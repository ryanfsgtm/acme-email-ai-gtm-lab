# Hosted workshop companion

Production:

- Student guide: <https://fullstackgtm.com/ai-in-gtm-class>
- Instructor dashboard: private URL stored in the `INSTRUCTOR_PATH` Worker secret

The Cloudflare Worker serves a gated, seven-stage student workshop and a separate instructor interface. It stores anonymous start/end surveys plus worked/blocked stage check-ins in D1. The browser receives aggregate counts only. Names, emails, Attio credentials, IP addresses, and qualitative responses are not exposed by the API.

Students move through one full-page stage at a time. Each stage requires a “Worked” or “I’m blocked” check-in before Continue becomes available; either response allows progress. The instructor pace chart uses opening-survey responses as its denominator and marks the 80% success target on every stage.

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
