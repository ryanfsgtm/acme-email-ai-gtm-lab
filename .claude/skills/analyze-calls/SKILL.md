---
name: analyze-calls
description: Analyze the class slice of 200 ACME call transcripts with Sonnet subagents, store the results in SQLite, and publish the drill-down report as an artifact. Run with /analyze-calls, optionally followed by a different scope such as "pricing calls" or "all".
disable-model-invocation: true
argument-hint: "[pricing calls | Enterprise | 100 calls | all]"
allowed-tools:
  - Bash(node analysis/calls.mjs *)
  - PowerShell(node analysis/calls.mjs *)
---

# Analyze the calls

A script runs this pipeline and decides every step. Your job is to start the subagents it asks for, and keep going until it prints DONE. Don't read transcripts, job files or outputs yourself, and don't write any of the analysis yourself.

1. Set the scope from what the user typed after the command (`$ARGUMENTS`), if anything.
   - Nothing: the class slice, `node analysis/calls.mjs init`. That is 200 calls sampled across every call type and segment, the same 200 for everyone in the class.
   - A number of calls: `--limit 100`. A call type: `--call-type "Pricing and procurement"`. A segment: `--segment Enterprise`.
   - "all" or "every call": first tell the user it means 2,500 calls, about 125 subagent jobs and an hour or more of plan usage, and ask them to confirm. Then `init --all`.
   - If `init` says a run for that scope already exists, go to step 2: the run picks up where it stopped. If it says the existing run covers a different scope, tell the user and ask before running `init` again with `--replace`.
2. Run `node analysis/calls.mjs next`.
3. If it prints `NEXT`, start one subagent for every job line it printed, all in a single message so they run in parallel. Use the agent named on the line, and make the whole prompt `Job: <file>`. Then wait for every one of them to report back. They may run in the background: if so, end your turn and wait for their completion notices instead of calling `next`. When all of them have finished, go back to step 2.
4. If it prints `WAIT`, start nothing. Wait for the running subagents to finish, then go back to step 2. Use `next --stalled` only if they have all finished or failed and `next` still says WAIT.
5. When it prints `DONE`, publish the report file it names as an artifact. Reply with the link and the coverage lines `next` printed: calls analyzed, calls failed, quotes found, audit result. If any calls failed, say how many. If you can't publish artifacts here, give the file path instead: it opens in any browser.

Between rounds, give the user one short progress line, such as "120 of 200 calls analyzed."

If a subagent errors or stops early, carry on: `next` hands an unfinished job out again, retries rejected records, and after three tries records the calls as failed instead of looping.

For follow-up questions, query the database rather than re-reading transcripts: `node analysis/calls.mjs sql "SELECT ..."`. Tables: `calls`, `call_analysis`, `insights`, `evidence`, `themes`, `product_areas`, `audits`, `headlines`. Views: `theme_summary`, `theme_calls`, `sentiment_by_segment`. Only insights with `verified = 1` have a quote that was found in the transcript.
