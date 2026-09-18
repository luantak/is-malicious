import { describe, expect, it } from "vitest";
import { formatReport } from "../src/report";
import type { ScanReport } from "../src/types";

describe("formatReport", () => {
  it("prints a compact finding with path, lines, category, and reason", () => {
    const report: ScanReport = {
      root: "/tmp/app",
      filesScanned: 3,
      chunks: 1,
      escalated: 1,
      skipped: [],
      model: "jev-test",
      usage: {
        requests: 2,
        inputTokens: 12000,
        outputTokens: 80,
        billedUsd: 0.000504,
        pricePerMillionInputTokens: 0.042,
      },
      findings: [
        {
          category: "credential_theft",
          label: "credential / secret theft",
          probability: 0.91,
          confidence: 0.82,
          severity: "high",
          files: ["src/sync.js"],
          lines: [
            {
              path: "src/sync.js",
              start: 2,
              end: 6,
              excerpt: "   2  const loot = { env: process.env }",
            },
          ],
          reason: "Harvests environment or credential stores and sends them off-box.",
          pass: 2,
          chunkId: "chunk-001",
        },
      ],
      categoryScores: [],
    };

    const text = formatReport(report);
    expect(text).toContain("Suspicious chunks");
    expect(text).toContain("chunk-001  src/sync.js:2-6");
    expect(text).toContain("src/sync.js:2-6");
    expect(text).toContain("credential_theft");
    expect(text).toContain("p=0.91");
    expect(text).toContain("conf=0.82");
    expect(text).toContain("Harvests environment");
    expect(text).toContain("input 12000 tok");
    expect(text).toContain("billed $0.0005");
  });

  it("says when nothing crossed the threshold", () => {
    expect(
      formatReport({
        root: "/tmp/app",
        filesScanned: 2,
        chunks: 1,
        escalated: 0,
        skipped: [],
        model: "jev-test",
        usage: {
          requests: 1,
          inputTokens: 0,
          outputTokens: 0,
          billedUsd: 0,
          pricePerMillionInputTokens: 0.042,
        },
        findings: [],
        categoryScores: [],
      }),
    ).toContain("No findings");
  });
});
