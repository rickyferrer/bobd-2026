// Best of Big D 2026: winner share-card builder.
// Runs entirely in the browser. The card is drawn on a canvas to match the cards on the main page
// (index.html): same colours, fonts, proportions and name-fitting rules. Photos never leave the browser.
import { encodeMp4, encodeGif, videoSupported } from './encode.js';

/* ------------------------------------------------------------------ constants */
const REF = 280;                 // card width (CSS px) the page's px values were designed at; everything scales from it
const RATIO = 875 / 640;         // card height / width
const DATA_URL = '../data/winners.json';
const PIP = { S: '../assets/pips/05f322ff.svg', H: '../assets/pips/758e7c02.svg', D: '../assets/pips/d8acbffb.svg', C: '../assets/pips/429bf106.svg' };
const BACK_URL = 'img/card-back-hires.jpg';
const LOGO_URL = 'img/d-logo.png';
const SUITS = [['S', 'Culture'], ['H', 'Food & Dining'], ['D', 'Shopping & Services'], ['C', 'Drinks & Nightlife']];
const RED = { H: 1, D: 1 };

// Output sizes. "layout" decides how the card sits on the canvas.
const SIZES = [
  { id: 'ig',   label: 'Instagram', note: '1080 × 1350', w: 1080, h: 1350, layout: 'portrait' },
  { id: 'fb',   label: 'Facebook',  note: '1200 × 630',  w: 1200, h: 630,  layout: 'landscape' },
  { id: 'land', label: 'Landscape', note: '1920 × 1080', w: 1920, h: 1080, layout: 'landscape' },
  { id: 'card', label: 'Card only', note: '1280 × 1750', w: 1280, h: 1750, layout: 'card' },
];
const JPG_BORDER = 64;           // white border added around "Card only" JPGs, in px

// Flip animation timing (seconds)
const HOLD = 1.6, FLIP = 0.7, CYCLE = 2 * (HOLD + FLIP);

/* ------------------------------------------------------------------ names (keep in sync with index.html) */
const SMALL = { and: 1, of: 1, the: 1, for: 1, at: 1, in: 1, on: 1, to: 1, by: 1, y: 1, a: 1 };
const KEEP = { BBQ: 1, DFW: 1, DJ: 1, FM: 1, IMAX: 1, KERA: 1, KTCK: 1, NTX: 1, SMU: 1, TITAS: 1, VCS: 1, XD: 1, KD: 1, DAQ: 1, CNTRD: 1, NH: 1 };
export function niceName(n) {
  return n.replace(/[A-Za-z0-9À-ÖØ-öø-ÿ]+(?:['’][A-Za-z]+)?/g, function (w, off) {
    if (/\d/.test(w) || KEEP[w]) return w;
    var lw = w.toLowerCase();
    if (off > 0 && SMALL[lw]) return lw;
    return lw.charAt(0).toUpperCase() + lw.slice(1);
  });
}
export function slugify(n) {
  return n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const NAME_FIX = { "L'EPOQUE PARFUMS": "L'Epoque Parfums", "BELL'INVITO": "Bell'Invito", 'AM/FM': 'AM/FM', 'BOOGIES, DISCO(NNECTED)': 'Boogies, Disco(nnected)', 'THE STANDARD MCKINNEY': 'The Standard McKinney' };

/* ------------------------------------------------------------------ state */
const S = {
  items: [], cur: null,
  mode: 'text',                  // text | ours | upload
  photo: null,                   // the user's uploaded image (ImageBitmap/Image)
  ours: null,                    // our photo for this winner (HTMLImageElement) or null
  oursState: 'none',             // none | loading | ok | blocked
  zoom: 1, px: 0, py: 0,
  sizeId: 'ig', kind: 'still', side: 'front',
  fontsOK: false, busy: false,
  pips: {}, back: null, logo: null, manifest: {},
};
const $ = (s, r = document) => r.querySelector(s);
const el = {};

/* ------------------------------------------------------------------ small helpers */
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

function loadImage(src, cors) {
  return new Promise((res, rej) => {
    const im = new Image();
    if (cors) im.crossOrigin = 'anonymous';
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('image failed: ' + src));
    im.src = src;
  });
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// Text with CSS-style letter spacing (added after every character, like the browser does).
function trackedW(ctx, text, track) { let t = 0; for (const c of text) t += ctx.measureText(c).width + track; return t; }
function tracked(ctx, text, x, y, track, align) {
  const total = trackedW(ctx, text, track);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const prev = ctx.textAlign; ctx.textAlign = 'left';
  for (const c of text) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + track; }
  ctx.textAlign = prev;
}
// Greedy word wrap using any width function; very long single words break by character (overflow-wrap: anywhere).
function wrapWith(measure, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (measure(t) <= maxW) { cur = t; continue; }
    if (cur) { lines.push(cur); cur = ''; }
    if (measure(w) <= maxW) { cur = w; continue; }
    let piece = '';
    for (const ch of w) { if (piece && measure(piece + ch) > maxW) { lines.push(piece); piece = ch; } else piece += ch; }
    cur = piece;
  }
  if (cur) lines.push(cur);
  return lines;
}
// text-wrap: balance: the narrowest width that still gives the same number of lines
function balanceWith(measure, text, maxW) {
  const lines = wrapWith(measure, text, maxW);
  if (lines.length < 2) return lines;
  let lo = maxW * 0.4, hi = maxW;
  for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (wrapWith(measure, text, mid).length === lines.length) hi = mid; else lo = mid; }
  return wrapWith(measure, text, hi);
}

