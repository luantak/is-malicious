import type { Finding, ScanReport } from "./types";

export function formatReport(report: ScanReport): string {
  const lines = [
    `Scan: ${report.root}`,
    `Files ${report.filesScanned}  chunks ${report.chunks}  escalated ${report.escalated}  model ${report.model}`,
    formatUsage(report),
    "",
  ];

  if (report.findings.length === 0) {
    lines.push("No findings above the report threshold.");
    return lines.join("\n");
  }

  lines.push("Findings");
  for (const [index, finding] of report.findings.entries()) {
    lines.push(formatFinding(index + 1, finding));
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

function formatUsage(report: ScanReport): string {
  const { usage } = report;
  return [
    `Requests ${usage.requests}`,
    `input ${usage.inputTokens} tok`,
    `output ${usage.outputTokens} tok (free)`,
    `billed $${usage.billedUsd.toFixed(4)} at $${usage.pricePerMillionInputTokens}/Mtok input`,
  ].join("  ");
}

function formatFinding(index: number, finding: Finding): string {
  const header = [
    `${index}. [${finding.severity.toUpperCase()}] ${finding.category}`,
    `p=${finding.probability.toFixed(2)}`,
    `conf=${finding.confidence.toFixed(2)}`,
    `pass ${finding.pass}`,
  ].join("  ");

  const body = [
    header,
    `   ${finding.label}`,
    `   files: ${finding.files.join(", ")}`,
  ];

  for (const line of finding.lines) {
    body.push(`   ${line.path}:${line.start}-${line.end}`);
    for (const excerptLine of line.excerpt.split("\n")) {
      body.push(`     ${excerptLine}`);
    }
  }
  body.push(`   reason: ${finding.reason}`);
  return body.join("\n");
}

export function reportToJson(report: ScanReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
