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

## Quick start

```bash
cp .env.example .env
# Replace ENCRYPTION_KEY with: openssl rand -base64 32
npm install
npm run inventory
npm run validate
```

Start the pinned Twenty CRM deployment:

```bash
docker compose up -d
open http://localhost:3000
```

After creating the first Twenty workspace and API key, add `TWENTY_API_KEY` to `.env`. Twenty schema creation and CRM seeding are the next implementation phase; the complete corpus is already available locally for coding-agent and CLI analysis.

## Repository boundaries

- Twenty supplies the logged-in CRM and system of record.
- The CLI is the primary student interface.
- Local files give coding agents fast, isolated, inspectable access to the corpus.
- The eventual Twenty publishing command will default to dry-run mode.
- Hidden instructor truth must never enter this repository's Git history because this repository will become public.

See [the implementation plan](docs/PLAN.md) and [public world model](docs/WORLD_MODEL.md).
