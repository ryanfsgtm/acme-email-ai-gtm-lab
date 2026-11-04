import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DB_PATH, ROOT, rel } from '../lib/corpus.mjs';
import { DatabaseSync } from '../lib/sqlite.mjs';

function agentModel(name) {
  try {
    const text = readFileSync(join(ROOT, '.claude', 'agents', `${name}.md`), 'utf8');
    return /^model:\s*(\S+)/m.exec(text)?.[1] ?? 'inherit';
  } catch {
    return 'unknown';
  }
}

// Reads the SQLite database into the compact shape the report page renders.
// Everything on the page comes from here, so the page can never disagree with the database.
export function readReportData({ withPaths = false } = {}) {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const all = (sql, ...params) => db.prepare(sql).all(...params);
  const one = (sql, ...params) => db.prepare(sql).get(...params);
  const info = Object.fromEntries(all('SELECT key, value FROM run_info').map((r) => [r.key, r.value]));

  const areas = all('SELECT area_id AS id, name, description FROM product_areas ORDER BY sort');
  const themes = all('SELECT theme_id AS id, area_id AS area, name, description, is_other AS other FROM themes ORDER BY area_id, is_other, name')
    .map((t) => ({ ...t, other: Boolean(t.other) }));

  const insightRows = all(`SELECT insight_id, call_id, ordinal, theme_id, theme_label, kind, polarity, severity, raised_by, competitor, statement
    FROM insights WHERE verified = 1 ORDER BY call_id, ordinal`);
  const evidenceRows = all(`SELECT insight_id, char_start, char_end, speaker, speaker_side FROM evidence
    WHERE matched = 1 ORDER BY insight_id, evidence_id`);
  const evidenceBy = new Map();
  for (const e of evidenceRows) {
    if (!evidenceBy.has(e.insight_id)) evidenceBy.set(e.insight_id, []);
    evidenceBy.get(e.insight_id).push([e.char_start, e.char_end, e.speaker, e.speaker_side]);
  }
  const insightsBy = new Map();
  for (const i of insightRows) {
    if (!insightsBy.has(i.call_id)) insightsBy.set(i.call_id, []);
    insightsBy.get(i.call_id).push({
      ord: i.ordinal,
      th: i.theme_id,
      label: i.theme_label,
      k: i.kind,
      p: i.polarity,
      sev: i.severity,
      by: i.raised_by,
      comp: i.competitor,
      st: i.statement,
      ev: evidenceBy.get(i.insight_id) ?? [],
    });
  }
  const dropped = new Map(all('SELECT call_id, COUNT(*) AS n FROM insights WHERE verified = 0 GROUP BY call_id').map((r) => [r.call_id, r.n]));
  const audits = new Map(all('SELECT * FROM audits').map((a) => [a.call_id, {
    v: a.verdict,
    sentiment_ok: Boolean(a.sentiment_ok),
    unsupported: a.unsupported_insights,
    missed: JSON.parse(a.missed),
    notes: a.notes,
    checks: JSON.parse(a.checks),
  }]));

  const callRows = all(`SELECT c.*, a.summary, a.sentiment, a.sentiment_score, a.sentiment_trajectory, a.sentiment_rationale
    FROM calls c JOIN call_analysis a USING (call_id) WHERE c.status = 'analyzed' ORDER BY c.occurred_at, c.call_id`);
  const calls = callRows.map((c) => ({
    id: c.call_id,
    acct: c.account_name,
    seg: c.segment,
    ind: c.industry,
    reg: c.region,
    arr: c.arr,
    type: c.call_type,
    date: c.occurred_at.slice(0, 10),
    q: c.quarter,
    dur: c.duration_min,
    outcome: c.opp_outcome,
    stage: c.opp_stage,
    comp: c.opp_competitor,
    sent: c.sentiment,
    score: c.sentiment_score,
    traj: c.sentiment_trajectory,
    why: c.sentiment_rationale,
    sum: c.summary,
    dropped: dropped.get(c.call_id) ?? 0,
    ...(audits.has(c.call_id) ? { audit: audits.get(c.call_id) } : {}),
    ins: insightsBy.get(c.call_id) ?? [],
    ...(withPaths ? { path: c.transcript_path } : {}),
  }));

  const failures = all("SELECT call_id, failure_reason AS reason FROM calls WHERE status = 'failed' ORDER BY call_id");
  const counts = one(`SELECT
      (SELECT COUNT(*) FROM calls) AS in_scope,
      (SELECT COUNT(*) FROM insights) AS insights_total,
      (SELECT COUNT(*) FROM insights WHERE verified = 1) AS insights_verified,
      (SELECT COUNT(*) FROM evidence) AS quotes_total,
      (SELECT COUNT(*) FROM evidence WHERE matched = 1) AS quotes_matched,
      (SELECT COUNT(*) FROM evidence WHERE matched = 1 AND claimed_speaker IS NOT NULL AND lower(claimed_speaker) <> lower(speaker)) AS speaker_mismatch,
      (SELECT COUNT(*) FROM insights WHERE verified = 1 AND theme_id LIKE '%/other') AS insights_other,
      (SELECT COUNT(DISTINCT job_id) FROM call_analysis) AS extract_jobs`);
  const audit = one(`SELECT COUNT(*) AS sampled,
      SUM(verdict = 'accurate') AS accurate, SUM(verdict = 'minor_issues') AS minor_issues, SUM(verdict = 'major_issues') AS major_issues,
      SUM(1 - sentiment_ok) AS sentiment_wrong, SUM(unsupported_insights) AS unsupported_insights FROM audits`);
  const auditChecked = calls.filter((c) => c.audit).reduce((n, c) => n + c.audit.checks.length, 0);
  const headlines = all('SELECT text, theme_ids FROM headlines ORDER BY ordinal').map((h) => ({ text: h.text, themes: JSON.parse(h.theme_ids) }));
  const quarters = [...new Set(calls.map((c) => c.q))].sort();
  const dates = calls.map((c) => c.date).sort();
  db.close();

  return {
    meta: {
      scope: info.scope,
      built_at: info.built_at,
      database: rel(DB_PATH),
      models: { extract: agentModel('call-analyst'), themes: agentModel('theme-normalizer'), audit: agentModel('record-auditor'), headlines: agentModel('headline-writer') },
      calls_in_scope: counts.in_scope,
      calls_analyzed: calls.length,
      calls_failed: failures.length,
      batches: Number(info.batches ?? counts.extract_jobs),
      batch_size: Number(info.batch_size ?? 20),
      retry_jobs: Number(info.retry_jobs ?? 0),
      insights_total: counts.insights_total,
      insights_verified: counts.insights_verified,
      insights_other: counts.insights_other,
      quotes_total: counts.quotes_total,
      quotes_matched: counts.quotes_matched,
      speaker_mismatch: counts.speaker_mismatch,
      audit: { ...audit, sampled: audit.sampled ?? 0, insights_checked: auditChecked },
      date_min: dates[0] ?? null,
      date_max: dates[dates.length - 1] ?? null,
      quarters,
      failures,
    },
    areas,
    themes,
    calls,
    headlines,
  };
}
