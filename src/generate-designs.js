// n8n Code node: "Generate Designs"  (mode: Run Once for All Items)
// Input: LLM chat completions response (Groq/Fireworks/Cerebras/Claude/etc. or local fallback).
// Output: { html } — a full gallery page: palette, typography, N procedural SVG backgrounds (no text),
//         standalone transparent component stickers, and Track 2 image-model prompts.

/* ---------------- inputs ---------------- */

const q = ($('Webhook Trigger').first().json.query) || {};
const brief = (q.brief || '').toString().slice(0, 600);
const count = Math.max(1, Math.min(24, parseInt(q.count, 10) || 6));

const SIZES = { insta: [1080, 1080], story: [1080, 1920], a4: [2480, 3508], hero: [1920, 1080], banner: [1500, 500] };
let sizeKey = (q.size || 'insta').toString();
let W = 1080, H = 1080;
if (SIZES[sizeKey]) { [W, H] = SIZES[sizeKey]; }
else {
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(sizeKey);
  if (m) { W = +m[1]; H = +m[2]; sizeKey = W + 'x' + H; } else { sizeKey = 'insta'; }
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}
const seedBase = (parseInt(q.seed, 10) || (hashStr(brief + '|' + sizeKey) % 1000000)) >>> 0;

/* ---------------- color utils ---------------- */

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHex(r, g, b) {
  const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
function lum(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => {
    v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function sat(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
}
function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return rgbToHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}
const lighten = (h, t) => mix(h, '#ffffff', t);
const darken = (h, t) => mix(h, '#000000', t);
function ensureContrast(c, bgLum, dark) {
  if (Math.abs(lum(c) - bgLum) >= 0.055) return c;
  return dark ? lighten(c, 0.3) : darken(c, 0.22);
}
const isHex = s => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);

/* ---------------- fonts ---------------- */

const FONT_WHITELIST = [
  // Sans-serif — clean/body/UI
  'Inter', 'Roboto', 'Montserrat', 'Poppins', 'Lato',
  'Source Sans Pro', 'IBM Plex Sans', 'Nunito',

  // Display/header — bold poster energy
  'Archivo Black', 'Bangers', 'Fredoka', 'Anton', 'Bebas Neue',

  // Monospace — techy/industrial captions
  'Space Mono', 'JetBrains Mono', 'IBM Plex Mono',

  // Serif/editorial — elegant/vintage
  'Cormorant Garamond', 'Playfair Display', 'Libre Baskerville',

  // Sci-fi/tech display
  'Orbitron', 'Chakra Petch', 'Audiowide'
];

const SINGLE_WEIGHT = ['Archivo Black', 'Bangers', 'Anton', 'Bebas Neue', 'Orbitron', 'Audiowide'];
const SERIF = ['Playfair Display', 'Cormorant Garamond', 'Libre Baskerville'];
const MONO = ['Space Mono', 'JetBrains Mono', 'IBM Plex Mono'];

const VIBE_PAIRING = {
  minimal: { header: 'Montserrat', body: 'Inter' },
  bold: { header: 'Archivo Black', body: 'Roboto' },
  playful: { header: 'Bangers', body: 'Nunito' },
  elegant: { header: 'Cormorant Garamond', body: 'Lato' },
  tech: { header: 'Orbitron', body: 'IBM Plex Mono' }
};
const VIBES = Object.keys(VIBE_PAIRING);

const STYLE_KEYS = [
  'aurora', 'waves', 'geometric', 'blobs', 'ribbons',
  'confetti', 'rings', 'grid', 'halftone', 'tornpaper', 'duotone'
];
const STYLE_LABEL = {
  aurora: 'Aurora', waves: 'Waves', geometric: 'Geometric', blobs: 'Organic',
  ribbons: 'Ribbons', confetti: 'Confetti', rings: 'Rings', grid: 'Dot Grid',
  halftone: 'Halftone Duotone', tornpaper: 'Torn Paper', duotone: 'Color Grade Wash'
};
const VIBE_STYLES = {
  minimal: ['waves', 'grid', 'blobs', 'duotone'],
  bold: ['ribbons', 'geometric', 'aurora', 'halftone'],
  playful: ['confetti', 'blobs', 'ribbons', 'tornpaper'],
  elegant: ['rings', 'waves', 'blobs', 'duotone'],
  tech: ['grid', 'geometric', 'aurora', 'halftone']
};

/* ---------------- fallback theme engine ---------------- */

const FALLBACKS = [
  { re: /(diwali|festival|holi|celebrat|fiesta|carnival|navratri|pongal)/i, t: { name: 'Festival Glow', colors: ['#FF6D00', '#FFC300', '#E4004B', '#7A1FA2', '#2B0B3A'], dark: true, vibe: 'playful', styles: ['aurora', 'confetti', 'rings', 'tornpaper'], header_font: 'Fredoka', body_font: 'Nunito' } },
  { re: /(tech|hack|dev|code|\bai\b|startup|launch|robot|cyber)/i, t: { name: 'Neon Circuit', colors: ['#00E5FF', '#7C4DFF', '#00FFA3', '#FF3D81', '#0A0F2C'], dark: true, vibe: 'tech', styles: ['grid', 'geometric', 'halftone'], header_font: 'Orbitron', body_font: 'IBM Plex Mono' } },
  { re: /(wedding|gala|luxur|elegan|award|anniversary)/i, t: { name: 'Gilded Evening', colors: ['#C9A227', '#F4E9D8', '#7B5E2A', '#2E2A24', '#8C6B3F'], dark: false, vibe: 'elegant', styles: ['rings', 'blobs', 'waves', 'duotone'], header_font: 'Cormorant Garamond', body_font: 'Lato' } },
  { re: /(nature|eco|green|garden|farm|yoga|wellness|organic)/i, t: { name: 'Fresh Canopy', colors: ['#2E7D32', '#A5D6A7', '#FFF8E1', '#66BB6A', '#1B4332'], dark: false, vibe: 'minimal', styles: ['blobs', 'waves', 'duotone'], header_font: 'Montserrat', body_font: 'Roboto' } },
  { re: /(music|party|dance|\bdj\b|night|concert|fest\b|rave|club)/i, t: { name: 'Bass Drop', colors: ['#FF2975', '#F222FF', '#8C1EFF', '#2DE2E6', '#12081F'], dark: true, vibe: 'bold', styles: ['aurora', 'ribbons', 'halftone'], header_font: 'Bebas Neue', body_font: 'Roboto' } },
  { re: /(corporate|business|finance|summit|conference|meetup|seminar)/i, t: { name: 'Slate Summit', colors: ['#1D3557', '#457B9D', '#A8DADC', '#F1FAEE', '#E63946'], dark: false, vibe: 'minimal', styles: ['geometric', 'waves', 'grid'], header_font: 'IBM Plex Sans', body_font: 'Inter' } },
  { re: /(kids|school|fun|game|sport|carniv)/i, t: { name: 'Playground Pop', colors: ['#FF595E', '#FFCA3A', '#8AC926', '#1982C4', '#6A4C93'], dark: false, vibe: 'playful', styles: ['confetti', 'blobs', 'tornpaper'], header_font: 'Bangers', body_font: 'Nunito' } }
];
const GENERIC = [
  { name: 'Coral Dusk', colors: ['#FF6B6B', '#FFD93D', '#4D96FF', '#6BCB77', '#22223B'], dark: false, vibe: 'bold', styles: ['aurora', 'geometric', 'halftone'], header_font: 'Poppins', body_font: 'Inter' },
  { name: 'Midnight Bloom', colors: ['#B388EB', '#F7AEF8', '#72DDF7', '#8093F1', '#101138'], dark: true, vibe: 'tech', styles: ['aurora', 'blobs', 'grid'], header_font: 'Orbitron', body_font: 'Space Mono' },
  { name: 'Paper & Ink', colors: ['#0F0F0F', '#E63946', '#F1FAEE', '#A8A8A8', '#457B9D'], dark: false, vibe: 'minimal', styles: ['grid', 'geometric', 'tornpaper'], header_font: 'Anton', body_font: 'Roboto' }
];

function fallbackTheme(b) {
  for (const f of FALLBACKS) if (f.re.test(b)) return Object.assign({}, f.t);
  return Object.assign({}, GENERIC[hashStr(b) % GENERIC.length]);
}

/* ---------------- parse LLM theme (or fall back) ---------------- */

function extractJSON(raw) {
  if (typeof raw !== 'string') throw new Error('Input is not a string');
  // Strip any <think>...</think> blocks some reasoning models emit anyway
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Strip markdown fences if present
  cleaned = cleaned.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  // Grab from first { to last } as a final safety net
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON found in model response');
  return JSON.parse(cleaned.slice(start, end + 1));
}

const resp = ($input.first() && $input.first().json) || {};
let theme = null;
let source = 'Theme Engine LLM';
try {
  let raw = '';
  if (typeof resp === 'string') {
    raw = resp;
  } else if (resp && Array.isArray(resp.choices) && resp.choices[0] && resp.choices[0].message) {
    raw = resp.choices[0].message.content || '';
    if (resp.model) source = resp.model;
  } else if (resp && Array.isArray(resp.content) && resp.stop_reason !== 'refusal') {
    const blk = resp.content.find(b => b.type === 'text' && b.text);
    if (blk) raw = blk.text;
    source = 'Claude';
  } else if (resp && typeof resp.text === 'string') {
    raw = resp.text;
  }
  if (raw) theme = extractJSON(raw);
} catch (e) {
  theme = null;
}

// Support both new theme schema (mood, dark, palette, backgroundStyles, fonts) and legacy schema
if (theme) {
  if (theme.palette && typeof theme.palette === 'object') {
    const p = theme.palette;
    const pCols = [p.primary, p.secondary, p.accent, p.surface, p.bg].filter(isHex);
    if (!Array.isArray(theme.colors) || theme.colors.filter(isHex).length < 3) {
      theme.colors = pCols;
    }
    theme.explicitRoles = {
      bg: isHex(p.bg) ? p.bg : null,
      surface: isHex(p.surface) ? p.surface : null,
      primary: isHex(p.primary) ? p.primary : null,
      secondary: isHex(p.secondary) ? p.secondary : null,
      accent: isHex(p.accent) ? p.accent : null,
      text: isHex(p.text) ? p.text : null,
      muted: isHex(p.muted) ? p.muted : null
    };
  }
  if (Array.isArray(theme.backgroundStyles) && (!theme.styles || !theme.styles.length)) {
    theme.styles = theme.backgroundStyles;
  }
  if (theme.fonts && typeof theme.fonts === 'object') {
    theme.header_font = theme.header_font || theme.fonts.header;
    theme.subheader_font = theme.subheader_font || theme.fonts.subheader;
    theme.body_font = theme.body_font || theme.fonts.body;
    theme.caption_font = theme.caption_font || theme.fonts.caption;
  }
  if (theme.mood && !theme.name) {
    theme.name = theme.mood.split(/[-_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  if (theme.mood && !theme.vibe) {
    const m = theme.mood.toLowerCase();
    theme.vibe = VIBES.find(v => m.includes(v)) || 'bold';
  }
}

if (!theme || !Array.isArray(theme.colors) || theme.colors.filter(isHex).length < 3) {
  theme = fallbackTheme(brief);
  source = 'Built-in theme engine';
}

/* sanitize */
theme.colors = theme.colors.filter(isHex).slice(0, 6);
theme.vibe = VIBES.includes(theme.vibe) ? theme.vibe : 'bold';
theme.dark = (q.dark === '1') ? true : (q.dark === '0') ? false : !!theme.dark;
theme.styles = (Array.isArray(theme.styles) ? theme.styles.filter(s => STYLE_KEYS.includes(s)) : []);
if (!theme.styles.length) theme.styles = VIBE_STYLES[theme.vibe] || ['aurora', 'geometric', 'grid'];
theme.name = (typeof theme.name === 'string' && theme.name.trim()) ? theme.name.trim().slice(0, 48) : 'Untitled Theme';
theme.rationale = (typeof theme.rationale === 'string') ? theme.rationale.slice(0, 240) : '';
const headerFont = FONT_WHITELIST.includes(theme.header_font) ? theme.header_font : (VIBE_PAIRING[theme.vibe] || VIBE_PAIRING.bold).header;
const bodyFont = FONT_WHITELIST.includes(theme.body_font) ? theme.body_font : (VIBE_PAIRING[theme.vibe] || VIBE_PAIRING.bold).body;

/* ---------------- roles ---------------- */

function deriveRoles(colors, dark, explicit) {
  const withL = colors.map(c => ({ c, l: lum(c), s: sat(c) }));
  const byL = [...withL].sort((a, b) => a.l - b.l);
  let bg = dark ? byL[0].c : byL[byL.length - 1].c;
  bg = dark ? mix(bg, '#05060a', 0.55) : mix(bg, '#ffffff', 0.72);
  const accent = [...withL].sort((a, b) => b.s - a.s)[0].c;
  const rest = colors.filter(c => c !== accent);
  const primary = rest[0] || accent;
  const secondary = rest[1] || primary;
  const text = lum(bg) > 0.45 ? '#14161c' : '#f7f8fa';
  const muted = mix(text, bg, 0.42);
  const surface = dark ? lighten(bg, 0.06) : darken(bg, 0.045);
  const base = { bg, surface, primary, secondary, accent, text, muted };
  if (!explicit) return base;
  for (const k of Object.keys(base)) {
    if (explicit[k] && isHex(explicit[k])) base[k] = explicit[k];
  }
  return base;
}
const roles = deriveRoles(theme.colors, theme.dark, theme.explicitRoles);
const bgLum = lum(roles.bg);
const shapeCols = theme.colors.map(c => ensureContrast(c, bgLum, theme.dark));

/* ---------------- seeded rng + helpers ---------------- */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = (r, a, b) => a + r() * (b - a);
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const fx = n => (+n).toFixed(1);
const MIN = Math.min(W, H), MAX = Math.max(W, H), DIAG = Math.sqrt(W * W + H * H);

/* ---------------- SVG style generators (Full backgrounds, no text) ---------------- */

function genAurora(r, cols, uid) {
  let defs = '', body = '';
  const n = 4 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const col = cols[k % cols.length];
    const id = uid + 'g' + k;
    defs += `<radialGradient id="${id}"><stop offset="0" stop-color="${col}" stop-opacity="0.85"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`;
    const cx = rnd(r, -0.15, 1.15) * W, cy = rnd(r, -0.15, 1.15) * H, rad = rnd(r, 0.3, 0.7) * MAX;
    body += `<circle cx="${fx(cx)}" cy="${fx(cy)}" r="${fx(rad)}" fill="url(#${id})"/>`;
  }
  return { defs, body };
}

function genWaves(r, cols) {
  let body = '';
  const n = 3 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const y0 = H * (0.38 + 0.55 * (k / n)) + rnd(r, -0.04, 0.04) * H;
    const a1 = rnd(r, 0.04, 0.11) * H * (r() < 0.5 ? -1 : 1);
    const a2 = rnd(r, 0.04, 0.11) * H * (r() < 0.5 ? -1 : 1);
    const d = `M0 ${fx(y0)} C ${fx(W * 0.2)} ${fx(y0 - a1)}, ${fx(W * 0.3)} ${fx(y0 + a1)}, ${fx(W * 0.5)} ${fx(y0)} S ${fx(W * 0.82)} ${fx(y0 + a2)}, ${fx(W)} ${fx(y0 - a2 * 0.5)} L ${W} ${H} L 0 ${H} Z`;
    body += `<path d="${d}" fill="${cols[k % cols.length]}" opacity="${fx(0.72 + 0.28 * (k / Math.max(1, n - 1)))}"/>`;
  }
  return { defs: '', body };
}

function genGeometric(r, cols) {
  let body = '';
  const n = 4 + Math.floor(r() * 4);
  for (let k = 0; k < n; k++) {
    const col = cols[k % cols.length];
    const cx = rnd(r, 0.05, 0.95) * W, cy = rnd(r, 0.05, 0.95) * H;
    const s = rnd(r, 0.12, 0.42) * MIN;
    const rot = Math.floor(rnd(r, 0, 360));
    const outline = r() < 0.35;
    const paint = outline ? `fill="none" stroke="${col}" stroke-width="${fx(MIN * rnd(r, 0.006, 0.014))}"` : `fill="${col}"`;
    const op = fx(outline ? rnd(r, 0.5, 0.95) : rnd(r, 0.14, 0.85));
    const kind = Math.floor(r() * 3);
    if (kind === 0) {
      body += `<polygon points="${fx(cx)},${fx(cy - s)} ${fx(cx + s * 0.87)},${fx(cy + s * 0.5)} ${fx(cx - s * 0.87)},${fx(cy + s * 0.5)}" ${paint} opacity="${op}" transform="rotate(${rot} ${fx(cx)} ${fx(cy)})"/>`;
    } else if (kind === 1) {
      body += `<rect x="${fx(cx - s * 0.7)}" y="${fx(cy - s * 0.7)}" width="${fx(s * 1.4)}" height="${fx(s * 1.4)}" ${paint} opacity="${op}" transform="rotate(${rot} ${fx(cx)} ${fx(cy)})"/>`;
    } else {
      body += `<circle cx="${fx(cx)}" cy="${fx(cy)}" r="${fx(s * 0.75)}" ${paint} opacity="${op}"/>`;
    }
  }
  return { defs: '', body };
}

function blobPath(r, cx, cy, R) {
  const n = 8, pts = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const rad = R * rnd(r, 0.68, 1.18);
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
  }
  let d = `M${fx(pts[0][0])} ${fx(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${fx(c1[0])} ${fx(c1[1])} ${fx(c2[0])} ${fx(c2[1])} ${fx(p2[0])} ${fx(p2[1])}`;
  }
  return d + 'Z';
}

