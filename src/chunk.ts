import path from "node:path";
import {
  compactCharCount,
  DEFAULT_MAX_FILES_PER_CHUNK,
  fileStateText,
  interestingLocalLines,
  lineHasSignal,
} from "./compact";
import type { FileChunk, LineWindow, SourceFile } from "./types";

export const DEFAULT_MAX_CHUNK_CHARS = 8_000;
const WINDOW_LINES = 10;

export function groupFiles(
  files: SourceFile[],
  maxChunkChars = DEFAULT_MAX_CHUNK_CHARS,
  maxFiles = DEFAULT_MAX_FILES_PER_CHUNK,
): FileChunk[] {
  const byDir = new Map<string, SourceFile[]>();
  for (const file of files) {
    const dir = path.dirname(file.relativePath);
    const list = byDir.get(dir) ?? [];
    list.push(file);
    byDir.set(dir, list);
  }

  const dirChunks: FileChunk[] = [];
  let index = 0;
  for (const [dir, dirFiles] of [...byDir.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const pieces = splitOversized(dirFiles, maxChunkChars, maxFiles);
    for (const piece of pieces) {
      index += 1;
      dirChunks.push({
        id: `chunk-${String(index).padStart(3, "0")}`,
        files: piece,
        neighborPaths: files
          .filter((file) => path.dirname(file.relativePath) === dir && !piece.includes(file))
          .map((file) => file.relativePath),
      });
    }
  }

  return mergeSmallChunks(dirChunks, files, maxChunkChars, maxFiles);
}

export function sliceFile(file: SourceFile, maxChars: number): SourceFile[] {
  if (file.content.length <= maxChars) {
    return [file];
  }
  const slices: SourceFile[] = [];
  let index = 0;
  while (index < file.lines.length) {
    const line = file.lines[index];
    if (line.length > maxChars) {
      for (let offset = 0; offset < line.length; offset += maxChars) {
        const piece = line.slice(offset, offset + maxChars);
        slices.push({
          ...file,
          content: piece,
          lines: [piece],
          bytes: piece.length,
          lineOffset: (file.lineOffset ?? 0) + index,
        });
      }
      index += 1;
      continue;
    }

    let end = index;
    let size = 0;
    while (end < file.lines.length) {
      const add = file.lines[end].length + 1;
      if (file.lines[end].length > maxChars) {
        break;
      }
      if (end > index && size + add > maxChars) {
        break;
      }
      size += add;
      end += 1;
    }
    if (end === index) {
      end = index + 1;
      size = file.lines[index].length;
    }
    const lines = file.lines.slice(index, end);
    slices.push({
      ...file,
      content: lines.join("\n"),
      lines,
      bytes: size,
      lineOffset: (file.lineOffset ?? 0) + index,
    });
    index = end;
  }
  return slices;
}

export function splitForRetry(chunk: FileChunk): FileChunk[] {
  if (chunk.files.length > 1) {
    const mid = Math.ceil(chunk.files.length / 2);
    return [
      { ...chunk, id: `${chunk.id}a`, files: chunk.files.slice(0, mid), neighborPaths: [] },
      { ...chunk, id: `${chunk.id}b`, files: chunk.files.slice(mid), neighborPaths: [] },
    ];
  }
  const file = chunk.files[0];
  if (!file) {
    return [];
  }
  const target = Math.max(1_500, Math.floor(file.content.length / 2));
  const slices = sliceFile(file, target);
  if (slices.length <= 1) {
    return [];
  }
  return slices.map((slice, index) => ({
    ...chunk,
    id: `${chunk.id}.${index + 1}`,
    files: [slice],
    neighborPaths: [],
  }));
}

function splitOversized(
  files: SourceFile[],
  maxChunkChars: number,
  maxFiles: number,
): SourceFile[][] {
  const groups: SourceFile[][] = [];
  let current: SourceFile[] = [];
  let size = 0;

  for (const original of files) {
    for (const file of sliceFile(original, maxChunkChars)) {
    const fileSize = compactCharCount(file);
    if (current.length > 0 && (size + fileSize > maxChunkChars || current.length >= maxFiles)) {
      groups.push(current);
      current = [];
      size = 0;
    }
    if (fileSize > maxChunkChars) {
      if (current.length > 0) {
        groups.push(current);
        current = [];
        size = 0;
      }
      groups.push([file]);
      continue;
    }
    current.push(file);
    size += fileSize;
    }
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups;
}

function mergeSmallChunks(
  chunks: FileChunk[],
  allFiles: SourceFile[],
  maxChunkChars: number,
  maxFiles: number,
): FileChunk[] {
  const merged: FileChunk[] = [];
  let pending: FileChunk | undefined;

  for (const chunk of chunks) {
    const chunkSize = chunkChars(chunk);
    if (!pending) {
      pending = chunk;
      continue;
    }
    const pendingSize = chunkChars(pending);
    const related = sameParent(pending, chunk);
    if (
      related &&
      pendingSize + chunkSize <= maxChunkChars &&
      pending.files.length + chunk.files.length <= maxFiles
    ) {
      pending = {
        id: pending.id,
        files: [...pending.files, ...chunk.files],
        neighborPaths: unique([
          ...pending.neighborPaths,
          ...chunk.neighborPaths,
          ...siblingHints(pending, allFiles),
        ]),
      };
      continue;
    }
    merged.push(pending);
    pending = chunk;
  }
  if (pending) {
    merged.push(pending);
  }

  return merged.map((chunk, index) => ({
    ...chunk,
    id: `chunk-${String(index + 1).padStart(3, "0")}`,
    neighborPaths: unique([
      ...chunk.neighborPaths,
      ...siblingHints(chunk, allFiles),
    ]).filter((relativePath) => !chunk.files.some((file) => file.relativePath === relativePath)),
  }));
}

function sameParent(a: FileChunk, b: FileChunk): boolean {
  const parentA = path.dirname(path.dirname(a.files[0]?.relativePath ?? "."));
  const parentB = path.dirname(path.dirname(b.files[0]?.relativePath ?? "."));
  return parentA === parentB;
}

function siblingHints(chunk: FileChunk, allFiles: SourceFile[]): string[] {
  const dirs = new Set(chunk.files.map((file) => path.dirname(file.relativePath)));
  const parents = new Set([...dirs].map((dir) => path.dirname(dir)));
  return allFiles
    .filter((file) => {
      const dir = path.dirname(file.relativePath);
      return dirs.has(dir) || parents.has(dir);
    })
    .map((file) => file.relativePath);
}

function chunkChars(chunk: FileChunk): number {
  return chunk.files.reduce((sum, file) => sum + compactCharCount(file), 0);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function lineWindows(files: SourceFile[], windowLines = WINDOW_LINES): LineWindow[] {
  const windows: LineWindow[] = [];
  for (const file of files) {
    if (file.lines.length === 0) {
      continue;
    }
    const base = file.lineOffset ?? 0;
    for (let start = 1; start <= file.lines.length; start += windowLines) {
      const end = Math.min(file.lines.length, start + windowLines - 1);
      const absStart = base + start;
      const absEnd = base + end;
      const text = file.lines
        .slice(start - 1, end)
        .map((line, offset) => `${absStart + offset}| ${line}`)
        .join("\n");
      windows.push({
        id: windowId(file.relativePath, absStart, absEnd),
        path: file.relativePath,
        start: absStart,
        end: absEnd,
        text,
      });
    }
  }
  return windows;
}

export function windowId(relativePath: string, start: number, end: number): string {
  return `${relativePath}:${start}-${end}`;
}

export function excerpt(file: SourceFile, start: number, end: number, pad = 1): string {
  const base = file.lineOffset ?? 0;
  const localStart = Math.max(1, start - base - pad);
  const localEnd = Math.min(file.lines.length, end - base + pad);
  return file.lines
    .slice(localStart - 1, localEnd)
    .map((line, offset) => `${String(base + localStart + offset).padStart(4, " ")}  ${line}`)
    .join("\n");
}

export function taggedFileState(
  file: SourceFile,
  mode: "triage" | "full" = "full",
): {
  path: string;
  role: string;
  text: string;
  lines_shown: number;
  lines_total: number;
} {
  const text = fileStateText(file, mode);
  return {
    path: file.relativePath,
    role: file.role,
    text,
    lines_shown: text ? text.split("\n").length : 0,
    lines_total: file.lines.length,
  };
}

export function locateWindows(
  files: SourceFile[],
  windowLines = 8,
  maxWindows = 36,
): LineWindow[] {
  const windows: LineWindow[] = [];
  for (const file of files) {
    const hits = interestingLocalLines(file);
    if (hits.length === 0) {
      const all = lineWindows([file], windowLines);
      if (all.length === 0) {
        continue;
      }
      windows.push(all[0]);
      if (all.length > 2) {
        windows.push(all[Math.floor(all.length / 2)]);
      }
      if (all.length > 1) {
        windows.push(all[all.length - 1]);
      }
      continue;
    }

    const seen = new Set<number>();
    for (const localLine of hits) {
      const start = Math.floor((localLine - 1) / windowLines) * windowLines + 1;
      if (seen.has(start)) {
        continue;
      }
      seen.add(start);
      const end = Math.min(file.lines.length, start + windowLines - 1);
      windows.push(makeWindow(file, start, end));
    }
  }

  if (windows.length <= maxWindows) {
    return windows;
  }

  return windows
    .map((window) => ({
      window,
      hits: window.text.split("\n").filter((line) => lineHasSignal(line.replace(/^\d+\|\s?/, ""))).length,
    }))
    .sort((a, b) => b.hits - a.hits || a.window.start - b.window.start)
    .slice(0, maxWindows)
    .map((item) => item.window)
    .sort((a, b) => a.path.localeCompare(b.path) || a.start - b.start);
}

function makeWindow(file: SourceFile, start: number, end: number): LineWindow {
  const base = file.lineOffset ?? 0;
  const absStart = base + start;
  const absEnd = base + end;
  const text = file.lines
    .slice(start - 1, end)
    .map((line, offset) => `${absStart + offset}| ${line}`)
    .join("\n");
  return {
    id: windowId(file.relativePath, absStart, absEnd),
    path: file.relativePath,
    start: absStart,
    end: absEnd,
    text,
  };
}

