import path from "node:path";
import { listChecks, type SemanticCheck } from "./checks";
import { DEFAULT_MAX_CHUNK_CHARS, excerpt, groupFiles, lineWindows } from "./chunk";
import { discoverFiles } from "./discover";
import { shouldEscalate } from "./escalate";
import {
  buildPass1Questions,
  buildPass2Questions,
  chunkState,
  createJevAsker,
  noulConfidence,
  readChoice,
  readNoul,
  type JevAnswerMap,
  type JevAsker,
} from "./jev";
import {
  DEFAULT_THRESHOLDS,
  INPUT_PRICE_PER_MTOK,
  billedUsd,
  type CategoryScore,
  type Finding,
  type ScanOptions,
  type ScanReport,
  type ScanThresholds,
  type SourceFile,
} from "./types";

export async function scanProject(options: ScanOptions): Promise<ScanReport> {
  const root = path.resolve(options.root);
  const checks = options.checks ?? listChecks();
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
  const ask = options.ask ?? createJevAsker({ apiKey: options.apiKey });
  const discovered = await discoverFiles(root);
  const files = options.fileFilter ? discovered.filter(options.fileFilter) : discovered;
  const chunks = groupFiles(files, options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS);
  const byPath = new Map(files.map((file) => [file.relativePath, file]));

  const findings: Finding[] = [];
  const categoryScores: ScanReport["categoryScores"] = [];
  let escalated = 0;
  let model = options.model ?? "jev-latest";
  let requests = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  const workers = Math.max(1, options.concurrency ?? 2);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < chunks.length) {
      const index = next;
      next += 1;
      const chunk = chunks[index];
      process.stderr.write(`chunk ${index + 1}/${chunks.length} ${chunk.id} (${chunk.files.length} files)\n`);
      try {
      const pass1 = await ask.ask(chunkState(chunk), buildPass1Questions(checks), options.model);
      model = pass1.model;
      requests += 1;
      inputTokens += pass1.usage.inputTokens;
      outputTokens += pass1.usage.outputTokens;

      const decision = shouldEscalate(pass1.answers, checks, thresholds);
      let answers = pass1.answers;
      let extraFiles: SourceFile[] = [];
      let pass: 1 | 2 = 1;

      if (decision.escalate) {
        escalated += 1;
        extraFiles = neighborFiles(chunk.neighborPaths, byPath, chunk.files);
        const windows = lineWindows([...chunk.files, ...extraFiles], 20).slice(0, 80);
        const pass2 = await ask.ask(
          chunkState(chunk, extraFiles, { windows: true }),
          buildPass2Questions(checks, windows),
          options.model,
        );
        answers = pass2.answers;
        model = pass2.model;
        requests += 1;
        inputTokens += pass2.usage.inputTokens;
        outputTokens += pass2.usage.outputTokens;
        pass = 2;
      }

      const scores = categoryScoresFrom(answers, checks);
      categoryScores.push({
        chunkId: chunk.id,
        files: chunk.files.map((file) => file.relativePath),
        pass,
        scores,
      });
      findings.push(
        ...findingsFrom({
          answers,
          checks,
          chunkId: chunk.id,
          files: [...chunk.files, ...extraFiles],
          pass,
          thresholds,
        }),
      );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Skipping ${chunk.id}: ${message}\n`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(workers, chunks.length || 1) }, () => worker()));
  findings.sort((a, b) => b.probability - a.probability || a.category.localeCompare(b.category));
  categoryScores.sort((a, b) => a.chunkId.localeCompare(b.chunkId));
  return {
    root,
    filesScanned: files.length,
    chunks: chunks.length,
    escalated,
    model,
    usage: {
      requests,
      inputTokens,
      outputTokens,
      billedUsd: billedUsd(inputTokens),
      pricePerMillionInputTokens: INPUT_PRICE_PER_MTOK,
    },
    findings,
    categoryScores,
  };
}

function neighborFiles(
  neighborPaths: string[],
  byPath: Map<string, SourceFile>,
  already: SourceFile[],
): SourceFile[] {
  const seen = new Set(already.map((file) => file.relativePath));
  const extras: SourceFile[] = [];
  for (const relativePath of neighborPaths) {
    if (seen.has(relativePath)) {
      continue;
    }
    const file = byPath.get(relativePath);
    if (file) {
      extras.push(file);
      seen.add(relativePath);
    }
  }
  return extras.slice(0, 8);
}

function categoryScoresFrom(answers: JevAnswerMap, checks: SemanticCheck[]): CategoryScore[] {
  return checks.map((check) => {
    const probability = readNoul(answers, check.id);
    return {
      id: check.id,
      label: check.label,
      probability,
      confidence: noulConfidence(probability),
    };
  });
}

function findingsFrom(input: {
  answers: JevAnswerMap;
  checks: SemanticCheck[];
  chunkId: string;
  files: SourceFile[];
  pass: 1 | 2;
  thresholds: ScanThresholds;
}): Finding[] {
  const { answers, checks, chunkId, files, pass, thresholds } = input;
  const reason = answers.reason?.type === "choice" ? readChoice(answers, "reason") : undefined;
  const window = answers.relevant_window?.type === "choice" ? readChoice(answers, "relevant_window") : undefined;
  const primary = answers.primary_category?.type === "choice" ? readChoice(answers, "primary_category") : undefined;

  const results: Finding[] = [];
  for (const check of checks) {
    const probability = readNoul(answers, check.id);
    if (probability < thresholds.reportProbability) {
      continue;
    }
    const confidence = noulConfidence(probability);
    const severity =
      probability >= thresholds.suspiciousProbability
        ? "high"
        : probability >= thresholds.uncertainHigh
          ? "medium"
          : "uncertain";

    results.push({
      category: check.id,
      label: check.label,
      probability,
      confidence,
      severity,
      files: implicatedFiles(files, window?.choice, check.id, reason?.choice, primary?.choice),
      lines: relevantLines(files, window?.choice),
      reason: reasonText(check, reason?.choice, primary?.choice),
      pass,
      chunkId,
    });
  }
  return results;
}

function implicatedFiles(
  files: SourceFile[],
  windowId: string | undefined,
  checkId: string,
  reasonId: string | undefined,
  primaryId: string | undefined,
): string[] {
  if (windowId && windowId !== "none") {
    const pathPart = windowId.split(":")[0];
    if (files.some((file) => file.relativePath === pathPart)) {
      return [pathPart];
    }
  }
  if (reasonId?.startsWith(`${checkId}:`) || primaryId === checkId) {
    return files.map((file) => file.relativePath);
  }
  return files.map((file) => file.relativePath);
}

function relevantLines(
  files: SourceFile[],
  windowId: string | undefined,
): Array<{ path: string; start: number; end: number; excerpt: string }> {
  if (!windowId || windowId === "none") {
    return files.slice(0, 2).map((file) => {
      const base = file.lineOffset ?? 0;
      const end = base + Math.min(file.lines.length, 12);
      return {
        path: file.relativePath,
        start: base + 1,
        end,
        excerpt: excerpt(file, base + 1, end),
      };
    });
  }
  const match = windowId.match(/^(.*):(\d+)-(\d+)$/);
  if (!match) {
    return [];
  }
  const [, relativePath, startText, endText] = match;
  const start = Number(startText);
  const end = Number(endText);
  const file = files.find((item) => {
    if (item.relativePath !== relativePath) {
      return false;
    }
    const first = (item.lineOffset ?? 0) + 1;
    const last = (item.lineOffset ?? 0) + item.lines.length;
    return start <= last && end >= first;
  });
  if (!file) {
    return [];
  }
  return [
    {
      path: file.relativePath,
      start,
      end,
      excerpt: excerpt(file, start, end),
    },
  ];
}

function reasonText(check: SemanticCheck, reasonId: string | undefined, primaryId: string | undefined): string {
  if (reasonId && reasonId !== "none") {
    const [checkId, localId] = reasonId.split(":");
    if (checkId === check.id && localId && check.reasons[localId]) {
      return check.reasons[localId];
    }
    if (checkId && localId) {
      return `${checkId}: ${localId}`;
    }
  }
  if (primaryId === check.id) {
    return check.label;
  }
  return check.label;
}

export function createAsker(options?: { apiKey?: string; timeout?: number }): JevAsker {
  return createJevAsker(options);
}
