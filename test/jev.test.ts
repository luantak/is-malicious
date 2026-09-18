import { describe, expect, it } from "vitest";
import { lineWindows } from "../src/chunk";
import { builtinChecks } from "../src/checks";
import { buildPass1Questions, buildPass2Questions, noulConfidence } from "../src/jev";
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
