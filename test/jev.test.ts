import { describe, expect, it } from "vitest";
import { builtinChecks } from "../src/checks";
import { buildPass1Questions, noulConfidence } from "../src/jev";

describe("jev helpers", () => {
  it("packs every check plus overall score and primary choice in one request", () => {
    const questions = buildPass1Questions(builtinChecks);
    for (const check of builtinChecks) {
      expect(questions[check.id]?.type).toBe("noul");
    }
    expect(questions.overall_risk?.type).toBe("score");
    expect(questions.primary_category?.type).toBe("choice");
  });

  it("treats noul values near 0.5 as low confidence", () => {
    expect(noulConfidence(0.5)).toBeCloseTo(0);
    expect(noulConfidence(0.9)).toBeCloseTo(0.8);
    expect(noulConfidence(0.1)).toBeCloseTo(0.8);
  });
});
