export const CHARS_PER_TOKEN = 3;
export const STATE_TOKEN_BUDGET = 20_000;

export function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / CHARS_PER_TOKEN);
}

export function isMaxTokensError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.message} ${error.name}` : String(error);
  return text.includes("max_tokens_exceeded");
}