/* ------------------------------------------------------------------ fonts */
const FONT_CHECKS = [
  ['700 20px "Futura Std"', 'Futura Std'],
  ['700 40px "Tungsten Comp"', 'Tungsten Comp'],
  ['700 40px "blackest-text"', 'Blackest'],
];
async function missingFonts() {
  const missing = [];
  await Promise.all(FONT_CHECKS.map(async ([spec, label]) => {
    try { const r = await document.fonts.load(spec, 'BD Aa'); if (!r || !r.length) missing.push(label); } catch (e) { missing.push(label); }
  }));
  return missing;
}
const FONT_NAME = (px) => `700 ${px}px "blackest-text","blackest","Ultra",Georgia,serif`; // winner names
const NAME_LH = 1.08;
const FONT_LAB = (px) => `700 ${px}px "Futura Std",Futura,"Century Gothic",system-ui,sans-serif`;
const FONT_BLK = (px) => `700 ${px}px "blackest-text","blackest","Ultra",Georgia,serif`;
const FONT_COMP = (px) => `700 ${px}px "Tungsten Comp","Arial Narrow",sans-serif`;

/* ------------------------------------------------------------------ card faces */
function tintPip(img, color, px) {
  const c = mk(px, px), x = c.getContext('2d');
  x.drawImage(img, 0, 0, px, px);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color; x.fillRect(0, 0, px, px);
  return c;
}
function slack(img, cw, ch, zoom) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const base = Math.max(cw / iw, ch / ih) * zoom;
  return [iw * base - cw, ih * base - ch, base, iw, ih];
}
function drawCover(ctx, img, cw, ch, zoom, px, py) {
  const [sx, sy, base, iw, ih] = slack(img, cw, ch, zoom);
  const x = -sx / 2 - (px * sx) / 2, y = -sy / 2 - (py * sy) / 2;
  ctx.drawImage(img, x, y, iw * base, ih * base);
}
function drawFrame(ctx, W, u, photo) {
  const H = ctx.canvas.height;
  ctx.lineWidth = u;
  ctx.strokeStyle = photo ? 'rgba(251,248,241,.75)' : 'rgba(181,150,82,.75)';
  rr(ctx, 10.5 * u, 10.5 * u, W - 21 * u, H - 21 * u, 8 * u); ctx.stroke();
  ctx.strokeStyle = photo ? 'rgba(251,248,241,.35)' : 'rgba(181,150,82,.35)';
  rr(ctx, 14.5 * u, 14.5 * u, W - 29 * u, H - 29 * u, 6 * u); ctx.stroke();
}
// The "B" / "D" corner index with its suit pip. Returns the bottom edge of the top-left one (used to fit plain-card text).
function drawIdx(ctx, W, u, letter, suit, corner, photo) {
  const H = ctx.canvas.height, F = 0.145 * W, capH = 0.703 * F;
  ctx.font = FONT_BLK(F);
  const lw = ctx.measureText(letter).width, pw = 0.096 * W, ph = pw, colW = Math.max(lw, pw), gap = 0.054 * W, total = capH + gap + ph;
  const x0 = corner === 'tl' ? 0.07 * W : W - 0.07 * W - colW;
  // the bottom-right offset (-0.0045 * W) and the letter baseline (-0.0272 * F) were measured against the live card
  const y0 = corner === 'tl' ? 0.092 * W : H - 0.075 * W - total - 0.0045 * W;
  ctx.save();
  if (corner === 'br') { ctx.translate(x0 + colW / 2, y0 + total / 2); ctx.rotate(Math.PI); ctx.translate(-(x0 + colW / 2), -(y0 + total / 2)); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  if (photo) { ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 8 * u; ctx.shadowOffsetY = 1 * u; }
  ctx.fillStyle = photo ? '#FBF8F1' : RED[suit] ? '#C8102E' : '#161C33';
  ctx.fillText(letter, x0 + colW / 2, y0 + capH - 0.0272 * F);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  const pip = S.pips[suit];
  const ppx = x0 + colW / 2 - pw / 2, ppy = y0 + capH + gap;
  if (photo) {
    const t = tintPip(pip, '#FFFFFF', Math.max(2, Math.round(pw)));
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 6 * u; ctx.shadowOffsetY = 1 * u;
    ctx.drawImage(t, ppx, ppy, pw, ph);
  } else ctx.drawImage(pip, ppx, ppy, pw, ph);
  ctx.restore();
  return y0 + total;
}
// label + name for the white plate on photo cards
function drawPlate(ctx, W, u, cat, name) {
  const H = ctx.canvas.height;
  const maxW = W - 14 * u - 0.19 * W, padX = 11 * u, padY = 9 * u, inner = maxW - 2 * padX;
  ctx.font = FONT_LAB(10 * u);
  const labLines = wrapWith((t) => trackedW(ctx, t.toUpperCase(), 0.18 * 10 * u), cat, inner).map((s) => s.toUpperCase());
  const labW = Math.max(...labLines.map((t) => trackedW(ctx, t, 0.18 * 10 * u)));
  let k = 1, size, lines, nameW;
  for (let n = 0; n < 12; n++) {
    size = 0.085 * W * k; ctx.font = FONT_NAME(size);
    lines = balanceWith((t) => ctx.measureText(t).width, name, inner);
    if (lines.length <= 3 || k <= 0.35) break;
    k *= 0.92;
  }
  ctx.font = FONT_NAME(size);
  const single = ctx.measureText(name).width;
  nameW = lines.length > 1 ? inner : Math.min(single, inner);
  const w = Math.min(maxW, Math.max(labW, nameW) + 2 * padX);
  const labH = labLines.length * 13 * u, nameH = lines.length * size * NAME_LH;
  const h = padY * 2 + labH + 4 * u + nameH;
  const x = 14 * u, y = H - 14 * u - h;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 14 * u; ctx.shadowOffsetY = 4 * u;
  ctx.fillStyle = '#FBF8F1'; rr(ctx, x, y, w, h, 4 * u); ctx.fill();
  ctx.restore();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillStyle = '#B00E28'; ctx.font = FONT_LAB(10 * u);
  labLines.forEach((t, i) => tracked(ctx, t, x + padX, y + padY + (i + 0.5) * 13 * u, 0.18 * 10 * u, 'left'));
  ctx.fillStyle = '#17171A'; ctx.font = FONT_NAME(size);
  lines.forEach((t, i) => ctx.fillText(t, x + padX, y + padY + labH + 4 * u + (i + 0.5) * size * NAME_LH));
}
// centered label + name on plain (text-only) cards
function drawPlain(ctx, W, u, cat, name, tlBottom) {
  const H = ctx.canvas.height, inner = W - 56 * u, maxH = H - 2 * (tlBottom + 2 * u);
  ctx.font = FONT_LAB(11 * u);
  const labLines = wrapWith((t) => trackedW(ctx, t.toUpperCase(), 0.18 * 11 * u), cat, inner).map((s) => s.toUpperCase());
  const labH = labLines.length * 1.3 * 11 * u;
  let k = 1, size, lines, blockH;
  for (let n = 0; n < 12; n++) {
    size = 0.115 * W * k; ctx.font = FONT_NAME(size);
    lines = balanceWith((t) => ctx.measureText(t).width, name, inner);
    blockH = labH + 8 * u + lines.length * size * NAME_LH;
    if ((lines.length <= 5 && blockH <= maxH) || k <= 0.35) break;
    k *= 0.92;
  }
  let y = H / 2 - blockH / 2;
  ctx.textBaseline = 'middle'; ctx.fillStyle = '#B00E28'; ctx.font = FONT_LAB(11 * u);
  labLines.forEach((t, i) => tracked(ctx, t, W / 2, y + (i + 0.5) * 1.3 * 11 * u, 0.18 * 11 * u, 'center'));
  y += labH + 8 * u;
  ctx.fillStyle = '#17171A'; ctx.font = FONT_NAME(size); ctx.textAlign = 'center';
  lines.forEach((t, i) => ctx.fillText(t, W / 2, y + (i + 0.5) * size * NAME_LH));
}
function drawBack(ctx, W) {
  const H = ctx.canvas.height, im = S.back, iw = im.naturalWidth, ih = im.naturalHeight;
  const sc = Math.max(W / iw, H / ih), dw = iw * sc, dh = ih * sc, ox = (W - dw) / 2, oy = (H - dh) / 2;
  ctx.drawImage(im, ox, oy, dw, dh);
  // "We won / Best of Big D 2026" sits in the plain navy band between the top ornament and the D's frame.
  // That band is y 253..604 and x 253..1174 in the 1428 x 2000 art, so everything is placed in art coordinates.
  const Y = (v) => oy + v * sc, X = (v) => ox + v * sc, P = (v) => v * sc;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#E9CF8E'; ctx.font = FONT_LAB(P(46));
  tracked(ctx, 'WE WON', X(iw / 2), Y(420), 0.34 * P(46), 'center');
  const text = 'BEST OF BIG D 2026', maxW = P(760);
  let size = P(150);
  const tw = (s2) => { ctx.font = FONT_COMP(s2); return trackedW(ctx, text, 0.03 * s2); };
  while (size > 8 && tw(size) > maxW) size -= 1;
  ctx.font = FONT_COMP(size); ctx.fillStyle = '#F4E6C2';
  tracked(ctx, text, X(iw / 2), Y(525), 0.03 * size, 'center');
}

// Which kind of face the current choices give.
function faceKind() {
  if (S.mode === 'upload' && S.photo) return 'photo';
  if (S.mode === 'ours' && S.ours) return S.cur.it === 'card' ? 'art' : 'photo';
  return 'plain';
}
function activePhoto() { return S.mode === 'upload' ? S.photo : S.ours; }

function buildFront(cw, opts) {
  const ch = Math.round(cw * RATIO), c = mk(cw, ch), ctx = c.getContext('2d'), W = c.width, u = W / REF;
  const it = S.cur, name = it.dn, kind = faceKind();
  ctx.save(); rr(ctx, 0, 0, W, c.height, 14 * u); ctx.clip();
  ctx.fillStyle = '#FBF8F1'; ctx.fillRect(0, 0, W, c.height);
  if (kind === 'art') {
    drawCover(ctx, S.ours, W, c.height, 1, 0, 0);
    drawPlate(ctx, W, u, it.c, name);
  } else if (kind === 'photo') {
    drawCover(ctx, activePhoto(), W, c.height, S.zoom, S.px, S.py);
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, 'rgba(0,0,0,.34)'); g.addColorStop(0.26, 'rgba(0,0,0,0)'); g.addColorStop(0.7, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.34)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, c.height);
    drawFrame(ctx, W, u, true);
    drawIdx(ctx, W, u, 'B', it.s, 'tl', true); drawIdx(ctx, W, u, 'D', it.s, 'br', true);
    drawPlate(ctx, W, u, it.c, name);
  } else {
    drawFrame(ctx, W, u, false);
    const wm = 0.52 * W;
    ctx.globalAlpha = 0.07; ctx.drawImage(S.pips[it.s], (W - wm) / 2, (c.height - wm) / 2, wm, wm); ctx.globalAlpha = 1;
    const tl = drawIdx(ctx, W, u, 'B', it.s, 'tl', false); drawIdx(ctx, W, u, 'D', it.s, 'br', false);
    drawPlain(ctx, W, u, it.c, name, tl);
  }
  if (opts && opts.logo) { // "Card only" stills: the D logo, small and centred near the top, level with the corner B
    const lh = 0.062 * W, lw = lh * (S.logo.naturalWidth / S.logo.naturalHeight);
    ctx.drawImage(S.logo, (W - lw) / 2, 0.092 * W, lw, lh);
  }
  ctx.restore();
  return c;
}
function buildBack(cw) {
  const ch = Math.round(cw * RATIO), c = mk(cw, ch), ctx = c.getContext('2d');
  ctx.save(); rr(ctx, 0, 0, c.width, ch, 14 * (c.width / REF)); ctx.clip();
  drawBack(ctx, c.width);
  ctx.restore();
  return c;
}

