export type FileRole = "source" | "config" | "build" | "ci";

export interface SourceFile {
  path: string;
  relativePath: string;
  role: FileRole;
  content: string;
  lines: string[];
  bytes: number;
  lineOffset?: number;
}

export interface LineWindow {
  id: string;
  path: string;
  start: number;
  end: number;
  text: string;
}

export interface FileChunk {
  id: string;
  files: SourceFile[];
  neighborPaths: string[];
}

export interface CategoryScore {
  id: string;
  label: string;
  probability: number;
  confidence: number;
}

export interface Finding {
  category: string;
  label: string;
  probability: number;
  confidence: number;
  severity: "high" | "medium" | "uncertain";
  files: string[];
  lines: Array<{ path: string; start: number; end: number; excerpt: string }>;
  reason: string;
  pass: 1 | 2;
  chunkId: string;
}

export interface ScanUsage {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  billedUsd: number;
  pricePerMillionInputTokens: number;
}

export const INPUT_PRICE_PER_MTOK = 0.042;

export function billedUsd(inputTokens: number, pricePerMillion = INPUT_PRICE_PER_MTOK): number {
  return (inputTokens / 1_000_000) * pricePerMillion;
}

export interface ScanReport {
  root: string;
  filesScanned: number;
  chunks: number;
  escalated: number;
  model: string;
  usage: ScanUsage;
  findings: Finding[];
  categoryScores: Array<{
    chunkId: string;
    files: string[];
    pass: 1 | 2;
    scores: CategoryScore[];
  }>;
}

export interface ScanThresholds {
  suspiciousProbability: number;
  uncertainLow: number;
  uncertainHigh: number;
  reportProbability: number;
  escalateOverallScore: number;
}

export interface ScanOptions {
  root: string;
  apiKey?: string;
  model?: string;
  checks?: import("./checks/types").SemanticCheck[];
  thresholds?: Partial<ScanThresholds>;
  concurrency?: number;
  maxChunkChars?: number;
  fileFilter?: (file: SourceFile) => boolean;
  ask?: import("./jev").JevAsker;
}

export const DEFAULT_THRESHOLDS: ScanThresholds = {
  suspiciousProbability: 0.65,
  uncertainLow: 0.35,
  uncertainHigh: 0.65,
  reportProbability: 0.4,
  escalateOverallScore: 1.4,
};
