# is-malicious?

Scan a codebase for hidden, deceptive, or data-stealing behavior with TypeSafe Jev. The CLI sends source, configuration, build, and CI files to Jev for review, then points you to suspicious files and lines.

Use it as a second opinion before running unfamiliar code. A clean report is not proof that a project is safe.

## Quick start

You need Node.js 20 or later and a TypeSafe API key.

```bash
export TYPESAFE_API_KEY=your-api-key
npx is-malicious /path/to/project
```

Omit the path to scan the current directory. Scans send file contents to the TypeSafe API and use paid input tokens. The report includes token usage and a calculated input cost.

To use another service that implements the [TypeSafe evaluation API](https://docs.typesafe.ai/api), set its API root and key, then choose a model it serves:

```bash
export TYPESAFE_API_KEY=your-provider-key
is-malicious /path/to/project --base-url http://localhost:8000 --model your-model
```

The API root can also come from `TYPESAFE_BASE_URL`; `--base-url` takes precedence. The service must accept `POST /v1/systemone` with TypeSafe's `state`, `model`, and typed `questions` request and return matching `answers` and `usage`. The CLI reports token counts for other providers but leaves cost unknown because their prices vary. File contents go to the configured endpoint. Model quality and scan accuracy depend on the provider.

To install the CLI globally:

```bash
npm install -g is-malicious
is-malicious /path/to/project
```

## Reading the report

<img width="1106" height="341" alt="Screenshot 2026-09-18 at 19 35 35" src="https://github.com/user-attachments/assets/611c979a-8dd4-4fc8-8963-0843314e6a55" />

Findings include a file, line range, category, probability, confidence, and a short reason label. Use these to decide which code to read first.

Telemetry appears separately as `info`, including documented analytics, crash reports, and feature-flag pings. Telemetry alone does not cause a failing exit code.

| Exit code | Meaning |
| --- | --- |
| `0` | No high-severity findings. The report may still contain other findings. |
| `1` | At least one high-severity finding. |
| `2` | The command failed, for example because of an invalid flag or a scan error. |

If any chunk cannot be scanned, the report lists it as skipped and the command exits with code `2`.

Both high and low scores can be wrong. Review the flagged code and the scan's coverage before deciding whether to run a project.

## What it checks

Jev reviews file contents for behavior and context. Ordinary credential use, documented services, and normal deployment jobs are intended to score low.

The checks cover:

| Area | Behaviors |
| --- | --- |
| Data theft and collection | Credential theft, unexpected data uploads, covert fingerprinting, excessive collection, and surveillance of input or devices |
| Network and execution | Hidden network activity, downloading and running hidden code, remote commands, and command-and-control channels |
| Access and persistence | Permission abuse, hidden startup or background processes, authentication bypasses, backdoors, and resistance to removal |
| Concealment | Obfuscation, anti-analysis checks, impersonation, and other deceptive behavior |
| System abuse | Destruction or sabotage, weakened security controls, cryptomining, unwanted proxying, and spreading to other machines |
| Build and dependencies | Suspicious build or CI steps and supply-chain manipulation |
| Telemetry | Usage analytics, diagnostics, crash reports, and feature-flag pings, reported as advisory findings |

The check definitions live in [`src/checks/builtin.ts`](src/checks/builtin.ts). To add a check, add and register a definition. The scanner handles checks through the same interface.

## Limits and coverage

The scanner reads selected text files. It does not inspect binaries, disk images, installers, or running processes.

It respects `.gitignore` and skips files such as:

- Images, binaries, and lockfiles.
- Environment files named `.env` or `.env.*`.
- Generated bundles and compiled `dist`, `lib`, and `build` output.
- TypeScript declarations, `tsconfig`, and JSON configuration that its filters exclude. Credential-like or long encoded values alone do not make a non-manifest JSON file eligible for upload.
- Files larger than 400,000 bytes and unsupported file types.

Malicious behavior in skipped files will not appear in the scan.

This tool also does not audit known dependency vulnerabilities or inventory committed secrets. Use a dependency auditor for known vulnerabilities and a secret scanner for exposed keys.

It does not sandbox code. Install scripts and postinstall hooks can still run when you install a project, even after a clean report.

## GitHub Actions

1. Copy a workflow from [`examples/github-actions/`](examples/github-actions/) to `.github/workflows/is-malicious.yml`.
2. Add a repository secret named `TYPESAFE_API_KEY`.
3. Make the PR base available with `fetch-depth: 0` or an explicit fetch of the base branch.

Choose the workflow that fits your needs:

| Workflow | Behavior |
| --- | --- |
| [`scan-pr.yml`](examples/github-actions/scan-pr.yml) | Scan files changed against the PR base and fail on high-severity findings. |
| [`scan-pr-comment.yml`](examples/github-actions/scan-pr-comment.yml) | Run the same scan and post or update a report comment. |

Both use this command to scan the PR's changed files:

```bash
npx --yes is-malicious . --diff-from "origin/${{ github.base_ref }}"
```

Fork PRs do not receive the API secret by default. Do not switch to `pull_request_target` just to expose the key to a fork PR. Running untrusted PR code in that context can expose your secrets.

## Agent skill

[![skills.sh](https://skills.sh/b/luantak/is-malicious)](https://skills.sh/luantak/is-malicious)

The agent skill instructs an agent to scan a repository after cloning it, or when asked whether it is safe. The scan should happen before installing dependencies or running the project.

Install the skill for the current project:

```bash
npx skills add luantak/is-malicious
```

Or install it globally:

```bash
npx skills add -g luantak/is-malicious
```

The agent runs `npx is-malicious`, so `TYPESAFE_API_KEY` must be set in its environment. See the [skills CLI docs](https://www.skills.sh/docs) for listing, updating, and removing skills.

## How a scan works

1. Find eligible files under the requested path, respecting ignore rules and file filters.
2. Group files by directory into chunks that fit the character budget. Split larger files into consecutive slices.
3. Send each chunk to Jev with all check categories in one request. The first pass includes the full contents of each selected file, with extra blank lines collapsed.
4. Run a second pass on suspicious or uncertain chunks, or chunks with a high overall risk score. This pass focuses on line windows in the file Jev identified.
5. Print findings, token usage, and the calculated input cost.

If Jev returns `max_tokens_exceeded`, the scanner splits the chunk and retries.

Jev answers typed questions using `noul`, `choice`, and `score`. Noul answers have no separate confidence field, so the report calculates confidence as `2 * |p - 0.5|`. Probabilities of `0.91` and `0.09` therefore have the same confidence, though they point to opposite answers.

## Usage

```text
is-malicious [path] [options]
```

| Option | What it does | Default |
| --- | --- | --- |
| `--json` | Print the full report as JSON | Off |
| `--model <name>` | Choose a Jev model | `jev-latest` |
| `--base-url <url>` | Use a TypeSafe-compatible API root | `https://api.typesafe.ai` |
| `--concurrency <n>` | Set the number of parallel chunk requests | `12` |
| `--min-prob <n>` | Set the minimum category probability to report | `0.40` |
| `--diff-from <ref>` | Scan only files changed since a Git ref | Scan all eligible files |
| `-h`, `--help` | Show help | |

For example, scan files changed since `origin/main`:

```bash
is-malicious . --diff-from origin/main
```

This scans the changed files, not just the changed lines, so you can review a PR without paying to rescan the whole project.

## Development

From a checkout:

```bash
npm install
npm run build
npx tsx src/cli.ts /path/to/project
```

Run the tests:

```bash
npm test
```

Scan tests use a scripted Jev client, so they spend no API credits. Fixtures under [`fixtures/`](fixtures/) cover benign code, suspicious behavior such as remote `eval` and secret theft, and telemetry.
