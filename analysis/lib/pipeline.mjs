import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DB_PATH, REPORT_PATH, WORK_DIR, loadCorpus, readJson, rel, stableHash, taxonomy, writeJson } from './corpus.mjs';
import { parseRecords, validateRecord } from './validate.mjs';
import { writeDatabase } from './db.mjs';
import { buildReport } from '../report/build.mjs';
import { aggregatesForHeadlines } from '../report/aggregate.mjs';

const RUN_PATH = join(WORK_DIR, 'run.json');
const ARCHIVE_DIR = join(WORK_DIR, '..', 'work-archive');
const STATE_PATH = join(WORK_DIR, 'state.json');
const MAX_EXTRACT_ATTEMPTS = 3;
const MAX_LISTINGS = 3;
// A job handed out less than this long ago, with no output yet, is assumed to still be running.
const RUNNING_MS = 20 * 60 * 1000;
const MAX_THEME_ATTEMPTS = 2;
const COMPLETE_CAP = 250; // areas with at most this many labels get themes and mapping in one job
const PROPOSE_EXAMPLES = 120; // larger areas: the top labels with examples, the rest as names only
const PROPOSE_NAMES_CAP = 3000;
const ASSIGN_CHUNK = 250;
const AUDIT_CHUNK = 10;
// With no scope options, a run covers the class slice: 200 calls, the same 200 for everyone.
export const CLASS_SLICE = 200;

const AGENTS = {
  extract: 'call-analyst',
  propose: 'theme-normalizer',
  assign: 'theme-normalizer',
  audit: 'record-auditor',
  headlines: 'headline-writer',
};
const JOB_PREFIX = { extract: 'x', propose: 'tp', assign: 'ta', audit: 'au', headlines: 'hl' };
const OUTPUT_EXT = { extract: 'jsonl', propose: 'json', assign: 'json', audit: 'json', headlines: 'json' };

const areaById = new Map(taxonomy.areas.map((a) => [a.id, a]));
const fmt = (n) => n.toLocaleString('en-US');

// ---------- run setup ----------

function planScope(options) {
  const { calls } = loadCorpus();
  let ids = [...calls.keys()];
  const sliceDefault = !options.all && !options.limit && !options.callType && !options.segment;
  const scope = { call_type: options.callType ?? null, segment: options.segment ?? null, limit: options.limit ?? (sliceDefault ? CLASS_SLICE : null), seed: options.seed ?? 'acme', class_slice: sliceDefault };
  if (scope.call_type) {
    const known = new Set([...calls.values()].map((c) => c.call_type));
    if (!known.has(scope.call_type)) throw new Error(`Unknown call type "${scope.call_type}". Use one of: ${[...known].sort().join(', ')}`);
    ids = ids.filter((id) => calls.get(id).call_type === scope.call_type);
  }
  if (scope.segment) {
    ids = ids.filter((id) => calls.get(id).segment === scope.segment);
    if (!ids.length) throw new Error(`No calls for segment "${scope.segment}". Use SMB, Mid-market or Enterprise.`);
  }
  if (scope.limit && scope.limit < ids.length) {
    // Each call type and segment pair gets its proportional share of the sample (largest
    // remainder), so a slice mirrors the corpus mix. Within a pair, a seeded hash picks the calls.
    const byType = new Map();
    for (const id of ids) {
      const type = `${calls.get(id).call_type}|${calls.get(id).segment}`;
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type).push(id);
    }
    const quotas = [...byType].map(([type, list]) => {
      const exact = (list.length * scope.limit) / ids.length;
      return { type, list, take: Math.floor(exact), rest: exact - Math.floor(exact) };
    });
    let left = scope.limit - quotas.reduce((n, q) => n + q.take, 0);
    for (const q of [...quotas].sort((a, b) => b.rest - a.rest || a.type.localeCompare(b.type))) if (left-- > 0) q.take++;
    ids = quotas.flatMap((q) => q.list
      .map((id) => [stableHash(`${scope.seed}:${id}`), id])
      .sort((a, b) => a[0] - b[0])
      .slice(0, q.take)
      .map(([, id]) => id));
  }
  ids.sort();
  const parts = [];
  if (scope.limit && scope.limit <= ids.length && !scope.class_slice) parts.push('sampled');
  if (scope.segment) parts.push(scope.segment);
  if (scope.call_type) parts.push(/^[A-Z]{2}/.test(scope.call_type) ? scope.call_type : scope.call_type.toLowerCase());
  scope.label = `${fmt(ids.length)} ${parts.join(' ')}${parts.length ? ' ' : ''}calls`.replace(/\s+/g, ' ');
  if (ids.length === calls.size) scope.label = `All ${fmt(ids.length)} calls`;
  if (scope.class_slice) scope.label = `Class slice of ${fmt(ids.length)} calls`;
  return { scope, ids };
}

