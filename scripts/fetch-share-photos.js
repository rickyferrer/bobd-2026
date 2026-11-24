#!/usr/bin/env node
/*
 * Copies the winners' photos that live on assets.dmagstatic.com into share/photos/, so the share builder
 * (share/) can use them without needing that host to send CORS headers. Safe to re-run: files that are
 * already there are skipped. Re-run after winners.json changes an `img` URL.
 *
 *   node scripts/fetch-share-photos.js            download what is missing
 *   node scripts/fetch-share-photos.js --force    download everything again
 *
 * Writes share/photos/manifest.json: { "<original image URL>": "photos/<file>" }. The builder looks a
 * winner's photo up by its URL, so a winner whose `img` was changed (and not re-fetched) falls back to
 * the remote URL instead of showing a stale photo.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'share', 'photos');
const force = process.argv.includes('--force');

const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'winners.json'), 'utf8'));
const slugify = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/avif': 'avif' };

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const manifestPath = path.join(outDir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) && !force ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
  const seen = {};
  const jobs = [];
  for (const w of data) {
    let s = slugify(w.n) || 'winner-' + w.id; if (seen[s]) s += '-' + w.id; seen[s] = 1; // same slugs as the page
    if (/^https?:\/\//.test(w.img || '')) jobs.push({ slug: s, url: w.img });
  }
  // drop manifest entries for URLs no winner uses any more
  const live = new Set(jobs.map((j) => j.url));
  for (const u of Object.keys(manifest)) if (!live.has(u)) { try { fs.unlinkSync(path.join(root, 'share', manifest[u])); } catch (e) {} delete manifest[u]; }

  let done = 0, skipped = 0, bytes = 0; const failed = [];
  const todo = jobs.filter((j) => { const f = manifest[j.url]; if (!force && f && fs.existsSync(path.join(root, 'share', f))) { skipped++; return false; } return true; });
  console.log(`${jobs.length} remote photos; ${skipped} already copied; fetching ${todo.length}`);

  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const j = todo[next++];
      try {
        const res = await fetch(j.url, { redirect: 'follow' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!EXT[type]) throw new Error('not an image: ' + (type || 'no content-type'));
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 500) throw new Error('suspiciously small (' + buf.length + ' bytes)');
        const file = j.slug + '.' + EXT[type];
        fs.writeFileSync(path.join(outDir, file), buf);
        manifest[j.url] = 'photos/' + file; bytes += buf.length; done++;
      } catch (e) { failed.push(j.slug + ': ' + e.message + ' (' + j.url + ')'); }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(manifestPath, JSON.stringify(sorted, null, 1) + '\n');
  console.log(`copied ${done} (${(bytes / 1048576).toFixed(1)} MB), manifest has ${Object.keys(sorted).length} entries`);
  if (failed.length) { console.log(`\n${failed.length} failed:`); failed.forEach((f) => console.log('  ' + f)); process.exitCode = 1; }
}
main();
