import { TypeSafeClient, choice, noul, score } from "@typesafe-ai/sdk";
import type { EntryType, Questions } from "@typesafe-ai/sdk";
import { REVIEW_RULES, type SemanticCheck } from "./checks";
import { lineWindows, taggedFileState } from "./chunk";
import type { FileChunk, SourceFile } from "./types";

export type QuestionMap = Questions;

export interface JevAnswerMap {
  [key: string]:
    | { type: "noul"; noul: number }
    | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
    | { type: "score"; score: number; confidence: number; probabilities: Record<string, number> };
}

export interface JevUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface JevResult {
  model: string;
  answers: JevAnswerMap;
  usage: JevUsage;
}

export interface JevAsker {
  ask(state: EntryType, questions: QuestionMap, model?: string): Promise<JevResult>;
}

export function createJevAsker(options: { apiKey?: string; timeout?: number } = {}): JevAsker {
  const client = new TypeSafeClient({
    apiKey: options.apiKey,
    timeout: options.timeout ?? 60_000,
  });

  return {
    async ask(state, questions, model) {
      const response = await client.systemOne(
        {
          state,
          questions,
          ...(model ? { model } : {}),
        },
        { timeout: options.timeout ?? 60_000 },
      );
      return {
        model: response.model,
        answers: response.answers as JevAnswerMap,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    },
  };
}

export function noulConfidence(probability: number): number {
  return Math.min(1, Math.abs(probability - 0.5) * 2);
}

export function readNoul(answers: JevAnswerMap, id: string): number {
  const answer = answers[id];
  if (!answer || answer.type !== "noul") {
    throw new Error(`Expected noul answer for ${id}`);
  }
  return answer.noul;
}

export function readChoice(answers: JevAnswerMap, id: string): { choice: string; confidence: number } {
  const answer = answers[id];
  if (!answer || answer.type !== "choice") {
    throw new Error(`Expected choice answer for ${id}`);
  }
  return { choice: answer.choice, confidence: answer.confidence };
}

export function readScore(answers: JevAnswerMap, id: string): { score: number; confidence: number } {
  const answer = answers[id];
  if (!answer || answer.type !== "score") {
    throw new Error(`Expected score answer for ${id}`);
  }
  return { score: answer.score, confidence: answer.confidence };
}

export function buildPass1Questions(checks: SemanticCheck[], files: SourceFile[] = []): QuestionMap {
  const questions: QuestionMap = {};
  for (const check of checks) {
    questions[check.id] = noul(check.instructions, check.criteria);
  }
  questions.overall_risk = score(
    "How suspicious is `chunk.files` as a whole, given `review_rules`?",
    [
      "Ordinary software. Powerful APIs, if present, match the project's purpose.",
      "A few odd details. Could be sloppy legitimate code or a weak signal.",
      "Clear hostile, covert, or deceptive behavior.",
    ],
  );
  questions.primary_category = choice(
    "If `chunk.files` is suspicious, which category is the strongest match?",
    Object.fromEntries([
      ["none", "Nothing here looks malicious or deceptive."],
      ...checks.map((check) => [check.id, check.label]),
    ]),
  );
  const filePaths = uniquePaths(files);
  if (filePaths.length > 0) {
    questions.hot_file = choice(
      "If anything in `chunk.files` is suspicious, which file contains that behavior? Use `none` if nothing does.",
      Object.fromEntries([["none", "No file in this chunk looks suspicious."], ...filePaths.map((path) => [path, null])]),
    );
  }
  return questions;
}

export function buildPass2Questions(
  checks: SemanticCheck[],
  files: SourceFile[],
  windows: ReturnType<typeof lineWindows>,
): QuestionMap {
  const questions = buildPass1Questions(checks, files);
  const windowCriteria = Object.fromEntries([
    ["none", "No window contains the suspicious behavior."],
    ...windows.slice(0, 250).map((window) => [window.id, null]),
  ]);
  questions.relevant_window = choice(
    "Which line window in `windows` best shows the suspicious or uncertain behavior? Use `none` if nothing does.",
    windowCriteria,
  );

  const reasonCriteria: Record<string, string> = { none: "No listed reason fits." };
  for (const check of checks) {
    for (const [id, text] of Object.entries(check.reasons)) {
      if (id === "none") {
        continue;
      }
      reasonCriteria[`${check.id}:${id}`] = `${check.label}: ${text}`;
    }
  }
  questions.reason = choice(
    "Which closed reason best describes the suspicious behavior in `chunk.files`?",
    reasonCriteria,
  );
  return questions;
}

export function chunkState(
  chunk: FileChunk,
  extraFiles: SourceFile[] = [],
  options: { windows?: ReturnType<typeof lineWindows>; mode?: "triage" | "locate" } = {},
): EntryType {
  const files = [...chunk.files, ...extraFiles];
  const mode = options.mode ?? "triage";
  return {
    review_rules: REVIEW_RULES,
    chunk: {
      id: chunk.id,
      files:
        mode === "locate"
          ? files.map((file) => ({ path: file.relativePath, role: file.role }))
          : files.map((file) => taggedFileState(file, "triage")),
    },
    ...(options.windows
      ? {
          windows: options.windows.slice(0, 40).map((window) => ({
            id: window.id,
            path: window.path,
            start: window.start,
            end: window.end,
            text: window.text,
          })),
        }
      : {}),
  };
}

function uniquePaths(files: SourceFile[]): string[] {
  return [...new Set(files.map((file) => file.relativePath))];
}