function genBlobs(r, cols) {
  let body = '';
  const n = 2 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const col = cols[k % cols.length];
    const cx = rnd(r, 0.1, 0.9) * W, cy = rnd(r, 0.1, 0.9) * H;
    const R = rnd(r, 0.16, 0.4) * MIN;
    const outline = r() < 0.25;
    const paint = outline ? `fill="none" stroke="${col}" stroke-width="${fx(MIN * 0.008)}"` : `fill="${col}"`;
    body += `<path d="${blobPath(r, cx, cy, R)}" ${paint} opacity="${fx(outline ? 0.85 : rnd(r, 0.25, 0.9))}"/>`;
  }
  return { defs: '', body };
}

function genRibbons(r, cols) {
  let body = '';
  const base = rnd(r, -60, 60);
  const n = 3 + Math.floor(r() * 4);
  for (let k = 0; k < n; k++) {
    const col = cols[k % cols.length];
    const cx = rnd(r, 0, 1) * W, cy = rnd(r, 0, 1) * H;
    const len = DIAG * 1.6, th = rnd(r, 0.05, 0.2) * MIN;
    const ang = fx(base + rnd(r, -9, 9));
    body += `<rect x="${fx(cx - len / 2)}" y="${fx(cy - th / 2)}" width="${fx(len)}" height="${fx(th)}" rx="${fx(th / 2)}" fill="${col}" opacity="${fx(rnd(r, 0.35, 0.95))}" transform="rotate(${ang} ${fx(cx)} ${fx(cy)})"/>`;
  }
  return { defs: '', body };
}

