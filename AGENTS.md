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

- `npm run generate` creates the deterministic local corpus.
- `npm run inventory` reports corpus coverage.
- `npm run validate` checks every manifest entry and checksum.
- `npm test` runs tests.
- `npm run typecheck` checks TypeScript.
- `docker compose up -d` starts Twenty CRM at http://localhost:3000.

Generated data and reports are intentionally gitignored. Twenty writes must support a dry-run preview before application.

