# is-malicious

CLI that walks a repo and asks TypeSafe Jev whether each chunk of source, config, build, or CI looks hostile.

Jev does not write prose. Each request sends the files as `state` and a bundle of typed questions (`noul`, `choice`, `score`). The report's reasons are closed labels plus the source lines Jev points at.

## What it checks

These categories ship in `src/checks/builtin.ts`. Add another object and register it; the scanner does not special-case them.

- credential / secret theft
- unexpected data exfiltration
- hidden or suspicious network activity
- dynamic code download / execution
- permission abuse
- persistence / background execution
- stealth / obfuscation
- deceptive behavior
- suspicious build / CI behavior

The prompts treat ordinary powerful behavior as fine. Reading your own API key, calling a documented host, running a worker, or deploying from CI is not enough. Jev is asked to say yes only when the behavior looks covert, deceptive, or aimed at stealing data.

## How a scan runs

1. Recurse from the given path. Skip binaries, images, lockfiles, generated bundles, and vendored trees such as `node_modules` / `vendor` / `dist`.
2. Group files that share a directory, splitting when a chunk would blow the character budget.
3. First pass: one Jev request per chunk, every category asked together.
4. Second pass only if a category is hot or near 0.5, or the overall risk score is high. That pass adds neighboring files and asks which line window and reason label fit.
5. Print paths, line ranges, category, probability, confidence, and the reason label.
6. Sum `usage.input_tokens` from every Jev response and print the billed input cost. Output tokens are free.

Noul answers have no separate `confidence` field in the API. The report uses `2 * |p - 0.5|` so a 0.91 yes and a 0.09 no both read as confident.

## Setup

```bash
npm install
export TYPESAFE_API_KEY=...
npx tsx src/cli.ts /path/to/project
```

Or `npm run build` and `node dist/cli.js`.

```
is-malicious [path] [--json] [--model jev-latest] [--concurrency 2] [--min-prob 0.40]
```

Exit code 1 means at least one high finding.

## Tests

```bash
npm test
```

The suite uses two fixtures under `fixtures/`:

- `benign-notes` — local notes CLI and a normal GitHub Actions job
- `suspicious-dropper` — remote `eval`, env/SSH theft, and a CI job that posts secrets

Those scans use a scripted Jev client so `npm test` spends no API credits.
