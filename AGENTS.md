# Agent Instructions

This repository supports a Pavilion AI in GTM workshop about reliably analyzing information larger than a model's working context.

## Operating principles

1. Read before write.
2. Draft before send.
3. Dry-run before apply.
4. Never claim corpus-wide coverage without a machine-readable manifest proving it.
5. Every analytical claim must remain traceable to transcript IDs and evidence spans.
6. Preserve failures and uncertainty; do not silently drop unprocessed records.
7. Do not put instructor ground truth, hidden findings, or evaluator answers in tracked files.

## Commands

- `npm run inventory` reports corpus coverage.
- `npm run validate` checks every manifest entry and checksum.
- `npm test` runs tests.
- `npm run typecheck` checks TypeScript.
- `npm run attio:doctor` verifies Attio access without writing.
- `npm run attio:export` builds deterministic Attio seed artifacts.
- `npm run attio:plan` creates a reviewable dry-run import plan.
- `npm run attio:apply -- --approve` applies an approved plan and writes a resumable local ledger.
- `npm run attio:verify` reconciles expected ACME IDs against live Attio and rejects missing or duplicate records.
- `npm run workshop:migrate:local` prepares the local survey database.
- `npm run workshop:dev` starts the Cloudflare workshop companion locally.
- `npm run workshop:migrate:remote` and `npm run workshop:deploy` migrate and deploy the hosted companion.

The authored corpus under `data/generated/` is tracked and must not be replaced with newly generated placeholder data. Reports and generated Attio exports are intentionally gitignored. Never read or write an Attio token from command-line arguments. Attio writes require a dry-run plan followed by explicit human approval.
