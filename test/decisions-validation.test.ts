import { choice, noul, score } from "@typesafe-ai/sdk";
import { afterEach, expect, it, vi } from "vitest";
import { createAsker } from "../src/scan";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each([
  {
    type: "choice",
    choice: "unknown",
    confidence: 0.8,
    probabilities: [{ value: "none", probability: 1 }],
  },
  {
    type: "choice",
    choice: "none",
    confidence: -1,
    probabilities: [{ value: "none", probability: 1 }],
  },
  { type: "choice", choice: "none", confidence: 0.8, probabilities: [] },
  {
    type: "choice",
    choice: "none",
    confidence: 0.8,
    probabilities: [
      { value: "none", probability: 1 },
      { value: "none", probability: 0 },
    ],
  },
  {
    type: "score",
    score: 3,
    confidence: 0.8,
    probabilities: [
      { value: 0, probability: 1 },
      { value: 1, probability: 0 },
    ],
  },
])("rejects invalid closed answers %j", async (answer) => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      model: "gpt-6-luna",
      answers: [{ name: "test", ...answer }],
      usage: { input_tokens: 1, output_tokens: 0 },
    }),
  );
  const question =
    answer.type === "choice"
      ? choice("Category?", { none: "None" })
      : score("Risk?", ["low", "high"]);
  await expect(
    createAsker({ provider: "openai", apiKey: "test" }).ask("code", {
      test: question,
    }),
  ).rejects.toThrow();
});

it.each([
  "file:///tmp/api",
  "https://user:password@example.com",
  "https://example.com?query=1",
  "https://example.com#fragment",
])("rejects unsafe API root %s", (baseURL) => {
  expect(() =>
    createAsker({ provider: "openai", apiKey: "test", baseURL }),
  ).toThrow();
});

it("bounds requests with an abort signal and disables redirects", async () => {
  let redirect: RequestRedirect | undefined;
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
    redirect = init.redirect;
    return await new Promise((_resolve, reject) => {
      init.signal?.addEventListener(
        "abort",
        () => reject(init.signal?.reason),
        { once: true },
      );
    });
  });
  await expect(
    createAsker({ provider: "openai", apiKey: "test", timeout: 20 }).ask(
      "code",
      { test: noul("Risk?") },
    ),
  ).rejects.toThrow();
  expect(redirect).toBe("error");
});

it("honors the OpenAI root and model without consulting TypeSafe settings", async () => {
  vi.stubEnv("OPENAI_BASE_URL", "https://openai.example/v1");
  vi.stubEnv("TYPESAFE_BASE_URL", "https://typesafe.example");
  let request: { url?: string; model?: string } = {};
  vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
    request = { url: String(url), model: JSON.parse(String(init.body)).model };
    return Response.json({
      model: "custom-model",
      answers: [{ name: "test", type: "predicate", probability: 0.1 }],
      usage: { input_tokens: 1, output_tokens: 0 },
    });
  });
  await createAsker({
    provider: "openai",
    apiKey: "test",
    baseURL: "https://explicit.example/v1/",
  }).ask("code", { test: noul("Risk?") }, "custom-model");
  expect(request).toEqual({
    url: "https://explicit.example/v1/decisions",
    model: "custom-model",
  });
  await createAsker({ provider: "openai", apiKey: "test" }).ask("code", {
    test: noul("Risk?"),
  });
  expect(request).toEqual({
    url: "https://openai.example/v1/decisions",
    model: "gpt-6-luna",
  });
});
