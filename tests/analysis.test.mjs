import { describe, expect, it } from 'vitest';
import { loadCorpus, parseTurns, readTranscript } from '../analysis/lib/corpus.mjs';
import { findQuote, normalize, quoteFragments } from '../analysis/lib/quotes.mjs';
import { parseRecords, validateRecord } from '../analysis/lib/validate.mjs';

const call = loadCorpus().calls.get('call_00441');
const transcript = readTranscript(call);
const turns = parseTurns(transcript);

describe('parseTurns', () => {
  it('splits speaker turns with offsets into the raw text', () => {
    expect(turns[0].speaker).toBe('Luis Romero');
    expect(turns[0].side).toBe('acme');
    expect(turns[1].side).toBe('customer');
    expect(transcript.slice(turns[1].start, turns[1].start + 13)).toBe('Busy, but man');
  });
});

describe('speaker roles', () => {
  it("uses a speaker's usual role when one line carries an ACME role by mistake", () => {
    const c = loadCorpus().calls.get('call_00026');
    const t = parseTurns(readTranscript(c));
    const tyler = t.filter((x) => x.speaker === 'Tyler Wolf');
    expect(new Set(tyler.map((x) => x.side))).toEqual(new Set(['customer']));
    expect(tyler.some((x) => x.labeled_role === 'Account Executive')).toBe(true);
  });
});

describe('normalize', () => {
  it('folds curly quotes, dashes and spacing but keeps every word', () => {
    expect(normalize('I’m  fine — really').text).toBe("i'm fine-really");
    expect(normalize('short - I’m').text).toBe("short-i'm");
  });

  it('maps each normalized character back to its source index', () => {
    const { text, index } = normalize('A’B  c');
    expect(text).toBe("a'b c");
    expect(index).toEqual([0, 1, 2, 3, 5]);
  });
});

describe('findQuote', () => {
  it('finds an exact quote and returns the source span', () => {
    const hit = findQuote(transcript, turns, 'The quote looked like it counted all 32,000.', 'Rey Lemke');
    expect(hit.matched).toBe(true);
    expect(hit.speaker_matches).toBe(true);
    expect(transcript.slice(hit.start, hit.end)).toBe('The quote looked like it counted all 32,000');
  });

  it('tolerates straight apostrophes and missing punctuation', () => {
    const hit = findQuote(transcript, turns, "I can't manufacture four thousand dollars", 'Rey Lemke');
    expect(hit.matched).toBe(true);
    expect(transcript.slice(hit.start, hit.end)).toContain('manufacture four thousand dollars');
  });

  it('reports the real speaker when the model names the wrong one', () => {
    const hit = findQuote(transcript, turns, 'The quote looked like it counted all 32,000', 'Luis Romero');
    expect(hit.matched).toBe(true);
    expect(hit.speaker).toBe('Rey Lemke');
    expect(hit.speaker_matches).toBe(false);
  });

  it('rejects paraphrases and stitched lines', () => {
    expect(findQuote(transcript, turns, 'The quote counted all thirty-two thousand contacts', 'Rey Lemke').matched).toBe(false);
    expect(findQuote(transcript, turns, 'Exactly. I can probably get people comfortable. What is the ceiling?', null).matched).toBe(false);
  });

  it('accepts ellipsis fragments only in order within one turn', () => {
    expect(quoteFragments('one two... three four')).toEqual(['one two', 'three four']);
    expect(findQuote(transcript, turns, 'We have around 31,000 records ... after the event imports', 'Rey Lemke').matched).toBe(true);
    expect(findQuote(transcript, turns, 'after the event imports ... We have around 31,000 records', 'Rey Lemke').matched).toBe(false);
  });

  it('refuses quotes too short to prove anything', () => {
    expect(findQuote(transcript, turns, 'Yes.', 'Rey Lemke')).toMatchObject({ matched: false, reason: 'too_short' });
  });
});

const goodRecord = {
  call_id: 'call_00441',
  summary: 'Pricing call where the buyer disputes the contact count and has a hard budget cap.',
  sentiment: { label: 'mixed', score: '-1', trajectory: 'improving', rationale: 'Interested but blocked on budget.' },
  insights: [
    {
      product_area: 'pricing', kind: 'objection', theme: 'Hard budget ceiling', polarity: 'negative', severity: 3, raised_by: 'customer', competitor: null,
      statement: 'Finance caps the platform at about $12k a year against a $16k proposal.',
      evidence: [{ speaker: 'Rey Lemke', quote: "I can't manufacture four thousand dollars." }],
    },
    {
      product_area: 'migration', kind: 'risk', theme: 'Marketo migration risk', polarity: 'negative', severity: 2, raised_by: 'seller', competitor: 'marketo',
      statement: 'Worried that old Marketo fields will break campaigns during migration.',
      evidence: [{ speaker: 'Rey Lemke', quote: 'this quote was never said in the call at all' }],
    },
    { product_area: 'not-an-area', kind: 'pain', theme: 'x', polarity: 'negative', severity: 1, raised_by: 'customer', statement: 'Bad insight.', evidence: [] },
  ],
};

describe('validateRecord', () => {
  it('accepts a good record, coerces types and canonicalizes competitors', () => {
    const r = validateRecord(goodRecord, call);
    expect(r.ok).toBe(true);
    expect(r.record.sentiment.score).toBe(-1);
    expect(r.record.insights).toHaveLength(2);
    expect(r.record.insights[1].competitor).toBe('Marketo');
    expect(r.problems[0]).toMatch(/insights\[2\]/);
  });

  it('keeps an insight with no matching quote but marks it unverified', () => {
    const r = validateRecord(goodRecord, call);
    expect(r.record.insights[0].verified).toBe(true);
    expect(r.record.insights[1].verified).toBe(false);
    expect(r.stats).toMatchObject({ quotes: 2, matched: 1, verified: 1 });
  });

  it('rejects a record whose quotes all come from some other call', () => {
    const swapped = {
      ...goodRecord,
      insights: [0, 1].map((n) => ({ ...goodRecord.insights[0], evidence: [{ speaker: 'Hugh Effertz', quote: `Marketing wants CRM synchronization, but if the sync is bidirectional ${n}` }] })),
    };
    const r = validateRecord(swapped, call);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/none of the 2 quotes/);
  });

  it('rejects records with the wrong call id or invalid sentiment', () => {
    expect(validateRecord({ ...goodRecord, call_id: 'call_00001' }, call).ok).toBe(false);
    expect(validateRecord({ ...goodRecord, sentiment: { label: 'great', score: 0, trajectory: 'steady' } }, call).ok).toBe(false);
  });
});

describe('parseRecords', () => {
  it('reads JSONL, arrays, fenced JSON, and reports broken lines', () => {
    expect(parseRecords('{"a":1}\n{"a":2}\n').records).toHaveLength(2);
    expect(parseRecords('[{"a":1},{"a":2}]').records).toHaveLength(2);
    expect(parseRecords('```json\n{"a":1}\n```').records).toHaveLength(1);
    const broken = parseRecords('{"a":1}\n{"a":\n');
    expect(broken.records).toHaveLength(1);
    expect(broken.lineErrors).toHaveLength(1);
  });
});
