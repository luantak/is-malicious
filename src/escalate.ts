import type { SemanticCheck } from "./checks";
import { noulConfidence, readNoul, readScore, type JevAnswerMap } from "./jev";
import type { ScanThresholds } from "./types";

export interface EscalationDecision {
  escalate: boolean;
  reason: "suspicious" | "uncertain" | "overall" | "none";
  flagged: string[];
}

export function shouldEscalate(
  answers: JevAnswerMap,
  checks: SemanticCheck[],
  thresholds: ScanThresholds,
): EscalationDecision {
  const flagged: string[] = [];
  let suspicious = false;
  let uncertain = false;

  for (const check of checks) {
    const probability = readNoul(answers, check.id);
    if (probability >= thresholds.suspiciousProbability) {
      flagged.push(check.id);
      suspicious = true;
      continue;
    }
    if (
      probability >= thresholds.uncertainLow &&
      probability <= thresholds.uncertainHigh &&
      noulConfidence(probability) < 0.45
    ) {
      flagged.push(check.id);
      uncertain = true;
    }
  }

  const overall = readScore(answers, "overall_risk");
  if (suspicious) {
    return { escalate: true, reason: "suspicious", flagged };
  }
  if (uncertain) {
    return { escalate: true, reason: "uncertain", flagged };
  }
  if (overall.score >= thresholds.escalateOverallScore) {
    return { escalate: true, reason: "overall", flagged };
  }
  return { escalate: false, reason: "none", flagged };
}
