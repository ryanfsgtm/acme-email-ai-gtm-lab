# Hosted workshop companion

Production:

- Student guide: <https://fullstackgtm.com/ai-in-gtm-class>
- Instructor dashboard: private URL stored in the `INSTRUCTOR_PATH` Worker secret

The Cloudflare Worker serves a gated, nine-stage student workshop and a separate instructor interface. It stores anonymous start/end surveys plus worked/blocked stage check-ins in D1. The browser receives aggregate counts only. Names, emails, Attio credentials, IP addresses, and qualitative responses are not exposed by the API.

Students move through one full-page stage at a time. Submitting the opening survey unlocks the workshop. Each of the seven hands-on stages requires a “Worked” or “I’m blocked” check-in before Continue becomes available; either response allows progress. Submitting the final survey completes the deck directly. The instructor pace chart uses opening-survey responses as its denominator and marks the 80% success target on every hands-on stage.

The prompt-design stage first asks the active coding agent to inspect the repository, live Attio formats, and its own CLI before turning observed failure modes into a saved, testable build specification. The following build-system stage offers Codex, Claude Code, and Cursor reference variants. The common prompt inventories the complete 2,500-call Attio corpus but limits live analysis to `call_00001` through `call_00100`. Those 100 calls become five immutable batches of 20, run with at most four concurrent workers. Each variant specifies its harness's model, CLI subprocess, output-envelope handling, and schema-validation behavior. The prompt requires a scoped HTML report and an immediate zero-launch resume; it explicitly prevents students from presenting the deterministic classroom scope as a representative or complete full-corpus analysis.

## Local development

```bash
npm install
npm run workshop:migrate:local
npx wrangler dev --local --var INSTRUCTOR_PATH:instructor-preview
```

Open <http://localhost:8787/ai-in-gtm-class> or <http://localhost:8787/ai-in-gtm-class/instructor-preview>.

## Production deployment

The D1 binding and `fullstackgtm.com/ai-in-gtm-class*` route are declared in `wrangler.jsonc`. Set a long, unguessable instructor path as a Worker secret, then apply migrations and deploy:

```bash
npx wrangler secret put INSTRUCTOR_PATH
npm run workshop:migrate:remote
npm run workshop:deploy
```

The instructor path is intentionally absent from the repository and student interface. Requests to the underlying `instructor.html` asset return 404.

The private dashboard includes a confirmed **Clear all class data** action. Its reset endpoint exists only beneath the secret instructor path, requires a same-origin POST, and deletes both surveys and stage check-ins.

## Read qualitative feedback

Qualitative answers intentionally do not appear in the public dashboard. Instructors can query them directly:

```bash
npx wrangler d1 execute DB --remote --command \
  "SELECT phase, goal, takeaway, updated_at FROM survey_responses WHERE goal IS NOT NULL OR takeaway IS NOT NULL ORDER BY updated_at"
```

Export every response as JSON:

```bash
npx wrangler d1 execute DB --remote --json --command \
  "SELECT * FROM survey_responses ORDER BY updated_at"
```

## Privacy and reset

- Responses use a random browser ID stored in local storage so a participant can update their own start/end response.
- Public results contain aggregates only.
- Free-text fields are capped in length and stored for instructor review.
- Resetting responses is destructive and should only be done deliberately between cohorts:

```bash
npx wrangler d1 execute DB --remote --command "DELETE FROM stage_feedback; DELETE FROM survey_responses"
```