/* ------------------------------------------------------------------ scene (card on a canvas of a given size) */
function canvasDims(size, bg) {
  const b = size.layout === 'card' && bg === 'white' ? JPG_BORDER : 0;
  return { w: size.w + 2 * b, h: size.h + 2 * b, b };
}
function cardRect(size, b) {
  if (size.layout === 'card') return { x: b, y: b, w: size.w, h: size.h };
  const m = (size.layout === 'portrait' ? 0.085 : 0.08) * size.h, h = size.h - 2 * m, w = h / RATIO;
  const x = size.layout === 'portrait' ? (size.w - w) / 2 : Math.max(m, size.w * 0.1);
  return { x, y: m, w, h };
}
// The real D logo (img/d-logo.png, 1350 x 1200). Drawn with height h; returns its width.
function drawDMark(ctx, x, y, h) {
  const w = h * (S.logo.naturalWidth / S.logo.naturalHeight);
  ctx.drawImage(S.logo, x, y, w, h);
  return w;
}
function drawLandscapeText(ctx, size, card) {
  const H = size.h, tx = card.x + card.w + size.w * 0.07, maxW = size.w - tx - size.h * 0.09;
  const dm = H * 0.14, we = H * 0.036;
  let big = H * 0.2; const lines = ['BEST OF', 'BIG D 2026'];
  const tw = (s) => { ctx.font = FONT_COMP(s); return Math.max(...lines.map((t) => trackedW(ctx, t, 0.03 * s))); };
  while (big > 10 && tw(big) > maxW) big -= 1;
  const blockH = dm + H * 0.05 + we + H * 0.03 + lines.length * big * 0.95;
  let y = card.y + card.h / 2 - blockH / 2;
  drawDMark(ctx, tx, y, dm); y += dm + H * 0.05;
  ctx.textBaseline = 'middle'; ctx.fillStyle = '#B00E28'; ctx.font = FONT_LAB(we);
  tracked(ctx, 'WE WON', tx, y + we / 2, 0.34 * we, 'left'); y += we + H * 0.03;
  ctx.fillStyle = '#141A30'; ctx.font = FONT_COMP(big);
  lines.forEach((t, i) => tracked(ctx, t, tx, y + (i + 0.5) * big * 0.95, 0.03 * big, 'left'));
}
// Paint one frame. faces = {front, back} canvases built for this card width. fs = flip state (see flipState).
function paintScene(ctx, size, faces, opts) {
  const { bg, scale: sc, fs, b } = opts;
  const card = cardRect(size, b);
  ctx.save(); ctx.scale(sc, sc);
  if (bg === 'white') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, ctx.canvas.width / sc, ctx.canvas.height / sc); }
  else ctx.clearRect(0, 0, ctx.canvas.width / sc, ctx.canvas.height / sc);
  if (size.layout === 'landscape') drawLandscapeText(ctx, size, card);
  if (opts.still && size.layout === 'portrait') { // Instagram still: the D logo, small and centred in the margin above the card
    const lh = 0.048 * size.h, lw = lh * (S.logo.naturalWidth / S.logo.naturalHeight);
    ctx.drawImage(S.logo, (size.w - lw) / 2, (card.y - lh) / 2, lw, lh);
  }
  const face = fs.back ? faces.back : faces.front;
  const w = card.w * fs.sx, x = card.x + (card.w - w) / 2;
  if (size.layout !== 'card') { ctx.shadowColor = 'rgba(20,26,48,.30)'; ctx.shadowBlur = 36 * (card.h / 1000); ctx.shadowOffsetY = 14 * (card.h / 1000); }
  ctx.drawImage(face, x, card.y, w, card.h);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  if (fs.shade > 0) { // dim the card as it turns edge-on
    const tmp = mk(Math.max(1, Math.round(w * sc)), Math.max(1, Math.round(card.h * sc))), t = tmp.getContext('2d');
    t.drawImage(face, 0, 0, tmp.width, tmp.height); t.globalCompositeOperation = 'source-in'; t.fillStyle = '#000'; t.fillRect(0, 0, tmp.width, tmp.height);
    ctx.globalAlpha = fs.shade; ctx.drawImage(tmp, x, card.y, w, card.h); ctx.globalAlpha = 1;
  }
  ctx.restore();
}
const STATIC = (side) => ({ sx: 1, back: side === 'back', shade: 0 });
function flipState(t) {
  t = ((t % CYCLE) + CYCLE) % CYCLE;
  if (t < HOLD) return { sx: 1, back: false, shade: 0 };
  if (t < HOLD + FLIP) { const th = Math.PI * ease((t - HOLD) / FLIP), c = Math.cos(th); return { sx: Math.max(0.001, Math.abs(c)), back: c < 0, shade: Math.sin(th) * 0.4 }; }
  if (t < 2 * HOLD + FLIP) return { sx: 1, back: true, shade: 0 };
  const th = Math.PI + Math.PI * ease((t - 2 * HOLD - FLIP) / FLIP), c = Math.cos(th);
  return { sx: Math.max(0.001, Math.abs(c)), back: c < 0, shade: Math.abs(Math.sin(th)) * 0.4 };
}

