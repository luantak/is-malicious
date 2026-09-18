#!/usr/bin/env node
import { formatReport, reportToJson } from "./report";
import { scanProject } from "./scan";

interface CliArgs {
  root: string;
  json: boolean;
  model?: string;
  concurrency?: number;
  minProb?: number;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { root: "", json: false, help: false };
  const rest: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--json") {
      args.json = true;
    } else if (token === "--help" || token === "-h") {
      args.help = true;
    } else if (token === "--model") {
      args.model = argv[++i];
    } else if (token === "--concurrency") {
      args.concurrency = Number(argv[++i]);
    } else if (token === "--min-prob") {
      args.minProb = Number(argv[++i]);
    } else if (token.startsWith("-")) {
      throw new Error(`Unknown flag: ${token}`);
    } else {
      rest.push(token);
    }
  }

  args.root = rest[0] ?? process.cwd();
  return args;
}

function usage(): string {
  return [
    "Usage: is-malicious [path] [options]",
    "",
    "Scan source, config, build, and CI files with TypeSafe Jev.",
    "",
    "Options:",
    "  --json              Print the full report as JSON",
    "  --model <name>      Jev model (default: jev-latest)",
    "  --concurrency <n>   Parallel chunk requests (default: 2)",
    "  --min-prob <n>      Minimum category probability to report (default: 0.40)",
    "  -h, --help          Show this help",
    "",
    "Set TYPESAFE_API_KEY in the environment.",
  ].join("\n");
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 2;
  }

  if (args.help) {
    console.log(usage());
    return 0;
  }

  const report = await scanProject({
    root: args.root,
    model: args.model,
    concurrency: args.concurrency,
    thresholds: args.minProb === undefined ? undefined : { reportProbability: args.minProb },
  });

  process.stdout.write(args.json ? reportToJson(report) : formatReport(report));
  return report.findings.some((finding) => finding.severity === "high") ? 1 : 0;
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(2);
    },
  );
}
