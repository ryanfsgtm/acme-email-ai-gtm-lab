import { loadView } from './build.mjs';

const pct = (part, whole) => (whole ? Math.round((100 * part) / whole) : 0);
const SEGMENTS = ['SMB', 'Mid-market', 'Enterprise'];

// Tone words are fixed in code so a headline can't call a split theme "heavily negative".
function toneBand(againstPct) {
  if (againstPct >= 85) return 'almost always counts against ACME';
  if (againstPct >= 65) return 'mostly counts against ACME';
  if (againstPct >= 45) return 'splits between against ACME and neutral';
  return 'counts against ACME less often than most themes';
}

// Numbers for the headline writer. It may reason over these but must not print quantities:
// the page renders every number itself from the database.
export function aggregatesForHeadlines(data) {
  const { View } = loadView();
  const filters = { seg: 'all', type: 'all', voice: 'customer' };
  const calls = View.callsInView(data, filters);
  const themes = new Map(data.themes.map((t) => [t.id, t]));
  const areas = new Map(data.areas.map((a) => [a.id, a]));
  const named = [...View.themeStats(data, filters, calls).values()].filter((s) => themes.has(s.key) && !themes.get(s.key).other);

  // Volume alone hides smaller themes that carry most of the deal risk, so take the union of
  // the largest themes, the ones with the most deal-threatening calls, and the ones where
  // deal-threatening calls make up the biggest share.
  const reasons = new Map();
  const tag = (list, why) => list.forEach((s) => reasons.set(s.key, [...(reasons.get(s.key) ?? []), why]));
  tag([...named].sort((a, b) => b.calls - a.calls).slice(0, 40), 'most calls');
  tag([...named].sort((a, b) => b.severe - a.severe).slice(0, 15), 'most deal-threatening calls');
  tag([...named].filter((s) => s.calls >= 10).sort((a, b) => b.severe / b.calls - a.severe / a.calls).slice(0, 10), 'highest share of deal-threatening calls');
  const chosen = named.filter((s) => reasons.has(s.key)).sort((a, b) => b.calls - a.calls);
  // Size words are fixed in code too, relative to all named themes.
  const byCalls = [...named].sort((a, b) => a.calls - b.calls);
  const sizeBand = (s) => {
    const rank = byCalls.indexOf(s) / Math.max(1, byCalls.length - 1);
    return rank >= 2 / 3 ? 'one of the larger themes' : rank >= 1 / 3 ? 'a mid-sized theme' : 'one of the smaller themes';
  };

  const sentimentBy = (keyOf, keys) => keys.map((key) => {
    const list = calls.filter((c) => keyOf(c) === key);
    const s = View.sentimentCounts(list);
    return { group: key, calls: list.length, negative_pct: pct(s.negative, list.length), mixed_pct: pct(s.mixed, list.length), positive_pct: pct(s.positive, list.length) };
  });

  const describe = (s) => {
    const t = themes.get(s.key);
    const total = s.tone.negative + s.tone.neutral + s.tone.positive;
    const against = pct(s.tone.negative, total);
    return {
      theme_id: t.id,
      name: t.name,
      area: areas.get(t.area)?.name ?? t.area,
      description: t.description,
      selected_for: reasons.get(s.key),
      calls: s.calls,
      size: sizeBand(s),
      pct_of_calls: s.share,
      against_acme_pct: against,
      tone: toneBand(against),
      deal_threatening_calls: s.severe,
      deal_threatening_pct: pct(s.severe, s.calls),
      calls_by_segment: Object.fromEntries(SEGMENTS.map((seg) => [seg, s.bySeg[seg] ?? 0])),
      pct_of_segment_calls: Object.fromEntries(SEGMENTS.map((seg) => [seg, pct(s.bySeg[seg] ?? 0, s.segmentTotals[seg])])),
      pct_by_quarter: Object.fromEntries(data.meta.quarters.map((q, i) => [q, s.trend[i] == null ? null : Math.round(s.trend[i] * 100)])),
      calls_by_quarter: Object.fromEntries(data.meta.quarters.map((q) => [q, `${s.byQuarter[q] ?? 0} of ${s.quarterTotals[q] ?? 0}`])),
      example_statements: s.entries.filter((_, i) => i % Math.max(1, Math.floor(s.entries.length / 3)) === 0).slice(0, 3).map((e) => e.insights[0].st),
    };
  };
  const competitors = [...View.competitorStats(data, filters, calls).values()]
    .sort((a, b) => b.calls - a.calls)
    .map((s) => {
      const against = pct(s.tone.negative, s.tone.negative + s.tone.neutral + s.tone.positive);
      return { competitor: s.key, calls: s.calls, against_acme_pct: against, tone: toneBand(against) };
    });
  return {
    calls_analyzed: calls.length,
    note: 'Counts use only insights the customer raised and whose quotes were found in the transcript. Rates per segment are shares of that segment\'s calls; counts per segment say where most calls sit. The last quarter may be partial.',
    calls_per_segment: Object.fromEntries(SEGMENTS.map((seg) => [seg, calls.filter((c) => c.seg === seg).length])),
    sentiment_by_segment: sentimentBy((c) => c.seg, SEGMENTS),
    sentiment_by_call_type: sentimentBy((c) => c.type, [...new Set(calls.map((c) => c.type))].sort()),
    themes: chosen.map(describe),
    other_themes: named.filter((s) => !reasons.has(s.key)).sort((a, b) => b.calls - a.calls).map((s) => ({ theme_id: s.key, name: themes.get(s.key).name, area: areas.get(themes.get(s.key).area)?.name, calls: s.calls })),
    competitors,
  };
}
