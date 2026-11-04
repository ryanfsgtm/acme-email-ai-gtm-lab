import { parseTurns, readTranscript, taxonomy } from './corpus.mjs';
import { findQuote } from './quotes.mjs';

const AREAS = new Set(taxonomy.areas.map((a) => a.id));
const KINDS = new Set(taxonomy.kinds.map((k) => k.id));
const COMPETITORS = new Map(taxonomy.competitors.map((c) => [c.toLowerCase(), c]));
const SENTIMENTS = new Set(['positive', 'neutral', 'mixed', 'negative']);
const TRAJECTORIES = new Set(['improving', 'steady', 'declining']);
const POLARITIES = new Set(['positive', 'neutral', 'negative']);
const RAISED_BY = new Set(['customer', 'seller']);

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const lower = (v) => text(v).toLowerCase();

function competitorOf(value) {
  const name = lower(value);
  if (!name || name === 'null' || name === 'none') return null;
  if (COMPETITORS.has(name)) return COMPETITORS.get(name);
  if (name.includes('customer.io') || name.includes('customerio')) return 'Customer.io';
  if (name.includes('salesforce marketing') || name.includes('pardot') || name.includes('account engagement')) return 'Pardot';
  if (name.includes('in-house') || name.includes('homegrown') || name.includes('home-grown')) return 'Homegrown';
  for (const [key, canonical] of COMPETITORS) if (name.includes(key)) return canonical;
  return 'Other';
}

// Hard errors make a record unusable and send the call back for another attempt.
// Soft problems (a quote that isn't in the transcript) drop only the affected evidence,
// and an insight with no matching quote is kept but marked unverified.
export function validateRecord(raw, call) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['record is not an object'] };
  if (text(raw.call_id) !== call.call_id) errors.push(`call_id ${JSON.stringify(raw.call_id)} does not match ${call.call_id}`);
  const summary = text(raw.summary);
  if (summary.length < 20) errors.push('summary missing or too short');
  const s = raw.sentiment ?? {};
  const sentiment = {
    label: lower(s.label),
    score: Number.parseInt(s.score, 10),
    trajectory: lower(s.trajectory),
    rationale: text(s.rationale),
  };
  if (!SENTIMENTS.has(sentiment.label)) errors.push(`sentiment.label ${JSON.stringify(s.label)} is not one of ${[...SENTIMENTS].join(', ')}`);
  if (!(sentiment.score >= -2 && sentiment.score <= 2)) errors.push('sentiment.score must be an integer from -2 to 2');
  if (!TRAJECTORIES.has(sentiment.trajectory)) errors.push(`sentiment.trajectory ${JSON.stringify(s.trajectory)} is not valid`);
  if (!Array.isArray(raw.insights)) errors.push('insights must be an array');
  if (errors.length) return { ok: false, errors };

  const transcript = readTranscript(call);
  const turns = parseTurns(transcript);
  const stats = { insights: 0, verified: 0, quotes: 0, matched: 0, speakerMismatch: 0 };
  const insights = [];
  const problems = [];
  raw.insights.slice(0, 8).forEach((item, i) => {
    const where = `insights[${i}]`;
    const area = lower(item?.product_area);
    const kind = lower(item?.kind);
    const polarity = lower(item?.polarity);
    const raisedBy = lower(item?.raised_by);
    const severity = Number.parseInt(item?.severity, 10);
    const theme = text(item?.theme).replace(/\s+/g, ' ');
    const statement = text(item?.statement);
    const bad = [];
    if (!AREAS.has(area)) bad.push(`product_area ${JSON.stringify(item?.product_area)}`);
    if (!KINDS.has(kind)) bad.push(`kind ${JSON.stringify(item?.kind)}`);
    if (!POLARITIES.has(polarity)) bad.push(`polarity ${JSON.stringify(item?.polarity)}`);
    if (!RAISED_BY.has(raisedBy)) bad.push(`raised_by ${JSON.stringify(item?.raised_by)}`);
    if (!(severity >= 1 && severity <= 3)) bad.push('severity');
    if (theme.length < 3 || theme.length > 80) bad.push('theme');
    if (statement.length < 10) bad.push('statement');
    if (bad.length) {
      problems.push(`${where}: invalid ${bad.join(', ')}`);
      return;
    }
    stats.insights++;
    const evidence = [];
    for (const ev of (Array.isArray(item.evidence) ? item.evidence : []).slice(0, 3)) {
      const quote = text(ev?.quote);
      if (!quote) continue;
      stats.quotes++;
      const hit = findQuote(transcript, turns, quote, text(ev?.speaker));
      if (hit.matched) {
        stats.matched++;
        if (!hit.speaker_matches) stats.speakerMismatch++;
        evidence.push({
          quote,
          claimed_speaker: text(ev?.speaker) || null,
          speaker: hit.speaker,
          role: hit.role,
          side: hit.side,
          turn_index: hit.turn_index,
          start: hit.start,
          end: hit.end,
          matched: true,
        });
      } else {
        evidence.push({ quote, claimed_speaker: text(ev?.speaker) || null, matched: false, reason: hit.reason });
      }
    }
    const verified = evidence.some((e) => e.matched);
    if (verified) stats.verified++;
    insights.push({
      ordinal: insights.length,
      product_area: area,
      kind,
      theme,
      polarity,
      severity,
      raised_by: raisedBy,
      competitor: competitorOf(item.competitor),
      statement,
      evidence,
      verified,
    });
  });

  if (stats.quotes >= 2 && stats.matched === 0) {
    return { ok: false, errors: [`none of the ${stats.quotes} quotes appear in ${call.call_id}'s transcript; copy quotes exactly, and check the record is for this call`] };
  }

  return {
    ok: true,
    problems,
    stats,
    record: {
      call_id: call.call_id,
      summary,
      sentiment,
      insights,
    },
  };
}

// Agents sometimes write a JSON array, a single object, fenced JSON, or JSONL. Accept all four.
export function parseRecords(fileText) {
  const cleaned = fileText.replace(/^﻿/, '').replace(/^```[a-z]*\s*$/gim, '').trim();
  if (!cleaned) return { records: [], lineErrors: [] };
  try {
    const whole = JSON.parse(cleaned);
    if (Array.isArray(whole)) return { records: whole, lineErrors: [] };
    if (whole && Array.isArray(whole.records)) return { records: whole.records, lineErrors: [] };
    return { records: [whole], lineErrors: [] };
  } catch {
    const records = [];
    const lineErrors = [];
    cleaned.split('\n').forEach((line, i) => {
      const trimmed = line.trim().replace(/,$/, '');
      if (!trimmed || trimmed === '[' || trimmed === ']') return;
      try {
        records.push(JSON.parse(trimmed));
      } catch (error) {
        lineErrors.push(`line ${i + 1}: ${error.message}`);
      }
    });
    return { records, lineErrors };
  }
}
