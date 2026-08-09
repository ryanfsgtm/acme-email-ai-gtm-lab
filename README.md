# ACME Email AI in GTM Lab

A large, synthetic marketing-automation CRM and call-transcript corpus for learning how coding agents reliably analyze information that does not fit in one model context window.

The workshop contrasts two requests:

> Summarize these call transcripts.

and:

> Build a reliable system to analyze these call transcripts with complete coverage, durable intermediate artifacts, citations, validation, and resumable execution.

## Included corpus

- 1,000 fictional accounts
- 3,500 fictional contacts
- 1,600 opportunities
- 2,500 call transcripts
- 2.64 million transcript words
- 18 months of sales and customer activity

The corpus contains common themes, rare commercially important signals, misleading correlations, seller-introduced topics, temporal shifts, and multi-call patterns. Instructor ground truth and semantic evaluation remain permanently private.

## What each student needs

- Git
- Node.js 22 or newer
- A free [Attio](https://attio.com/) workspace where they are an admin
- About 10 minutes before class to install, seed, and verify the workspace

Use a new workshop workspace rather than a real company CRM. Existing Attio sample records are harmless—the verifier counts only records marked as part of the ACME corpus.

## 1. Clone and validate the corpus

```bash
git clone https://github.com/ryanfsgtm/acme-email-ai-gtm-lab.git
cd acme-email-ai-gtm-lab
npm install
cp .env.example .env
npm run inventory
npm run validate
```

On a clean 2-core, 8 GB Linux environment, cloning took about 2 seconds, `npm install` took 7 seconds, and corpus validation took 2 seconds. The repository uses about 353 MB after installation. If a prerequisite check fails, fix that prerequisite and rerun the same command; do not reclone the repository.

## 2. Create the Attio access token

In Attio:

1. Create a free workspace for the class.
2. Open the menu beside the workspace name and choose **Workspace settings**.
3. Open **Developers** and choose **New access token**.
4. Name it `ACME Email workshop`.
5. Set Objects, Records, Notes, and Users/User management to read/write.
6. Copy the token into the local `.env` file as `ATTIO_API_KEY`.

If the Attio workspace has multiple members, also set `ATTIO_DEAL_OWNER_EMAIL` in `.env`. A one-person workshop workspace does not need it.

Verify the connection without changing Attio:

```bash
npm run attio:doctor
```

## 3. Build and review the seed plan

```bash
npm run attio:export
npm run attio:plan
```

The generated `seed/attio/` directory contains Companies, People, and Deals CSV files plus a JSONL note feed containing all 2,500 transcripts. These artifacts are derived from the canonical authored corpus and are ignored by Git so they cannot drift independently.

The plan proposes 8,600 writes and makes no remote changes. Inspect `reports/attio-seed-plan.json` before continuing.

## 4. Seed Attio

The importer follows four ordered phases: upsert Companies by synthetic domain, upsert People by synthetic email, reconcile Deals, then attach transcripts as Notes to their Company records. Apply only after inspecting the plan:

```bash
npm run attio:apply -- --approve
```

The importer defaults to 10 concurrent requests, a rate verified against a fresh Attio workspace. It coordinates rate-limit cooldowns across workers, honors Attio's `Retry-After` response, and retries transient failures. A complete import generally takes several minutes.

It is safe to resume after an interruption or terminal `429` error: rerun the exact same command. Successful remote IDs are appended to `reports/attio-import-ledger.jsonl`, and every run reconciles Attio before writing. The ledger is tied to the workspace ID so it cannot silently skip records in a different workspace.

Do not delete the ledger while an import is in progress. If it is lost, the importer discovers existing ACME Companies, People, Deals, and Notes from stable markers before continuing.

## 5. Verify the seeded CRM

```bash
npm run attio:verify
```

Success ends with:

```text
✓ Attio contains the complete, duplicate-free ACME Email seed corpus.
```

The verifier ignores unrelated sample data and checks for exactly 1,000 unique ACME Companies, 3,500 People, 1,600 Deals, and 2,500 transcript Notes. It fails on missing IDs or duplicates and saves details to `reports/attio-verification.json`.

## 6. Run the classroom analysis

Open the [hosted student guide](https://fullstackgtm.com/ai-in-gtm-class), choose the Codex, Claude Code, or Cursor prompt variant, and follow it in your coding agent. The shared analysis contract stays the same; each variant supplies the correct worker command, model choice, output-envelope handling, schema validation, and synthesis invocation for that harness. The exercise deliberately contrasts a one-shot request with building a testable analysis system.

The system should retrieve and inventory all 2,500 Attio transcripts, proving that it connected to the complete live CRM. To fit the class window, its analysis scope is exactly the first 100 calls by numeric call ID (`call_00001` through `call_00100`): five immutable batches of 20 calls, processed by at most four concurrent Codex workers.

The classroom run still exercises the complete architecture:

- live Attio pagination and deterministic normalization;
- a machine-readable full-corpus inventory and separate 100-call scope manifest;
- real `gpt-5.6-luna` extraction workers at low reasoning effort;
- stable evidence IDs, structured outputs, and byte-for-byte citation validation;
- deterministic aggregation followed by a bounded synthesis step;
- a standalone HTML report clearly labeled as a 100-call classroom analysis; and
- an immediate rerun that launches zero new workers when every input and configuration hash is unchanged.

The 100 calls are a deterministic teaching scope, not a statistically representative sample. Do not describe the resulting report as a complete analysis of the 2,500-call corpus. The generated system should support a later full run, but students should not process the remaining 2,400 calls during class.

## Troubleshooting

- `401`: replace the token in `.env`; never pass it as a command-line argument.
- Missing scope: edit the token in **Workspace settings → Developers** and rerun `npm run attio:doctor`.
- Multiple workspace members: set `ATTIO_DEAL_OWNER_EMAIL` to a member of that workspace.
- `429` rate limit: wait for the command's automatic retries. If it eventually exits, rerun `npm run attio:apply -- --approve`; the ledger resumes completed work. Do not delete the ledger or restart the workspace.
- Interrupted import: rerun `npm run attio:apply -- --approve`; it resumes rather than starting over.
- Verification failure: inspect `reports/attio-verification.json`. Do not rerun blindly when duplicates are reported.

## Repository boundaries

- Each student owns an isolated hosted Attio workspace and API key.
- The CLI is the primary student interface.
- Attio is the live system of record during the exercise; local files are seed provenance.
- Every Attio import defaults to a reviewable dry-run plan.
- Hidden instructor truth must never enter this public repository's Git history.

See [the implementation plan](docs/PLAN.md) and [public world model](docs/WORLD_MODEL.md).

## Hosted class companion

The Cloudflare-hosted companion provides anonymous opening and closing surveys, live aggregate results, and copyable prompts for every stage of the lab, including the bounded 100-call system exercise:

- [Student guide](https://fullstackgtm.com/ai-in-gtm-class)

The instructor dashboard uses a separate, unlinked URL configured as a Cloudflare Worker secret.

Deployment and feedback-export instructions live in [workshop/README.md](workshop/README.md).
