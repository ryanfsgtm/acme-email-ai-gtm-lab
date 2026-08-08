# Hosted workshop companion

Production:

- Student guide: <https://acme-ai-gtm-workshop.ryan-ad7.workers.dev/>
- Instructor dashboard: <https://acme-ai-gtm-workshop.ryan-ad7.workers.dev/?view=instructor>

The Cloudflare Worker serves a static student/instructor interface and stores anonymous start/end survey responses in D1. The browser receives aggregate counts only. Names, emails, Attio credentials, IP addresses, and qualitative responses are not exposed by the API.

## Local development

```bash
npm install
npm run workshop:migrate:local
npm run workshop:dev
```

Open <http://localhost:8787/> or <http://localhost:8787/?view=instructor>.

## Production deployment

The D1 database binding is declared in `wrangler.jsonc`. Apply migrations before deploying a version that depends on them:

```bash
npm run workshop:migrate:remote
npm run workshop:deploy
```

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
npx wrangler d1 execute DB --remote --command "DELETE FROM survey_responses"
```
