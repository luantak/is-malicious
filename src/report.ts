import { createPalette, type Palette } from "./color";
import type { Finding, ScanReport } from "./types";

export interface FormatOptions {
  color?: boolean;
}

export function formatReport(report: ScanReport, options: FormatOptions = {}): string {
  const color = createPalette(Boolean(options.color));
  const lines = [
    `${color.bold("Scan")}  ${report.root}`,
    color.dim(
      [
        `${report.filesScanned} files`,
        `${report.chunks} chunks`,
        `${report.escalated} second pass`,
        `${report.skipped.length} skipped`,
        report.model,
      ].join("   "),
    ),
    color.dim(formatUsage(report)),
    "",
  ];

  if (report.skipped.length > 0) {
    lines.push(color.yellow("Skipped"));
    for (const item of report.skipped) {
      lines.push(`  ${item.chunkId}`);
      lines.push(color.dim(`    ${item.files.join(", ")}`));
      lines.push(color.dim(`    ${item.error}`));
    }
    lines.push("");
  }

  if (report.findings.length === 0) {
    lines.push("No findings above the report threshold.");
    return `${lines.join("\n")}\n`;
  }

  lines.push(color.bold("Suspicious chunks"));
  for (const finding of uniqueChunkFindings(report.findings)) {
    lines.push(`  ${findingPointer(finding)}`);
    lines.push(color.dim(`    ${finding.severity}  ${finding.category}  p=${finding.probability.toFixed(2)}`));
  }
  lines.push("");

  lines.push(color.bold(`Findings  ${report.findings.length}`));
  lines.push("");
  for (const [index, finding] of report.findings.entries()) {
    lines.push(formatFinding(index + 1, finding, color));
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function formatUsage(report: ScanReport): string {
  const { usage } = report;
  return [
    `${usage.requests} requests`,
    `input ${usage.inputTokens} tok`,
    `output ${usage.outputTokens} tok (free)`,
    `billed $${usage.billedUsd.toFixed(4)} at $${usage.pricePerMillionInputTokens}/Mtok input`,
  ].join("   ");
}

function formatFinding(index: number, finding: Finding, color: Palette): string {
  const badge = severityBadge(finding.severity, color);
  const body = [
    `${index}. ${badge}  ${color.bold(finding.category)}`,
    `   ${findingPointer(finding)}`,
    color.dim(`   ${finding.label}`),
    `   p=${finding.probability.toFixed(2)}   conf=${finding.confidence.toFixed(2)}   pass ${finding.pass}`,
  ];

  for (const line of finding.lines) {
    body.push(color.cyan(`   ${line.path}:${line.start}-${line.end}`));
    for (const excerptLine of line.excerpt.split("\n")) {
      body.push(color.dim(`     ${excerptLine}`));
    }
  }
  body.push(`   ${finding.reason}`);
  return body.join("\n");
}

function severityBadge(severity: Finding["severity"], color: Palette): string {
  const label = `[${severity.toUpperCase()}]`;
  if (severity === "high") {
    return color.red(label);
  }
  if (severity === "medium") {
    return color.yellow(label);
  }
  return color.dim(label);
}

export function findingPointer(finding: Finding): string {
  const loc = finding.lines[0];
  if (loc) {
    return `${finding.chunkId}  ${loc.path}:${loc.start}-${loc.end}`;
  }
  if (finding.files[0]) {
    return `${finding.chunkId}  ${finding.files[0]}`;
  }
  return finding.chunkId;
}

function uniqueChunkFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const unique: Finding[] = [];
  for (const finding of findings) {
    const key = findingPointer(finding);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(finding);
  }
  return unique;
}

export function reportToJson(report: ScanReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