function confettiShapes(r, cols, n) {
  let body = '';
  for (let k = 0; k < n; k++) {
    const col = cols[k % cols.length];
    const x = rnd(r, 0.02, 0.98) * W, y = rnd(r, 0.02, 0.98) * H;
    const s = rnd(r, 0.01, 0.028) * MIN;
    const rot = Math.floor(rnd(r, 0, 360));
    const op = fx(rnd(r, 0.5, 1));
    const t = Math.floor(r() * 5);
    const tr = `transform="rotate(${rot} ${fx(x)} ${fx(y)})"`;
    if (t === 0) body += `<circle cx="${fx(x)}" cy="${fx(y)}" r="${fx(s * 0.7)}" fill="${col}" opacity="${op}"/>`;
    else if (t === 1) body += `<rect x="${fx(x - s * 0.6)}" y="${fx(y - s * 0.6)}" width="${fx(s * 1.2)}" height="${fx(s * 1.2)}" fill="${col}" opacity="${op}" ${tr}/>`;
    else if (t === 2) body += `<polygon points="${fx(x)},${fx(y - s)} ${fx(x + s * 0.87)},${fx(y + s * 0.5)} ${fx(x - s * 0.87)},${fx(y + s * 0.5)}" fill="${col}" opacity="${op}" ${tr}/>`;
    else if (t === 3) body += `<path d="M${fx(x - s)} ${fx(y)} L${fx(x + s)} ${fx(y)} M${fx(x)} ${fx(y - s)} L${fx(x)} ${fx(y + s)}" stroke="${col}" stroke-width="${fx(s * 0.45)}" stroke-linecap="round" opacity="${op}" ${tr}/>`;
    else body += `<path d="M${fx(x - s * 2)} ${fx(y)} Q ${fx(x - s)} ${fx(y - s)}, ${fx(x)} ${fx(y)} T ${fx(x + s * 2)} ${fx(y)}" fill="none" stroke="${col}" stroke-width="${fx(s * 0.4)}" stroke-linecap="round" opacity="${op}" ${tr}/>`;
  }
  return body;
}

function genConfetti(r, cols) {
  const n = Math.max(30, Math.min(260, Math.round((W * H) / (1080 * 1080) * rnd(r, 70, 130))));
  return { defs: '', body: confettiShapes(r, cols, n) };
}

