# Theme Studio

A local-first workspace for reusable visual themes, reference-guided image batches, and a matching website-design prompt. Built for a personal machine with **20 GB RAM and no assumed GPU**.

## Run

The project environment, Tiny SD image model, and Qwen 2.5 3B local theme-analysis model have been installed in this workspace:

```bash
.venv/bin/python app.py
```

Open **http://127.0.0.1:7860**. The server binds only to localhost. This is a personal desktop service, not a public multi-user deployment.

### Docker

Install Docker Compose and run from the repository directory:

```bash
docker compose up --build -d
docker compose ps
```

Open **http://127.0.0.1:7860**. The app container runs as a non-root user, binds through a localhost-only host port, and keeps the SQLite library and uploaded/generated files in the persistent `studio-data` volume. Credentials stay in the ignored `.env` file and are not copied into the image. To use Ollama inside Docker, start with the optional service overlay and pull Qwen once:

```bash
docker compose -f compose.yaml -f compose.ollama.yaml up --build -d
docker compose -f compose.yaml -f compose.ollama.yaml exec ollama ollama pull qwen2.5:3b
```

The default image includes the hosted providers and procedural engine, not the optional PyTorch/Diffusers local image models. The Ollama overlay provides local text-based theme analysis; it stores model weights separately in the `ollama-models` volume.

For a fresh installation (Python 3.12 recommended):

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

Core startup does not require a model, token, account or network connection. The procedural graphic engine is always available. AI models are distinct from that fallback and are labeled in every image's details.

## Workflow

1. Add a brief, upload inspiration, or use both: PNG, JPEG, WebP, TXT, Markdown, JSON, or text PDF. Assign a role and notes to each reference.
2. Suggest an editable theme direction. Review palette hex values, contrast, font recommendations, motifs and exclusions. Optional Gemini analyzes reference images; Ollama analyzes text and notes; offline mode uses a rules-based draft.
3. Save the theme. Each edit creates a version; restoring an older version creates a new revision without deleting history.
4. Choose the image count, canvas, seed, quality mode and engine. **Final mode is the default**: it uses only stronger hosted models and requires the requested native size/aspect ratio (minimum 768 px short side). It stops rather than downgrading to a draft engine. **Draft mode** tries the configured providers in catalog order, then local models, then abstract procedural graphics. A provider that fails is skipped for the remainder of that batch. In Final mode, after the first successful image the batch stays on that model to avoid cross-model style drift; quota exhaustion can leave a partial batch. Final mode is an engine/resolution policy, not an automated aesthetic-quality guarantee.
5. Review outputs, inspect actual provider/model/prompt/dimensions, generate a new variation from an image's original theme version, or import images made elsewhere.
6. Download individual files, an optional metadata-clean PNG, a quality-92 WebP capped at 1600 px, or the full kit ZIP. The default generation canvas is 1024 × 1024; large working files remain optional. Enter the website purpose and copy a complete website-design prompt using the saved palette and typography.

### References are not all equivalent

- **Palette + written direction:** image color extraction runs locally. Hosted text-to-image models receive the approved written theme, reference notes, and extracted document text, not reference pixels. Use optional Gemini analysis to turn image references into an approved written direction first.
- **Reference pixels:** Final mode supports up to four non-palette images with Cloudflare FLUX.2 Klein. Local Draft image-to-image accepts one. Providers with insufficient reference capacity are skipped without silently dropping images. Providers without image-to-image support are skipped, including procedural output. This mode fails visibly rather than silently ignoring the requested pixel guidance.
- PDF extraction supports text PDFs, up to 12 pages / 16,000 characters. Scanned PDFs should be supplied as images. Fonts are recommendations, not verified font identification.

## Reviewed model catalog

The catalog is deliberately finite. "All free models" is not a stable or verifiable list, and downloading arbitrary community model code would be unsafe. The app uses known publisher repositories and adapters, without `trust_remote_code`, arbitrary Space endpoints, or public demo scraping.

