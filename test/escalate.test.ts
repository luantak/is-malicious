import { describe, expect, it } from "vitest";
import { builtinChecks } from "../src/checks";
import { shouldEscalate } from "../src/escalate";
import { DEFAULT_THRESHOLDS } from "../src/types";
import { highAnswers, lowAnswers, noulAnswer, scoreAnswer } from "./helpers";

describe("shouldEscalate", () => {
  it("leaves a clean chunk on the first pass", () => {
    expect(shouldEscalate(lowAnswers(), builtinChecks, DEFAULT_THRESHOLDS)).toEqual({
      escalate: false,
      reason: "none",
      flagged: [],
    });
  });

  it("escalates a high-probability category", () => {
    const decision = shouldEscalate(
      highAnswers({ credential_theft: 0.91 }),
      builtinChecks,
      DEFAULT_THRESHOLDS,
    );
    expect(decision.escalate).toBe(true);
    expect(decision.reason).toBe("suspicious");
    expect(decision.flagged).toContain("credential_theft");
  });

  it("escalates an uncertain noul near 0.5", () => {
    const answers = lowAnswers();
    answers.hidden_network = noulAnswer(0.51);
    answers.overall_risk = scoreAnswer(0.4);
    const decision = shouldEscalate(answers, builtinChecks, DEFAULT_THRESHOLDS);
    expect(decision.escalate).toBe(true);
    expect(decision.reason).toBe("uncertain");
  });

  it("escalates documented telemetry as advisory, not suspicious", () => {
    const decision = shouldEscalate(highAnswers({ telemetry: 0.88 }), builtinChecks, DEFAULT_THRESHOLDS);
    expect(decision.escalate).toBe(true);
    expect(decision.reason).toBe("advisory");
    expect(decision.flagged).toEqual(["telemetry"]);
  });

  it("escalates a high overall risk score", () => {
    const answers = lowAnswers();
    answers.overall_risk = scoreAnswer(1.8);
    expect(shouldEscalate(answers, builtinChecks, DEFAULT_THRESHOLDS).reason).toBe("overall");
  });
});