/* ------------------------------------------------------------------ preview */
let raf = 0, faces = null, facesKey = '';
const curSize = () => SIZES.find((s) => s.id === S.sizeId);
function previewScale(size) { return Math.min(1, 1000 / size.w); }
// "Card only" stills carry the logo on the card's front face
const cardLogo = (size) => S.kind === 'still' && size.layout === 'card';
function facesFor(cardPx) {
  const key = [cardPx, cardLogo(curSize()), S.cur && S.cur.id, S.mode, S.zoom.toFixed(3), S.px.toFixed(3), S.py.toFixed(3), S.photo && S.photo.width, S.ours && S.ours.src].join('|');
  if (key !== facesKey) { faces = { front: buildFront(cardPx, { logo: cardLogo(curSize()) }), back: buildBack(cardPx) }; facesKey = key; }
  return faces;
}
function draw() {
  cancelAnimationFrame(raf);
  if (!S.cur) return;
  const size = curSize(), sc = previewScale(size), bg = 'transparent', cv = el.cv;
  const d = canvasDims(size, bg); // the preview never shows the JPG border; the border is added only on download
  if (cv.width !== Math.round(d.w * sc) || cv.height !== Math.round(d.h * sc)) { cv.width = Math.round(d.w * sc); cv.height = Math.round(d.h * sc); }
  const ctx = cv.getContext('2d'), card = cardRect(size, 0);
  const f = facesFor(Math.round(card.w * sc));
  el.empty.hidden = true;
  el.dims.textContent = `${size.w} × ${size.h} px` + (S.kind === 'anim' ? ' · animated' : '');
  if (S.kind === 'anim') {
    const t0 = performance.now();
    const tick = () => { paintScene(ctx, size, f, { bg, scale: sc, b: 0, still: false, fs: flipState((performance.now() - t0) / 1000) }); raf = requestAnimationFrame(tick); };
    tick();
  } else paintScene(ctx, size, f, { bg, scale: sc, b: 0, still: true, fs: STATIC(S.side) });
}

