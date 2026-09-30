// Local smoke test for the n8n Code-node sources (no n8n needed).
// Run: node test/run-local.js
// Writes test/preview-ai.html and test/preview-fallback.html — open them in a browser.

const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');

function runNode(src, { query = {}, input = {} } = {}) {
  const $ = name => {
    if (name !== 'Webhook Trigger') throw new Error('unknown node ref: ' + name);
    return { first: () => ({ json: { query } }) };
  };
  const $input = { first: () => ({ json: input }), all: () => [{ json: input }] };
  const fn = new Function('$', '$input', src);
  return fn($, $input);
}

function extractData(html) {
  const m = /<script type="application\/json" id="design-data">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('design-data block missing');
  return JSON.parse(m[1]);
}

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok  :', msg);
}

/* 1 — prepare-claude / prepare-theme */
const prep = runNode(read('prepare-claude.js'), { input: { query: { brief: 'Diwali tech fest at campus' } } });
assert(prep[0].json.body.model.includes('llama') || prep[0].json.body.model.includes('70b'), 'prepare: model configured for fast inference');
assert(prep[0].json.body.messages[1].content.includes('Diwali'), 'prepare: brief lands in the user message');
assert(prep[0].json.body.messages[0].content.includes('STEP 1'), 'prepare: system prompt defines color theory steps');
assert(prep[0].json.body.messages[0].content.includes('Orbitron'), 'prepare: font whitelist includes expanded fonts');

/* 2 — generate, OpenAI/Groq path with reasoning leakage (<think> tags and code fences) */
const aiThemeNewSchema = {
  mood: 'festive-modern',
  dark: true,
  palette: {
    bg: '#1a0f2e',
    surface: '#2d1b4e',
    primary: '#ff6b35',
    secondary: '#f7c548',
    accent: '#e63946',
    text: '#fff8f0',
    muted: '#b8a9c9'
  },
  backgroundStyles: ['halftone', 'tornpaper', 'duotone', 'aurora'],
  fonts: {
    header: 'Poppins',
    subheader: 'Poppins',
    body: 'Inter',
    caption: 'Inter'
  }
};

// Simulate a reasoning model that emits <think> reasoning and markdown fences
const simulatedModelText =
  `<think>\n` +
  `The user wants a Diwali tech fest at campus.\n` +
  `Mood is festive-modern. Color palette should have diya oranges, deep purples, and vibrant accents.\n` +
  `Styles should include halftone, tornpaper, and duotone.\n` +
  `</think>\n\n` +
  `\`\`\`json\n` +
  JSON.stringify(aiThemeNewSchema, null, 2) +
  `\n\`\`\``;

const groqResp = {
  model: 'llama-3.3-70b-versatile',
  choices: [
    {
      message: {
        role: 'assistant',
        content: simulatedModelText
      }
    }
  ]
};

const gen1 = runNode(read('generate-designs.js'), {
  query: { brief: 'Diwali tech fest at campus', count: '6', size: 'insta', seed: '42' },
  input: groqResp
});
const html1 = gen1[0].json.html;
const data1 = extractData(html1);

assert(data1.svgs.length === 6, 'generate/ai: 6 background designs produced');
assert(data1.W === 1080 && data1.H === 1080, 'generate/ai: insta canvas 1080x1080');
assert(data1.theme.source === 'llama-3.3-70b-versatile', 'generate/ai: theme attributed to model');
assert(data1.theme.name === 'Festive Modern', 'generate/ai: mood capitalized into theme name');
assert(data1.theme.roles.primary === '#ff6b35', 'generate/ai: direct palette primary role preserved');
assert(data1.theme.roles.bg === '#1a0f2e', 'generate/ai: direct palette bg role preserved');

// Verify background SVGs have ZERO text
for (const d of data1.svgs) {
  assert(d.svg.startsWith('<svg') && d.svg.endsWith('</svg>'), 'generate/ai: svg well-formed shell (' + d.name + ')');
  assert(!d.svg.includes('<text') && !d.svg.includes('<tspan'), 'generate/ai: zero text in background (' + d.name + ')');
  assert(!d.svg.includes('NaN') && !d.svg.includes('undefined'), 'generate/ai: no NaN/undefined in ' + d.name);
}

// Track 1 — Standalone transparent component stickers verification
assert(Array.isArray(data1.components) && data1.components.length >= 6, 'generate/components: standalone component stickers generated');
for (const c of data1.components) {
  assert(c.svg.startsWith('<svg') && c.svg.endsWith('</svg>'), 'generate/components: valid SVG shell for ' + c.name);
  assert(!c.svg.includes('<text'), 'generate/components: zero text in component ' + c.name);
  assert(!c.svg.includes('<rect width="500" height="500" fill="#'), 'generate/components: transparent background (no solid rect canvas) in ' + c.name);
  assert(c.svg.includes('viewBox="0 0 500 500"'), 'generate/components: viewBox standard 0 0 500 500 in ' + c.name);
}