// Returns { run, existing }. An existing run with the same scope is kept; a different scope
// needs --replace, which moves the old run to work-archive/ rather than deleting it.
export function initRun(options) {
  for (const [key, min] of [['batchSize', 1], ['wave', 1], ['limit', 1], ['audit', 0]]) {
    if (options[key] !== undefined && !(Number.isInteger(options[key]) && options[key] >= min)) throw new Error(`${key} must be a whole number of at least ${min}`);
  }
  const { scope, ids } = planScope(options);
  const existing = readJson(RUN_PATH);
  if (existing) {
    const same = existing.call_ids.length === ids.length && existing.call_ids.every((id, i) => id === ids[i]);
    if (same && !options.replace) return { run: existing, existing: true };
    if (!options.replace) {
      throw new Error(`The existing run in work/ covers ${existing.scope.label}, and you asked for ${scope.label}. Check with the user first, then run init again with --replace. The old run moves to work-archive/, nothing is deleted.`);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    mkdirSync(ARCHIVE_DIR, { recursive: true });
    renameSync(WORK_DIR, join(ARCHIVE_DIR, `run-${stamp}`));
  }
  const run = {
    version: 1,
    scope,
    batch_size: options.batchSize ?? 20,
    wave: options.wave ?? 10,
    audit_size: options.audit ?? Math.min(50, Math.max(10, Math.round(ids.length * 0.02))),
    call_ids: ids,
  };
  writeJson(RUN_PATH, run);
  writeJson(STATE_PATH, emptyState());
  return { run, existing: false };
}

function emptyState() {
  return { jobs: {}, attempts: {}, failed: {}, theme_attempts: {}, counters: {} };
}

export function loadRun() {
  const run = readJson(RUN_PATH);
  if (!run) throw new Error('No run yet. Start one with `node analysis/calls.mjs init` (add --limit 200 or --call-type "Pricing and procurement" for a slice).');
  return run;
}

const loadState = () => ({ ...emptyState(), ...readJson(STATE_PATH, {}) });
const saveState = (state) => writeJson(STATE_PATH, state);

// ---------- jobs ----------

function createJob(state, stage, payload) {
  state.counters[stage] = (state.counters[stage] ?? 0) + 1;
  const width = stage === 'extract' ? 4 : 2;
  const id = `${JOB_PREFIX[stage]}${String(state.counters[stage]).padStart(width, '0')}`;
  const file = `work/jobs/${stage}/${id}.json`;
  const output = `work/out/${stage}/${id}.${OUTPUT_EXT[stage]}`;
  writeJson(join(WORK_DIR, '..', file), { job_id: id, agent: AGENTS[stage], output, ...payload });
  state.jobs[id] = { stage, file, output, listed: 0, status: 'pending', ...(payload.previous_errors ? { retry: true } : {}), ...(payload.calls ? { calls: payload.calls.map((c) => c.call_id) } : {}), ...(payload.areas ? { areas: payload.areas.map((a) => a.area_id) } : {}), ...(payload.area_id ? { areas: [payload.area_id] } : {}) };
  return id;
}

const outputPath = (job) => join(WORK_DIR, '..', job.output);

let stalledMode = false;

// Marks jobs done when their output exists, and abandons a job that has been handed out
// MAX_LISTINGS times without ever producing output.
function refreshJobs(state, stages) {
  const pending = [];
  for (const [id, job] of Object.entries(state.jobs)) {
    if (!stages.includes(job.stage) || job.status !== 'pending') continue;
    if (existsSync(outputPath(job))) job.status = 'done';
    else if (job.listed >= MAX_LISTINGS && (stalledMode || Date.now() - (job.listed_at ?? 0) >= RUNNING_MS)) job.status = 'abandoned';
    else pending.push(id);
  }
  return pending;
}

function readOutput(job) {
  try {
    return readFileSync(outputPath(job), 'utf8');
  } catch {
    return null;
  }
}

function readJsonOutput(job) {
  const raw = readOutput(job);
  if (raw == null) return null;
  try {
    return JSON.parse(raw.replace(/^```[a-z]*\s*$/gim, '').trim());
  } catch {
    return null;
  }
}

// ---------- extraction ----------

function collectExtractions(run, state) {
  const { calls } = loadCorpus();
  const inRun = new Set(run.call_ids);
  const accepted = new Map();
  const lastError = new Map();
  const totals = { problems: 0 };
  const jobs = Object.entries(state.jobs)
    .filter(([, j]) => j.stage === 'extract' && j.status !== 'pending')
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [id, job] of jobs) {
    const expected = new Set(job.calls);
    const seen = new Set();
    if (job.status === 'abandoned') {
      for (const c of job.calls) if (!accepted.has(c)) lastError.set(c, `job ${id}: subagent never wrote ${job.output}`);
      continue;
    }
    const { records, lineErrors } = parseRecords(readOutput(job) ?? '');
    for (const raw of records) {
      const callId = typeof raw?.call_id === 'string' ? raw.call_id.trim() : '';
      if (!expected.has(callId) || !inRun.has(callId)) continue;
      const repeat = seen.has(callId);
      seen.add(callId);
      const result = validateRecord(raw, calls.get(callId));
      const prior = accepted.get(callId);
      if (result.ok && repeat && prior?.job_id === id && prior.stats.matched >= result.stats.matched) continue;
      if (result.ok) {
        accepted.set(callId, { ...result.record, job_id: id, stats: result.stats, problems: result.problems });
        totals.problems += result.problems.length;
        lastError.delete(callId);
      } else if (!accepted.has(callId)) {
        lastError.set(callId, `job ${id}: ${result.errors.join('; ')}`);
      }
    }
    for (const c of job.calls) {
      if (!seen.has(c) && !accepted.has(c)) lastError.set(c, `job ${id}: no record written${lineErrors.length ? ` (${lineErrors[0]})` : ''}`);
    }
  }
  return { accepted, lastError, totals };
}

function planExtraction(run, state, extraction) {
  const { calls } = loadCorpus();
  const pendingIds = refreshJobs(state, ['extract']);
  const queued = new Set(pendingIds.flatMap((id) => state.jobs[id].calls));
  const fresh = [];
  for (const id of run.call_ids) {
    if (extraction.accepted.has(id)) {
      delete state.failed[id];
      continue;
    }
    if (queued.has(id) || state.failed[id]) continue;
    if ((state.attempts[id] ?? 0) >= MAX_EXTRACT_ATTEMPTS) {
      state.failed[id] = extraction.lastError.get(id) ?? 'no valid record after retries';
      continue;
    }
    fresh.push(id);
  }
  for (let i = 0; i < fresh.length; i += run.batch_size) {
    const batch = fresh.slice(i, i + run.batch_size);
    for (const id of batch) state.attempts[id] = (state.attempts[id] ?? 0) + 1;
    const retry = batch.some((id) => state.attempts[id] > 1);
    pendingIds.push(createJob(state, 'extract', {
      calls: batch.map((id) => ({ call_id: id, path: calls.get(id).path })),
      ...(retry ? { previous_errors: Object.fromEntries(batch.filter((id) => extraction.lastError.has(id)).map((id) => [id, extraction.lastError.get(id)])) } : {}),
      taxonomy: {
        product_areas: taxonomy.areas,
        kinds: taxonomy.kinds,
        competitors: taxonomy.competitors,
        acme_roles: taxonomy.acmeRoles,
      },
    }));
  }
  return pendingIds;
}

// ---------- themes ----------

const labelKey = (label) => label.toLowerCase().replace(/[\s_]+/g, ' ').replace(/[.,;:!?]+$/, '').trim();
const slug = (value) => String(value ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

export function collectLabels(accepted) {
  const byArea = new Map();
  for (const record of accepted.values()) {
    for (const insight of record.insights) {
      if (!insight.verified) continue;
      const key = labelKey(insight.theme);
      if (!byArea.has(insight.product_area)) byArea.set(insight.product_area, new Map());
      const labels = byArea.get(insight.product_area);
      if (!labels.has(key)) labels.set(key, { key, mentions: 0, forms: new Map(), example: insight.statement });
      const entry = labels.get(key);
      entry.mentions++;
      entry.forms.set(insight.theme, (entry.forms.get(insight.theme) ?? 0) + 1);
    }
  }
  for (const labels of byArea.values()) {
    for (const entry of labels.values()) {
      entry.label = [...entry.forms.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
  }
  return byArea;
}

function validProposal(area, value) {
  const themes = Array.isArray(value?.themes) ? value.themes : null;
  if (!themes || themes.length < 1 || themes.length > 16) return null;
  const seen = new Set();
  const clean = [];
  for (const t of themes) {
    const id = slug(t?.id || t?.name);
    const name = String(t?.name ?? '').trim();
    if (!id || id === 'other' || !name || seen.has(id)) continue;
    seen.add(id);
    clean.push({ theme_id: `${area}/${id}`, name, description: String(t?.description ?? '').trim() });
  }
  return clean.length ? clean : null;
}

function themeState(state, labelsByArea) {
  const proposals = new Map();
  const mapping = new Map();
  const jobs = Object.entries(state.jobs)
    .filter(([, j]) => (j.stage === 'propose' || j.stage === 'assign') && j.status === 'done')
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [, job] of jobs.filter(([, j]) => j.stage === 'propose')) {
    const out = readJsonOutput(job);
    const entries = Array.isArray(out?.areas) ? out.areas : out?.area_id ? [out] : [];
    for (const entry of entries) {
      const area = String(entry?.area_id ?? '');
      if (!job.areas.includes(area) || proposals.has(area)) continue;
      const themes = validProposal(area, entry);
      if (!themes) continue;
      proposals.set(area, themes);
      if (entry.mapping && typeof entry.mapping === 'object') absorbMapping(mapping, area, themes, entry.mapping, labelsByArea);
    }
  }
  for (const [, job] of jobs.filter(([, j]) => j.stage === 'assign')) {
    const out = readJsonOutput(job);
    const area = job.areas[0];
    if (!proposals.has(area) || !out?.mapping) continue;
    absorbMapping(mapping, area, proposals.get(area), out.mapping, labelsByArea);
  }
  // Fallback for areas whose proposals kept failing: one theme per area.
  for (const area of labelsByArea.keys()) {
    if (!proposals.has(area) && (state.theme_attempts[`propose:${area}`] ?? 0) >= MAX_THEME_ATTEMPTS) {
      const info = areaById.get(area);
      proposals.set(area, [{ theme_id: `${area}/all`, name: info.name, description: info.description, fallback: true }]);
    }
  }
  return { proposals, mapping };
}

function absorbMapping(mapping, area, themes, raw, labelsByArea) {
  const valid = new Set(themes.map((t) => t.theme_id));
  const labels = labelsByArea.get(area) ?? new Map();
  for (const [label, target] of Object.entries(raw)) {
    const key = labelKey(label);
    if (!labels.has(key)) continue;
    const id = `${area}/${slug(target)}`;
    const themeId = valid.has(id) ? id : slug(target) === 'other' ? `${area}/other` : null;
    if (themeId && !mapping.has(`${area}|${key}`)) mapping.set(`${area}|${key}`, themeId);
  }
}

function labelList(labels, cap) {
  return [...labels.values()]
    .sort((a, b) => b.mentions - a.mentions || a.key.localeCompare(b.key))
    .slice(0, cap)
    .map((e) => ({ label: e.label, mentions: e.mentions, example: e.example }));
}

function planThemes(state, labelsByArea) {
  let pendingIds = refreshJobs(state, ['propose', 'assign']);
  const { proposals, mapping } = themeState(state, labelsByArea);
  const busy = new Set(pendingIds.flatMap((id) => state.jobs[id].areas));

  // Proposals: bin-pack areas so small slices need only a few jobs.
  const needProposal = [...labelsByArea.keys()].filter((a) => !proposals.has(a) && !busy.has(a));
  const bins = [];
  for (const area of needProposal.sort((a, b) => labelsByArea.get(b).size - labelsByArea.get(a).size)) {
    const size = labelsByArea.get(area).size;
    const bin = size <= COMPLETE_CAP && bins.find((b) => b.small && b.size + size <= 500);
    if (!bin && size > COMPLETE_CAP) { bins.push({ areas: [area], size, small: false }); continue; }
    if (bin) { bin.areas.push(area); bin.size += size; } else bins.push({ areas: [area], size, small: true });
  }
  for (const bin of bins) {
    for (const area of bin.areas) state.theme_attempts[`propose:${area}`] = (state.theme_attempts[`propose:${area}`] ?? 0) + 1;
    pendingIds.push(createJob(state, 'propose', {
      mode: 'propose',
      areas: bin.areas.map((area) => {
        const labels = labelsByArea.get(area);
        const info = areaById.get(area);
        const complete = labels.size <= COMPLETE_CAP;
        const sorted = labelList(labels, Infinity);
        return {
          area_id: area,
          area_name: info.name,
          area_description: info.description,
          distinct_labels: labels.size,
          complete,
          labels: complete ? sorted : sorted.slice(0, PROPOSE_EXAMPLES),
          ...(complete ? {} : {
            other_labels: sorted.slice(PROPOSE_EXAMPLES, PROPOSE_NAMES_CAP).map((e) => `${e.label} (${e.mentions})`),
            other_labels_left_out: Math.max(0, sorted.length - PROPOSE_NAMES_CAP),
          }),
        };
      }),
    }));
  }
  if (pendingIds.length) return { pendingIds, proposals, mapping };

  // Assignments for labels the proposals did not map.
  for (const [area, labels] of labelsByArea) {
    const unmapped = [...labels.values()].filter((e) => !mapping.has(`${area}|${e.key}`));
    if (!unmapped.length || busy.has(area)) continue;
    const key = `assign:${area}`;
    if ((state.theme_attempts[key] ?? 0) >= MAX_THEME_ATTEMPTS + 1) continue;
    state.theme_attempts[key] = (state.theme_attempts[key] ?? 0) + 1;
    const themes = proposals.get(area);
    if (themes.length === 1 && themes[0].fallback) continue;
    const sorted = labelList(new Map(unmapped.map((e) => [e.key, e])), Infinity);
    for (let i = 0; i < sorted.length; i += ASSIGN_CHUNK) {
      pendingIds.push(createJob(state, 'assign', {
        mode: 'assign',
        area_id: area,
        area_name: areaById.get(area).name,
        themes: themes.map((t) => ({ id: t.theme_id.split('/')[1], name: t.name, description: t.description })),
        labels: sorted.slice(i, i + ASSIGN_CHUNK),
      }));
    }
  }
  return { pendingIds, proposals, mapping };
}

// Final theme for every verified insight; leftovers land in the area's "Other" theme.
function resolveThemes(labelsByArea, proposals, mapping) {
  const themes = [];
  const usedOther = new Set();
  const lookup = (area, label) => {
    const proposal = proposals.get(area);
    if (proposal?.length === 1 && proposal[0].fallback) return proposal[0].theme_id;
    const id = mapping.get(`${area}|${labelKey(label)}`);
    if (id) {
      if (id.endsWith('/other')) usedOther.add(area);
      return id;
    }
    usedOther.add(area);
    return `${area}/other`;
  };
  for (const [area, list] of proposals) themes.push(...list.map((t) => ({ ...t, area_id: area })));
  return { themes, lookup, usedOther };
}

// ---------- review: audit + headlines ----------

function planReview(run, state, accepted, reportData) {
  const pendingIds = refreshJobs(state, ['audit', 'headlines']);
  const { calls } = loadCorpus();
  const hasStage = (stage) => Object.values(state.jobs).some((j) => j.stage === stage);

  if (run.audit_size > 0 && !hasStage('audit')) {
    const byType = new Map();
    for (const id of [...accepted.keys()].sort((a, b) => stableHash(`audit:${a}`) - stableHash(`audit:${b}`))) {
      const type = calls.get(id).call_type;
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type).push(id);
    }
    const sample = [];
    const target = Math.min(run.audit_size, accepted.size);
    while (sample.length < target) {
      for (const list of byType.values()) if (list.length && sample.length < target) sample.push(list.shift());
    }
    sample.sort();
    for (let i = 0; i < sample.length; i += AUDIT_CHUNK) {
      pendingIds.push(createJob(state, 'audit', {
        mode: 'audit',
        calls: sample.slice(i, i + AUDIT_CHUNK).map((id) => {
          const r = accepted.get(id);
          return {
            call_id: id,
            path: calls.get(id).path,
            record: {
              summary: r.summary,
              sentiment: r.sentiment,
              insights: r.insights.map((ins, n) => ({
                index: n,
                product_area: ins.product_area,
                kind: ins.kind,
                theme: ins.theme,
                polarity: ins.polarity,
                severity: ins.severity,
                raised_by: ins.raised_by,
                statement: ins.statement,
                quotes: ins.evidence.filter((e) => e.matched).map((e) => `${e.speaker}: ${e.quote}`),
              })),
            },
          };
        }),
      }));
    }
  }
  const headlineJobs = Object.entries(state.jobs).filter(([, j]) => j.stage === 'headlines');
  const headlinesOk = headlineJobs.some(([, j]) => j.status === 'done' && validHeadlines(readJsonOutput(j), reportData));
  if (!headlinesOk && headlineJobs.every(([, j]) => j.status !== 'pending') && headlineJobs.length < 2) {
    pendingIds.push(createJob(state, 'headlines', {
      mode: 'headlines',
      scope: run.scope.label,
      ...(headlineJobs.length ? { previous_problem: 'The last answer was rejected. It must be JSON {"headlines":[...]} with 3 to 5 items, only theme_ids from the list, and no quantities in the text: no digits and no number words such as half, twice, a third, or four in five.' } : {}),
      ...aggregatesForHeadlines(reportData),
    }));
  }
  return pendingIds;
}

// Quantities the page can't check. Headlines describe the pattern; the page prints the numbers.
const NUMBER_WORDS = /\b(half|twice|double[sd]?|triple[sd]?|thirds?|fifths?|tenths?|percent|majority|minority|(one|two|three|four|five|six|seven|eight|nine|ten) (in|out of|times)|(a|one) (third|quarter|fifth|tenth) of)\b/i;

function validHeadlines(out, reportData) {
  const items = Array.isArray(out?.headlines) ? out.headlines : null;
  if (!items || items.length < 3 || items.length > 5) return null;
  const known = new Set(reportData.themes.map((t) => t.id));
  const clean = [];
  for (const h of items) {
    const textValue = String(h?.text ?? '').trim();
    const ids = (Array.isArray(h?.theme_ids) ? h.theme_ids : []).map(String).filter((id) => known.has(id));
    if (!textValue || /\d/.test(textValue) || NUMBER_WORDS.test(textValue) || textValue.length > 320 || !ids.length) return null;
    clean.push({ text: textValue, theme_ids: ids });
  }
  return clean;
}

function collectAudits(state) {
  const audits = new Map();
  for (const [, job] of Object.entries(state.jobs).filter(([, j]) => j.stage === 'audit' && j.status === 'done')) {
    const out = readJsonOutput(job);
    for (const a of Array.isArray(out?.audits) ? out.audits : []) {
      const id = String(a?.call_id ?? '');
      const verdict = String(a?.verdict ?? '').toLowerCase();
      if (!job.calls.includes(id) || !['accurate', 'minor_issues', 'major_issues'].includes(verdict)) continue;
      audits.set(id, {
        verdict,
        sentiment_ok: a.sentiment_ok !== false,
        insight_checks: (Array.isArray(a.insight_checks) ? a.insight_checks : []).map((c) => ({ index: Number(c?.index), supported: c?.supported !== false, note: String(c?.note ?? '') })),
        missed: (Array.isArray(a.missed) ? a.missed : []).map(String).slice(0, 5),
        notes: String(a.notes ?? ''),
      });
    }
  }
  return audits;
}

// ---------- next ----------

// Hands out up to `wave` jobs. Jobs handed out recently and still without output are
// treated as running: they are not handed out again, and if enough are running, `next` says WAIT.
function dispatch(state, pendingIds, wave, progress, stalled) {
  const now = Date.now();
  const isRunning = (id) => !stalled && state.jobs[id].listed > 0 && now - (state.jobs[id].listed_at ?? 0) < RUNNING_MS;
  const running = pendingIds.filter(isRunning);
  const ready = pendingIds.filter((id) => !isRunning(id)).sort();
  const room = Math.max(0, wave - running.length);
  if (!ready.length || !room) {
    saveState(state);
    const oldest = Math.min(...running.map((id) => state.jobs[id].listed_at ?? now));
    return { action: 'wait', running: running.length, minutes: Math.round((now - oldest) / 60000), pending: pendingIds.length, progress };
  }
  const ids = ready.slice(0, room);
  for (const id of ids) {
    state.jobs[id].listed++;
    state.jobs[id].listed_at = now;
  }
  saveState(state);
  return {
    action: 'dispatch',
    jobs: ids.map((id) => ({ agent: state.jobs[id].agent ?? AGENTS[state.jobs[id].stage], stage: state.jobs[id].stage, file: state.jobs[id].file })),
    running: running.length,
    pending: pendingIds.length,
    progress,
  };
}

export function next({ stalled = false } = {}) {
  stalledMode = stalled;
  const run = loadRun();
  const state = loadState();
  for (const job of Object.values(state.jobs)) job.agent ??= AGENTS[job.stage];

  refreshJobs(state, ['extract']);
  const extraction = collectExtractions(run, state);
  const extractPending = planExtraction(run, state, extraction);
  const progress = () => ({
    calls_in_scope: run.call_ids.length,
    calls_accepted: extraction.accepted.size,
    calls_failed: Object.keys(state.failed).length,
  });
  if (extractPending.length) return dispatch(state, extractPending, run.wave, { stage: 'extract', ...progress() }, stalled);

  const labelsByArea = collectLabels(extraction.accepted);
  const themePlan = planThemes(state, labelsByArea);
  if (themePlan.pendingIds.length) return dispatch(state, themePlan.pendingIds, run.wave, { stage: 'themes', ...progress() }, stalled);

  const resolved = resolveThemes(labelsByArea, themePlan.proposals, themePlan.mapping);
  let reportData = writeDatabase({ run, state, accepted: extraction.accepted, resolved, audits: new Map(), headlines: [] });

  const reviewPending = planReview(run, state, extraction.accepted, reportData);
  if (reviewPending.length) return dispatch(state, reviewPending, run.wave, { stage: 'review', ...progress() }, stalled);

  const headlineJobs = Object.values(state.jobs).filter((j) => j.stage === 'headlines' && j.status === 'done');
  const headlines = headlineJobs.map((j) => validHeadlines(readJsonOutput(j), reportData)).find(Boolean) ?? [];
  reportData = writeDatabase({ run, state, accepted: extraction.accepted, resolved, audits: collectAudits(state), headlines });
  saveState(state);
  const report = buildReport();
  return {
    action: 'done',
    report: rel(REPORT_PATH),
    report_bytes: report.bytes,
    transcripts_mode: report.transcriptsMode,
    database: rel(DB_PATH),
    progress: { stage: 'done', ...progress() },
    coverage: reportData.meta,
  };
}

export function status() {
  const run = loadRun();
  const state = loadState();
  refreshJobs(state, Object.keys(AGENTS));
  const counts = {};
  for (const job of Object.values(state.jobs)) {
    counts[job.stage] ??= { pending: 0, done: 0, abandoned: 0 };
    counts[job.stage][job.status]++;
  }
  const extraction = collectExtractions(run, state);
  return {
    scope: run.scope.label,
    calls_in_scope: run.call_ids.length,
    calls_accepted: extraction.accepted.size,
    calls_failed: Object.keys(state.failed).length,
    jobs: counts,
    database: existsSync(DB_PATH) ? rel(DB_PATH) : null,
    report: existsSync(REPORT_PATH) ? `${rel(REPORT_PATH)} (${(statSync(REPORT_PATH).size / 1e6).toFixed(1)} MB)` : null,
  };
}
