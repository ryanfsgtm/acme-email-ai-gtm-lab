# Call review: Sonnet subagents to SQLite to an artifact

This folder turns ACME Email call transcripts into one interactive report. By default it covers the class slice: 200 of the 2,500 calls, sampled in proportion to call type and segment, the same 200 for everyone.

1. A summary of the calls in scope: sentiment, and product insights grouped into themes by product area.
2. A drill-down into any theme, competitor or sentiment, listing the calls behind it.
3. A drill-down into any call: its analysis next to the full transcript, with the supporting lines highlighted.

Claude Code does the reading with Sonnet subagents. A Node script decides every step, checks every record, and stores the results in SQLite. The report is generated from the database, so the page can't claim anything the database doesn't hold.

## Run it

In Claude Code, from the repository root:

```
/analyze-calls
```

The skill runs only when you type the command, so a plain "summarize the calls" prompt stays a one-shot answer. Other scopes: `/analyze-calls pricing calls`, `/analyze-calls Enterprise`, or `/analyze-calls all` for every call (about 125 subagent jobs; Claude asks you to confirm).

You need Node 22.13 or newer. Nothing to install: the scripts use only Node's standard library, including `node:sqlite`.

## What happens

```
node analysis/calls.mjs init [--all | --limit N | --call-type "..." | --segment ...]
node analysis/calls.mjs next      # repeat until it prints DONE
```

`next` does all the scripted work itself and stops whenever it needs subagents. It then prints the agent and the job files to hand out, and Claude starts one subagent per job, in parallel.

| Stage | Subagent (model) | Job | What the script checks |
| --- | --- | --- | --- |
| Extract | `call-analyst` (sonnet) | 20 transcripts per job, one JSON record per call | Schema; every quote searched in its transcript; broken records retried up to 3 times |
| Name themes | `theme-normalizer` (sonnet) | Free-text theme labels per product area | Every label mapped to a theme or to "Other" |
| Audit | `record-auditor` (sonnet) | A 2% sample of calls, re-read against their records | Verdicts recorded per call |
| Headlines | `headline-writer` (sonnet) | Aggregate stats only | 3 to 5 findings, no digits, theme IDs that exist |

Then it rebuilds `work/calls.sqlite` and writes `reports/call-insights.html`, a single self-contained page under the 16 MiB artifact limit. Ask Claude to publish it as an artifact.

Everything under `work/` is resumable. If a session ends mid-run, run `/analyze-calls` again with the same scope: `next` picks up from the files on disk. While subagents it handed out are still working, `next` prints WAIT instead of handing their jobs out twice.

A job handed out three times without output is abandoned, and its calls go into a new job. Each call gets three jobs in total, whether the earlier ones produced a broken record, no record, or no output. A call that still has no valid record after its third job is recorded as failed, never silently dropped. Starting a different scope needs `init --replace`, which moves the old run to `work-archive/`.

## Rules the script enforces

- An insight counts only if at least one of its quotes appears word for word in one transcript line. Case, curly quotes, dash style and spacing are ignored; words are not.
- Each insight records who named the topic first. Topics an ACME rep brought up are tagged `raised_by: seller`; the report counts customer-raised topics by default and has a switch to include the rest.
- Headlines contain no numbers. The page prints the numbers next to each headline, from the database.

## Ask the database

```
node analysis/calls.mjs sql "SELECT name, calls, customer_raised_calls FROM theme_summary ORDER BY calls DESC LIMIT 10"
node analysis/calls.mjs sql "SELECT c.call_id, c.account_name, i.statement FROM insights i JOIN calls c USING (call_id) WHERE i.theme_id = 'pricing/...' AND c.segment = 'Enterprise'"
```

Tables: `calls`, `call_analysis`, `insights`, `evidence`, `themes`, `product_areas`, `audits`, `headlines`, `run_info`. Views: `theme_summary`, `theme_calls`, `sentiment_by_segment`. `evidence.char_start` and `char_end` index into the raw transcript file.

## Files

- `calls.mjs`: the command line
- `taxonomy.json`: product areas, insight kinds, competitors, ACME roles
- `lib/`: corpus loading, quote matching, validation, pipeline state, SQLite
- `report/`: data loader, shared view code, page script, styles, template, design tokens
- `../.claude/agents/`: the four subagents
- `../.claude/skills/analyze-calls/SKILL.md`: the loop Claude follows