// Track 2 — Image-model prompts verification
assert(data1.imagePrompts && typeof data1.imagePrompts.textureBackground === 'string', 'generate/track2: textureBackground prompt generated');
assert(data1.imagePrompts.textureBackground.includes('Abstract textured background'), 'generate/track2: texture prompt includes texture styling');
assert(Array.isArray(data1.imagePrompts.components) && data1.imagePrompts.components.length === 5, 'generate/track2: 5 isolated component prompts generated');
assert(data1.imagePrompts.components[0].prompt.includes('Centered on a plain flat white background for easy background removal'), 'generate/track2: component prompt includes rembg white background instruction');

assert(!data1.files.css.includes('undefined') && !data1.files.themeJson.includes('undefined'), 'generate/ai: export files clean');
assert(html1.includes('fonts.googleapis.com/css2?family=Poppins'), 'generate/ai: Google Fonts link present');
assert(html1.includes('Standalone Components &amp; Stickers') || html1.includes('Standalone Components'), 'generate/ai: HTML gallery displays component stickers section');
assert(html1.includes('Image Model Prompts'), 'generate/ai: HTML gallery displays image model prompts section');

/* 3 — reproducibility: same seed → identical designs */
const gen1b = runNode(read('generate-designs.js'), {
  query: { brief: 'Diwali tech fest at campus', count: '6', size: 'insta', seed: '42' },
  input: groqResp
});
assert(JSON.stringify(extractData(gen1b[0].json.html).svgs) === JSON.stringify(data1.svgs), 'generate: seed 42 reproduces identical background SVGs');
assert(JSON.stringify(extractData(gen1b[0].json.html).components) === JSON.stringify(data1.components), 'generate: seed 42 reproduces identical component stickers');

/* 4 — backward compatibility: legacy Claude theme schema */
const legacyTheme = {
  name: 'Retro Circuit',
  colors: ['#00E5FF', '#7C4DFF', '#00FFA3', '#FF3D81', '#0A0F2C'],
  dark: true,
  vibe: 'tech',
  styles: ['halftone', 'geometric', 'aurora'],
  header_font: 'Orbitron',
  body_font: 'IBM Plex Mono',
  rationale: 'Retro sci-fi tech vibes with neon glow.'
};
const genLegacy = runNode(read('generate-designs.js'), {
  query: { brief: 'cyberpunk conference', count: '4', size: 'story' },
  input: { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(legacyTheme) }] }
});
const dataLegacy = extractData(genLegacy[0].json.html);
assert(dataLegacy.theme.name === 'Retro Circuit', 'generate/legacy: legacy schema parsed successfully');
assert(dataLegacy.svgs.length === 4, 'generate/legacy: 4 designs produced for story size');

/* 5 — generate, fallback path (API failed / no credential) */
const gen2 = runNode(read('generate-designs.js'), {
  query: { brief: 'corporate finance summit 2026', count: '4', size: 'a4' },
  input: { error: { message: 'no credentials' } }
});
const data2 = extractData(gen2[0].json.html);
assert(data2.svgs.length === 4, 'generate/fallback: 4 designs produced');
assert(data2.W === 2480 && data2.H === 3508, 'generate/fallback: A4 print canvas');
assert(data2.theme.source === 'Built-in theme engine', 'generate/fallback: built-in engine attributed');
for (const d of data2.svgs) assert(!d.svg.includes('NaN') && !d.svg.includes('undefined'), 'generate/fallback: clean svg ' + d.name);

/* 6 — custom size */
const gen3 = runNode(read('generate-designs.js'), {
  query: { brief: 'music night', count: '2', size: '1200x628' },
  input: {}
});
const data3 = extractData(gen3[0].json.html);
assert(data3.W === 1200 && data3.H === 628, 'generate: custom size 1200x628 honored');

/* 7 — refusal stop_reason falls back */
const gen4 = runNode(read('generate-designs.js'), {
  query: { brief: 'yoga retreat', count: '3', size: 'hero' },
  input: { stop_reason: 'refusal', content: [{ type: 'text', text: 'nope' }] }
});
assert(extractData(gen4[0].json.html).theme.source === 'Built-in theme engine', 'generate: refusal → fallback engine');

/* 8 — form page */
const form = runNode(read('form-page.js'), {});
assert(form[0].json.html.includes('<form') && form[0].json.html.includes('name="brief"'), 'form: renders brief form');

fs.writeFileSync(path.join(__dirname, 'preview-ai.html'), html1);
fs.writeFileSync(path.join(__dirname, 'preview-fallback.html'), gen2[0].json.html);
console.log('\npreviews → test/preview-ai.html, test/preview-fallback.html');
if (process.exitCode) { console.error('\nSOME TESTS FAILED'); } else { console.log('ALL TESTS PASSED'); }
