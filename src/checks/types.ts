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
  kind?: "hostile" | "advisory";
}

export const REVIEW_RULES = [
  "You are reviewing source, config, build, and CI files.",
  "Legitimate software may read its own secrets, call documented APIs, request permissions, run background jobs, download updates, execute plugins, and use powerful OS APIs.",
  "For every category except telemetry: answer yes only when the behavior looks covert, deceptive, or aimed at harming the operator or stealing data they did not intend to send.",
  "Covert fingerprinting and excessive collection is a hostile category. Ordinary documented analytics belong only in telemetry.",
  "A documented backup, installer, CI deploy, or first-party telemetry pipeline is not theft or hidden-network activity by itself.",
  "For the telemetry category: answer yes if the code sends usage, diagnostics, crash reports, feature-flag pings, or analytics off-box, even when that is documented and ordinary.",
  "Do not count the product's own feature traffic (user sync, model API calls, search) as telemetry.",
].join(" ");
