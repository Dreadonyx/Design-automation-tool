# Design Agent — n8n workflow

An agentic design-kit generator that runs entirely inside n8n. Give it a design brief
("Diwali tech fest at our campus"), and it returns a complete, downloadable design kit:

- **N procedural background designs** (you choose how many, 1–24) in a consistent trained theme —
  full bleed, **zero text**, vector SVG originals + PNG exports, infinitely scalable
- **Standalone transparent components & stickers** — isolated vector shapes (stars, blobs, bursts,
  rings, brutalist arrows, torn paper deckle edges, duotone washes) with **transparent backgrounds**
  and zero text, ready for custom collage compositions and sticker overlays
- **Color palette** — raw brand colors plus derived roles (`bg`, `surface`, `primary`,
  `secondary`, `accent`, `text`, `muted`), click-to-copy hex
- **Font system** — header / subheader / body / caption from Google Fonts, with weights,
  sizes, line heights, tracking, a ready `typography.css`, and the `<link>` tag
- **Track 2 image-model prompts** — theme-tailored prompts for abstract textures and isolated
  stickers on plain white backgrounds, ready to feed into Pollinations, Cloudflare AI, FLUX,
  Midjourney, or SD, and cut out using `rembg`
- **One-click ZIP** with organized folders: `backgrounds/`, `components/`, `theme.json`, and `typography.css`

The theme designer is powered by fast LLM inference (e.g. Groq `llama-3.3-70b-versatile`, Cerebras,
Fireworks, Kimi, GLM, DeepSeek, or Claude). It reasons over color theory, mood, contrast, and editorial
typography, outputting strict JSON. The parser is hardened with regex stripping to handle reasoning
models that emit `<think>...</think>` tags or markdown fences.

If the LLM call fails (no credential, rate limit, timeout, refusal), a built-in keyword-based
theme engine takes over automatically, so the workflow always produces output.

## Architecture

```
Webhook (GET /design-agent)
   │
   ├─ no ?brief= ──────────────► Form Page (Code) ─────────────────────────┐
   │                                                                       ▼
   └─ ?brief=... ─► Prepare Theme Request (Code)                     Send Response
                         │                                                 ▲
                         ▼                                                 │
                   LLM Theme Designer (HTTP → Groq/OpenAI-compatible)      │
                         │  (onError: continue → fallback)                 │
                         ▼                                                 │
                   Generate Designs (Code) ────────────────────────────────┘
                         ├─► Procedural SVG backgrounds (zero text, full bleed)
                         ├─► Standalone transparent stickers & overlays
                         ├─► Typography system & tokens (typography.css)
                         ├─► Track 2 image prompts (theme.json)
                         └─► Interactive gallery + ZIP packager
```

### Full Separation of Text, Backgrounds, and Components

1. **Backgrounds (zero text)**: Pure visual atmosphere procedurally generated via SVG math.
2. **Components (transparent, zero text)**: Isolated stickers and graphic overlays with no bounding box fill.
3. **Typography**: Handled separately via the generated CSS tokens and Google Fonts `<link>`, ensuring you or downstream tools have total control over typography and copy placement.

## Setup (2 minutes)

1. **Import**: n8n → Workflows → ⋯ → *Import from File* → `workflow/design-agent-workflow.json`
2. **API Key (optional but recommended)**:
   - Open the **Claude Theme Designer** HTTP Request node.
   - By default, it points to `https://api.groq.com/openai/v1/chat/completions`.
   - In **Header Parameters**, replace `YOUR_API_KEY_HERE` in `Authorization: Bearer YOUR_API_KEY_HERE` with your Groq, Cerebras, or Fireworks API key (or set `{{ $env.GROQ_API_KEY }}`).
   - *Skip this and the workflow still works — it just uses the built-in fallback theme engine.*
3. **Run**:
   - Test mode: click *Execute workflow*, then open the **Test URL** of the Webhook node
     (`http://localhost:5678/webhook-test/design-agent`) in a browser.
   - Production: toggle the workflow **Active**, then use
     `http://localhost:5678/webhook/design-agent` — the form stays permanently available.