/* ------------------------------------------------------------------ exporting */
const fileBase = () => `best-of-big-d-2026-${S.cur.slug}-${curSize().id}`;
function saveBlob(blob, name) {
  const a = document.createElement('a'), url = URL.createObjectURL(blob);
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
}
function say(msg, bad) { el.status.textContent = msg || ''; el.status.classList.toggle('bad', !!bad); }
function toBlob(canvas, type, q) {
  return new Promise((res, rej) => { try { canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not create the image.'))), type, q); } catch (e) { rej(e); } });
}
async function exportStill(bg) {
  const size = curSize(), d = canvasDims(size, bg);
  const c = mk(d.w, d.h), ctx = c.getContext('2d');
  const cw = cardRect(size, d.b).w, f = { front: buildFront(cw, { logo: size.layout === 'card' }), back: buildBack(cw) };
  paintScene(ctx, size, f, { bg, scale: 1, b: d.b, still: true, fs: STATIC(S.side) });
  return bg === 'white' ? toBlob(c, 'image/jpeg', 0.93) : toBlob(c, 'image/png');
}
function animDraw(size, sc, f) {
  return (ctx, t) => paintScene(ctx, size, f, { bg: 'white', scale: sc, b: 0, still: false, fs: flipState(t) });
}
async function exportMp4() {
  const size = curSize(), card = cardRect(size, 0), f = { front: buildFront(card.w), back: buildBack(card.w) };
  return encodeMp4({ w: size.w, h: size.h, seconds: CYCLE * 2, fps: 30, draw: animDraw(size, 1, f), onProgress: (p) => say(`Making your video… ${Math.round(p * 100)}%`) });
}
async function exportGif() {
  const size = curSize(), sc = Math.min(1, 720 / Math.max(size.w, size.h)), w = Math.round(size.w * sc), h = Math.round(size.h * sc);
  const card = cardRect(size, 0), f = { front: buildFront(Math.round(card.w * sc)), back: buildBack(Math.round(card.w * sc)) };
  const steps = [{ t: 0.01, delay: Math.round(HOLD * 1000) }], N = 14;
  for (let i = 0; i < N; i++) steps.push({ t: HOLD + ((i + 0.5) / N) * FLIP, delay: Math.round((FLIP / N) * 1000) });
  steps.push({ t: HOLD + FLIP + 0.01, delay: Math.round(HOLD * 1000) });
  for (let i = 0; i < N; i++) steps.push({ t: 2 * HOLD + FLIP + ((i + 0.5) / N) * FLIP, delay: Math.round((FLIP / N) * 1000) });
  return encodeGif({ w, h, steps, draw: animDraw(size, sc, f), onProgress: (p) => say(`Making your GIF… ${Math.round(p * 100)}%`) });
}
async function run(label, fn, name) {
  if (S.busy || !S.cur) return;
  if (!S.fontsOK) { say('The brand fonts have not loaded yet. Please wait a moment and try again.', true); return; }
  S.busy = true; setButtons(); say(`Making your ${label}…`);
  try {
    const blob = await fn();
    saveBlob(blob, name);
    say(`Done. Your ${label} is in your downloads.`);
  } catch (e) {
    console.error(e);
    say(e && /taint|insecure|security/i.test(String(e.name + e.message)) ? 'This photo can not be saved. Please upload your own photo instead.' : (e && e.message) || 'Something went wrong.', true);
  } finally { S.busy = false; setButtons(); }
}

/* ------------------------------------------------------------------ UI */
function setButtons() {
  const ok = !!S.cur && S.fontsOK && !S.busy;
  ['dlPng', 'dlJpg', 'dlMp4', 'dlGif'].forEach((id) => { el[id].disabled = !ok; });
  if (!videoSupported()) el.dlMp4.title = 'Video export needs Chrome or Safari';
}
function showSteps() {
  const on = !!S.cur;
  el.stepStyle.hidden = !on; el.stepOut.hidden = !on; el.stepGo.hidden = !on;
}
function renderList(filter) {
  const q = (filter || '').trim().toLowerCase();
  el.list.innerHTML = '';
  let any = false;
  for (const [k, label] of SUITS) {
    const rows = S.items.filter((w) => w.s === k && (!q || w.dn.toLowerCase().includes(q) || w.c.toLowerCase().includes(q)));
    if (!rows.length) continue;
    any = true;
    const g = document.createElement('div'); g.className = 'grp'; g.textContent = label; el.list.appendChild(g);
    for (const w of rows) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'opt'; b.dataset.id = w.id;
      b.setAttribute('aria-pressed', S.cur && S.cur.id === w.id ? 'true' : 'false');
      b.innerHTML = '<span></span><small></small>';
      b.firstChild.textContent = w.dn; b.lastChild.textContent = w.c;
      b.addEventListener('click', () => pick(w));
      el.list.appendChild(b);
    }
  }
  if (!any) { const n = document.createElement('div'); n.className = 'none'; n.textContent = 'No match. Check the spelling, or try just the first word.'; el.list.appendChild(n); }
}
async function pick(w) {
  S.cur = w; S.photo = null; S.ours = null; S.oursState = 'none'; S.zoom = 1; S.px = 0; S.py = 0; S.mode = 'text'; S.kind = 'still'; S.side = 'front';
  $('input[name=mode][value=text]').checked = true; $('input[name=kind][value=still]').checked = true; $('input[name=side][value=front]').checked = true;
  el.zoom.value = 1; el.fileBtn.textContent = 'Choose a photo'; el.file.value = ''; // so the same file can be chosen again for the next winner
  el.list.querySelectorAll('.opt').forEach((b) => b.setAttribute('aria-pressed', b.dataset.id == w.id ? 'true' : 'false'));
  el.picked.innerHTML = ''; const bEl = document.createElement('b'); bEl.textContent = w.dn; el.picked.append(bEl, ' · ' + w.c);
  history.replaceState(null, '', '?w=' + w.slug);
  showSteps(); say('');
  // our photo, if this winner has one
  const oursInput = $('input[name=mode][value=ours]');
  if (w.img) {
    S.oursState = 'loading'; oursInput.disabled = true; el.oursNote.hidden = false; el.oursNote.textContent = 'Checking for our photo of your listing…';
    // 1) a copy kept in this repo (photos/manifest.json, made by scripts/fetch-share-photos.js; same origin, so no CORS needed)
    // 2) otherwise the original, which only works if its host sends CORS headers
    const local = S.manifest[w.img];
    const src = local || (/^https?:/.test(w.img) ? w.img : '..' + w.img);
    loadImage(src, !local).then((im) => { if (S.cur !== w) return; S.ours = im; S.oursState = 'ok'; oursInput.disabled = false; el.oursNote.hidden = true; refresh(); })
      .catch(() => { if (S.cur !== w) return; S.oursState = 'blocked'; oursInput.disabled = true; el.oursNote.hidden = false; el.oursNote.textContent = 'We can not use our photo directly here. '; const a = document.createElement('a'); a.href = w.img; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Open our photo'; el.oursNote.append(a, ' in a new tab, save it, then choose My photo and upload it.'); });
  } else { oursInput.disabled = true; el.oursNote.hidden = false; el.oursNote.textContent = 'We do not have a photo for this listing. Choose text only, or upload your own.'; }
  refresh();
}
function refresh() {
  const m = S.mode;
  el.uploadBox.hidden = m !== 'upload';
  const photoShown = (m === 'upload' && !!S.photo) || (m === 'ours' && !!S.ours && S.cur.it !== 'card');
  el.adjust.hidden = !photoShown;
  el.cv.classList.toggle('drag', photoShown);
  el.sideBox.hidden = S.kind === 'anim';
  el.stillBtns.hidden = S.kind === 'anim'; el.animBtns.hidden = S.kind !== 'anim';
  setButtons();
  draw();
}
function buildSizes() {
  el.sizes.innerHTML = '';
  for (const s of SIZES) {
    const l = document.createElement('label'); l.className = 'sz';
    l.innerHTML = `<input type="radio" name="size" value="${s.id}"${s.id === S.sizeId ? ' checked' : ''}><span><b>${s.label}</b><i>${s.note}</i></span>`;
    el.sizes.appendChild(l);
  }
}
async function onFile(e) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  try {
    let bmp;
    if (window.createImageBitmap) bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
    else bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(f); });
    // keep memory in check for very large photos
    const maxSide = 3000, w = bmp.width, h = bmp.height;
    if (Math.max(w, h) > maxSide) { const k = maxSide / Math.max(w, h), c = mk(w * k, h * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp = c; }
    S.photo = bmp; S.zoom = 1; S.px = 0; S.py = 0; el.zoom.value = 1;
    el.fileBtn.textContent = 'Change photo'; say('');
    refresh();
  } catch (err) { console.error(err); say('That file could not be read as a photo. Try a JPG or PNG.', true); }
}
function bindDrag() {
  let start = null;
  el.cv.addEventListener('pointerdown', (e) => {
    const ph = activePhoto(); if (!ph || faceKind() !== 'photo') return;
    start = { x: e.clientX, y: e.clientY, px: S.px, py: S.py }; el.cv.setPointerCapture(e.pointerId);
  });
  el.cv.addEventListener('pointermove', (e) => {
    if (!start) return;
    const ph = activePhoto(), size = curSize(), sc = previewScale(size), card = cardRect(size, 0);
    const rect = el.cv.getBoundingClientRect(), k = el.cv.width / rect.width; // canvas px per screen px
    const cw = card.w * sc, ch = card.h * sc, [sx, sy] = slack(ph, cw, ch, S.zoom);
    const dx = (e.clientX - start.x) * k, dy = (e.clientY - start.y) * k;
    S.px = clamp(start.px - (sx > 1 ? dx / (sx / 2) : 0), -1, 1); S.py = clamp(start.py - (sy > 1 ? dy / (sy / 2) : 0), -1, 1);
    draw();
  });
  const end = () => { start = null; };
  el.cv.addEventListener('pointerup', end); el.cv.addEventListener('pointercancel', end);
}

/* ------------------------------------------------------------------ start */
async function start() {
  for (const id of ['q', 'list', 'picked', 'stepStyle', 'stepOut', 'stepGo', 'uploadBox', 'adjust', 'oursNote', 'oursLabel', 'file', 'fileBtn', 'zoom', 'sizes', 'sideBox',
    'stillBtns', 'animBtns', 'dlPng', 'dlJpg', 'dlMp4', 'dlGif', 'status', 'fontWarn', 'cv', 'empty', 'dims']) el[id] = document.getElementById(id);
  buildSizes();

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'mode') { S.mode = t.value; refresh(); }
    else if (t.name === 'kind') { S.kind = t.value; refresh(); }
    else if (t.name === 'side') { S.side = t.value; refresh(); }
    else if (t.name === 'size') { S.sizeId = t.value; refresh(); }
  });
  el.q.addEventListener('input', () => renderList(el.q.value));
  el.file.addEventListener('change', onFile);
  el.zoom.addEventListener('input', () => { S.zoom = parseFloat(el.zoom.value); draw(); });
  el.dlPng.addEventListener('click', () => run('PNG', () => exportStill('transparent'), fileBase() + (S.side === 'back' ? '-back' : '') + '.png'));
  el.dlJpg.addEventListener('click', () => run('JPG', () => exportStill('white'), fileBase() + (S.side === 'back' ? '-back' : '') + '.jpg'));
  el.dlMp4.addEventListener('click', () => run('video', exportMp4, fileBase() + '-flip.mp4'));
  el.dlGif.addEventListener('click', () => run('GIF', exportGif, fileBase() + '-flip.gif'));
  bindDrag();
  window.addEventListener('resize', () => { if (S.cur) draw(); });
  setButtons();

  // data
  const [data, back, logo] = await Promise.all([
    fetch(DATA_URL).then((r) => r.json()),
    loadImage(BACK_URL),
    loadImage(LOGO_URL),
    ...Object.entries(PIP).map(([k, u]) => loadImage(u).then((im) => { S.pips[k] = im; })),
  ]);
  S.back = back; S.logo = logo;
  try { const r = await fetch('photos/manifest.json'); if (r.ok) S.manifest = await r.json(); } catch (e) { /* no local copies: fall back to the remote photos */ }
  const seen = {};
  S.items = data.map((it) => {
    let s = slugify(it.n) || 'winner-' + it.id; if (seen[s]) s = s + '-' + it.id; seen[s] = 1;
    return Object.assign({}, it, { slug: s, dn: NAME_FIX[it.n] || niceName(it.n) });
  });
  renderList('');

  // fonts: the card is drawn with the brand fonts, so downloads wait until all four are loaded
  if (/[?&]nofontcheck\b/.test(location.search)) { S.fontsOK = true; }
  else {
    el.fontWarn.hidden = false;
    for (let i = 0; i < 40 && !S.fontsOK; i++) {
      const missing = await missingFonts();
      if (!missing.length) S.fontsOK = true; else { el.fontWarn.textContent = `Waiting for the brand fonts (${missing.join(', ')}). If this stays here, reload the page.`; await new Promise((r) => setTimeout(r, 500)); }
    }
  }
  el.fontWarn.hidden = S.fontsOK;
  if (!S.fontsOK) el.fontWarn.textContent = 'The brand fonts did not load, so downloads are turned off. Reload the page, and if it keeps happening let D Magazine know.';
  setButtons();

  const w = new URLSearchParams(location.search).get('w');
  const pre = w && S.items.find((x) => x.slug === w);
  if (pre) { el.q.value = ''; await pick(pre); const o = el.list.querySelector('.opt[aria-pressed=true]'); if (o) o.scrollIntoView({ block: 'nearest' }); }
  if (S.cur) draw();
}
start().catch((e) => { console.error(e); document.getElementById('picked').textContent = 'Something went wrong loading the winners. Please reload the page.'; });

// exposed for automated checks
window.__share = { S, niceName, slugify, buildFront, buildBack, flipState, SIZES };