function genRings(r, cols) {
  let body = '';
  const cx = pick(r, [0, W * 0.5, W]) + rnd(r, -0.08, 0.08) * W;
  const cy = pick(r, [0, H * 0.5, H]) + rnd(r, -0.08, 0.08) * H;
  const n = 5 + Math.floor(r() * 4);
  for (let k = 0; k < n; k++) {
    const col = cols[k % cols.length];
    const rad = MIN * 0.14 * (k + 1) * rnd(r, 0.9, 1.12);
    const sw = MIN * rnd(r, 0.006, 0.03);
    body += `<circle cx="${fx(cx)}" cy="${fx(cy)}" r="${fx(rad)}" fill="none" stroke="${col}" stroke-width="${fx(sw)}" opacity="${fx(0.85 - 0.6 * (k / n))}"/>`;
  }
  body += `<circle cx="${fx(cx)}" cy="${fx(cy)}" r="${fx(MIN * 0.05)}" fill="${cols[0]}" opacity="0.9"/>`;
  return { defs: '', body };
}

function genGrid(r, cols) {
  let body = '';
  const spacing = MIN / (14 + Math.floor(r() * 10));
  const r0 = spacing * 0.14;
  for (let y = spacing / 2; y < H; y += spacing) {
    for (let x = spacing / 2; x < W; x += spacing) {
      if (r() < 0.12) continue;
      const a = 0.1 + 0.5 * ((x / W + y / H) / 2);
      body += `<circle cx="${fx(x)}" cy="${fx(y)}" r="${fx(r0)}" fill="${cols[(Math.floor(x / spacing) + Math.floor(y / spacing)) % 2]}" opacity="${fx(a)}"/>`;
    }
  }
  const nAcc = 1 + Math.floor(r() * 2);
  for (let k = 0; k < nAcc; k++) {
    body += `<circle cx="${fx(rnd(r, 0.15, 0.85) * W)}" cy="${fx(rnd(r, 0.15, 0.85) * H)}" r="${fx(rnd(r, 0.07, 0.15) * MIN)}" fill="${cols[(k + 2) % cols.length]}" opacity="0.9"/>`;
  }
  return { defs: '', body };
}

/* Track 1: New Procedural SVG Backgrounds */

function genHalftoneDuotone(r, cols) {
  let body = '';
  const c1 = roles.primary || cols[0];
  const c2 = roles.secondary || cols[1] || cols[0];
  const spacing = MIN / (26 + Math.floor(r() * 14));
  const maxR = spacing * 0.46;
  for (let y = spacing / 2; y < H; y += spacing) {
    for (let x = spacing / 2; x < W; x += spacing) {
      const n = r();
      const radius = maxR * (0.2 + n * 0.8);
      const col = n > 0.5 ? c1 : c2;
      const op = fx(0.35 + n * 0.55);
      body += `<circle cx="${fx(x)}" cy="${fx(y)}" r="${fx(radius)}" fill="${col}" opacity="${op}"/>`;
    }
  }
  return { defs: '', body };
}

function genTornPaperEdge(r, cols) {
  let body = '';
  const surfaceCol = roles.surface || mix(roles.bg, cols[0], 0.2);
  const nLayers = 2 + Math.floor(r() * 2);
  for (let L = 0; L < nLayers; L++) {
    const col = L === 0 ? surfaceCol : cols[L % cols.length];
    const op = fx(0.72 + 0.24 * (L / Math.max(1, nLayers - 1)));
    const yBase = H * (0.25 + 0.48 * (L / nLayers));
    let path = `M0 ${fx(yBase)} `;
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const x = (i / steps) * W;
      const jag = (r() - 0.5) * (0.045 * H);
      path += `L${fx(x)} ${fx(yBase + jag)} `;
    }
    path += `L${W} ${H} L0 ${H} Z`;
    body += `<path d="${path}" fill="${col}" opacity="${op}"/>`;
  }
  return { defs: '', body };
}

function genColorGradeOverlay(r, cols, uid) {
  const c1 = roles.primary || cols[0];
  const c2 = roles.accent || cols[1] || cols[0];
  const gradId = uid + 'duo';
  const defs = `<linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}" stop-opacity="0.65"/><stop offset="100%" stop-color="${c2}" stop-opacity="0.65"/></linearGradient>`;
  const body = `<rect width="${W}" height="${H}" fill="url(#${gradId})" opacity="0.85"/>`;
  return { defs, body };
}

const GEN = {
  aurora: genAurora,
  waves: genWaves,
  geometric: genGeometric,
  blobs: genBlobs,
  ribbons: genRibbons,
  confetti: genConfetti,
  rings: genRings,
  grid: genGrid,
  halftone: genHalftoneDuotone,
  tornpaper: genTornPaperEdge,
  duotone: genColorGradeOverlay
};

/* ---------------- compose N designs (Backgrounds only, zero text) ---------------- */

function grainRGB() { return theme.dark ? '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1' : '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0'; }

function genOne(i) {
  const r = mulberry32((seedBase + i * 7919 + 17) >>> 0);
  const style = theme.styles[i % theme.styles.length];
  const uid = 'd' + i + '_';
  const cols = shuffle(r, shapeCols);
  const parts = GEN[style](r, cols, uid);
  let defs = parts.defs || '';
  let body = parts.body;
  if ((theme.vibe === 'playful' || theme.vibe === 'bold') && style !== 'confetti' && r() < 0.35) {
    body += confettiShapes(r, cols, 24);
  }
  const grainOp = theme.vibe === 'minimal' ? 0.03 : 0.05;
  defs += `<filter id="${uid}gr" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="matrix" values="${grainRGB()}  0.55 0.55 0.55 0 0"/></filter>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs>${defs}</defs>` +
    `<rect width="${W}" height="${H}" fill="${roles.bg}"/>` +
    body +
    `<rect width="${W}" height="${H}" filter="url(#${uid}gr)" opacity="${grainOp}"/>` +
    `</svg>`;
  return { name: STYLE_LABEL[style] + ' ' + String(i + 1).padStart(2, '0'), style, svg };
}

const svgs = [];
for (let i = 0; i < count; i++) svgs.push(genOne(i));

/* ---------------- Track 1: Standalone Transparent Component Shapes ---------------- */

