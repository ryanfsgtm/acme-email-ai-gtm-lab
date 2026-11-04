import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { REPORT_PATH, ROOT } from '../lib/corpus.mjs';
import { readReportData } from './data.mjs';

const HERE = join(ROOT, 'analysis', 'report');
// Claude Code artifacts must render at 16 MiB or less. Stay under with room to spare.
const SIZE_LIMIT = Math.floor(15.5 * 1024 * 1024);

export function loadView() {
  const source = readFileSync(join(HERE, 'view.js'), 'utf8');
  return { source, View: new Function(`${source}\nreturn View;`)() };
}

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const packed = (value) => gzipSync(JSON.stringify(value), { level: 9 }).toString('base64');

// Keeps only the lines with highlighted evidence plus one line either side.
function excerpts(call, text) {
  const spans = call.ins.flatMap((i) => i.ev.map((e) => [e[0], e[1]]));
  const lines = [];
  let start = 0;
  while (start <= text.length) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = text.length;
    lines.push([start, end]);
    start = end + 1;
  }
  const keep = new Set();
  lines.forEach(([s, e], i) => {
    if (spans.some(([a, b]) => a < e && b > s)) for (let k = i - 2; k <= i + 2; k++) if (k >= 0 && k < lines.length) keep.add(k);
  });
  const parts = [];
  for (const i of [...keep].sort((a, b) => a - b)) {
    const [s, e] = lines[i];
    const last = parts[parts.length - 1];
    if (last && last.end + 1 >= s) {
      last.end = e;
    } else {
      parts.push({ start: s, end: e });
    }
  }
  return parts.map((p) => [p.start, text.slice(p.start, p.end)]);
}

export function buildReport() {
  const data = readReportData({ withPaths: true });
  const texts = data.calls.map((c) => readFileSync(join(ROOT, c.path), 'utf8'));
  for (const c of data.calls) delete c.path;

  const { source, View } = loadView();
  const route = View.parseRoute('');
  const ssr = View.render(data, route, null);
  const built = new Date(data.meta.built_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const template = readFileSync(join(HERE, 'template.html'), 'utf8');
  const fill = (transcripts) => template
    .replace('{{STYLES}}', () => readFileSync(join(HERE, 'styles.css'), 'utf8'))
    .replace('{{SSR_ROUTE}}', () => esc(View.routeKey({ ...route, anchor: null })))
    .replace('{{SSR}}', () => ssr)
    .replace('{{BUILT}}', () => esc(built))
    .replace('{{DATABASE}}', () => esc(data.meta.database))
    .replace('{{DATA}}', () => packed(data))
    .replace('{{TRANSCRIPTS}}', () => transcripts)
    .replace('{{VIEW}}', () => source)
    .replace('{{CLIENT}}', () => readFileSync(join(HERE, 'client.js'), 'utf8'));

  let transcriptsMode = 'full';
  let html = fill(packed(texts));
  if (Buffer.byteLength(html) > SIZE_LIMIT) {
    transcriptsMode = 'excerpts';
    html = fill(packed(data.calls.map((c, i) => excerpts(c, texts[i]))));
  }
  const bytes = Buffer.byteLength(html);
  if (bytes > SIZE_LIMIT) throw new Error(`Report is ${(bytes / 1048576).toFixed(1)} MiB, over the artifact limit even with transcript excerpts. Narrow the run's scope.`);
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, html);
  return { bytes, transcriptsMode };
}
