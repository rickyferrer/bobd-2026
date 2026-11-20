#!/usr/bin/env node
/*
 * Make support.js safe to inline inside an HTML <script> tag.
 *
 * Why: some hosts (the dmagazine.com WordPress embed block with "SSR snapshot" off) paste support.js straight
 * into a <script> element. In that position the HTML parser, not the JS engine, reads the text first:
 *   - a literal "<!--" puts the script into the "escaped" state, and a following literal "<script" puts it into the
 *     "double escaped" state, in which "</script>" no longer ends the element, so the script swallows the rest of
 *     the page (the <x-dc> template and the logic script);
 *   - a literal "</script" would end the element early;
 *   - the runtime fetches its own page source and takes the FIRST "<x-dc" in it as the start of the template
 *     (function re() and de()). support.js mentions "<x-dc" in regexes and strings, and inlined it comes before the real
 *     <x-dc> element, so the "template" becomes a slice of support.js itself and the page shows script text.
 * support.js (the Claude Design runtime) contains all of those character sequences inside strings and regexes.
 *
 * Fix: write the "<" as \x3C. Inside a string, regex or (untagged) template literal, \x3C means exactly "<",
 * so behaviour is unchanged. Elsewhere (code position) \x3C is a syntax error, which the compile check below catches.
 *
 * Usage (re-run whenever support.js is re-exported from Claude Design):
 *   node scripts/make-support-inline-safe.js             rewrite support.js in place (idempotent)
 *   node scripts/make-support-inline-safe.js --check     change nothing; exit 1 if the file is not inline-safe
 *   node scripts/make-support-inline-safe.js path/to.js  use another file
 * Plain Node, no dependencies.
 *
 * Not detected: a tagged template that reads .raw (String.raw`...`) would see \x3C instead of "<". None today.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const args = process.argv.slice(2);
const check = args.includes('--check');
const file = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(__dirname, '..', 'support.js'));

const src = fs.readFileSync(file, 'utf8');

let comments = 0;
let scripts = 0;
let xdcs = 0;
const out = src
  .replace(/<!--/g, () => { comments++; return '\\x3C!--'; })                        // <!--      -> \x3C!--
  .replace(/<(\/?script)/gi, (m, tag) => { scripts++; return '\\x3C' + tag; })     // <script, </script (any case) -> \x3Cscript, \x3C/script
  .replace(/<(\/?x-dc)/gi, (m, tag) => { xdcs++; return '\\x3C' + tag; });         // <x-dc, </x-dc -> \x3Cx-dc, \x3C/x-dc

// Nothing the HTML tokenizer cares about may be left.
const left = out.match(/<!--|<\/?script|<\/?x-dc/i);
if (left) { console.error('still contains "' + left[0] + '" after rewriting: ' + file); process.exit(2); }

// Must still be valid JavaScript (a replacement in code position, not in a literal, would be a syntax error).
try { new vm.Script(out, { filename: path.basename(file) }); }
catch (e) { console.error('rewritten file does not compile (a match was outside a string/regex?): ' + e.message); process.exit(2); }

const n = comments + scripts + xdcs;
if (check) {
  if (n) { console.error(path.relative(process.cwd(), file) + ' is NOT inline-safe: ' + comments + ' "<!--", ' + scripts + ' "<script"/"</script" and ' + xdcs + ' "<x-dc"/"</x-dc" would be escaped. Run: node scripts/make-support-inline-safe.js'); process.exit(1); }
  console.log(path.relative(process.cwd(), file) + ' is inline-safe.');
} else if (n) {
  fs.writeFileSync(file, out);
  console.log('rewrote ' + path.relative(process.cwd(), file) + ': ' + comments + ' "<!--", ' + scripts + ' "<script"/"</script" and ' + xdcs + ' "<x-dc"/"</x-dc" now use \\x3C.');
} else {
  console.log(path.relative(process.cwd(), file) + ' already inline-safe; nothing to do.');
}