function genStickerShapes(th, rls, cols, seed, countNeeded) {
  const r = mulberry32((seed + 40409) >>> 0);
  const pal = [rls.primary, rls.secondary, rls.accent, rls.surface];
  const shapeTypes = ['star', 'blob', 'burst', 'ring', 'arrow', 'torn-edge', 'duotone-wash'];
  const total = Math.max(6, countNeeded || 6);
  const out = [];

  for (let i = 0; i < total; i++) {
    const kind = shapeTypes[i % shapeTypes.length];
    const c1 = pal[i % pal.length];
    const c2 = pal[(i + 1) % pal.length];
    const name = `Sticker ${kind.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} ${String(i + 1).padStart(2, '0')}`;
    const filename = `sticker-${kind}-${String(i + 1).padStart(2, '0')}`;
    let body = '';

    if (kind === 'star') {
      const pts = [];
      const nPts = r() > 0.5 ? 4 : 8;
      const R = 200, rIn = nPts === 4 ? 45 : 90;
      for (let j = 0; j < nPts * 2; j++) {
        const rad = j % 2 === 0 ? R : rIn;
        const ang = (j / (nPts * 2)) * Math.PI * 2 - Math.PI / 2;
        pts.push(`${fx(250 + Math.cos(ang) * rad)},${fx(250 + Math.sin(ang) * rad)}`);
      }
      body = `<polygon points="${pts.join(' ')}" fill="${c1}"/><circle cx="250" cy="250" r="28" fill="${c2}"/>`;
    } else if (kind === 'blob') {
      body = `<path d="${blobPath(r, 250, 250, 185)}" fill="${c1}"/>`;
    } else if (kind === 'burst') {
      const pts = [];
      const nPts = 16;
      for (let j = 0; j < nPts * 2; j++) {
        const rad = j % 2 === 0 ? 210 : 160;
        const ang = (j / (nPts * 2)) * Math.PI * 2;
        pts.push(`${fx(250 + Math.cos(ang) * rad)},${fx(250 + Math.sin(ang) * rad)}`);
      }
      body = `<polygon points="${pts.join(' ')}" fill="${c1}"/><circle cx="250" cy="250" r="105" fill="${c2}" opacity="0.85"/>`;
    } else if (kind === 'ring') {
      body = `<circle cx="250" cy="250" r="190" fill="none" stroke="${c1}" stroke-width="32"/>` +
             `<circle cx="250" cy="250" r="140" fill="none" stroke="${c2}" stroke-width="12" stroke-dasharray="14 12"/>` +
             `<circle cx="250" cy="250" r="55" fill="${c1}"/>`;
    } else if (kind === 'arrow') {
      body = `<path d="M120 200 L260 200 L260 120 L380 250 L260 380 L260 300 L120 300 Z" fill="${c1}"/>`;
    } else if (kind === 'torn-edge') {
      let d = 'M60 90 ';
      for (let x = 60; x <= 440; x += 20) {
        d += `L${fx(x)} ${fx(90 + (r() - 0.5) * 24)} `;
      }
      d += 'L440 410 ';
      for (let x = 440; x >= 60; x -= 20) {
        d += `L${fx(x)} ${fx(410 + (r() - 0.5) * 24)} `;
      }
      d += 'Z';
      body = `<path d="${d}" fill="${c1}" opacity="0.9"/>`;
    } else { // duotone-wash
      body = `<defs><linearGradient id="wash${i}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}" stop-opacity="0.85"/><stop offset="100%" stop-color="${c2}" stop-opacity="0.85"/></linearGradient></defs>` +
             `<rect x="50" y="50" width="400" height="400" rx="80" fill="url(#wash${i})"/>`;
    }

    // Transparent SVG: no background rect, no text, clean viewBox
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">${body}</svg>`;
    out.push({ name, filename, style: kind, svg, W: 500, H: 500 });
  }
  return out;
}

const components = genStickerShapes(theme, roles, shapeCols, seedBase, 6);

/* ---------------- Track 2: Image-Model Prompts ---------------- */

const moodDesc = theme.mood || theme.name || 'modern-creative';
const pCol = roles.primary;
const sCol = roles.secondary;
const aCol = roles.accent;

const imagePrompts = {
  textureBackground: `Abstract textured background, ${moodDesc} aesthetic. Vintage paper grain texture with subtle halftone dot pattern. Muted duotone color grade using ${pCol} and ${sCol}. No text, no letters, no words, no logos, no people, no faces, no objects — pure abstract texture only. Flat even lighting, no vignette, edge-to-edge texture, seamless.`,
  components: [
    { name: 'Vintage Flower Illustration', prompt: `A single isolated vintage flower illustration in collage-art style, ${moodDesc} aesthetic, ${pCol} and ${aCol} color palette. Centered on a plain flat white background for easy background removal. No text, no shadows, no other objects, no scene, no environment — just the one object, clean edges, vector-illustration style.` },
    { name: 'Retro Boombox Line-Art', prompt: `A single isolated retro boombox line-art in collage-art style, ${moodDesc} aesthetic, ${pCol} and ${aCol} color palette. Centered on a plain flat white background for easy background removal. No text, no shadows, no other objects, no scene, no environment — just the one object, clean edges, vector-illustration style.` },
    { name: 'Torn Paper Scrap', prompt: `A single isolated torn paper scrap in collage-art style, ${moodDesc} aesthetic, ${pCol} and ${aCol} color palette. Centered on a plain flat white background for easy background removal. No text, no shadows, no other objects, no scene, no environment — just the one object, clean edges, vector-illustration style.` },
    { name: 'Halftone Sun Burst Shape', prompt: `A single isolated halftone sun burst shape in collage-art style, ${moodDesc} aesthetic, ${pCol} and ${aCol} color palette. Centered on a plain flat white background for easy background removal. No text, no shadows, no other objects, no scene, no environment — just the one object, clean edges, vector-illustration style.` },
    { name: 'Abstract Squiggle Line Doodle', prompt: `A single isolated abstract squiggle line doodle in collage-art style, ${moodDesc} aesthetic, ${pCol} and ${aCol} color palette. Centered on a plain flat white background for easy background removal. No text, no shadows, no other objects, no scene, no environment — just the one object, clean edges, vector-illustration style.` }
  ]
};

/* ---------------- typography + export files ---------------- */

function fontWeights(fam) {
  if (SINGLE_WEIGHT.includes(fam)) return '400';
  return '400;700';
}
function gfUrl(fams) {
  const seen = {};
  const parts = [];
  for (const f of fams) {
    if (seen[f.family]) continue;
    seen[f.family] = 1;
    parts.push('family=' + f.family.replace(/ /g, '+') + ':wght@' + f.weights);
  }
  return 'https://fonts.googleapis.com/css2?' + parts.join('&') + '&display=swap';
}
const themeFontsHref = gfUrl([
  { family: headerFont, weights: fontWeights(headerFont) },
  { family: bodyFont, weights: fontWeights(bodyFont) }
]);
const headerStack = `'${headerFont}', ${SERIF.includes(headerFont) ? 'serif' : MONO.includes(headerFont) ? 'monospace' : 'sans-serif'}`;
const bodyStack = `'${bodyFont}', ${MONO.includes(bodyFont) ? 'monospace' : 'sans-serif'}`;
const hWeight = SINGLE_WEIGHT.includes(headerFont) ? 400 : 700;

const TYPE_SPEC = [
  { el: 'Header / H1', font: headerFont, weight: hWeight, size: 'clamp(2.8rem, 6vw, 4.5rem)', lh: '1.05', ls: SINGLE_WEIGHT.includes(headerFont) ? '0.01em' : '-0.02em', extra: '' },
  { el: 'Subheader / H2', font: headerFont, weight: SINGLE_WEIGHT.includes(headerFont) ? 400 : 600, size: 'clamp(1.5rem, 3vw, 2.25rem)', lh: '1.15', ls: '-0.01em', extra: '' },
  { el: 'Body', font: bodyFont, weight: 400, size: '1rem', lh: '1.65', ls: '0', extra: '' },
  { el: 'Caption / Label', font: bodyFont, weight: 700, size: '0.8rem', lh: '1.4', ls: '0.09em', extra: 'text-transform: uppercase;' }
];

