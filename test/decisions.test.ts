import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { choice, noul, score } from "@typesafe-ai/sdk";
import { expect, it } from "vitest";
import { createAsker } from "../src/scan";

it("translates typed questions and answers through the Decisions HTTP endpoint", async () => {
  let request: any;
  const server = createServer(async (incoming, outgoing) => {
    let body = "";
    for await (const part of incoming) body += part;
    request = {
      path: incoming.url,
      authorization: incoming.headers.authorization,
      body: JSON.parse(body),
    };
    outgoing.setHeader("content-type", "application/json");
    outgoing.end(
      JSON.stringify({
        model: "gpt-6-luna",
        answers: [
          { name: "risk", type: "predicate", probability: 0.9 },
          {
            name: "category",
            type: "choice",
            choice: "none",
            confidence: 0.8,
            probabilities: [
              { value: "none", probability: 1 },
              { value: "file", probability: 0 },
            ],
          },
          {
            name: "overall",
            type: "score",
            score: 1.2,
            confidence: 0.7,
            probabilities: [
              { value: 0, probability: 0.4 },
              { value: 1, probability: 0 },
              { value: 2, probability: 0.6 },
            ],
          },
        ],
        usage: { input_tokens: 42, output_tokens: 0 },
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const asker = createAsker({
      provider: "openai",
      apiKey: "test-key",
      baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    });
    const result = await asker.ask(
      { code: "example" },
      {
        risk: noul("Risk?", { true: "Covert activity" }),
        category: choice("Category?", { none: "Ordinary", file: null }),
        overall: score("Severity?", ["low", "medium", "high"]),
      },
    );
    expect(request).toEqual({
      path: "/v1/decisions",
      authorization: "Bearer test-key",
      body: {
        model: "gpt-6-luna",
        input: '{"code":"example"}',
        questions: [
          {
            name: "risk",
            type: "predicate",
            instructions: 'Risk?\nCriteria: {"true":"Covert activity"}',
          },
          {
            name: "category",
            type: "choice",
            instructions: "Category?",
            choices: [
              { value: "none", description: "Ordinary" },
              { value: "file" },
            ],
          },
          {
            name: "overall",
            type: "score",
            instructions: "Severity?",
            levels: [{ label: "low" }, { label: "medium" }, { label: "high" }],
          },
        ],
      },
    });
    expect(result).toEqual({
      model: "gpt-6-luna",
      answers: {
        risk: { type: "noul", noul: 0.9 },
        category: {
          type: "choice",
          choice: "none",
          confidence: 0.8,
          probabilities: { none: 1, file: 0 },
        },
        overall: {
          type: "score",
          score: 1.2,
          confidence: 0.7,
          probabilities: { 0: 0.4, 1: 0, 2: 0.6 },
        },
      },
      usage: { inputTokens: 42, outputTokens: 0 },
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
