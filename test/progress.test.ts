import { describe, expect, it } from "vitest";
import { formatProgressLine } from "../src/progress";

describe("formatProgressLine", () => {
  it("shows a compact bar and counts", () => {
    const line = formatProgressLine({
      files: 50,
      chunks: 10,
      done: 4,
      inflight: 3,
      findings: 1,
      escalated: 1,
      skipped: 0,
      requests: 5,
      current: "src/sync.js",
    });
    expect(line).toContain("4/10");
    expect(line).toContain("3 running");
    expect(line).toContain("1 hit");
    expect(line).toContain("src/sync.js");
  });
});