const cssFile = `/* ${theme.name} — design tokens generated by Design Agent */
@import url('${themeFontsHref}');

:root {
  --color-bg: ${roles.bg};
  --color-surface: ${roles.surface};
  --color-primary: ${roles.primary};
  --color-secondary: ${roles.secondary};
  --color-accent: ${roles.accent};
  --color-text: ${roles.text};
  --color-muted: ${roles.muted};
${theme.colors.map((c, i) => `  --color-brand-${i + 1}: ${c};`).join('\n')}
  --font-display: ${headerStack};
  --font-body: ${bodyStack};
}

h1 { font: ${TYPE_SPEC[0].weight} ${TYPE_SPEC[0].size}/${TYPE_SPEC[0].lh} var(--font-display); letter-spacing: ${TYPE_SPEC[0].ls}; color: var(--color-text); }
h2 { font: ${TYPE_SPEC[1].weight} ${TYPE_SPEC[1].size}/${TYPE_SPEC[1].lh} var(--font-display); letter-spacing: ${TYPE_SPEC[1].ls}; color: var(--color-text); }
body { font: ${TYPE_SPEC[2].weight} ${TYPE_SPEC[2].size}/${TYPE_SPEC[2].lh} var(--font-body); color: var(--color-text); background: var(--color-bg); }
.caption { font: ${TYPE_SPEC[3].weight} ${TYPE_SPEC[3].size}/${TYPE_SPEC[3].lh} var(--font-body); letter-spacing: ${TYPE_SPEC[3].ls}; ${TYPE_SPEC[3].extra} color: var(--color-muted); }
`;

const slug = theme.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'theme';

const themeJson = JSON.stringify({
  name: theme.name,
  brief,
  source,
  mood: theme.mood || theme.name,
  vibe: theme.vibe,
  dark: theme.dark,
  rationale: theme.rationale,
  colors: theme.colors,
  roles,
  typography: {
    header: { family: headerFont, weight: hWeight, fallback: SERIF.includes(headerFont) ? 'serif' : 'sans-serif' },
    body: { family: bodyFont, weight: 400 },
    scale: TYPE_SPEC,
    googleFontsUrl: themeFontsHref
  },
  canvas: { key: sizeKey, width: W, height: H },
  seed: seedBase,
  styles: theme.styles,
  imagePrompts
}, null, 2);

/* ---------------- gallery page ---------------- */

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const rerollSeed = Math.floor(Math.random() * 999983) + 1;
const qsBase = 'brief=' + encodeURIComponent(brief) + '&count=' + count + '&size=' + encodeURIComponent(sizeKey);
const rerollHref = '?' + qsBase + '&seed=' + rerollSeed;

const DATA = {
  W, H, sizeKey, slug,
  theme: { name: theme.name, mood: theme.mood || theme.name, vibe: theme.vibe, dark: theme.dark, colors: theme.colors, roles, source },
  svgs,
  components,
  imagePrompts,
  files: { css: cssFile, themeJson }
};
const dataJson = JSON.stringify(DATA).replace(/</g, '\\u003c');

const roleOrder = ['bg', 'surface', 'primary', 'secondary', 'accent', 'text', 'muted'];
const roleSwatches = roleOrder.map(k => {
  const c = roles[k];
  const tcol = lum(c) > 0.45 ? '#14161c' : '#f7f8fa';
  return `<div class="swatch" data-copy="${c}" style="background:${c};color:${tcol}"><span class="role">${k}</span><span class="hex">${c.toUpperCase()}</span></div>`;
}).join('');
const brandSwatches = theme.colors.map((c, i) => {
  const tcol = lum(c) > 0.45 ? '#14161c' : '#f7f8fa';
  return `<div class="swatch small" data-copy="${c}" style="background:${c};color:${tcol}"><span class="role">brand-${i + 1}</span><span class="hex">${c.toUpperCase()}</span></div>`;
}).join('');

const specRows = TYPE_SPEC.map(t =>
  `<tr><td>${t.el}</td><td>${t.font}</td><td>${t.weight}</td><td>${t.size}</td><td>${t.lh}</td><td>${t.ls}</td></tr>`
).join('');

const cards = svgs.map((d, i) =>
  `<div class="card">
    <div class="prev" id="prev${i}"></div>
    <div class="cardbar">
      <span class="cardname">${esc(d.name)}</span>
      <span class="cardbtns">
        <button class="mini btn-svg" data-i="${i}">SVG</button>
        <button class="mini btn-png" data-i="${i}">PNG</button>
      </span>
    </div>
  </div>`
).join('');

