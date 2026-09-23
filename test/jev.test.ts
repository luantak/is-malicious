import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { noul } from "@typesafe-ai/sdk";
import { lineWindows } from "../src/chunk";
import { builtinChecks } from "../src/checks";
import { buildPass1Questions, buildPass2Questions, createJevAsker, noulConfidence } from "../src/jev";
import type { SourceFile } from "../src/types";

function sourceFile(relativePath: string): SourceFile {
  return {
    path: `/tmp/${relativePath}`,
    relativePath,
    role: "source",
    content: "x\ny\n",
    lines: ["x", "y"],
    bytes: 4,
  };
}

describe("jev helpers", () => {
  it("sends requests to a configured TypeSafe-compatible endpoint", async () => {
    let request: { path?: string; authorization?: string; body?: unknown } = {};
    const server = createServer(async (incoming, outgoing) => {
      let body = "";
      for await (const part of incoming) body += part;
      request = {
        path: incoming.url,
        authorization: incoming.headers.authorization,
        body: JSON.parse(body),
      };
      outgoing.setHeader("content-type", "application/json");
      outgoing.end(JSON.stringify({
        model: "open-test",
        answers: { suspicious: { type: "noul", noul: 0.25 } },
        usage: { input_tokens: 12, output_tokens: 3 },
      }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const port = (server.address() as AddressInfo).port;
      const asker = createJevAsker({ apiKey: "test-key", baseURL: `http://127.0.0.1:${port}` });
      const result = await asker.ask("some code", { suspicious: noul("Is this suspicious?") }, "open-test");
      expect(request).toMatchObject({
        path: "/v1/systemone",
        authorization: "Bearer test-key",
        body: { state: "some code", model: "open-test" },
      });
      expect(result).toMatchObject({ model: "open-test", usage: { inputTokens: 12, outputTokens: 3 } });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("packs every check plus overall score and primary choice in one request", () => {
    const questions = buildPass1Questions(builtinChecks);
    for (const check of builtinChecks) {
      expect(questions[check.id]?.type).toBe("noul");
    }
    expect(questions.overall_risk?.type).toBe("score");
    expect(questions.primary_category?.type).toBe("choice");
    expect(questions.hot_file).toBeUndefined();
  });

  it("asks which file is hot when files are supplied", () => {
    const questions = buildPass1Questions(builtinChecks, [sourceFile("src/sync.js")]);
    expect(questions.hot_file?.type).toBe("choice");
  });

  it("asks for the exact window on the second pass", () => {
    const files = [sourceFile("src/sync.js")];
    const questions = buildPass2Questions(builtinChecks, files, lineWindows(files, 8));
    expect(questions.relevant_window?.type).toBe("choice");
    expect(questions.reason?.type).toBe("choice");
    expect(questions.hot_file?.type).toBe("choice");
  });

  it("treats noul values near 0.5 as low confidence", () => {
    expect(noulConfidence(0.5)).toBeCloseTo(0);
    expect(noulConfidence(0.9)).toBeCloseTo(0.8);
    expect(noulConfidence(0.1)).toBeCloseTo(0.8);
  });
});