| Adapter | Models | Availability / cost boundary |
|---|---|---|
| Cloudflare Workers AI | FLUX.2 Klein 4B, FLUX.1 Schnell, SDXL Lightning, SDXL Base | Account/API token required; use a Workers **Free** account for the hard quota boundary |
| Hugging Face Inference Providers | FLUX.1 Schnell, SDXL Base, Qwen Image, Z-Image Turbo | Token and optional client required; very limited free credits, model routing/availability varies |
| Local Diffusers | Segmind Tiny SD, Stable Diffusion 1.5 | No per-image API fees; weights must be downloaded explicitly |
| Procedural | Geometry v1 | Offline SVG + PNG; abstract graphics, not semantic AI imagery |
| Optional theme analysis | Gemini 3.1 Flash-Lite; local Ollama Qwen 2.5 3B | Separate from image generation; offline rules-based fallback |

Large models such as Qwen Image and FLUX are **hosted-only in this hardware profile**. They are not automatically downloaded onto a 20 GB machine. Nano Banana's paid image API is not part of the automatic chain. Images created manually in Gemini or ChatGPT can be imported.

The UI indicates readiness/configuration, not a guarantee of remote model availability. Hosted calls have not been live-verified without user credentials. Quota errors, timeouts and unavailable models are recorded on each image or failed job.

## Free-account connections

Follow [the account setup guide](docs/SETUP.md) for exact token creation steps and verification commands. A private `.env` is configured in this workspace; on a fresh checkout, copy `.env.example` to `.env` and fill only the connections you want. `.env` is loaded by `app.py`, ignored by Git and never returned to the browser.

