# Call review report: design system

The report matches the AI in GTM class guide at fullstackgtm.com/ai-in-gtm-class: white paper, hairline rules, IBM Plex, navy and blue, square corners. It drops the guide's patterns that read as generated design (labels above headings, tight tracking, sub-11px labels), checked with `npx impeccable detect`.

## Color

- Ink `#101828`, muted `#536174`, paper `#ffffff`, surface `#f3f6f9`
- Rules: line `#ccd4dd`, soft line `#e4e9ee`
- Navy `#123252` (selected controls), blue `#2563a8` (links, charts), brand red `#d74436` (the FSGTM mark only)
- Sentiment and for-or-against-ACME, used only to encode those:
  - positive: text `#147a52` on `#e8f5ef`, bars `#62c194`
  - negative: text `#b53b31` on `#fdecea`, bars `#8f2a22`
  - mixed: text `#8a6100` on `#fbf3df`, bars `#e3b341`
  - neutral: text `#536174` on `#eef2f6`, bars `#6b7a8b`
  - Bar fills differ in lightness as well as hue, and stacked bars have 2px gaps, so they read in grayscale and for color-blind readers

## Type

- IBM Plex Sans for text, IBM Plex Mono for IDs, dates and counts in the header and filter bar
- Sizes: 12, 13, 14, 15, 16 (body), 18, 19, 20, 26, and 34 to 50 for the page title
- Weights 400, 500, 600; 700 only for the header wordmark, as on the class guide. Line height 1.5 for body, 1.6 for transcripts. Tracking at most -0.015em on the page title only
- Measure: about 66 to 72 characters for prose

## Shape and space

- Radius 2px on controls, 0 elsewhere. No shadows, no gradients, no cards
- Page width 1120px with a 24px gutter (16px on phones)
- Sections are separated by space and 1px rules, not containers

## Components

- Stacked bars for sentiment and tone, one sparkline per theme, columns for quarters. No pie charts
- Pills for sentiment labels, with a tinted fill and a darker text color that passes WCAG AA
- Highlights in transcripts use a tint plus a 2px underline in the tone color; the evidence for the theme you came from is darker
