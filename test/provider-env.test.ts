import path from "node:path";
import { noul } from "@typesafe-ai/sdk";
import { afterEach, expect, it, vi } from "vitest";
import { createAsker, scanProject } from "../src/scan";
import type { JevAsker } from "../src/jev";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("uses the selected provider's model environment in the public asker", async () => {
  vi.stubEnv("IS_MALICIOUS_PROVIDER", "openai");
  vi.stubEnv("IS_MALICIOUS_MODEL", "");
  vi.stubEnv("OPENAI_DEFAULT_MODEL", "openai-env-model");
  vi.stubEnv("TYPESAFE_DEFAULT_MODEL", "wrong-model");
  vi.stubEnv("OPENAI_API_KEY", "test");
  const bodies: any[] = [];
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    bodies.push(body);
    return Response.json({ model: body.model, answers: [], usage: { input_tokens: 0, output_tokens: 0 } });
  });
  await createAsker().ask("code", {});
  expect(bodies[0].model).toBe("openai-env-model");
  vi.stubEnv("IS_MALICIOUS_MODEL", "generic-model");
  await createAsker().ask("code", {});
  expect(bodies[1].model).toBe("generic-model");
  await createAsker().ask("code", {}, "explicit-model");
  expect(bodies[2].model).toBe("explicit-model");
});

it("uses the environment provider and model in both scan passes without TypeSafe pricing", async () => {
  vi.stubEnv("IS_MALICIOUS_PROVIDER", "openai");
  vi.stubEnv("IS_MALICIOUS_MODEL", "env-model");
  const models: Array<string | undefined> = [];
  const ask: JevAsker = {
    async ask(_state, questions, model) {
      models.push(model);
      return {
        model: model ?? "unset",
        usage: { inputTokens: 10, outputTokens: 0 },
        answers: Object.fromEntries(Object.entries(questions).map(([name, q]) => [name,
          q.type === "noul" ? { type: "noul", noul: 0.9 }
            : q.type === "score" ? { type: "score", score: 2, confidence: 1, probabilities: {} }
              : { type: "choice", choice: Object.keys(q.criteria)[0], confidence: 1, probabilities: {} },
        ])),
      };
    },
  };
  const report = await scanProject({ root: path.join(__dirname, "../fixtures/benign-notes"), ask });
  expect(report.skipped).toEqual([]);
  expect(models.length).toBe(report.chunks * 2);
  expect(models.every((model) => model === "env-model")).toBe(true);
  expect(report.usage.billedUsd).toBeNull();
});

it.each([
  ["typesafe", "typesafe-model"],
  ["openai", "openai-model"],
  ["", "typesafe-model"],
  ["   ", "typesafe-model"],
])("selects the isolated model default for provider %j", async (provider, expected) => {
  vi.stubEnv("IS_MALICIOUS_PROVIDER", provider);
  vi.stubEnv("IS_MALICIOUS_MODEL", " ");
  vi.stubEnv("TYPESAFE_DEFAULT_MODEL", "typesafe-model");
  vi.stubEnv("OPENAI_DEFAULT_MODEL", "openai-model");
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe(expected);
    return Response.json({ model: body.model, answers: provider === "openai" ? [{ name: "risk", type: "predicate", probability: 0.1 }] : { risk: { type: "noul", noul: 0.1 } }, usage: { input_tokens: 0, output_tokens: 0 } });
  });
  expect((await createAsker({ apiKey: "test" }).ask("code", { risk: noul("Risk?") })).model).toBe(expected);
});

it("rejects an invalid environment provider before making requests", async () => {
  vi.stubEnv("IS_MALICIOUS_PROVIDER", "invalid");
  expect(() => createAsker({ apiKey: "test" })).toThrow("IS_MALICIOUS_PROVIDER");
  await expect(scanProject({ root: "." })).rejects.toThrow("IS_MALICIOUS_PROVIDER");
});

it("lets explicit provider and model override the environment", async () => {
  vi.stubEnv("IS_MALICIOUS_PROVIDER", "invalid");
  vi.stubEnv("IS_MALICIOUS_MODEL", "wrong-model");
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("explicit-model");
    return Response.json({ model: body.model, answers: { risk: { type: "noul", noul: 0.1 } }, usage: { input_tokens: 0, output_tokens: 0 } });
  });
  await createAsker({ provider: "typesafe", apiKey: "test" }).ask("code", { risk: noul("Risk?") }, "explicit-model");
});
