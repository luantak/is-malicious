import path from "node:path";
import { listChecks, type SemanticCheck } from "./checks";
import { DEFAULT_MAX_CHUNK_CHARS, excerpt, groupFiles, lineWindows, splitForRetry } from "./chunk";
import { discoverFiles } from "./discover";
import { shouldEscalate } from "./escalate";
import { isMaxTokensError } from "./tokens";
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
import { findingPointer } from "./report";
import {
  DEFAULT_CONCURRENCY,
  DEFAULT_THRESHOLDS,
  INPUT_PRICE_PER_MTOK,
  billedUsd,
  type CategoryScore,
  type FileChunk,
  type Finding,
  type ScanOptions,
  type ScanProgress,
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
  const skipped: ScanReport["skipped"] = [];
  let escalated = 0;
  let model = options.model ?? "jev-latest";
  let requests = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  let done = 0;
  let inflight = 0;

  function emit(current?: string, note?: string): void {
    const snapshot: ScanProgress = {
      files: files.length,
      chunks: chunks.length,
      done,
      inflight,
      findings: findings.length,
      escalated,
      skipped: skipped.length,
      requests,
      current,
      note,
    };
    options.onProgress?.(snapshot);
  }

  emit();

  async function evaluateChunk(chunk: FileChunk, depth = 0): Promise<void> {
    try {
      const pass1 = await ask.ask(chunkState(chunk), buildPass1Questions(checks, chunk.files), options.model);
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
        const located = locateFiles(chunk.files, extraFiles, pass1.answers);
        const windows = lineWindows(located, 8).slice(0, 80);
        try {
          const pass2 = await ask.ask(
            chunkState(chunk, extraFiles, { windows }),
            buildPass2Questions(checks, [...chunk.files, ...extraFiles], windows),
            options.model,
          );
          answers = pass2.answers;
          model = pass2.model;
          requests += 1;
          inputTokens += pass2.usage.inputTokens;
          outputTokens += pass2.usage.outputTokens;
          pass = 2;
        } catch (error) {
          if (!isMaxTokensError(error)) {
            throw error;
          }
          emit(chunk.files[0]?.relativePath, `${chunk.id}: second pass exceeded tokens, keeping first pass`);
        }
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
      const newest = findings
        .filter((finding) => finding.chunkId === chunk.id)
        .sort((a, b) => b.probability - a.probability);
      if (newest[0]) {
        emit(findingPointer(newest[0]), `${newest[0].category}  ${findingPointer(newest[0])}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const pieces = isMaxTokensError(error) && depth < 6 ? splitForRetry(chunk) : [];
      if (pieces.length > 1) {
        emit(chunk.files[0]?.relativePath, `${chunk.id}: split after max_tokens`);
        for (const piece of pieces) {
          await evaluateChunk(piece, depth + 1);
        }
        return;
      }
      emit(chunk.files[0]?.relativePath, `${chunk.id}: ${message}`);
      skipped.push({
        chunkId: chunk.id,
        files: chunk.files.map((file) => file.relativePath),
        error: message,
      });
    }
  }

  const workers = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < chunks.length) {
      const index = next;
      next += 1;
      const chunk = chunks[index];
      inflight += 1;
      emit(chunk.files[0]?.relativePath);
      await evaluateChunk(chunk);
      inflight -= 1;
      done += 1;
      emit(chunk.files[0]?.relativePath);
    }
  }

  await Promise.all(Array.from({ length: Math.min(workers, chunks.length || 1) }, () => worker()));
  emit();
  findings.sort((a, b) => b.probability - a.probability || a.category.localeCompare(b.category));
  categoryScores.sort((a, b) => a.chunkId.localeCompare(b.chunkId));
  return {
    root,
    filesScanned: files.length,
    chunks: chunks.length,
    escalated,
    skipped,
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
  const hotFile = answers.hot_file?.type === "choice" ? readChoice(answers, "hot_file") : undefined;

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
      files: implicatedFiles(files, window?.choice, hotFile?.choice),
      lines: relevantLines(files, window?.choice),
      reason: reasonText(check, reason?.choice, primary?.choice),
      pass,
      chunkId,
    });
  }
  return results;
}

function locateFiles(chunkFiles: SourceFile[], extraFiles: SourceFile[], answers: JevAnswerMap): SourceFile[] {
  const all = [...chunkFiles, ...extraFiles];
  const hot = answers.hot_file?.type === "choice" ? answers.hot_file.choice : undefined;
  if (hot && hot !== "none") {
    const match = all.filter((file) => file.relativePath === hot);
    if (match.length > 0) {
      return match;
    }
  }
  return chunkFiles;
}

function implicatedFiles(
  files: SourceFile[],
  windowId: string | undefined,
  hotFile: string | undefined,
): string[] {
  const parsed = parseWindowId(windowId);
  if (parsed && files.some((file) => file.relativePath === parsed.path)) {
    return [parsed.path];
  }
  if (hotFile && hotFile !== "none" && files.some((file) => file.relativePath === hotFile)) {
    return [hotFile];
  }
  return files[0] ? [files[0].relativePath] : [];
}

function parseWindowId(windowId: string | undefined): { path: string; start: number; end: number } | undefined {
  if (!windowId || windowId === "none") {
    return undefined;
  }
  const match = windowId.match(/^(.*):(\d+)-(\d+)$/);
  if (!match) {
    return undefined;
  }
  return { path: match[1], start: Number(match[2]), end: Number(match[3]) };
}

function relevantLines(
  files: SourceFile[],
  windowId: string | undefined,
): Array<{ path: string; start: number; end: number; excerpt: string }> {
  const parsed = parseWindowId(windowId);
  if (!parsed) {
    return [];
  }
  const { path: relativePath, start, end } = parsed;
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
