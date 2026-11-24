#!/usr/bin/env node
/*
 * Builds seo/bobd-2026-seo-snippet.html: the page's schema.org JSON-LD as static markup.
 *
 * Why: the deck builds its JSON-LD in the browser (injectLd in index.html). Where the deck's script does not run
 * (WordPress "SSR snapshot" = Yes, or a crawler that does not run scripts) there is no schema at all. Paste this
 * snippet into the WordPress page's backend as custom HTML and search engines get the same data.
 *
 * It reuses buildLd() from index.html (between the bobd:ld markers), so the static copy cannot drift from the
 * runtime one. The snippet is wrapped in <div id="bobd-seo">; when the deck's script does run, it removes that
 * element, so you never end up with two copies of the Event.
 *
 * Usage:  node scripts/make-seo-snippet.js [page-url] [out-file]
 *   page-url  the public URL of the page the snippet will sit on (default: the WordPress post)
 *   out-file  default seo/bobd-2026-seo-snippet.html
 * Re-run after editing winners.json, PARTY, PUBLISHED or buildLd.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const pageUrl = (process.argv[2] || 'https://www.dmagazine.com/publications/d-magazine/2026/december/the-best-of-big-d-winners-2026/').split('#')[0].split('?')[0];
const outFile = path.resolve(process.argv[3] || path.join(root, 'seo', 'bobd-2026-seo-snippet.html'));

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const between = (from, to) => {
  const a = html.indexOf(from), b = html.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error('could not find "' + from + '" ... "' + to + '" in index.html');
  return html.slice(a, b);
};
const partyLine = /var PARTY = [\s\S]*?\}\] \};/.exec(html);
if (!partyLine) throw new Error('could not find PARTY in index.html');

const ctx = { appUrl: (x) => x };
vm.createContext(ctx);
vm.runInContext(
  between('var SMALL = ', 'function goDeck()') + '\n' + // name helpers, prep(), STORIES, REVIEWS
  partyLine[0] + '\n' +
  between('/* bobd:ld:start', '/* bobd:ld:end */') + '\nthis.prep=prep;this.buildLd=buildLd;',
  ctx
);

const items = ctx.prep(JSON.parse(fs.readFileSync(path.join(root, 'data', 'winners.json'), 'utf8')));
const ld = ctx.buildLd(items, pageUrl);
// keep the JSON safe inside an HTML script element
const json = JSON.stringify(ld).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
JSON.parse(json); // must still be valid JSON

const out = '<div id="bobd-seo">\n<script type="application/ld+json">' + json + '</script>\n</div>\n';
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, out);
console.log('wrote ' + path.relative(process.cwd(), outFile) + ' (' + out.length + ' bytes) for ' + pageUrl + ': ' + ld['@graph'].map((n) => n['@type']).join(', ') + ', ' + items.length + ' winners');
