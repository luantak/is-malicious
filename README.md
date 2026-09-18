# is-malicious

A CLI that reads a repo the way a hostile-code reviewer would, then asks TypeSafe Jev whether the source, config, build, or CI looks covert, deceptive, or built to steal data.

It is a second opinion on a tree you have not read yet. It is not a verdict, and it is not permission to run the project.

## What this is

- A **semantic** scan. Jev sees file text and answers typed questions (`noul`, `choice`, `score`). It does not grep for a malware signature list and stop there.
- A **behavior** scan. The hostile questions are about theft, exfil, hidden network use, decode-and-run, backdoors, remote command, surveillance, sabotage, supply-chain swaps, security weakening, mining/proxying, lateral movement, anti-removal, covert fingerprinting, permission abuse, persistence, stealth, deception, and dirty CI. Ordinary powerful code (your own API key, a documented host, a worker, a normal deploy job) is supposed to score low.
- A **disclosure** scan for telemetry. Usage analytics, crash reports, and feature-flag pings show up even when they are documented and not hostile. They print under Telemetry as `info`, not as a dropper. The process still exits 0 unless something else is high.
- A **pointer**. Findings name a chunk, a file, a line range, a category, a probability, and a closed reason label. Jev does not write an essay.
- A **paid API client**. Input tokens are billed. Output tokens are free. The report prints the actual bill.

The first pass sends each scanned file in full. Extra blank lines are collapsed. Files that do not fit the chunk budget are split and sent as consecutive slices, still with every line. A second pass runs only on hot or uncertain chunks and windows the file Jev pointed at.

## What this is not

- **Not antivirus.** It does not inspect binaries, disk images, or running processes. It will not catch a malicious `.so` or a signed installer.
- **Not a CVE or lockfile audit.** It does not tell you that lodash is old. Use `npm audit`, OSV, or your normal dependency tools for that.
- **Not a secret scanner.** It looks for code that *steals* secrets. It does not inventory keys you already committed. Use gitleaks or trufflehog for that.
- **Not a sandbox.** A clean report does not make `npm install` or `curl | bash` safe. Install scripts and postinstall hooks can still fire.
- **Not proof.** A high score means Jev thinks that span looks hostile. A low score means it did not see that in the text it was shown. Either can be wrong.
- **Not complete.** It honors `.gitignore`, skips binaries, images, lockfiles, generated bundles, `tsconfig`, compiled `dist`/`lib`/`build` output, and boring JSON. Malice that lives only there will not be read.
- **Not a substitute for reading the code you are about to run.**

If you need to know whether a dependency has a known vuln, or whether a binary is malware, use the tool built for that. This one answers a narrower question: does this source tree look like it is trying to hide something.

## What it checks

These categories live in `src/checks/builtin.ts`. Add an object and register it. The scanner does not special-case them.

- credential / secret theft
- unexpected data exfiltration
- hidden or suspicious network activity
- dynamic code download / execution
- permission abuse
- persistence / background execution
- stealth / obfuscation
- deceptive behavior
- suspicious build / CI behavior
- telemetry / analytics (advisory: users should know it phones home, even when that is ordinary)
- authentication bypass / hidden backdoor
- remote command execution / command-and-control
- surveillance / input and device capture
- destructive behavior / sabotage
- supply-chain manipulation
- security weakening
- resource abuse / cryptomining / proxying
- lateral movement / propagation
- anti-removal / self-protection
- covert fingerprinting / excessive collection

## How a scan runs

1. Recurse from the given path. Honor `.gitignore` the way git does (`git ls-files --exclude-standard` when the tree is a repo). Skip the noise listed above. If Jev returns `max_tokens_exceeded`, the scanner splits that chunk and retries.
2. Group files that share a directory, splitting when a chunk would blow the character budget.
3. First pass: one Jev request per chunk, every category asked together.
4. Second pass only if a category is hot or near 0.5, or the overall risk score is high.
5. Print paths, line ranges, category, probability, confidence, and the reason label.
6. Sum `usage.input_tokens` and print the billed input cost.

Noul answers have no separate `confidence` field. The report uses `2 * |p - 0.5|` so a 0.91 yes and a 0.09 no both read as confident.

## Install

```bash
export TYPESAFE_API_KEY=...
npx is-malicious /path/to/project
```

Or install it once:

```bash
npm install -g is-malicious
is-malicious /path/to/project
```

From a checkout:

```bash
npm install
npm run build
npx tsx src/cli.ts /path/to/project
```

```
is-malicious [path] [--json] [--model jev-latest] [--concurrency 12] [--min-prob 0.40] [--diff-from origin/main]
```

`--diff-from` only reads files `git diff` reports since that ref. Use it on PRs so you are not paying to rescan the whole tree.

Exit code 1 means at least one high finding. Exit 0 means none of the findings cleared the high bar. Telemetry and uncertain hits can still be in the report.

## GitHub Actions

Copy a workflow from `examples/github-actions/` into `.github/workflows/is-malicious.yml`.

Add a repo secret named `TYPESAFE_API_KEY`.

`scan-pr.yml` scans the files changed against the PR base and fails the check on a high finding. `scan-pr-comment.yml` does the same and posts or updates a report comment.

Fork PRs do not get that secret unless you change the default GitHub settings. Do not switch the workflow to `pull_request_target` just to get a key. That runs untrusted workflow files with your secrets.

To scan only the PR:

```yaml
npx --yes is-malicious . --diff-from "origin/${{ github.base_ref }}"
```

Checkout needs `fetch-depth: 0` (or a fetch of the base branch) so the merge-base exists.

## Agent skill

[![skills.sh](https://skills.sh/b/luantak/is-malicious)](https://skills.sh/luantak/is-malicious)

After a `git clone`, or when someone asks whether a tree is safe, the agent should run this CLI **before** `npm install`, `pip install`, or running the project.

Install it with the [skills CLI](https://www.skills.sh/docs):

```bash
npx skills add luantak/is-malicious
```

Global, for every project:

```bash
npx skills add -g luantak/is-malicious
```

The agent then calls `npx is-malicious`. You still need `TYPESAFE_API_KEY` in the environment.

See [skills.sh/docs](https://www.skills.sh/docs) for list, update, and remove.

## Tests

```bash
npm test
```

The suite uses two fixtures under `fixtures/`:

- `benign-notes` — local notes CLI and a normal GitHub Actions job
- `suspicious-dropper` — remote `eval`, env/SSH theft, and a CI job that posts secrets

Those scans use a scripted Jev client so `npm test` spends no API credits.
