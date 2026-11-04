// Shared by the report page and the Node builder, which uses it to pre-render the summary.
// Pure functions from data to HTML strings: no DOM access in this file.
const View = (() => {
  const SENTIMENTS = ['positive', 'neutral', 'mixed', 'negative'];
  const SENTIMENT_NAME = { positive: 'Positive', neutral: 'Neutral', mixed: 'Mixed', negative: 'Negative' };
  const SEGMENTS = ['SMB', 'Mid-market', 'Enterprise'];
  // Insight polarity is whether the point counts for or against ACME, not the customer's mood.
  const POLARITY_NAME = { negative: 'against ACME', neutral: 'neutral for ACME', positive: "in ACME's favor" };
  const KIND_NAME = { pain: 'Pain point', request: 'Request', praise: 'Praise', objection: 'Objection', risk: 'Risk' };
  const SEVERITY_NAME = { 1: 'minor', 2: 'material', 3: 'deal-threatening' };
  const COMPETITOR_LABEL = { Other: 'Other or unnamed tools', Homegrown: 'In-house tools' };
  const COMPETITOR_LEDE = {
    Other: 'Calls where a customer brought up a vendor outside the named list, or an unnamed current tool, as an alternative to ACME.',
    Homegrown: 'Calls where a customer weighed building or keeping an in-house tool instead of ACME.',
  };
  const ACME_ROLES = new Set(['Account Executive', 'Customer Success Manager', 'Solutions Consultant', 'Solutions Engineer']);
  const PAGE_SIZE = 40;
  const LEAN_MIN_CALLS = 8;
  const LEAN_MIN_SEGMENT = 20;
  const QUARTER_MIN_BASE = 5;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n ?? 0).toLocaleString('en-US');
  const nCalls = (n) => `${fmt(n)} call${n === 1 ? '' : 's'}`;
  const pct = (part, whole) => (whole ? Math.round((100 * part) / whole) : 0);
  const money = (n) => (n == null ? '' : `$${fmt(n)}`);
  const lowerFirst = (s) => (/^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
  const compLabel = (name) => COMPETITOR_LABEL[name] ?? name;
  const model = (name) => (name === 'sonnet' ? 'Claude Sonnet' : name === 'opus' ? 'Claude Opus' : name === 'haiku' ? 'Claude Haiku' : `model "${esc(name)}"`);
  const scoreText = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
  const date = (iso) => {
    const [y, m, d] = String(iso).split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}, ${y}`;
  };
  const shortDate = (iso) => {
    const [y, m] = String(iso).split('-').map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  };

  // ---------- routes ----------
  // #/                       summary
  // #/theme/<area>/<slug>    calls behind one theme
  // #/competitor/<name>      calls naming one competitor
  // #/sentiment/<label>      calls ending with one sentiment
  // #/call/<id>?from=...     one call, with its evidence highlighted
  // Filters ride along in the query: seg, type, voice.
  function parseRoute(hash) {
    const raw = String(hash || '').replace(/^#/, '');
    const qAt = raw.indexOf('?');
    const path = qAt === -1 ? raw : raw.slice(0, qAt);
    const params = new URLSearchParams(qAt === -1 ? '' : raw.slice(qAt + 1));
    const filters = {
      seg: SEGMENTS.includes(params.get('seg')) ? params.get('seg') : 'all',
      type: params.get('type') || 'all',
      voice: params.get('voice') === 'all' ? 'all' : 'customer',
    };
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] === 'theme' && parts.length >= 2) return { view: 'list', kind: 'theme', value: parts.slice(1).join('/'), filters };
    if (parts[0] === 'competitor' && parts[1]) return { view: 'list', kind: 'competitor', value: parts[1], filters };
    if (parts[0] === 'sentiment' && SENTIMENTS.includes(parts[1])) return { view: 'list', kind: 'sentiment', value: parts[1], filters };
    if (parts[0] === 'call' && parts[1]) return { view: 'call', id: parts[1], from: params.get('from'), filters };
    return { view: 'summary', anchor: parts[0] && !path.startsWith('/') ? parts[0] : null, filters };
  }

  // An unknown call type in a link would empty every view; treat it as "all".
  function normalize(data, route) {
    if (route.filters.type === 'all' || data.calls.some((c) => c.type === route.filters.type)) return route;
    return { ...route, filters: { ...route.filters, type: 'all' } };
  }

  function query(filters, extra) {
    const params = new URLSearchParams();
    if (filters.seg !== 'all') params.set('seg', filters.seg);
    if (filters.type !== 'all') params.set('type', filters.type);
    if (filters.voice !== 'customer') params.set('voice', filters.voice);
    for (const [k, v] of Object.entries(extra || {})) if (v) params.set(k, v);
    const text = params.toString();
    return text ? `?${text}` : '';
  }

  const enc = (value) => String(value).split('/').map(encodeURIComponent).join('/');
  const hrefSummary = (filters) => `#/${query(filters)}`;
  const hrefList = (kind, value, filters) => `#/${kind}/${enc(value)}${query(filters)}`;
  const hrefCall = (id, filters, from) => `#/call/${encodeURIComponent(id)}${query(filters, { from })}`;
  const withFilter = (filters, key, value) => ({ ...filters, [key]: value });
  const routeKey = (route) => JSON.stringify(route);
  const DEFAULT_FILTERS = { seg: 'all', type: 'all', voice: 'customer' };
  const isDefault = (f) => f.seg === 'all' && f.type === 'all' && f.voice === 'customer';

  // ---------- model ----------
  function callsInView(data, filters) {
    return data.calls.filter((c) => (filters.seg === 'all' || c.seg === filters.seg) && (filters.type === 'all' || c.type === filters.type));
  }

  const insightsOf = (call, filters) => (filters.voice === 'all' ? call.ins : call.ins.filter((i) => i.by === 'customer'));

  // A call's stance on a theme: against ACME if any of its insights there counts against ACME,
  // otherwise in ACME's favor if any does, otherwise neutral. Counting calls, not insights,
  // keeps one talkative call from outweighing several quiet ones.
  function callTone(insights) {
    if (insights.some((i) => i.p === 'negative')) return 'negative';
    if (insights.some((i) => i.p === 'positive')) return 'positive';
    return 'neutral';
  }

  function groupStats(data, calls, filters, keyOf) {
    const stats = new Map();
    const quarterTotals = Object.fromEntries(data.meta.quarters.map((q) => [q, 0]));
    const segmentTotals = Object.fromEntries(SEGMENTS.map((s) => [s, 0]));
    for (const call of calls) {
      quarterTotals[call.q] = (quarterTotals[call.q] ?? 0) + 1;
      if (call.seg in segmentTotals) segmentTotals[call.seg]++;
      const groups = new Map();
      for (const ins of insightsOf(call, filters)) {
        const key = keyOf(ins);
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(ins);
      }
      for (const [key, list] of groups) {
        if (!stats.has(key)) {
          stats.set(key, { key, calls: 0, tone: { negative: 0, neutral: 0, positive: 0 }, severe: 0, bySeg: {}, byType: {}, byQuarter: {}, entries: [] });
        }
        const s = stats.get(key);
        s.calls++;
        s.tone[callTone(list)]++;
        if (list.some((i) => i.sev === 3)) s.severe++;
        s.bySeg[call.seg] = (s.bySeg[call.seg] ?? 0) + 1;
        s.byType[call.type] = (s.byType[call.type] ?? 0) + 1;
        s.byQuarter[call.q] = (s.byQuarter[call.q] ?? 0) + 1;
        s.entries.push({ call, insights: list });
      }
    }
    for (const s of stats.values()) {
      s.quarterTotals = quarterTotals;
      s.segmentTotals = segmentTotals;
      s.share = pct(s.calls, calls.length);
      // null marks a quarter with no calls in view, so it isn't drawn as 0%.
      s.trend = data.meta.quarters.map((q) => (quarterTotals[q] ? (s.byQuarter[q] ?? 0) / quarterTotals[q] : null));
      s.lean = leaningSegment(s, segmentTotals, calls.length);
    }
    return stats;
  }

  // The segment where a theme comes up at least 1.3 times as often as overall. Says why when
  // that can't be judged: too few calls, or fewer than two segments in view to compare.
  function leaningSegment(s, segmentTotals, totalCalls) {
    if (SEGMENTS.filter((seg) => segmentTotals[seg] >= LEAN_MIN_SEGMENT).length < 2) return { state: 'one' };
    if (s.calls < LEAN_MIN_CALLS || !totalCalls) return { state: 'few' };
    const overall = s.calls / totalCalls;
    let best = null;
    for (const seg of SEGMENTS) {
      if (segmentTotals[seg] < LEAN_MIN_SEGMENT) continue;
      const rate = (s.bySeg[seg] ?? 0) / segmentTotals[seg];
      if (rate >= overall * 1.3 && (!best || rate > best.rate)) best = { state: 'lean', seg, rate, ratio: rate / overall };
    }
    return best ?? { state: 'even' };
  }

  function leanText(lean) {
    if (lean.state === 'lean') return `${esc(lean.seg)} <span class="muted">${lean.ratio.toFixed(1)}x</span>`;
    if (lean.state === 'few') return '<span class="muted" title="Fewer than 8 calls">Too few</span>';
    if (lean.state === 'one') return '';
    return '<span class="muted" title="No segment reaches 1.3 times the overall rate">Even</span>';
  }

  const themeStats = (data, filters, calls = callsInView(data, filters)) => groupStats(data, calls, filters, (i) => i.th);
  const competitorStats = (data, filters, calls = callsInView(data, filters)) => groupStats(data, calls, filters, (i) => i.comp);

  function sentimentCounts(calls) {
    const counts = { positive: 0, neutral: 0, mixed: 0, negative: 0 };
    for (const c of calls) counts[c.sent]++;
    return counts;
  }

  function byKey(calls, keyOf, order) {
    const groups = new Map((order || []).map((k) => [k, []]));
    for (const c of calls) {
      const k = keyOf(c);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    return [...groups.entries()].filter(([, list]) => list.length);
  }

  // Theme names that repeat across product areas get the area appended wherever they appear
  // outside the area-grouped table.
  function themeNames(data) {
    const areas = new Map(data.areas.map((a) => [a.id, a.name]));
    const count = new Map();
    for (const t of data.themes) count.set(t.name.toLowerCase(), (count.get(t.name.toLowerCase()) ?? 0) + 1);
    return new Map(data.themes.map((t) => [t.id, count.get(t.name.toLowerCase()) > 1 ? `${t.name} in ${lowerFirst(areas.get(t.area))}` : t.name]));
  }

  // ---------- small pieces ----------
  function stack(parts, total, label) {
    if (!total) return '<span class="stack stack-empty" aria-hidden="true"></span>';
    const spans = parts
      .filter((p) => p.value > 0)
      .map((p) => `<span class="stack-part tone-${p.key}" style="flex-grow:${p.value}"></span>`)
      .join('');
    return `<span class="stack" role="img" aria-label="${esc(label)}">${spans}</span>`;
  }

  function toneStack(tone) {
    const total = tone.negative + tone.neutral + tone.positive;
    const label = `${pct(tone.negative, total)}% against ACME, ${pct(tone.neutral, total)}% neutral for ACME, ${pct(tone.positive, total)}% in ACME's favor`;
    return stack([{ key: 'negative', value: tone.negative }, { key: 'neutral', value: tone.neutral }, { key: 'positive', value: tone.positive }], total, label);
  }

  function sentimentStack(counts) {
    const total = SENTIMENTS.reduce((n, s) => n + counts[s], 0);
    const label = SENTIMENTS.map((s) => `${pct(counts[s], total)}% ${s}`).join(', ');
    return stack(SENTIMENTS.slice().reverse().map((s) => ({ key: s, value: counts[s] })), total, label);
  }

  // One shared scale per table, so a flat theme looks flat next to a busy one.
  function spark(values, max, bases) {
    const pts = values.map((v, i) => [i, v]).filter(([i, v]) => v != null && (!bases || bases[i] >= QUARTER_MIN_BASE));
    if (pts.length < 2) return '';
    const top = Math.max(max ?? 0, 0.0001);
    const w = 88;
    const h = 22;
    const x = (i) => ((i * w) / (values.length - 1)).toFixed(1);
    const y = (v) => (h - 2 - (Math.min(v, top) / top) * (h - 4)).toFixed(1);
    const first = Math.round(pts[0][1] * 100);
    const last = Math.round(pts[pts.length - 1][1] * 100);
    const label = `Share of calls by quarter, from ${first}% to ${last}%`;
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${label}"><title>${label}</title><polyline points="${pts.map(([i, v]) => `${x(i)},${y(v)}`).join(' ')}" /></svg>`;
  }

  const againstShare = (tone) => pct(tone.negative, tone.negative + tone.neutral + tone.positive);
  const toneWord = (tone) => `${againstShare(tone)}% against ACME`;

  function filterBar(route, data, count) {
    const f = route.filters;
    const target = (filters) => (route.view === 'list' ? hrefList(route.kind, route.value, filters) : hrefSummary(filters));
    const segLinks = ['all', ...SEGMENTS]
      .map((s) => `<a class="chip" href="${target(withFilter(f, 'seg', s))}"${f.seg === s ? ' aria-current="true"' : ''}>${s === 'all' ? 'All' : esc(s)}</a>`)
      .join('');
    const types = [...new Set(data.calls.map((c) => c.type))].sort();
    const typeOptions = ['all', ...types]
      .map((t) => `<option value="${esc(t)}"${f.type === t ? ' selected' : ''}>${t === 'all' ? 'All call types' : esc(t)}</option>`)
      .join('');
    const voiceLinks = [['customer', 'Customer raised it'], ['all', 'Include topics ACME raised']]
      .map(([v, label]) => `<a class="chip" href="${target(withFilter(f, 'voice', v))}"${f.voice === v ? ' aria-current="true"' : ''}>${label}</a>`)
      .join('');
    return `<div class="filters" role="region" aria-label="Filters">
      <div class="filter-row">
        <div class="chips" role="group" aria-label="Customer segment">${segLinks}</div>
        <label class="select"><span class="visually-hidden">Call type</span><select data-filter="type">${typeOptions}</select></label>
        <div class="chips" role="group" aria-label="Which topics count">${voiceLinks}</div>
        <span class="filter-count">${nCalls(count)} in view</span>
      </div>
    </div>`;
  }

  const themeById = (data) => new Map(data.themes.map((t) => [t.id, t]));
  const areaById = (data) => new Map(data.areas.map((a) => [a.id, a]));
  // Auditor notes sometimes use the record's field names; say the same thing in plain words.
  const cleanNote = (text) => String(text ?? '')
    .replace(/\b(has|have) (the )?wrong raised_by\b/gi, (_, v) => (v.toLowerCase() === 'have' ? 'are credited to the wrong side' : 'is credited to the wrong side'))
    .replace(/\b(have|has) raised_by set to seller\b/gi, (_, v) => (v.toLowerCase() === 'have' ? 'are credited to ACME' : 'is credited to ACME'))
    .replace(/\braised_by (is|was) wrong\b/gi, 'is credited to the wrong side')
    .replace(/\braised_by should be (customer|seller)\b/gi, (_, who) => `it should be credited to the ${who === 'seller' ? 'ACME rep' : 'customer'}`)
    .replace(/\bwrong raised_by\b/gi, 'wrong side credited')
    .replace(/\braised_by\b/g, 'who raised it')
    .replace(/_/g, ' ');

  // ---------- summary ----------
  function renderSummary(data, route) {
    const f = route.filters;
    const calls = callsInView(data, f);
    const themes = themeById(data);
    const names = themeNames(data);
    const areas = areaById(data);
    const stats = themeStats(data, f, calls);
    const m = data.meta;
    const range = m.date_min ? `${shortDate(m.date_min)} to ${shortDate(m.date_max)}` : '';
    const readers = m.batches === 1
      ? `One ${model(m.models.extract)} subagent read up to ${fmt(m.batch_size)} transcripts in full.`
      : `${fmt(m.batches)} ${model(m.models.extract)} subagents each read up to ${fmt(m.batch_size)} transcripts in full.`;
    const scope = m.scope.startsWith('All ') ? `Calls from ${esc(range)}.` : `${esc(m.scope)} from ${esc(range)}.`;
    const auditLine = m.audit.sampled
      ? `<span>${fmt(m.audit.insights_checked - m.audit.unsupported_insights)} of ${fmt(m.audit.insights_checked)} insights confirmed when an auditor re-read ${nCalls(m.audit.sampled)}</span>`
      : '';
    const failLine = m.calls_failed ? `<span>${nCalls(m.calls_failed)} failed and are listed below</span>` : '';

    const intro = `<section class="intro">
      <h1>What ${fmt(m.calls_analyzed)} ACME&nbsp;Email calls say</h1>
      <p class="lede">${scope} ${readers} Each theme below opens the calls behind it, and each call shows the lines that support it.</p>
      <p class="receipt"><span>${m.calls_analyzed === m.calls_in_scope ? 'Every call analyzed' : `${fmt(m.calls_analyzed)} of ${fmt(m.calls_in_scope)} calls analyzed`}</span><span>${fmt(m.quotes_matched)} of ${fmt(m.quotes_total)} quotes found word for word in the transcript</span>${auditLine}${failLine}</p>
      <p class="receipt-link"><a href="#coverage${query(f)}">How this was built and checked</a></p>
    </section>`;

    // Headline numbers use the basis the writer saw (customer-raised topics, all calls),
    // so the sentence and the numbers next to it always agree. Filtered counts are added.
    const basis = isDefault(f) ? stats : themeStats(data, DEFAULT_FILTERS);
    const headlines = data.headlines.length
      ? `<section class="block" id="findings" aria-labelledby="findings-h">
          <h2 id="findings-h">What stands out</h2>
          <p class="section-note">Written by a <code>headline-writer</code> subagent (${model(m.models.headlines)}) from counts computed in code, over topics customers raised in every call. It could not state numbers; the numbers in parentheses come from the database${isDefault(f) ? '' : ', with this view’s count after the semicolon'}.</p>
          <ul class="findings">${data.headlines.map((h) => {
            const links = h.themes.filter((id) => themes.has(id)).map((id) => {
              const b = basis.get(id);
              let detail = b ? `${nCalls(b.calls)}, ${toneWord(b.tone)}` : 'no calls';
              if (!isDefault(f)) {
                const v = stats.get(id);
                detail += `; ${v ? `${fmt(v.calls)} in this view` : 'none in this view'}`;
              }
              return `<a href="${hrefList('theme', id, f)}">${esc(names.get(id))}</a> <span class="muted">(${detail})</span>`;
            }).join('<span class="sep">, </span>');
            return `<li><p>${esc(h.text)}</p><p class="finding-links">${links}</p></li>`;
          }).join('')}</ul>
        </section>`
      : '';

    const counts = sentimentCounts(calls);
    const total = calls.length;
    const legend = SENTIMENTS.slice().reverse().map((s) => `<li><a href="${hrefList('sentiment', s, f)}"><span class="key tone-${s}" aria-hidden="true"></span>${SENTIMENT_NAME[s]} <span class="num">${fmt(counts[s])}</span> <span class="muted">${pct(counts[s], total)}%</span></a></li>`).join('');
    const distTable = (caption, head, groups, linkFor, cls) => `<table class="dist ${cls}">
        <caption>${caption}</caption>
        <thead><tr><th scope="col">${head}</th><th scope="col" class="num">Calls</th><th scope="col">Sentiment</th><th scope="col" class="num">Negative</th></tr></thead>
        <tbody>${groups.map(([key, list]) => {
          const c = sentimentCounts(list);
          return `<tr><th scope="row">${linkFor ? `<a href="${linkFor(key)}">${esc(key)}</a>` : esc(key)}</th><td class="num">${fmt(list.length)}</td><td class="bar-cell">${sentimentStack(c)}</td><td class="num">${pct(c.negative, list.length)}%</td></tr>`;
        }).join('')}</tbody>
      </table>`;
    const sentiment = `<section class="block" id="sentiment" aria-labelledby="sentiment-h">
      <h2 id="sentiment-h">How customers felt by the end of the call</h2>
      <p class="section-note">The analyst's reading of each customer's attitude toward ACME at the end of the call. It comes from the whole conversation, so it isn't tied to specific lines.</p>
      <div class="overall">${sentimentStack(counts)}<ul class="legend">${legend}</ul></div>
      <div class="split">
        ${distTable('By segment', 'Segment', byKey(calls, (c) => c.seg, SEGMENTS), f.seg === 'all' ? (seg) => hrefSummary(withFilter(f, 'seg', seg)) : null, 'segments')}
        ${distTable('By call type', 'Call type', byKey(calls, (c) => c.type).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])), f.type === 'all' ? (type) => hrefSummary(withFilter(f, 'type', type)) : null, 'types')}
      </div>
    </section>`;

    const areaGroups = new Map();
    for (const s of stats.values()) {
      const t = themes.get(s.key);
      if (!t) continue;
      if (!areaGroups.has(t.area)) areaGroups.set(t.area, []);
      areaGroups.get(t.area).push(s);
    }
    const areaCalls = new Map();
    for (const call of calls) {
      const seen = new Set(insightsOf(call, f).map((i) => themes.get(i.th)?.area).filter(Boolean));
      for (const a of seen) areaCalls.set(a, (areaCalls.get(a) ?? 0) + 1);
    }
    const bases = data.meta.quarters.map((q) => calls.filter((c) => c.q === q).length);
    const sparkMax = Math.max(0.0001, ...[...stats.values()].filter((s) => s.calls >= LEAN_MIN_CALLS).flatMap((s) => s.trend.filter((v, i) => v != null && bases[i] >= QUARTER_MIN_BASE)));
    const showLean = f.seg === 'all';
    const orderedAreas = [...areaGroups.keys()].sort((a, b) => (areaCalls.get(b) ?? 0) - (areaCalls.get(a) ?? 0));
    const areaBodies = orderedAreas.map((areaId) => {
      const list = areaGroups.get(areaId).sort((a, b) => Number(themes.get(a.key).other) - Number(themes.get(b.key).other) || b.calls - a.calls);
      const rows = list.map((s, i) => {
        const t = themes.get(s.key);
        return `<tr${i >= 6 ? ' hidden data-extra' : ''}>
          <th scope="row"><a href="${hrefList('theme', t.id, f)}">${esc(t.name)}</a>${showLean && s.lean.state === 'lean' ? `<span class="lean-mobile">Most common in ${esc(s.lean.seg)}</span>` : ''}</th>
          <td class="num">${fmt(s.calls)}</td>
          <td class="tone-cell">${toneStack(s.tone)}<span class="tone-label">${toneWord(s.tone)}</span></td>
          <td class="num">${fmt(s.severe)}</td>
          <td>${s.calls >= LEAN_MIN_CALLS ? spark(s.trend, sparkMax, bases) : '<span class="muted" title="Fewer than 8 calls">Too few</span>'}</td>
          ${showLean ? `<td>${leanText(s.lean)}</td>` : ''}
        </tr>`;
      }).join('');
      const more = list.length > 6
        ? `<tr class="more-row"><td colspan="${showLean ? 6 : 5}"><button type="button" class="text-button" data-more="area-${esc(areaId)}" aria-expanded="false">Show all ${list.length} ${esc(lowerFirst(areas.get(areaId).name))} themes</button></td></tr>`
        : '';
      return `<tbody class="area" id="area-${esc(areaId)}">
        <tr class="area-row"><th colspan="${showLean ? 6 : 5}" scope="rowgroup">${esc(areas.get(areaId).name)} <span class="muted">${nCalls(areaCalls.get(areaId) ?? 0)}</span></th></tr>
        ${rows}${more}
      </tbody>`;
    }).join('');
    const insights = `<section class="block" id="themes" aria-labelledby="themes-h">
      <h2 id="themes-h">Product insights</h2>
      <p class="section-note">Themes grouped by product area. A call counts once per theme, and only when the customer brought the topic up, unless you include topics ACME raised. "For or against ACME" splits those calls by whether the point counted against ACME, was neutral, or was in ACME's favor; it is separate from how the customer felt overall. "Most common in" names a segment where the theme comes up at least 1.3 times as often as overall.</p>
      ${areaBodies ? `<div class="table-scroll"><table class="themes">
        <thead><tr><th scope="col">Theme</th><th scope="col" class="num">Calls</th><th scope="col">For or against ACME</th><th scope="col" class="num">Deal-<wbr>threatening</th><th scope="col">By quarter</th>${showLean ? '<th scope="col">Most common in</th>' : ''}</tr></thead>
        ${areaBodies}
      </table></div>` : '<p class="empty">No insights match these filters.</p>'}
    </section>`;

    const comp = [...competitorStats(data, f, calls).values()].sort((a, b) => b.calls - a.calls || a.key.localeCompare(b.key));
    const competitors = comp.length
      ? `<section class="block" id="competitors" aria-labelledby="competitors-h">
          <h2 id="competitors-h">Competitors in the conversation</h2>
          <div class="table-scroll"><table class="themes compact">
            <thead><tr><th scope="col">Competitor</th><th scope="col" class="num">Calls</th><th scope="col">For or against ACME</th>${f.seg === 'all' ? '<th scope="col">Most common in</th>' : ''}</tr></thead>
            <tbody>${comp.map((s) => `<tr><th scope="row"><a href="${hrefList('competitor', s.key, f)}">${esc(compLabel(s.key))}</a></th><td class="num">${fmt(s.calls)}</td><td class="tone-cell">${toneStack(s.tone)}<span class="tone-label">${toneWord(s.tone)}</span></td>${f.seg === 'all' ? `<td>${leanText(s.lean)}</td>` : ''}</tr>`).join('')}</tbody>
          </table></div>
        </section>`
      : '';

    return `${intro}${filterBar(route, data, calls.length)}<div class="page">${headlines}${sentiment}${insights}${competitors}${renderCoverage(data, f)}</div>`;
  }

  function renderCoverage(data, f) {
    const m = data.meta;
    const a = m.audit;
    const facts = [
      ['Scope', esc(m.scope)],
      ['Calls analyzed', `${fmt(m.calls_analyzed)} of ${fmt(m.calls_in_scope)}`],
      ['Calls that failed', fmt(m.calls_failed)],
      ['Insights extracted', fmt(m.insights_total)],
      ['Insights kept', `${fmt(m.insights_verified)} <span class="muted">(at least one quote found in the transcript)</span>`],
      ['Quotes found word for word', `${fmt(m.quotes_matched)} of ${fmt(m.quotes_total)}`],
      ['Insights in an "Other" theme', fmt(m.insights_other)],
    ];
    if (a.sampled) {
      const audited = data.calls.filter((c) => c.audit);
      const omissionsOnly = audited.filter((c) => c.audit.v === 'minor_issues' && !c.audit.unsupported && c.audit.sentiment_ok && c.audit.missed.length > 0).length;
      facts.push(['Audit sample', `${nCalls(a.sampled)} re-read by a separate subagent`]);
      facts.push(['Insights confirmed', `${fmt(a.insights_checked - a.unsupported_insights)} of ${fmt(a.insights_checked)} <span class="muted">(the rest had a wrong tag or overstated the transcript)</span>`]);
      facts.push(['Sentiment disputed', `${fmt(a.sentiment_wrong)} of ${nCalls(a.sampled)}`]);
      facts.push(['Calls by verdict', `${fmt(a.accurate)} no issues, ${fmt(a.minor_issues)} minor${omissionsOnly ? ` (${fmt(omissionsOnly)} of them only missed points, nothing wrong)` : ''}, ${fmt(a.major_issues)} major`]);
    }
    const issues = data.calls.filter((c) => c.audit && c.audit.v !== 'accurate');
    const issueList = issues.length
      ? `<details class="disclosure"><summary>Audit findings (${issues.length})</summary><ul class="plain">${issues.map((c) => `<li><a href="${hrefCall(c.id, f)}">${esc(c.id)}</a><span class="badge">${c.audit.v === 'major_issues' ? 'Major' : 'Minor'}</span><span>${esc(cleanNote(c.audit.notes))}</span></li>`).join('')}</ul></details>`
      : '';
    const failList = m.failures.length
      ? `<details class="disclosure"><summary>Failed calls (${m.failures.length})</summary><ul class="plain">${m.failures.map((x) => `<li><span class="mono">${esc(x.call_id)}</span><span></span><span>${esc(x.reason)}</span></li>`).join('')}</ul></details>`
      : '';
    const retries = m.retry_jobs
      ? `Calls with broken records went back for another attempt (${fmt(m.retry_jobs)} retry ${m.retry_jobs === 1 ? 'batch' : 'batches'}).`
      : 'Calls with broken records would have gone back for another attempt; in this run every record passed on the first try.';
    return `<section class="block" id="coverage" aria-labelledby="coverage-h">
      <h2 id="coverage-h">How this was built</h2>
      <div class="split">
        <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        <ol class="steps">
          <li>A script split the calls into ${fmt(m.batches)} ${m.batches === 1 ? 'batch' : 'batches'} of up to ${fmt(m.batch_size)} and wrote one job file per batch.</li>
          <li>Each batch went to a <code>call-analyst</code> subagent (${model(m.models.extract)}), which read the transcripts and wrote one JSON record per call: a summary, the customer's sentiment as a label plus a separate score from −2 (hostile or leaving) to +2 (keen to buy or expand), and product insights with quotes.</li>
          <li>The script checked every record against the schema and searched for each quote in its transcript. Insights with no matching quote are not counted. ${retries}</li>
          <li><code>theme-normalizer</code> subagents (${model(m.models.themes)}) merged the free-text theme labels into named themes within each product area.</li>
          <li>Everything was loaded into SQLite at <code>${esc(m.database)}</code>. This page is generated from that database.</li>
          <li>A <code>record-auditor</code> subagent (${model(m.models.audit)}) re-read a sample of calls and checked each record against the transcript.</li>
          ${data.headlines.length ? `<li>A <code>headline-writer</code> subagent (${model(m.models.headlines)}) wrote the findings at the top from counts computed in code. It was not allowed to state numbers.</li>` : ''}
        </ol>
      </div>
      <h3 class="limits-h">Limits</h3>
      <ul class="limits">
        <li>ACME Email and every call here are synthetic, written to resemble real sales and customer calls.</li>
        <li>Sentiment, insight tags, severity and who raised a topic are a model's judgment. The audit above measures how often a second reading agreed.</li>
        <li>Themes are named by a model from free-text labels. Some buying-process topics, such as a missing sponsor, appear under more than one product area.</li>
        <li>A call can count toward several themes, so theme counts don't add up to the number of calls.</li>
        <li>Quarter shares in a narrow filter can rest on a handful of calls. Each column shows how many.</li>
      </ul>
      ${issueList}${failList}
    </section>`;
  }

  // ---------- list views: theme, competitor, sentiment ----------
  function listContext(data, route) {
    const f = route.filters;
    const calls = callsInView(data, f);
    if (route.kind === 'theme') {
      const theme = themeById(data).get(route.value);
      if (!theme) return null;
      const s = themeStats(data, f, calls).get(theme.id);
      return { calls, theme, area: areaById(data).get(theme.area), stats: s, entries: s ? s.entries : [], title: themeNames(data).get(theme.id), description: theme.description, from: `theme:${theme.id}`, noun: 'theme' };
    }
    if (route.kind === 'competitor') {
      const s = competitorStats(data, f, calls).get(route.value);
      return { calls, stats: s, entries: s ? s.entries : [], title: compLabel(route.value), description: COMPETITOR_LEDE[route.value] ?? `Calls where a customer compared ACME with ${route.value}, used it, or chose it.`, from: `competitor:${route.value}`, noun: 'competitor' };
    }
    const matching = calls.filter((c) => c.sent === route.value);
    return {
      calls,
      entries: matching.map((call) => ({ call, insights: [] })),
      title: `${SENTIMENT_NAME[route.value]} calls`,
      description: `Calls where the customer's attitude toward ACME was ${route.value} by the end of the call. The label comes from the analyst's reading of the whole call, not from specific lines.`,
      from: `sentiment:${route.value}`,
      sentimentList: true,
    };
  }

  function sortEntries(entries, sentimentList) {
    const order = { negative: 0, mixed: 1, neutral: 2, positive: 3 };
    return entries.slice().sort((a, b) => {
      if (sentimentList) return a.call.score - b.call.score || b.call.date.localeCompare(a.call.date) || a.call.id.localeCompare(b.call.id);
      const sev = Math.max(...b.insights.map((i) => i.sev)) - Math.max(...a.insights.map((i) => i.sev));
      return sev || order[a.call.sent] - order[b.call.sent] || b.call.date.localeCompare(a.call.date) || a.call.id.localeCompare(b.call.id);
    });
  }

  function renderList(data, route) {
    const ctx = listContext(data, route);
    if (!ctx) return notFound(route);
    const f = route.filters;
    const entries = sortEntries(ctx.entries, ctx.sentimentList);
    const s = ctx.stats;
    const crumbs = `<nav class="crumbs" aria-label="Breadcrumb"><a href="${hrefSummary(f)}">All calls</a>${ctx.area ? `<span aria-hidden="true">/</span><a href="#area-${esc(ctx.area.id)}${query(f)}">${esc(ctx.area.name)}</a>` : ''}</nav>`;
    let extra = 0;
    let sellerLink = '';
    if (f.voice === 'customer' && !ctx.sentimentList) {
      const everyone = listContext(data, { ...route, filters: { ...f, voice: 'all' } });
      extra = (everyone?.stats?.calls ?? 0) - (s?.calls ?? 0);
      if (extra > 0) sellerLink = `<a href="${hrefList(route.kind, route.value, withFilter(f, 'voice', 'all'))}">${fmt(extra)} more where ACME raised it first</a>`;
    }
    const receipt = s
      ? `<p class="receipt"><span>${fmt(s.calls)} of ${fmt(ctx.calls.length)} calls in view (${s.share}%)</span><span>${againstShare(s.tone)}% of them count against ACME on this ${ctx.noun}</span><span>${fmt(s.severe)} deal-threatening</span>${s.lean.state === 'lean' ? `<span>Most common in ${esc(s.lean.seg)}, ${s.lean.ratio.toFixed(1)}x the overall rate</span>` : ''}${sellerLink}</p>`
      : `<p class="receipt"><span>${fmt(entries.length)} of ${fmt(ctx.calls.length)} calls in view</span>${sellerLink}</p>`;
    const intro = `<section class="intro">${crumbs}<h1>${esc(ctx.title)}</h1>${ctx.description ? `<p class="lede">${esc(ctx.description)}</p>` : ''}${receipt}</section>`;

    let breakdown = '';
    if (s) {
      const typeTotals = {};
      for (const c of ctx.calls) typeTotals[c.type] = (typeTotals[c.type] ?? 0) + 1;
      const segShares = SEGMENTS.filter((seg) => s.segmentTotals[seg]).map((seg) => [seg, s.bySeg[seg] ?? 0, s.segmentTotals[seg]]);
      const typeShares = Object.keys(typeTotals).map((type) => [type, s.byType[type] ?? 0, typeTotals[type]])
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1] || b[1] / b[2] - a[1] / a[2] || a[0].localeCompare(b[0]));
      const maxShare = Math.max(0.0001, ...segShares.map(([, n, d]) => n / d), ...typeShares.map(([, n, d]) => n / d));
      const row = ([key, n, d]) => `<tr><th scope="row">${esc(key)}</th><td class="num">${fmt(n)}</td><td class="num">${pct(n, d)}%</td><td class="bar-cell">${bar(n / d, maxShare)}</td></tr>`;
      const quarters = data.meta.quarters;
      const based = quarters.map((q, i) => ({ q, v: s.trend[i], k: s.byQuarter[q] ?? 0, n: s.quarterTotals[q] ?? 0 }));
      const eligible = based.filter((b) => b.v != null && b.n >= QUARTER_MIN_BASE);
      const pool = eligible.some((b) => b.v > 0) ? eligible : based.filter((b) => b.v != null);
      const scaleMax = Math.max(0.0001, ...pool.map((b) => b.v));
      const cols = based.map((b) => {
        if (b.v == null) return `<div class="col is-empty"><span class="col-bar" style="height:0"></span><span class="col-value">no calls</span><span class="col-label">${esc(b.q)}</span><span class="col-base" aria-hidden="true">&nbsp;<br>&nbsp;</span></div>`;
        const small = b.n < QUARTER_MIN_BASE;
        return `<div class="col${small ? ' is-small' : ''}" title="${fmt(b.k)} of ${nCalls(b.n)}"><span class="col-bar" style="height:${((100 * Math.min(b.v, scaleMax)) / scaleMax).toFixed(1)}%"></span><span class="col-value">${Math.round(b.v * 100)}%</span><span class="col-label">${esc(b.q)}</span><span class="col-base">${fmt(b.k)}<br>of ${fmt(b.n)}</span></div>`;
      }).join('');
      const chartLabel = based.map((b) => (b.v == null ? `${b.q} no calls` : `${b.q} ${Math.round(b.v * 100)}% (${b.k} of ${b.n})`)).join(', ');
      breakdown = `<section class="block split three" aria-label="Breakdown">
        <div><h2>By segment</h2><table class="dist breakdown segments"><thead><tr><th scope="col">Segment</th><th scope="col" class="num">Calls</th><th scope="col" class="num">Share</th><th scope="col"><span class="visually-hidden">Share of the segment's calls</span></th></tr></thead><tbody>${segShares.map(row).join('')}</tbody></table></div>
        <div><h2>By call type</h2><table class="dist breakdown"><thead><tr><th scope="col">Call type</th><th scope="col" class="num">Calls</th><th scope="col" class="num">Share</th><th scope="col"><span class="visually-hidden">Share of that call type</span></th></tr></thead><tbody>${typeShares.map(row).join('')}</tbody></table></div>
        <div><h2>By quarter</h2><p class="section-note">Share of each quarter's calls that raised it, with the count under each column.</p><div class="columns" role="img" aria-label="Share of calls by quarter: ${esc(chartLabel)}">${cols}</div></div>
      </section>`;
    }

    const rows = entries.map((e, i) => {
      const c = e.call;
      const said = ctx.sentimentList
        ? `<p>${esc(c.why || c.sum)}</p>`
        : e.insights.map((ins) => `<p>${esc(ins.st)} <span class="muted">${KIND_NAME[ins.k] ?? ins.k}, ${POLARITY_NAME[ins.p]}${ins.sev === 3 ? ', deal-threatening' : ''}${ins.by === 'seller' ? ', ACME raised it first' : ''}</span></p>`).join('');
      const fourth = ctx.sentimentList
        ? `<td class="score-cell"><span class="mobile-label">Score </span>${scoreText(c.score)} <span class="sub">${esc(c.traj)}</span></td>`
        : `<td class="sent-cell"><span class="mobile-label">Call ended </span><span class="pill tone-${c.sent}">${SENTIMENT_NAME[c.sent]}</span></td>`;
      return `<tr${i >= PAGE_SIZE ? ' hidden data-extra' : ''}>
        <td class="call-cell"><a href="${hrefCall(c.id, f, ctx.from)}">${esc(c.acct)}</a><span class="mono">${esc(c.id)}</span></td>
        <td class="date-cell">${date(c.date)}<span class="sub">${esc(c.type)}</span></td>
        <td class="seg-cell">${esc(c.seg)}<span class="sub">${esc(c.ind)}</span></td>
        ${fourth}
        <td class="said">${said}</td>
      </tr>`;
    }).join('');
    const more = entries.length > PAGE_SIZE
      ? `<button type="button" class="text-button" data-more="calls" aria-expanded="false">Show all ${fmt(entries.length)} calls</button>`
      : '';
    const note = ctx.sentimentList
      ? 'Lowest score first, then most recent. Open a call to read the full transcript.'
      : 'Deal-threatening first, then calls that ended negative, then most recent. Insights are the analyst’s summary, not the customer’s words: open a call for the exact quotes, highlighted in the transcript.';
    const table = entries.length
      ? `<section class="block" id="calls" aria-labelledby="calls-h">
          <h2 id="calls-h">${ctx.sentimentList ? 'The calls' : 'Calls behind this'}</h2>
          <p class="section-note">${note}</p>
          <div class="table-scroll"><table class="calls" id="calls-table">
            <thead><tr><th scope="col">Call</th><th scope="col">Date</th><th scope="col">Segment</th><th scope="col">${ctx.sentimentList ? 'Score' : 'End-of-call sentiment'}</th><th scope="col">${ctx.sentimentList ? 'Why' : 'Insight'}</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
          ${more}
        </section>`
      : `<p class="empty">${extra > 0 ? `No calls where the customer raised this match these filters. ${sellerLink}.` : 'No calls match these filters.'}</p>`;

    return `${intro}${filterBar(route, data, ctx.calls.length)}<div class="page">${breakdown}${table}</div>`;
  }

  function bar(fraction, max) {
    const width = Math.max(0, Math.min(1, fraction / max)) * 100;
    return `<span class="bar" aria-hidden="true"><span style="width:${width.toFixed(1)}%"></span></span>`;
  }

  // ---------- one call ----------
  function fromContext(data, route) {
    const from = route.from || '';
    const at = from.indexOf(':');
    if (at === -1) return null;
    const kind = from.slice(0, at);
    const value = from.slice(at + 1);
    if (!['theme', 'competitor', 'sentiment'].includes(kind)) return null;
    const ctx = listContext(data, { view: 'list', kind, value, filters: route.filters });
    if (!ctx) return null;
    return { kind, value, ctx, order: sortEntries(ctx.entries, ctx.sentimentList).map((e) => e.call.id) };
  }

  function renderCall(data, route, transcript) {
    const call = data.calls.find((c) => c.id === route.id);
    if (!call) return notFound(route);
    const f = route.filters;
    const themes = themeById(data);
    const names = themeNames(data);
    const from = fromContext(data, route);
    const focus = (ins) => from && ((from.kind === 'theme' && ins.th === from.value) || (from.kind === 'competitor' && ins.comp === from.value));

    let crumbs = `<a href="${hrefSummary(f)}">All calls</a>`;
    let pager = '';
    if (from) {
      crumbs += `<span aria-hidden="true">/</span><a href="${hrefList(from.kind, from.value, f)}">${esc(from.ctx.title)}</a>`;
      const i = from.order.indexOf(call.id);
      if (i !== -1) {
        const prev = from.order[i - 1];
        const nextId = from.order[i + 1];
        const scope = [f.seg !== 'all' ? f.seg : null, f.type !== 'all' ? f.type : null].filter(Boolean).join(' ');
        pager = `<nav class="pager" aria-label="Other calls in this list">
          ${prev ? `<a href="${hrefCall(prev, f, route.from)}">Previous call</a>` : '<span class="muted">Previous call</span>'}
          <span class="muted">${fmt(i + 1)} of ${fmt(from.order.length)}${scope ? ` ${esc(scope)}` : ''} ${from.kind === 'sentiment' ? `${esc(from.value)} calls` : from.kind === 'competitor' ? `calls naming ${esc(from.ctx.title)}` : `calls on ${esc(from.ctx.title)}`}</span>
          ${nextId ? `<a href="${hrefCall(nextId, f, route.from)}">Next call</a>` : '<span class="muted">Next call</span>'}
        </nav>`;
      }
    }

    const named = new Set(call.ins.map((i) => i.comp).filter(Boolean));
    const crmComp = call.comp === 'No decision'
      ? ', no decision'
      : call.comp ? `, competitor on record ${compLabel(call.comp)}${named.has(call.comp) ? '' : ' (no insight from this call mentions it)'}` : '';
    const crm = call.outcome ? `CRM: opportunity ${call.outcome === 'Open' ? `open (${call.stage})` : call.outcome.toLowerCase()}${crmComp}` : null;
    const meta = [date(call.date), call.dur ? `${call.dur} min` : null, call.seg, call.ind, call.reg, call.arr != null ? `${money(call.arr)} ARR` : null, crm]
      .filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('');
    const audit = call.audit
      ? `<p class="audit-line"><strong>Audited.</strong> ${call.audit.v === 'accurate' ? 'A second subagent re-read this call and found no errors in the record.' : `A second subagent re-read this call and found ${call.audit.v === 'major_issues' ? 'major' : 'minor'} issues. ${esc(cleanNote(call.audit.notes))}`}</p>`
      : '';
    const flagged = new Map((call.audit?.checks ?? []).filter((c) => !c.supported).map((c) => [c.index, c.note]));

    const insights = call.ins.map((ins, n) => ({ ins, n }));
    const ordered = insights.slice().sort((a, b) => Number(focus(b.ins)) - Number(focus(a.ins)) || a.n - b.n);
    const panel = ordered.map(({ ins, n }) => {
      const t = themes.get(ins.th);
      const quotes = ins.ev.map((ev, k) => {
        const text = transcript && typeof transcript === 'string' ? transcript.slice(ev[0], ev[1]) : null;
        return `<li><button type="button" class="quote" data-jump="q-${n}-${k}">${text ? `“${esc(text)}”` : 'Show in transcript'}<span class="who">${esc(ev[2] ?? '')}</span></button></li>`;
      }).join('');
      const auditNote = flagged.has(ins.ord) ? `<p class="audit-note">Auditor: ${esc(cleanNote(flagged.get(ins.ord)) || 'this insight was not supported on re-reading.')}</p>` : '';
      return `<li class="insight${focus(ins) ? ' is-focus' : ''}">
        <p class="insight-theme">${t ? `<a href="${hrefList('theme', t.id, f)}">${esc(names.get(t.id))}</a>` : esc(ins.label)}</p>
        <p class="insight-tags"><span class="pill tone-${ins.p}">${esc(KIND_NAME[ins.k] ?? ins.k)}</span><span>${POLARITY_NAME[ins.p]}</span><span>${SEVERITY_NAME[ins.sev]}</span>${ins.by === 'seller' ? '<span>ACME raised it first</span>' : ''}${ins.comp ? `<span>${esc(compLabel(ins.comp))}</span>` : ''}</p>
        <p>${esc(ins.st)}</p>
        ${auditNote}
        <ul class="quotes">${quotes}</ul>
      </li>`;
    }).join('');
    const dropped = call.dropped ? `<p class="section-note">${call.dropped === 1 ? 'One more insight was' : `${call.dropped} more insights were`} left out because ${call.dropped === 1 ? 'its quote' : 'their quotes'} could not be found in the transcript.</p>` : '';

    const intro = `<section class="intro call-intro">
      <nav class="crumbs" aria-label="Breadcrumb">${crumbs}</nav>
      <h1>${esc(call.type)} call with ${esc(call.acct)}</h1>
      <p class="call-meta"><span class="mono">${esc(call.id)}</span>${meta}</p>
      <p class="lede">${esc(call.sum)}</p>
      <p class="sentiment-line"><span class="pill tone-${call.sent}">${SENTIMENT_NAME[call.sent]}</span> <span>Score ${scoreText(call.score)} on a separate scale from −2 (hostile or leaving) to +2 (keen to buy or expand), ${esc(call.traj)} during the call. ${esc(call.why)}</span></p>
      <p class="sentiment-note">The sentiment reading covers the whole call, so no lines are highlighted for it.</p>
      ${audit}
      ${pager}
    </section>`;

    return `${intro}<div class="page call-layout">
      <aside class="insight-panel" aria-labelledby="insights-h">
        <h2 id="insights-h">Insights from this call <span class="muted">(${call.ins.length})</span></h2>
        ${panel ? `<ol class="insights">${panel}</ol>` : '<p class="empty">No product insights in this call.</p>'}
        ${dropped}
      </aside>
      <section class="transcript" aria-labelledby="transcript-h">
        <h2 id="transcript-h">Transcript</h2>
        ${renderTranscript(call, transcript, focus)}
        ${pager ? `<div class="pager-end">${pager}</div>` : ''}
      </section>
    </div>`;
  }

  // Each speaker's usual role in the call. The corpus sometimes labels a customer's line with
  // an ACME role (transcription noise); the page shows the speaker's usual role and notes it.
  function speakerRoles(lines) {
    const counts = new Map();
    for (const line of lines) {
      const m = /^(.+?) \(([^)]+)\): /.exec(line);
      if (!m) continue;
      if (!counts.has(m[1])) counts.set(m[1], new Map());
      counts.get(m[1]).set(m[2], (counts.get(m[1]).get(m[2]) ?? 0) + 1);
    }
    const holders = new Map();
    for (const [name, roles] of counts) for (const role of roles.keys()) holders.set(role, (holders.get(role) ?? new Set()).add(name));
    return new Map([...counts].map(([name, roles]) => {
      const ranked = [...roles].sort((a, b) => b[1] - a[1]);
      const customerRole = ranked.find(([role]) => !ACME_ROLES.has(role));
      const borrowsAcme = ranked.some(([role]) => ACME_ROLES.has(role) && holders.get(role).size > 1);
      return [name, customerRole && borrowsAcme ? customerRole[0] : ranked[0][0]];
    }));
  }

  // Highlights evidence spans inside the transcript. Spans index the raw transcript text.
  function renderTranscript(call, transcript, focus) {
    if (transcript == null) return '<p class="loading">Loading the transcript.</p>';
    const marks = [];
    call.ins.forEach((ins, n) => ins.ev.forEach((ev, k) => marks.push({ start: ev[0], end: ev[1], id: `q-${n}-${k}`, tone: ins.p, focus: Boolean(focus(ins)) })));
    marks.sort((a, b) => a.start - b.start || b.end - a.end);
    const parts = typeof transcript === 'string' ? [[0, transcript]] : transcript;
    const roles = speakerRoles(parts.flatMap(([, text]) => text.split('\n')));
    const out = [];
    let lastEnd = null;
    for (const [offset, text] of parts) {
      if (lastEnd != null && offset > lastEnd + 1) out.push('<p class="gap">Lines without highlights are left out of this copy of the page.</p>');
      lastEnd = offset + text.length;
      let lineStart = 0;
      while (lineStart <= text.length) {
        let lineEnd = text.indexOf('\n', lineStart);
        if (lineEnd === -1) lineEnd = text.length;
        const line = text.slice(lineStart, lineEnd);
        if (line.trim()) out.push(renderTurn(line, offset + lineStart, marks, roles));
        lineStart = lineEnd + 1;
      }
    }
    return `<div class="turns">${out.join('')}</div>`;
  }

  function renderTurn(line, base, marks, roles) {
    const m = /^(.+?) \(([^)]+)\): /.exec(line);
    const bodyStart = m ? m[0].length : 0;
    const body = line.slice(bodyStart);
    const absStart = base + bodyStart;
    const absEnd = base + line.length;
    // Build highlight segments first. A quote inside (or equal to) one already marked is
    // folded into that mark, so every quote button still has something to jump to.
    const segs = [];
    let cursor = absStart;
    for (const mark of marks) {
      if (mark.end <= absStart || mark.start >= absEnd) continue;
      const start = Math.max(mark.start, absStart);
      const end = Math.min(mark.end, absEnd);
      if (start < cursor) {
        const host = segs.find((g) => g.start <= start && g.end > start) ?? segs[segs.length - 1];
        host.ids.push(mark.id);
        host.focus ||= mark.focus;
        if (end > cursor) {
          segs.push({ start: cursor, end, ids: [], tone: mark.tone, focus: mark.focus });
          cursor = end;
        }
        continue;
      }
      segs.push({ start, end, ids: [mark.id], tone: mark.tone, focus: mark.focus });
      cursor = end;
    }
    let html = '';
    let at = absStart;
    for (const g of segs) {
      html += esc(body.slice(at - absStart, g.start - absStart));
      const id = g.ids.length ? ` id="${g.ids[0]}"` : '';
      const ids = g.ids.length > 1 ? ` data-ids="${g.ids.join(' ')}"` : '';
      html += `<mark${id}${ids} tabindex="-1" class="hl tone-${g.tone}${g.focus ? ' is-focus' : ''}">${esc(body.slice(g.start - absStart, g.end - absStart))}</mark>`;
      at = g.end;
    }
    html += esc(body.slice(at - absStart));
    if (!m) return `<p class="turn">${html}</p>`;
    const role = roles.get(m[1]) ?? m[2];
    const acme = ACME_ROLES.has(role);
    const relabeled = role !== m[2] ? ` title="Labeled ${esc(m[2])} on this line of the transcript file"` : '';
    return `<div class="turn${acme ? ' is-acme' : ''}"><p class="speaker">${esc(m[1])} <span${relabeled}>${esc(role)}${acme ? ', ACME' : ''}</span></p><p>${html}</p></div>`;
  }

  function notFound(route) {
    return `<section class="intro"><h1>Nothing here</h1><p class="lede">That link points to something this report does not contain.</p><p><a href="${hrefSummary(route.filters)}">Back to all calls</a></p></section>`;
  }

  function title(data, route) {
    if (route.view === 'call') {
      const c = data.calls.find((x) => x.id === route.id);
      return c ? `${c.type} call with ${c.acct}` : 'Call review';
    }
    if (route.view === 'list') {
      if (route.kind === 'theme') return themeNames(data).get(route.value) ?? 'Call review';
      if (route.kind === 'sentiment') return `${SENTIMENT_NAME[route.value]} calls`;
      return compLabel(route.value);
    }
    return null;
  }

  function render(data, route, transcript) {
    const r = normalize(data, route);
    if (r.view === 'list') return renderList(data, r);
    if (r.view === 'call') return renderCall(data, r, transcript);
    return renderSummary(data, r);
  }

  return { parseRoute, normalize, routeKey, render, title, themeStats, competitorStats, callsInView, sentimentCounts, hrefSummary, query, leaningSegment };
})();