- Cloudflare: `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `CF_FREE_ACCOUNT_ONLY=1`.
- Hugging Face: `HF_TOKEN`, `HF_FREE_ACCOUNT_ONLY=1`. Install `huggingface_hub>=0.34,<1` if using only the core requirements.
- Optional Gemini theme/reference analysis: `GEMINI_API_KEY`, `GEMINI_FREE_ACCOUNT_ONLY=1`.
- Ollama text analysis: Qwen 2.5 3B is installed and enabled in this workspace; fresh setups can install Ollama and pull `qwen2.5:3b`. Start `ollama serve` if the local service is not already running. No API key is required; only `127.0.0.1:11434` is used, and the model is unloaded after each response.

**These flags are operator declarations, not billing verification.** The app cannot inspect your provider billing settings or remaining credits. Keep Cloudflare on Workers Free, use HF without purchased credits/custom provider billing, and Gemini without paid billing if you require no paid usage. Do not enable these flags on a paid account and assume the app enforces a spending cap. No keys or flags means no hosted requests.

Enabling a hosted service sends prompts and relevant reference-derived information to that service. Gemini analysis and Cloudflare Klein pixel guidance also send resized image references. Review the provider's data policy before supplying private references.

## Local CPU setup

Install the **CPU** build of PyTorch first to avoid downloading CUDA packages:

```bash
.venv/bin/pip install 'torch==2.8.0+cpu' --index-url https://download.pytorch.org/whl/cpu
.venv/bin/pip install -r requirements-local.txt
.venv/bin/python scripts/download_model.py local-tiny
```

Optional larger local fallback:

```bash
.venv/bin/python scripts/download_model.py local-sd15
```

Tiny SD downloads approximately 1 GB of publisher weights. The downloader pins the resolved Hub revision, uses `weights_only=True` to convert the publisher's legacy tensor files to safetensors, and writes a readiness marker only after checking all required weight components. Legacy files plus converted weights currently use about 2 GB of disk.

Local generation runs on CPU with four threads, one image per subprocess, a maximum 512-pixel side, 20 denoising steps, attention/decoder slicing, and a 20-minute per-image timeout. RAM is released after each image. Requested larger dimensions are reduced proportionally to model-compatible sizes, and the actual size is recorded rather than claiming an upscale. This limits memory pressure but is not a hard OS memory limit. Close other large applications if RAM is constrained.

On this machine, a real 512 × 512 job took 172.4 seconds and peaked at approximately 3.4 GB RAM. Samples are in `test_img/`.

Tiny SD is a lightweight draft model. Do not expect frontier-model quality, exact hex matching, perfect reference adherence, or exact reproduction across providers/model revisions. Review output quality before use. A fixed seed plus frozen theme improves repeatability but is not a cross-provider guarantee.

## Storage and export

Default storage: `.studio/studio.db` plus `.studio/files/`. Local models are under `.studio/models/`. Set `STUDIO_DATA` to move the library and assets; models remain in the project model directory. Back up the entire library directory to preserve references and all history. The ZIP is a design handoff, not an importable full database backup.

The ZIP contains `theme.json`, `versions.json`, `manifest.json`, `typography.css`, `website-prompt.txt`, and images (SVG too for procedural output). The manifest stores prompts and actual model/provider details separately from image files. Fonts are referenced by family name; font binaries are not bundled.

**Clean PNG** creates a fresh image from pixels without optional embedded file metadata. The original file stays saved. This does not remove invisible pixel watermarks such as SynthID, change the artwork's visual style, or guarantee that it cannot be identified as AI-generated. Generated designs do not have a studio logo stamped onto them; provider-supplied marks are not erased.

Queued/running jobs are marked interrupted on server restart; completed images remain saved. Cancellation takes effect between images or after the active provider call returns. A maximum of three batches can be pending at once. Run only one server process per library.

## Verification

```bash
.venv/bin/python -m unittest discover -s tests -v
node --check web/app.js
node test/run-local.js
```

Optional real CPU integration test (writes the output to `test_img/`):

```bash
PYTHONPATH=. .venv/bin/python tests/local_model_smoke.py
```

Browser smoke check (requires Playwright and Chromium; use a disposable library):

```bash
STUDIO_DATA=/tmp/theme-studio-test .venv/bin/python app.py
# In another terminal with Playwright installed:
python3 tests/browser_smoke.py
```

The browser check covers image upload, extracted palette, theme save, three-image procedural batch, prompt generation, ZIP contents, persisted reload and mobile overflow. Unit tests cover version conflicts/restores, input limits, fallback behavior, cancellation, rejection handling, local dimension caps, reproducibility, imports, metadata-clean exports and restart persistence. See `docs/VERIFICATION.md` for measured local inference results and unverified integrations.

## Project layout

- `studio/app.py`: local HTTP API, SQLite persistence, uploads, queued jobs and ZIP exports.
- `studio/themes.py`: validated theme contracts, offline defaults and website-prompt compiler.
- `studio/intelligence.py`: optional Gemini/Ollama theme analysis.
- `studio/providers.py`: curated provider catalog and fallback adapters.
- `web/`: responsive theme workspace.
- `scripts/`: explicit local model download and isolated CPU inference.
- `tests/`: API and browser/inference verification.
- `test_img/`: real test-generated images for inspection.
- `src/`, `build.js`, `workflow/`: original n8n workflow, preserved separately. See [legacy n8n instructions](docs/N8N_WORKFLOW.md).

## Provider references

Checked September 2026; provider offerings and licenses can change:

- [Cloudflare quota and pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Hugging Face free credits and billing](https://huggingface.co/docs/inference-providers/pricing)
- [Gemini free/paid model pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Tiny SD publisher model card](https://huggingface.co/segmind/tiny-sd)
- [Stable Diffusion 1.5 model card](https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5)
- [FLUX Schnell model card](https://huggingface.co/black-forest-labs/FLUX.1-schnell)
- [Qwen Image model card](https://huggingface.co/Qwen/Qwen-Image)
- [Z-Image Turbo model card](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo)
