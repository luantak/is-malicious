export interface NoulCriteria {
  true: string;
  false: string;
}

export interface SemanticCheck {
  id: string;
  label: string;
  instructions: string;
  criteria: NoulCriteria;
  reasons: Record<string, string>;
}

export const REVIEW_RULES = [
  "You are reviewing source, config, build, and CI files for malicious or deceptive behavior.",
  "Legitimate software may read its own secrets, call documented APIs, request permissions, run background jobs, download updates, execute plugins, and use powerful OS APIs.",
  "Answer yes only when the behavior looks covert, deceptive, or aimed at harming the operator or stealing data they did not intend to send.",
  "A documented backup, installer, CI deploy, or first-party telemetry pipeline is not theft by itself.",
].join(" ");
