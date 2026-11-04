import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_DIR = join(ROOT, 'data', 'generated');
export const WORK_DIR = join(ROOT, 'work');
export const DB_PATH = join(WORK_DIR, 'calls.sqlite');
export const REPORT_PATH = join(ROOT, 'reports', 'call-insights.html');

export const rel = (p) => p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p;

export function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

export function readJsonl(path) {
  return readFileSync(path, 'utf8').split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line));
}

export const taxonomy = readJson(join(ROOT, 'analysis', 'taxonomy.json'));

let corpusCache;
export function loadCorpus() {
  if (corpusCache) return corpusCache;
  const manifest = readJsonl(join(DATA_DIR, 'manifest.jsonl'));
  const accounts = new Map(readJsonl(join(DATA_DIR, 'accounts.jsonl')).map((a) => [a.id, a]));
  const opportunities = new Map(readJsonl(join(DATA_DIR, 'opportunities.jsonl')).map((o) => [o.id, o]));
  const calls = new Map();
  for (const entry of manifest) {
    const account = accounts.get(entry.accountId) ?? {};
    const opportunity = opportunities.get(entry.opportunityId) ?? {};
    calls.set(entry.id, {
      call_id: entry.id,
      path: `data/generated/${entry.path}`,
      call_type: entry.callType,
      occurred_at: entry.occurredAt,
      duration_min: entry.durationMinutes,
      word_count: entry.wordCount,
      sha256: entry.sha256,
      account_id: entry.accountId,
      account_name: account.name ?? null,
      segment: account.segment ?? null,
      industry: account.industry ?? null,
      region: account.region ?? null,
      employees: account.employees ?? null,
      arr: account.arr ?? null,
      opportunity_id: entry.opportunityId,
      opp_stage: opportunity.stage ?? null,
      opp_outcome: opportunity.outcome ?? null,
      opp_competitor: opportunity.competitor ?? null,
    });
  }
  corpusCache = { calls };
  return corpusCache;
}

const transcriptCache = new Map();
export function readTranscript(call) {
  if (!transcriptCache.has(call.call_id)) {
    transcriptCache.set(call.call_id, readFileSync(join(ROOT, call.path), 'utf8'));
  }
  return transcriptCache.get(call.call_id);
}

const acmeRoles = new Set(taxonomy.acmeRoles);
const partnerRoles = new Set(taxonomy.partnerRoles);
export function sideOf(role) {
  if (!role) return 'unknown';
  if (acmeRoles.has(role)) return 'acme';
  if (partnerRoles.has(role)) return 'partner';
  return 'customer';
}

// One turn per non-empty line: "Name (Role): text". Offsets point into the raw transcript string,
// so the report can highlight the exact characters a quote came from.
export function parseTurns(text) {
  const turns = [];
  let lineStart = 0;
  while (lineStart <= text.length) {
    let lineEnd = text.indexOf('\n', lineStart);
    if (lineEnd === -1) lineEnd = text.length;
    const line = text.slice(lineStart, lineEnd);
    if (line.trim()) {
      const match = /^(.+?) \(([^)]+)\): /.exec(line);
      if (match) {
        turns.push({
          index: turns.length,
          speaker: match[1],
          role: match[2],
          side: sideOf(match[2]),
          start: lineStart + match[0].length,
          end: lineEnd,
        });
      } else {
        turns.push({ index: turns.length, speaker: null, role: null, side: 'unknown', start: lineStart, end: lineEnd });
      }
    }
    lineStart = lineEnd + 1;
  }
  // The corpus sometimes labels a customer's line with an ACME role (transcription noise).
  // Use each speaker's most frequent role in the call to decide their side.
  const counts = new Map();
  for (const t of turns) {
    if (!t.speaker) continue;
    if (!counts.has(t.speaker)) counts.set(t.speaker, new Map());
    counts.get(t.speaker).set(t.role, (counts.get(t.speaker).get(t.role) ?? 0) + 1);
  }
  // A name that also has a customer role, while another speaker holds the ACME role it borrows,
  // is the customer; otherwise use the most frequent role.
  const holders = new Map();
  for (const [name, roles] of counts) for (const role of roles.keys()) holders.set(role, (holders.get(role) ?? new Set()).add(name));
  const usualRole = new Map([...counts].map(([name, roles]) => {
    const ranked = [...roles].sort((a, b) => b[1] - a[1]);
    const customerRole = ranked.find(([role]) => sideOf(role) !== 'acme');
    const borrowsAcme = ranked.some(([role]) => sideOf(role) === 'acme' && holders.get(role).size > 1);
    return [name, customerRole && borrowsAcme ? customerRole[0] : ranked[0][0]];
  }));
  for (const t of turns) {
    if (!t.speaker) continue;
    const usual = usualRole.get(t.speaker);
    if (usual !== t.role) t.labeled_role = t.role;
    t.role = usual;
    t.side = sideOf(usual);
  }
  return turns;
}

export function quarterOf(iso) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()} Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

// Small deterministic hash for stable sampling without Math.random.
export function stableHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
