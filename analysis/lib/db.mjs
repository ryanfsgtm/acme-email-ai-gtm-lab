import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { DB_PATH, loadCorpus, quarterOf, taxonomy } from './corpus.mjs';
import { DatabaseSync } from './sqlite.mjs';
import { readReportData } from '../report/data.mjs';

const SCHEMA = `
CREATE TABLE run_info (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE product_areas (
  area_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  sort INTEGER NOT NULL
);

CREATE TABLE themes (
  theme_id TEXT PRIMARY KEY,
  area_id TEXT NOT NULL REFERENCES product_areas(area_id),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  is_other INTEGER NOT NULL DEFAULT 0
);

-- One row per call in the run's scope, including calls that failed analysis.
CREATE TABLE calls (
  call_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('analyzed', 'failed')),
  failure_reason TEXT,
  call_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  quarter TEXT NOT NULL,
  duration_min INTEGER,
  word_count INTEGER,
  transcript_path TEXT NOT NULL,
  transcript_sha256 TEXT NOT NULL,
  account_id TEXT,
  account_name TEXT,
  segment TEXT,
  industry TEXT,
  region TEXT,
  employees INTEGER,
  arr INTEGER,
  opportunity_id TEXT,
  opp_stage TEXT,
  opp_outcome TEXT,
  opp_competitor TEXT
);

CREATE TABLE call_analysis (
  call_id TEXT PRIMARY KEY REFERENCES calls(call_id),
  summary TEXT NOT NULL,
  sentiment TEXT NOT NULL CHECK (sentiment IN ('positive', 'neutral', 'mixed', 'negative')),
  sentiment_score INTEGER NOT NULL CHECK (sentiment_score BETWEEN -2 AND 2),
  sentiment_trajectory TEXT NOT NULL,
  sentiment_rationale TEXT,
  job_id TEXT NOT NULL,
  validation_notes TEXT
);

-- verified = at least one of the insight's quotes was found word for word in the transcript.
-- Only verified insights get a theme and count in the report.
CREATE TABLE insights (
  insight_id TEXT PRIMARY KEY,
  call_id TEXT NOT NULL REFERENCES calls(call_id),
  ordinal INTEGER NOT NULL,
  area_id TEXT NOT NULL REFERENCES product_areas(area_id),
  theme_label TEXT NOT NULL,
  theme_id TEXT REFERENCES themes(theme_id),
  kind TEXT NOT NULL,
  polarity TEXT NOT NULL,
  severity INTEGER NOT NULL,
  raised_by TEXT NOT NULL,
  competitor TEXT,
  statement TEXT NOT NULL,
  verified INTEGER NOT NULL
);

-- char_start/char_end index into the raw transcript file, so any viewer can highlight the span.
CREATE TABLE evidence (
  evidence_id TEXT PRIMARY KEY,
  insight_id TEXT NOT NULL REFERENCES insights(insight_id),
  call_id TEXT NOT NULL REFERENCES calls(call_id),
  quote TEXT NOT NULL,
  claimed_speaker TEXT,
  speaker TEXT,
  speaker_role TEXT,
  speaker_side TEXT,
  turn_index INTEGER,
  char_start INTEGER,
  char_end INTEGER,
  matched INTEGER NOT NULL,
  miss_reason TEXT
);

CREATE TABLE audits (
  call_id TEXT PRIMARY KEY REFERENCES calls(call_id),
  verdict TEXT NOT NULL CHECK (verdict IN ('accurate', 'minor_issues', 'major_issues')),
  sentiment_ok INTEGER NOT NULL,
  unsupported_insights INTEGER NOT NULL,
  missed TEXT NOT NULL,
  notes TEXT NOT NULL,
  checks TEXT NOT NULL
);

CREATE TABLE headlines (
  ordinal INTEGER PRIMARY KEY,
  text TEXT NOT NULL,
  theme_ids TEXT NOT NULL
);

CREATE INDEX insights_by_theme ON insights(theme_id, call_id);
CREATE INDEX insights_by_call ON insights(call_id);
CREATE INDEX evidence_by_insight ON evidence(insight_id);

-- Calls behind each theme, counting only verified insights.
CREATE VIEW theme_calls AS
  SELECT DISTINCT i.theme_id, i.call_id FROM insights i WHERE i.verified = 1 AND i.theme_id IS NOT NULL;

CREATE VIEW theme_summary AS
  SELECT t.theme_id, t.area_id, t.name,
         COUNT(DISTINCT i.call_id) AS calls,
         COUNT(DISTINCT CASE WHEN i.raised_by = 'customer' THEN i.call_id END) AS customer_raised_calls,
         SUM(i.polarity = 'negative') AS negative_insights,
         SUM(i.polarity = 'positive') AS positive_insights,
         SUM(i.severity = 3) AS severe_insights
  FROM themes t LEFT JOIN insights i ON i.theme_id = t.theme_id AND i.verified = 1
  GROUP BY t.theme_id;

CREATE VIEW sentiment_by_segment AS
  SELECT c.segment, a.sentiment, COUNT(*) AS calls
  FROM calls c JOIN call_analysis a USING (call_id)
  GROUP BY c.segment, a.sentiment;
`;

