export interface Palette {
  enabled: boolean;
  dim(text: string): string;
  bold(text: string): string;
  red(text: string): string;
  yellow(text: string): string;
  green(text: string): string;
  cyan(text: string): string;
}

function wrap(enabled: boolean, code: string, text: string): string {
  if (!enabled) {
    return text;
  }
  return `\x1b[${code}m${text}\x1b[0m`;
}

export function createPalette(enabled: boolean): Palette {
  return {
    enabled,
    dim: (text) => wrap(enabled, "2", text),
    bold: (text) => wrap(enabled, "1", text),
    red: (text) => wrap(enabled, "31", text),
    yellow: (text) => wrap(enabled, "33", text),
    green: (text) => wrap(enabled, "32", text),
    cyan: (text) => wrap(enabled, "36", text),
  };
}

export function shouldColor(stream: NodeJS.WriteStream): boolean {
  if (process.env.NO_COLOR) {
    return false;
  }
  if (process.env.FORCE_COLOR) {
    return true;
  }
  return Boolean(stream.isTTY);
}
