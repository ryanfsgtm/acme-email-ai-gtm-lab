// Verbatim quote matching. A quote counts only if its words appear, in order, inside one
// speaker turn. Matching ignores case, curly vs straight quotes, dash style and spacing,
// because models reliably change those; it does not ignore any words.

const CHAR_MAP = {
  '‘': "'", '’': "'", '‚': "'", '‛': "'", '′': "'", 'ʼ': "'", '`': "'",
  '“': '"', '”': '"', '„': '"', '″': '"',
  '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '―': '-', '−': '-',
  ' ': ' ', ' ': ' ', ' ': ' ',
  '…': '...',
};

// Returns the normalized text plus, for each normalized character, its index in the source.
export function normalize(source) {
  let text = '';
  const index = [];
  let skipSpace = true;
  for (let i = 0; i < source.length; i++) {
    const mapped = (CHAR_MAP[source[i]] ?? source[i]).toLowerCase();
    for (const ch of mapped) {
      if (/\s/.test(ch)) {
        if (skipSpace) continue;
        text += ' ';
        index.push(i);
        skipSpace = true;
        continue;
      }
      if (ch === '-') {
        if (text.endsWith(' ')) { text = text.slice(0, -1); index.pop(); }
        text += '-';
        index.push(i);
        skipSpace = true;
        continue;
      }
      text += ch;
      index.push(i);
      skipSpace = false;
    }
  }
  if (text.endsWith(' ')) { text = text.slice(0, -1); index.pop(); }
  return { text, index };
}

const EDGE_PUNCT = /^[\s"'.,;:!?\-()[\]]+|[\s"'.,;:!?\-()[\]]+$/g;

// Splits a quote on ellipses into fragments that must each match, in order.
export function quoteFragments(quote) {
  const { text } = normalize(String(quote ?? ''));
  return text
    .split('...')
    .map((part) => part.replace(EDGE_PUNCT, ''))
    .filter((part) => part.length > 0);
}

export const MIN_QUOTE_CHARS = 12;

function matchInTurn(transcript, turn, fragments) {
  turn.norm ??= normalize(transcript.slice(turn.start, turn.end));
  const { text, index } = turn.norm;
  let from = 0;
  let first = -1;
  let lastEnd = -1;
  for (const fragment of fragments) {
    const at = text.indexOf(fragment, from);
    if (at === -1) return null;
    if (first === -1) first = at;
    lastEnd = at + fragment.length;
    from = lastEnd;
  }
  return { start: turn.start + index[first], end: turn.start + index[lastEnd - 1] + 1 };
}

const sameSpeaker = (a, b) => normalize(a ?? '').text === normalize(b ?? '').text;

// Finds a quote in the transcript. Searches the named speaker's turns first, then every turn,
// and reports whether the speaker the model named actually said it.
export function findQuote(transcript, turns, quote, speaker) {
  const fragments = quoteFragments(quote);
  const length = fragments.reduce((sum, f) => sum + f.length, 0);
  if (!fragments.length || length < MIN_QUOTE_CHARS) return { matched: false, reason: 'too_short' };
  const ordered = [
    ...turns.filter((t) => speaker && sameSpeaker(t.speaker, speaker)),
    ...turns.filter((t) => !(speaker && sameSpeaker(t.speaker, speaker))),
  ];
  for (const turn of ordered) {
    const hit = matchInTurn(transcript, turn, fragments);
    if (hit) {
      return {
        matched: true,
        turn_index: turn.index,
        start: hit.start,
        end: hit.end,
        speaker: turn.speaker,
        role: turn.role,
        side: turn.side,
        speaker_matches: Boolean(speaker) && sameSpeaker(turn.speaker, speaker),
      };
    }
  }
  return { matched: false, reason: 'not_found' };
}