// Rebuilds the database from the run's validated records. The file is replaced atomically,
// so a crash never leaves a half-written database behind.
export function writeDatabase({ run, state, accepted, resolved, audits, headlines }) {
  const { calls } = loadCorpus();
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const tmp = `${DB_PATH}.tmp`;
  rmSync(tmp, { force: true });
  const db = new DatabaseSync(tmp);
  db.exec(SCHEMA);
  db.exec('BEGIN');

  const info = db.prepare('INSERT INTO run_info (key, value) VALUES (?, ?)');
  info.run('scope', run.scope.label);
  info.run('scope_json', JSON.stringify(run.scope));
  info.run('built_at', new Date().toISOString());
  info.run('audit_size', String(run.audit_size));
  info.run('batch_size', String(run.batch_size));
  info.run('batches', String(Math.ceil(run.call_ids.length / run.batch_size)));
  info.run('retry_jobs', String(Object.values(state.jobs).filter((j) => j.stage === 'extract' && j.retry).length));

  const area = db.prepare('INSERT INTO product_areas VALUES (?, ?, ?, ?)');
  taxonomy.areas.forEach((a, i) => area.run(a.id, a.name, a.description, i));

  // Resolve every verified insight's theme first: that is what decides which "Other" themes exist.
  const themeOf = new Map();
  for (const [id, record] of accepted) {
    for (const ins of record.insights) if (ins.verified) themeOf.set(`${id}#${ins.ordinal}`, resolved.lookup(ins.product_area, ins.theme));
  }

  const theme = db.prepare('INSERT INTO themes (theme_id, area_id, name, description, is_other) VALUES (?, ?, ?, ?, ?)');
  for (const t of resolved.themes) theme.run(t.theme_id, t.area_id, t.name, t.description || '', 0);
  for (const a of resolved.usedOther) {
    const name = taxonomy.areas.find((x) => x.id === a).name;
    theme.run(`${a}/other`, a, `Other ${/^[A-Z]{2}/.test(name) ? name : name.charAt(0).toLowerCase() + name.slice(1)} topics`, 'Insights that matched none of the named themes in this area.', 1);
  }

  const call = db.prepare(`INSERT INTO calls VALUES (${Array(21).fill('?').join(', ')})`);
  const analysis = db.prepare('INSERT INTO call_analysis VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insight = db.prepare(`INSERT INTO insights VALUES (${Array(13).fill('?').join(', ')})`);
  const evidence = db.prepare(`INSERT INTO evidence VALUES (${Array(13).fill('?').join(', ')})`);

  for (const id of run.call_ids) {
    const c = calls.get(id);
    const record = accepted.get(id);
    const status = record ? 'analyzed' : 'failed';
    const reason = record ? null : state.failed[id] ?? 'not analyzed yet';
    call.run(id, status, reason, c.call_type, c.occurred_at, quarterOf(c.occurred_at), c.duration_min, c.word_count, c.path, c.sha256,
      c.account_id, c.account_name, c.segment, c.industry, c.region, c.employees, c.arr, c.opportunity_id, c.opp_stage, c.opp_outcome, c.opp_competitor);
    if (!record) continue;
    analysis.run(id, record.summary, record.sentiment.label, record.sentiment.score, record.sentiment.trajectory, record.sentiment.rationale,
      record.job_id, record.problems.length ? record.problems.join('\n') : null);
    for (const ins of record.insights) {
      const insightId = `${id}#${ins.ordinal}`;
      const themeId = themeOf.get(insightId) ?? null;
      insight.run(insightId, id, ins.ordinal, ins.product_area, ins.theme, themeId, ins.kind, ins.polarity, ins.severity, ins.raised_by,
        ins.competitor, ins.statement, ins.verified ? 1 : 0);
      ins.evidence.forEach((ev, n) => {
        evidence.run(`${insightId}.${n}`, insightId, id, ev.quote, ev.claimed_speaker, ev.speaker ?? null, ev.role ?? null, ev.side ?? null,
          ev.turn_index ?? null, ev.start ?? null, ev.end ?? null, ev.matched ? 1 : 0, ev.reason ?? null);
      });
    }
  }

  const audit = db.prepare('INSERT INTO audits VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const [id, a] of audits) {
    if (!accepted.has(id)) continue;
    audit.run(id, a.verdict, a.sentiment_ok ? 1 : 0, a.insight_checks.filter((c) => !c.supported).length, JSON.stringify(a.missed), a.notes, JSON.stringify(a.insight_checks));
  }

  const headline = db.prepare('INSERT INTO headlines VALUES (?, ?, ?)');
  headlines.forEach((h, i) => headline.run(i, h.text, JSON.stringify(h.theme_ids)));

  db.exec('COMMIT');
  db.close();
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  renameSync(tmp, DB_PATH);
  return readReportData();
}
