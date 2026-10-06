import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { noul } from "@typesafe-ai/sdk";
import { afterEach, expect, it, vi } from "vitest";
import { createAsker, scanProject } from "../src/scan";
import { main } from "../src/cli";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each([
  { answers: [] },
  { answers: [{ name: "risk", type: "refusal" }] },
  { answers: [{ name: "risk", type: "predicate", probability: 1.1 }] },
  { answers: [{ name: "risk", type: "predicate", probability: "0.1" }] },
  { answers: [{ name: "other", type: "predicate", probability: 0.1 }] },
  {
    answers: [
      { name: "risk", type: "predicate", probability: 0.1 },
      { name: "risk", type: "predicate", probability: 0.1 },
    ],
  },
])("rejects missing, refused, or malformed answers %j", async ({ answers }) => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      model: "gpt-6-luna",
      answers,
      usage: { input_tokens: 1, output_tokens: 0 },
    }),
  );
  await expect(
    createAsker({ provider: "openai", apiKey: "test" }).ask("code", {
      risk: noul("Risk?"),
    }),
  ).rejects.toThrow();
});

it("does not expose provider error bodies containing submitted code", async () => {
  vi.stubGlobal(
    "fetch",
    async () => new Response("secret source", { status: 401 }),
  );
  await expect(
    createAsker({ provider: "openai", apiKey: "test" }).ask("secret source", {
      risk: noul("Risk?"),
    }),
  ).rejects.toThrow("OpenAI Decisions request failed with HTTP 401");
});

it("requires OpenAI credentials rather than falling back to TypeSafe", () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("TYPESAFE_API_KEY", "typesafe-key");
  expect(() => createAsker({ provider: "openai" })).toThrow("OPENAI_API_KEY");
});

it("routes both scan passes and the CLI through Decisions and fails closed on refusal", async () => {
  const requests: any[] = [];
  let refuse = false;
  const server = createServer(async (incoming, outgoing) => {
    let text = "";
    for await (const part of incoming) text += part;
    const body = JSON.parse(text);
    requests.push(body);
    expect(incoming.url).toBe("/v1/decisions");
    const input = JSON.parse(body.input);
    const file = input.chunk.files[0].path;
    const answers = body.questions.map((q: any) => {
      if (refuse) return { name: q.name, type: "refusal" };
      if (q.type === "predicate")
        return {
          name: q.name,
          type: q.type,
          probability: q.name === "credential_theft" ? 0.9 : 0.01,
        };
      const values =
        q.type === "choice"
          ? q.choices.map((c: any) => c.value)
          : q.levels.map((_: any, i: number) => i);
      const value =
        q.name === "hot_file"
          ? file
          : q.name === "relevant_window"
            ? input.windows[0].id
            : q.name === "primary_category"
              ? "credential_theft"
              : values[0];
      return {
        name: q.name,
        type: q.type,
        confidence: 1,
        ...(q.type === "choice" ? { choice: value } : { score: 0 }),
        probabilities: values.map((v: any) => ({
          value: v,
          probability: v === value ? 1 : 0,
        })),
      };
    });
    outgoing.setHeader("content-type", "application/json");
    outgoing.end(
      JSON.stringify({
        model: "gpt-6-luna",
        answers,
        usage: { input_tokens: 100, output_tokens: 0 },
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const root = path.join(__dirname, "../fixtures/suspicious-dropper");
    const report = await scanProject({
      root,
      provider: "openai",
      apiKey: "test",
      baseURL,
    });
    expect(report.skipped).toEqual([]);
    expect(
      report.findings.some((f) => f.pass === 2 && f.lines.length > 0),
    ).toBe(true);
    expect(requests.length).toBe(report.chunks * 2);
    expect(requests.every((r) => r.model === "gpt-6-luna")).toBe(true);
    expect(report.usage.billedUsd).toBeNull();
    vi.stubEnv("OPENAI_API_KEY", "test");
    vi.stubEnv("OPENAI_BASE_URL", baseURL);
    const output = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    expect(await main([root, "--provider", "openai", "--json"])).toBe(1);
    expect(JSON.parse(String(output.mock.calls.at(-1)?.[0])).skipped).toEqual(
      [],
    );
    vi.stubEnv("IS_MALICIOUS_PROVIDER", "openai");
    vi.stubEnv("IS_MALICIOUS_MODEL", "env-model");
    expect(await main([root, "--json"])).toBe(1);
    expect(requests.slice(-report.chunks * 2).every((r) => r.model === "env-model")).toBe(true);
    expect(JSON.parse(String(output.mock.calls.at(-1)?.[0])).usage.billedUsd).toBeNull();
    vi.stubEnv("IS_MALICIOUS_PROVIDER", "invalid");
    expect(await main([root, "--provider", "openai", "--model", "flag-model", "--json"])).toBe(1);
    expect(requests.slice(-report.chunks * 2).every((r) => r.model === "flag-model")).toBe(true);
    refuse = true;
    expect(await main([root, "--provider", "openai", "--json"])).toBe(2);
    expect(
      JSON.parse(String(output.mock.calls.at(-1)?.[0])).skipped.length,
    ).toBeGreaterThan(0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