const compCards = components.map((c, i) =>
  `<div class="card comp-card">
    <div class="comp-prev" id="cprev${i}"></div>
    <div class="cardbar">
      <span class="cardname">${esc(c.name)}</span>
      <span class="cardbtns">
        <button class="mini btn-comp-svg" data-ci="${i}">SVG</button>
        <button class="mini btn-comp-png" data-ci="${i}">PNG</button>
      </span>
    </div>
  </div>`
).join('');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(theme.name)} — Design Kit</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link href="${themeFontsHref}" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<style>
  :root { --bg:#0b0d14; --card:#141826; --line:#252b3f; --text:#eef0f6; --muted:#98a0b8; --accent:#7c6cff; --accent2:#22d3ee; }
  * { box-sizing:border-box; margin:0; }
  body { background:var(--bg); color:var(--text); font:15px/1.6 Inter, system-ui, sans-serif; padding-bottom:80px; }
  .wrap { max-width:1180px; margin:0 auto; padding:0 24px; }
  header { padding:40px 0 8px; }
  .chips { display:flex; gap:8px; flex-wrap:wrap; margin:14px 0 6px; }
  .chip { font:600 12px/1 Inter; letter-spacing:.06em; text-transform:uppercase; padding:7px 12px; border-radius:99px; border:1px solid var(--line); color:var(--muted); background:var(--card); }
  .chip.hl { color:#fff; background:linear-gradient(90deg, var(--accent), var(--accent2)); border:0; }
  h1.title { font:700 44px/1.1 'Space Grotesk', sans-serif; letter-spacing:-.01em; }
  p.rationale { color:var(--muted); max-width:720px; margin-top:10px; }
  .toplinks { margin-top:16px; display:flex; gap:10px; flex-wrap:wrap; }
  a.btn, button.btn { display:inline-block; text-decoration:none; cursor:pointer; border:1px solid var(--line); background:var(--card); color:var(--text); border-radius:10px; padding:10px 16px; font:600 13.5px Inter; }
  a.btn:hover, button.btn:hover { border-color:var(--accent); }
  button.btn.primary { background:linear-gradient(90deg, var(--accent), var(--accent2)); border:0; color:#fff; }
  h2.sec { font:700 22px 'Space Grotesk', sans-serif; margin:44px 0 16px; display:flex; align-items:center; gap:12px; }
  h2.sec::after { content:''; flex:1; height:1px; background:var(--line); }
  .sechint { color:var(--muted); font-size:13.5px; margin:-8px 0 18px; }
  .swatches { display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:10px; }
  .swatch { border-radius:12px; padding:18px 14px; min-height:92px; display:flex; flex-direction:column; justify-content:space-between; cursor:pointer; border:1px solid rgba(255,255,255,.08); }
  .swatch.small { min-height:72px; padding:12px 14px; }
  .swatch .role { font:600 11px/1 Inter; letter-spacing:.08em; text-transform:uppercase; opacity:.8; }
  .swatch .hex { font:600 13px/1 'Space Grotesk', monospace; }
  .brandrow { margin-top:10px; }
  .typo { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:28px; }
  .typo .sample-h1 { font-family:${headerStack.replace(/"/g, '&quot;')}; font-weight:${hWeight}; font-size:clamp(2.2rem,5vw,3.6rem); line-height:1.05; letter-spacing:${TYPE_SPEC[0].ls}; }
  .typo .sample-h2 { font-family:${headerStack.replace(/"/g, '&quot;')}; font-weight:${TYPE_SPEC[1].weight}; font-size:clamp(1.3rem,2.6vw,1.9rem); line-height:1.15; margin-top:14px; color:var(--muted); }
  .typo .sample-body { font-family:${bodyStack.replace(/"/g, '&quot;')}; font-size:1rem; line-height:1.65; margin-top:16px; max-width:640px; }
  .typo .sample-cap { font-family:${bodyStack.replace(/"/g, '&quot;')}; font-weight:700; font-size:.8rem; letter-spacing:.09em; text-transform:uppercase; margin-top:16px; color:var(--muted); }
  table.spec { width:100%; border-collapse:collapse; margin-top:22px; font-size:13.5px; }
  table.spec th, table.spec td { text-align:left; padding:9px 12px; border-bottom:1px solid var(--line); }
  table.spec th { color:var(--muted); font:600 11px/1 Inter; letter-spacing:.07em; text-transform:uppercase; }
  .typo .btns { margin-top:20px; display:flex; gap:10px; flex-wrap:wrap; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:18px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; overflow:hidden; }
  .prev { background:#000; }
  .prev svg { width:100%; height:auto; display:block; }
  .cardbar { display:flex; justify-content:space-between; align-items:center; padding:10px 12px; }
  .cardname { font:600 13px 'Space Grotesk', sans-serif; color:var(--muted); }
  button.mini { border:1px solid var(--line); background:#0e1220; color:var(--text); border-radius:8px; padding:6px 10px; font:600 12px Inter; cursor:pointer; }
  button.mini:hover { border-color:var(--accent2); }

  /* Standalone Components / Stickers Grid (Checkerboard for transparency) */
  .comp-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:18px; }
  .comp-prev {
    background-color:#161a29;
    background-image:linear-gradient(45deg, #1f2538 25%, transparent 25%), linear-gradient(-45deg, #1f2538 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1f2538 75%), linear-gradient(-45deg, transparent 75%, #1f2538 75%);
    background-size:16px 16px;
    background-position:0 0, 0 8px, 8px -8px, -8px 0px;
    padding:24px;
    display:flex;
    align-items:center;
    justify-content:center;
    min-height:190px;
  }
  .comp-prev svg { max-width:140px; max-height:140px; width:100%; height:auto; display:block; filter:drop-shadow(0 6px 16px rgba(0,0,0,0.4)); }

  /* Track 2 Image Prompts */
  .prompt-card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:20px; margin-bottom:14px; }
  .prompt-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
  .prompt-title { font:600 14px 'Space Grotesk', sans-serif; color:#fff; }
  .prompt-body { background:#0e1220; border:1px solid var(--line); border-radius:8px; padding:12px 14px; font:13px/1.6 Inter, monospace; color:var(--muted); white-space:pre-wrap; }
  .prompt-sublist { display:grid; grid-template-columns:1fr; gap:10px; margin-top:10px; }
  .prompt-subitem { background:#0e1220; border:1px solid var(--line); border-radius:8px; padding:12px 14px; display:flex; flex-direction:column; gap:6px; }
  .prompt-subhead { display:flex; justify-content:space-between; align-items:center; }
  .prompt-subname { font:600 12.5px Inter; color:var(--text); }

  #toast { position:fixed; left:50%; bottom:28px; transform:translateX(-50%) translateY(80px); background:#fff; color:#111; font:600 13.5px Inter; padding:11px 18px; border-radius:10px; transition:transform .25s; z-index:9; }
  #toast.show { transform:translateX(-50%) translateY(0); }
  footer { margin-top:56px; color:var(--muted); font-size:12.5px; }
  code { background:#0e1220; border:1px solid var(--line); border-radius:6px; padding:1px 6px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="chips">
      <span class="chip hl">${esc(theme.vibe)}</span>
      <span class="chip">${theme.dark ? 'dark' : 'light'} theme</span>
      <span class="chip">${W}&times;${H}</span>
      <span class="chip">${count} backgrounds</span>
      <span class="chip">${components.length} stickers</span>
      <span class="chip">${esc(source)}</span>
    </div>
    <h1 class="title">${esc(theme.name)}</h1>
    ${theme.rationale ? `<p class="rationale">${esc(theme.rationale)}</p>` : ''}
    ${brief ? `<p class="rationale">Brief: &ldquo;${esc(brief)}&rdquo;</p>` : ''}
    <div class="toplinks">
      <button class="btn primary" id="zip-all">&darr; Download full kit (ZIP)</button>
      <a class="btn" href="${rerollHref}">&#127922; Reroll designs</a>
      <a class="btn" href="?">&larr; New brief</a>
    </div>
  </header>

  <h2 class="sec">Color palette</h2>
  <div class="swatches">${roleSwatches}</div>
  <div class="swatches brandrow">${brandSwatches}</div>

  <h2 class="sec">Typography</h2>
  <div class="typo">
    <div class="sample-cap">Caption &middot; ${esc(bodyFont)} 700</div>
    <div class="sample-h1">Design once, generate forever.</div>
    <div class="sample-h2">Subheader in ${esc(headerFont)} &mdash; set the tone, keep the rhythm</div>
    <div class="sample-body">Body text in ${esc(bodyFont)}. This paragraph shows measure, rhythm and contrast on real copy. Use it for descriptions, agendas, speaker bios and long-form website content. Click any swatch above to copy its hex.</div>
    <table class="spec">
      <tr><th>Element</th><th>Font</th><th>Weight</th><th>Size</th><th>Line height</th><th>Tracking</th></tr>
      ${specRows}
    </table>
    <div class="btns">
      <button class="btn" id="copy-css">Copy CSS tokens</button>
      <button class="btn" id="copy-link">Copy Google Fonts &lt;link&gt;</button>
      <button class="btn" id="dl-json">Download theme.json</button>
    </div>
  </div>

  <h2 class="sec">Backgrounds (Zero Text)</h2>
  <p class="sechint">Full-bleed generative poster backgrounds with pure visual atmosphere &mdash; ready for headline and copy placement.</p>
  <div class="grid">${cards}</div>

  <h2 class="sec">Components &amp; Stickers (Transparent)</h2>
  <p class="sechint">Standalone transparent vector assets &mdash; no background fill, no text. Ideal for collage layering, stamps, stickers, and badges.</p>
  <div class="comp-grid">${compCards}</div>

  <h2 class="sec">Image Model Prompts (Track 2)</h2>
  <p class="sechint">Ready-to-use prompts with this kit's exact mood and palette for Pollinations, Cloudflare AI, FLUX, or Midjourney. Run isolated components through rembg for instant alpha cutouts.</p>
  <div class="prompt-card">
    <div class="prompt-head">
      <span class="prompt-title">Abstract Texture Background Prompt</span>
      <button class="mini" id="copy-bg-prompt">Copy Prompt</button>
    </div>
    <div class="prompt-body" id="bg-prompt-text">${esc(imagePrompts.textureBackground)}</div>
  </div>
  <div class="prompt-card">
    <div class="prompt-head">
      <span class="prompt-title">Isolated Component Prompts (White Background &rarr; rembg)</span>
      <button class="mini" id="copy-all-prompts">Copy All Prompts</button>
    </div>
    <div class="prompt-sublist">
      ${imagePrompts.components.map((cp, idx) => `
        <div class="prompt-subitem">
          <div class="prompt-subhead">
            <span class="prompt-subname">${esc(cp.name)}</span>
            <button class="mini btn-copy-cp" data-cidx="${idx}">Copy</button>
          </div>
          <div class="prompt-body" id="cp-text-${idx}">${esc(cp.prompt)}</div>
        </div>
      `).join('')}
    </div>
  </div>

  <footer>Generated by Design Agent &middot; seed <code>${seedBase}</code> &middot; call with <code>?brief=...&amp;count=${count}&amp;size=${esc(sizeKey)}&amp;seed=${seedBase}</code> to reproduce this exact kit.</footer>
</div>

<div id="toast">Copied</div>
<script type="application/json" id="design-data">${dataJson}</script>
<script>
(function () {
  var DATA = JSON.parse(document.getElementById('design-data').textContent);
  var FONTS_LINK = '<link href="${themeFontsHref}" rel="stylesheet">';

  DATA.svgs.forEach(function (d, i) {
    var el = document.getElementById('prev' + i);
    if (el) el.innerHTML = d.svg;
  });

  DATA.components.forEach(function (c, i) {
    var el = document.getElementById('cprev' + i);
    if (el) el.innerHTML = c.svg;
  });

  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, 1600);
  }
  function copyText(s, msg) {
    function done() { toast(msg || 'Copied'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(s).then(done, function () { fallbackCopy(s); done(); });
    } else { fallbackCopy(s); done(); }
  }
  function fallbackCopy(s) {
    var ta = document.createElement('textarea');
    ta.value = s; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }
  function saveBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function fileBase(i) {
    return DATA.slug + '-' + DATA.svgs[i].style + '-' + (i + 1);
  }
  function pngBlob(svg, w, h, cb) {
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = w || DATA.W; c.height = h || DATA.H;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(cb, 'image/png');
    };
    img.onerror = function () { toast('PNG render failed — download the SVG instead'); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  document.querySelectorAll('.swatch').forEach(function (el) {
    el.addEventListener('click', function () { copyText(el.getAttribute('data-copy'), el.getAttribute('data-copy') + ' copied'); });
  });

  // Background downloads
  document.querySelectorAll('.btn-svg').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = +b.getAttribute('data-i');
      saveBlob(new Blob([DATA.svgs[i].svg], { type: 'image/svg+xml' }), fileBase(i) + '.svg');
    });
  });
  document.querySelectorAll('.btn-png').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = +b.getAttribute('data-i');
      b.textContent = '...';
      pngBlob(DATA.svgs[i].svg, DATA.W, DATA.H, function (blob) {
        b.textContent = 'PNG';
        if (blob) saveBlob(blob, fileBase(i) + '.png');
      });
    });
  });

  // Component sticker downloads
  document.querySelectorAll('.btn-comp-svg').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = +b.getAttribute('data-ci');
      saveBlob(new Blob([DATA.components[i].svg], { type: 'image/svg+xml' }), DATA.components[i].filename + '.svg');
    });
  });
  document.querySelectorAll('.btn-comp-png').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = +b.getAttribute('data-ci');
      b.textContent = '...';
      pngBlob(DATA.components[i].svg, 500, 500, function (blob) {
        b.textContent = 'PNG';
        if (blob) saveBlob(blob, DATA.components[i].filename + '.png');
      });
    });
  });

  // CSS and link copy
  document.getElementById('copy-css').addEventListener('click', function () { copyText(DATA.files.css, 'CSS tokens copied'); });
  document.getElementById('copy-link').addEventListener('click', function () { copyText(FONTS_LINK, 'Google Fonts link copied'); });
  document.getElementById('dl-json').addEventListener('click', function () {
    saveBlob(new Blob([DATA.files.themeJson], { type: 'application/json' }), DATA.slug + '-theme.json');
  });

  // Prompt copies
  var bgPromptEl = document.getElementById('copy-bg-prompt');
  if (bgPromptEl) {
    bgPromptEl.addEventListener('click', function () { copyText(DATA.imagePrompts.textureBackground, 'Texture prompt copied'); });
  }
  var allPromptsEl = document.getElementById('copy-all-prompts');
  if (allPromptsEl) {
    allPromptsEl.addEventListener('click', function () {
      var full = DATA.imagePrompts.components.map(function (cp) { return '## ' + cp.name + '\n' + cp.prompt; }).join('\n\n');
      copyText(full, 'All component prompts copied');
    });
  }
  document.querySelectorAll('.btn-copy-cp').forEach(function (b) {
    b.addEventListener('click', function () {
      var idx = +b.getAttribute('data-cidx');
      copyText(DATA.imagePrompts.components[idx].prompt, DATA.imagePrompts.components[idx].name + ' prompt copied');
    });
  });

  // ZIP download (organizes into backgrounds/ and components/)
  document.getElementById('zip-all').addEventListener('click', function () {
    var btn = this;
    if (typeof JSZip === 'undefined') { toast('JSZip CDN unreachable — download files individually'); return; }
    btn.disabled = true;
    btn.textContent = 'Packing files...';
    var zip = new JSZip();
    zip.file('theme.json', DATA.files.themeJson);
    zip.file('typography.css', DATA.files.css);
    zip.file('README.txt',
      DATA.theme.name + ' — design kit\n\n' +
      'backgrounds/      Full-bleed background designs (no text, vector SVG + PNG)\n' +
      'components/       Standalone transparent stickers & shape overlays\n' +
      'theme.json        Palette, roles, fonts, seed & image-model prompts\n' +
      'typography.css    Drop-in CSS tokens + Google Fonts import\n');

    DATA.svgs.forEach(function (d, i) {
      zip.file('backgrounds/' + fileBase(i) + '.svg', d.svg);
    });
    DATA.components.forEach(function (c) {
      zip.file('components/' + c.filename + '.svg', c.svg);
    });

    var allRenders = [];
    DATA.svgs.forEach(function (d, i) {
      allRenders.push({ path: 'backgrounds/' + fileBase(i) + '.png', svg: d.svg, w: DATA.W, h: DATA.H });
    });
    DATA.components.forEach(function (c) {
      allRenders.push({ path: 'components/' + c.filename + '.png', svg: c.svg, w: 500, h: 500 });
    });

    var total = allRenders.length;
    var idx = 0;
    function next() {
      if (idx >= total) {
        zip.generateAsync({ type: 'blob' }).then(function (blob) {
          saveBlob(blob, DATA.slug + '-design-kit.zip');
          btn.disabled = false;
          btn.textContent = '↓ Download full kit (ZIP)';
        });
        return;
      }
      var item = allRenders[idx++];
      btn.textContent = 'Packing ' + idx + '/' + total + '...';
      pngBlob(item.svg, item.w, item.h, function (blob) {
        if (blob) zip.file(item.path, blob);
        next();
      });
    }
    next();
  });
})();
</script>
</body>
</html>`;

return [{ json: { html } }];
