export { REVIEW_RULES, type NoulCriteria, type SemanticCheck } from "./types";
export { builtinChecks } from "./builtin";

import { builtinChecks } from "./builtin";
import type { SemanticCheck } from "./types";

const registry = new Map<string, SemanticCheck>(
  builtinChecks.map((check) => [check.id, check]),
);

export function listChecks(): SemanticCheck[] {
  return [...registry.values()];
}

export function getCheck(id: string): SemanticCheck | undefined {
  return registry.get(id);
}

export function registerCheck(check: SemanticCheck): void {
  registry.set(check.id, check);
}

export function resetChecks(checks: SemanticCheck[] = builtinChecks): void {
  registry.clear();
  for (const check of checks) {
    registry.set(check.id, check);
  }
}