Opening the URL with no parameters shows a form. Submitting it (or calling the URL with
query params) returns the gallery page.

## URL parameters

| Param   | Example                  | Default | Notes                                        |
|---------|--------------------------|---------|----------------------------------------------|
| `brief` | `brief=neon+music+night` | —       | Required for generation; empty → shows form   |
| `count` | `count=8`                | 6       | 1–24 background designs                      |
| `size`  | `size=a4`                | `insta` | `insta` 1080², `story` 1080×1920, `a4` 2480×3508 (print), `hero` 1920×1080, `banner` 1500×500, or custom `1200x628` |
| `seed`  | `seed=42`                | derived | Same brief+seed ⇒ identical designs (reproducible) |
| `dark`  | `dark=1`                 | AI picks| Force dark (`1`) or light (`0`) backgrounds   |

## Downloaded ZIP Structure

```
<slug>-design-kit.zip
├── backgrounds/
│   ├── <slug>-halftone-1.svg   (vector original, zero text)
│   ├── <slug>-halftone-1.png   (full canvas export)
│   ├── <slug>-tornpaper-2.svg
│   └── <slug>-tornpaper-2.png
├── components/
│   ├── sticker-star-01.svg     (transparent vector)
│   ├── sticker-star-01.png     (transparent PNG)
│   ├── sticker-blob-02.svg
│   ├── sticker-burst-03.svg
│   ├── sticker-ring-04.svg
│   ├── sticker-arrow-05.svg
│   ├── sticker-torn-edge-06.svg
│   └── duotone-wash.svg
├── theme.json                  (palette, roles, typography scale, seed, Track 2 prompts)
├── typography.css              (CSS custom properties + Google Fonts @import)
└── README.txt                  (manifest and usage notes)
```

## Track 2: Image-Model Prompts & rembg Pipeline

The workflow writes theme-tailored prompts directly into `theme.json` and renders copy buttons in the gallery UI:

- **Texture background prompt**: Generates pure abstract paper grain / halftone texture with zero text, logos, or objects.
- **Isolated component prompts**: Prompts for isolated objects (vintage flower, retro boombox, torn paper scrap, halftone sunburst, squiggle doodle) centered on a plain white background.

### Optional n8n Image Pipeline with rembg

To automate image generation and background removal in n8n:
1. Add an **HTTP Request** node calling Pollinations (free: `https://image.pollinations.ai/prompt/{{ encodeURIComponent($json.prompt) }}`) or Cloudflare Workers AI.
2. Add an **Execute Command** node running `rembg i input.png output.png` (or call a self-hosted / free rembg API endpoint) to convert the white background into transparent alpha PNG.

## Project layout

```
workflow/design-agent-workflow.json   ← the importable n8n workflow (generated)
src/prepare-claude.js                 ← Code node: builds OpenAI-compatible request payload & system prompt
src/generate-designs.js               ← Code node: hardened parser + 11 procedural SVG generators + sticker engine + gallery
src/form-page.js                      ← Code node: the input form
build.js                              ← embeds src/ into the workflow JSON
test/run-local.js                     ← smoke tests + writes browsable preview pages
```

To modify the agent, edit the files in `src/`, then:

```bash
node test/run-local.js   # verify (also writes test/preview-*.html to eyeball)
node build.js            # regenerate workflow/design-agent-workflow.json
```

…and re-import into n8n.

## Customization pointers

- **Procedural styles** — `src/generate-designs.js`, the `GEN` map: `aurora`, `waves`,
  `geometric`, `blobs`, `ribbons`, `confetti`, `rings`, `grid`, `halftone`, `tornpaper`, `duotone`.
- **Component sticker shapes** — `genStickerShapes` in `generate-designs.js`.
- **Font whitelist** — `FONT_WHITELIST` in both `prepare-claude.js` and `generate-designs.js`.
- **Model** — `MODEL` constant at the top of `prepare-claude.js`.
- **Fallback themes** — `FALLBACKS` keyword table in `generate-designs.js`.
