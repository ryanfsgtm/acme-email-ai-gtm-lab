# ACME Email AI in GTM Lab

A synthetic CRM and call-transcript corpus for ACME Email, a fictional marketing-automation company. It's for learning how coding agents analyze more information than fits in one context window.

The class exercise: students give Claude Code one prompt, and it builds a system that reads 200 calls with Sonnet subagents, stores the results in SQLite, and publishes the findings as a Claude artifact.

## Class quick start: build it from a prompt

The artifact has three levels: a summary of sentiment and product insights, a drill-down into each segment to see the calls behind it, and each call's analysis with the relevant transcript sections highlighted. [See one finished version](https://claude.ai/artifact/9E7D3hEYtWLeTHu29WzZJf). The class walkthrough is at [fullstackgtm.com/ai-in-gtm-class](https://fullstackgtm.com/ai-in-gtm-class).

You need:

- [Claude Code](https://code.claude.com/docs/en/setup), signed in with a Claude Pro, Max or Team plan
- [Node.js](https://nodejs.org) 22.13 or newer (`node --version` to check)
- Git, or the [ZIP download](https://github.com/ryanfsgtm/acme-email-ai-gtm-lab/archive/refs/heads/main.zip)

Then:

```bash
git clone https://github.com/ryanfsgtm/acme-email-ai-gtm-lab.git
cd acme-email-ai-gtm-lab
claude
```

Choose **Yes** when Claude Code asks whether you trust the folder, then paste this prompt:

```text
I want a Claude artifact built from the ACME Email call transcripts in this repo that shows:
1) a summary of all the calls with sentiment and product insights extracted
2) a drill-down into each segment to see which calls contributed
3) a final drill-down with the per-call analysis and the relevant sections of the transcript highlighted

To do this, build a system that uses Claude Sonnet subagents to process the calls and stores the segmented results in a SQLite database. Use only the 200 calls listed in data/class-slice.txt. The transcripts are in data/generated/transcripts, and the account, opportunity and call metadata is in data/generated.

Build all of this out, then publish the page as an artifact. Match the style of https://fullstackgtm.com/ai-in-gtm-class, and use https://impeccable.style/slop/ to remove slop.
```

`data/class-slice.txt` lists the 200 calls: a sample in proportion to call type and customer segment, the same for everyone in the class.

The `reference-solution` branch has one finished version of the system, with a `/analyze-calls` command that builds the same kind of page. Look at it after you've built your own.

## Included corpus

- 1,000 fictional accounts
- 3,500 fictional contacts
- 1,600 opportunities
- 2,500 call transcripts
- 2.64 million transcript words
- 18 months of sales and customer activity

The corpus contains common themes, rare commercially important signals, misleading correlations, seller-introduced topics, temporal shifts, and multi-call patterns. Instructor ground truth and semantic evaluation remain permanently private.

## Optional: the Attio exercise

The earlier version of the workshop seeds the corpus into a live Attio CRM and has each student design their own analysis system. It is kept here for self-study.

### What each student needs

- Git
- Node.js 22.13 or newer
- A free [Attio](https://attio.com/) workspace where they are an admin
- An installed and authenticated coding harness: Codex, Claude Code, or Cursor Agent
- About 10 minutes before class to install, seed, and verify the workspace

Use a new workshop workspace rather than a real company CRM. Existing Attio sample records are harmless—the verifier counts only records marked as part of the ACME corpus.

### 1. Clone and validate the corpus

```bash
git clone https://github.com/ryanfsgtm/acme-email-ai-gtm-lab.git
cd acme-email-ai-gtm-lab
npm install
cp .env.example .env
npm run inventory
npm run validate
```

On a clean 2-core, 8 GB Linux environment, cloning took about 2 seconds, `npm install` took 7 seconds, and corpus validation took 2 seconds. The repository uses about 353 MB after installation. If a prerequisite check fails, fix that prerequisite and rerun the same command; do not reclone the repository.

### 2. Create the Attio access token

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

### 3. Build and review the seed plan

```bash
npm run attio:export
npm run attio:plan
```

The generated `seed/attio/` directory contains Companies, People, and Deals CSV files plus a JSONL note feed containing all 2,500 transcripts. These artifacts are derived from the canonical authored corpus and are ignored by Git so they cannot drift independently.

The plan proposes 8,600 writes and makes no remote changes. Inspect `reports/attio-seed-plan.json` before continuing.

### 4. Seed Attio

The importer follows four ordered phases: upsert Companies by synthetic domain, upsert People by synthetic email, reconcile Deals, then attach transcripts as Notes to their Company records. Apply only after inspecting the plan:

```bash
npm run attio:apply -- --approve
```

The importer defaults to 10 concurrent requests, a rate verified against a fresh Attio workspace. It coordinates rate-limit cooldowns across workers, honors Attio's `Retry-After` response, and retries transient failures. A complete import generally takes several minutes.

It is safe to resume after an interruption or terminal `429` error: rerun the exact same command. Successful remote IDs are appended to `reports/attio-import-ledger.jsonl`, and every run reconciles Attio before writing. The ledger is tied to the workspace ID so it cannot silently skip records in a different workspace.

Do not delete the ledger while an import is in progress. If it is lost, the importer discovers existing ACME Companies, People, Deals, and Notes from stable markers before continuing.

### 5. Verify the seeded CRM

```bash
npm run attio:verify
```

Success ends with:

```text
✓ Attio contains the complete, duplicate-free ACME Email seed corpus.
```

The verifier ignores unrelated sample data and checks for exactly 1,000 unique ACME Companies, 3,500 People, 1,600 Deals, and 2,500 transcript Notes. It fails on missing IDs or duplicates and saves details to `reports/attio-verification.json`.

### 6. Run the classroom analysis

The earlier walkthrough gave Codex, Claude Code and Cursor prompt variants for this step. The [hosted student guide](https://fullstackgtm.com/ai-in-gtm-class) now covers the 200-call exercise instead; the prompts that built this version are in [the prompt transcript](docs/appendix/PROMPTS.md). The shared analysis contract stays the same; each variant supplies the correct worker command, model choice, output-envelope handling, schema validation, and synthesis invocation for that harness. The exercise deliberately contrasts a one-shot request with building a testable analysis system.

#### Workshop flow

| Stage | Student activity | Why it matters |
|---|---|---|
| Starting survey | Report current familiarity and confidence | Calibrates the room before instruction |
| Attio setup | Create a temporary workspace and API token | Establishes a real hosted-system boundary |
| Seed Attio | Clone, validate, import, and verify the ACME corpus | Replaces a folder of files with a live CRM |
| Naive summary | Ask for the obvious one-shot analysis | Creates a plausible baseline |
| Coverage audit | Ask the answer to prove retrieval, coverage, and evidence | Exposes what conversational output cannot demonstrate |
| Design the prompt | Inspect the environment and author `prompts/classroom-build-system.md` | Converts observed risks into a testable specification |
| Build the system | Compare with the harness-specific reference and execute | Produces a durable, resumable analysis pipeline |
| Verify the system | Independently challenge coverage, citations, aggregates, and resume behavior | Separates “ran” from “worked” |
| Final reflection | Reassess familiarity, confidence, and likely use | Measures movement during the class |

The prompt-design stage is intentionally separate from implementation. It asks the agent to inspect repository code, verify live Attio and harness behavior, enumerate plausible failure modes, and convert each risk into a hard constraint, deterministic check, regression test, or execution gate. The next stage provides the instructor's long reference prompt for comparison and recovery; students can see which requirements their generated specification found or missed.

The system should retrieve and inventory all 2,500 Attio transcripts, proving that it connected to the complete live CRM. To fit the class window, its analysis scope is exactly the first 100 calls by numeric call ID (`call_00001` through `call_00100`): five immutable batches of 20 calls, processed by at most four concurrent worker subprocesses.

The classroom run still exercises the complete architecture:

- live Attio pagination and deterministic normalization;
- a machine-readable full-corpus inventory and separate 100-call scope manifest;
- real, independent extraction subprocesses using the selected harness and a pinned model configuration;
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

- `main` holds the corpus and the instructions, not a solution. Students' agents build their own system; the `reference-solution` branch holds one finished version.
- Hidden instructor truth must never enter this public repository's Git history.
- In the Attio exercise, each student owns an isolated Attio workspace and API key, Attio is the live system of record, and every import defaults to a reviewable dry-run plan.

See [the implementation plan](docs/PLAN.md) (written for the Attio version) and [public world model](docs/WORLD_MODEL.md).

## Hosted class companion

The Cloudflare-hosted companion provides anonymous opening and closing surveys, live aggregate results, and the class walkthrough for the 200-call slice:

- [Student guide](https://fullstackgtm.com/ai-in-gtm-class)

The instructor dashboard uses a separate, unlinked URL configured as a Cloudflare Worker secret.

Deployment and feedback-export instructions live in [workshop/README.md](workshop/README.md).

## Prompt transcript

[Raw prompts used to build the workshop](docs/appendix/PROMPTS.md)
