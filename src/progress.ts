import type { ScanProgress } from "./types";

const CLEAR = "\x1b[2K";

export function createProgressRenderer(stream: NodeJS.WriteStream): (progress: ScanProgress) => void {
  const tty = Boolean(stream.isTTY);
  let lastNote: string | undefined;
  let lastDraw = 0;

  return (progress) => {
    if (progress.note && progress.note !== lastNote && !tty) {
      stream.write(`${progress.note}\n`);
      lastNote = progress.note;
    }

    const now = Date.now();
    if (!tty && now - lastDraw < 400 && progress.done < progress.chunks) {
      return;
    }
    lastDraw = now;

    const line = formatProgressLine(progress);
    if (tty) {
      stream.write(`\r${CLEAR}${line}`);
      if (progress.done >= progress.chunks && progress.inflight === 0) {
        stream.write("\n");
      }
      return;
    }
    stream.write(`${line}\n`);
  };
}

export function formatProgressLine(progress: ScanProgress): string {
  const width = 24;
  const ratio = progress.chunks === 0 ? 1 : progress.done / progress.chunks;
  const filled = Math.round(ratio * width);
  const bar = `${"#".repeat(filled)}${"-".repeat(width - filled)}`;
  const current = progress.current ? `  ${truncate(progress.current, 48)}` : "";
  const extra = [
    progress.findings ? `${progress.findings} hit${progress.findings === 1 ? "" : "s"}` : "",
    progress.escalated ? `${progress.escalated} second pass` : "",
    progress.skipped ? `${progress.skipped} skipped` : "",
  ]
    .filter(Boolean)
    .join("  ");

  return [
    `[${bar}]`,
    `${progress.done}/${progress.chunks}`,
    progress.inflight ? `${progress.inflight} running` : "",
    extra,
    current,
  ]
    .filter(Boolean)
    .join("  ")
    .trimEnd();
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `...${value.slice(-(max - 3))}`;
}
