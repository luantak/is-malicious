import { builtinChecks, type SemanticCheck } from "../src/checks";
import type { JevAnswerMap, JevAsker, JevResult } from "../src/jev";

export function noulAnswer(value: number): JevAnswerMap[string] {
  return { type: "noul", noul: value };
}

export function choiceAnswer(value: string, confidence = 0.8): JevAnswerMap[string] {
  return { type: "choice", choice: value, confidence, probabilities: { [value]: confidence } };
}

export function scoreAnswer(value: number, confidence = 0.7): JevAnswerMap[string] {
  return { type: "score", score: value, confidence, probabilities: { "0": 0.1, "1": 0.2, "2": 0.7 } };
}

export function lowAnswers(checks: SemanticCheck[] = builtinChecks): JevAnswerMap {
  const answers: JevAnswerMap = {
    overall_risk: scoreAnswer(0.1, 0.9),
    primary_category: choiceAnswer("none", 0.9),
  };
  for (const check of checks) {
    answers[check.id] = noulAnswer(0.04);
  }
  return answers;
}

export function highAnswers(
  hot: Record<string, number>,
  checks: SemanticCheck[] = builtinChecks,
): JevAnswerMap {
  const answers = lowAnswers(checks);
  let primary = "none";
  let best = 0;
  for (const [id, value] of Object.entries(hot)) {
    answers[id] = noulAnswer(value);
    if (value > best) {
      best = value;
      primary = id;
    }
  }
  answers.overall_risk = scoreAnswer(best > 0.7 ? 1.9 : 1.1, 0.75);
  answers.primary_category = choiceAnswer(primary, 0.8);
  return answers;
}

export function scriptedAsker(script: (state: unknown) => JevAnswerMap): JevAsker & { calls: number } {
  const asker = {
    calls: 0,
    async ask(state: unknown): Promise<JevResult> {
      asker.calls += 1;
      return {
        model: "jev-test",
        answers: script(state),
        usage: { inputTokens: 100, outputTokens: 10 },
      };
    },
  };
  return asker;
}

export function stateText(state: unknown): string {
  return JSON.stringify(state);
}
