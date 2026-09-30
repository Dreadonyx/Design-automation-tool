# Connect the free services

The local app and Tiny SD draft model are installed in this workspace. No ChatGPT subscription, OpenAI API key, paid image model, domain, cloud server, or GPU is required for this setup. Hosted services have quotas: this is not unlimited free generation. The remaining live verification needs your own account credentials.

## 1. Cloudflare — primary image generation

1. Sign in or create an account at <https://dash.cloudflare.com/>. Keep **Workers Free**; do not upgrade Workers billing.
2. Open **Workers AI → Use REST API → Create a Workers AI API Token**. Review and create the token using that template.
3. Copy the token into `CF_API_TOKEN` in the project's `.env`. Copy the account ID shown on the REST API page into `CF_ACCOUNT_ID`.
4. After checking the account is on Workers Free, set `CF_FREE_ACCOUNT_ONLY=1`.

Official steps: <https://developers.cloudflare.com/workers-ai/get-started/rest-api/>. Free accounts currently have 10,000 neurons daily; requests fail at the free limit. Paid accounts can incur charges above it: <https://developers.cloudflare.com/workers-ai/platform/pricing/>.

The default first adapter is FLUX.2 Klein 4B. It accepts text or up to four image references. The app sends resized reference copies, preserves your stored originals, and requests a 1024 × 1024 output by default. API success is not a guarantee of visual quality; review the actual results.

## 2. Google AI Studio — understand inspiration and propose a theme

1. Open <https://aistudio.google.com/apikey> and sign in.
2. Accept the terms if prompted. Create an API key in a project available to your account; import an existing project if necessary.
3. Use a project on the **free tier with no paid billing enabled**. Put its key in `GEMINI_API_KEY`.
4. Set `GEMINI_FREE_ACCOUNT_ONLY=1` after checking that billing setting.

Official key instructions: <https://ai.google.dev/gemini-api/docs/api-key>. The app uses Gemini 3.1 Flash-Lite for reference analysis, palette and font recommendations, not Google image generation. Availability and free limits depend on the project and supported region. See <https://ai.google.dev/gemini-api/docs/pricing>.

## 3. Hugging Face — optional hosted fallback

1. Create/sign in to an account at <https://huggingface.co/>.
2. Open <https://huggingface.co/settings/tokens> and create a fine-grained token with **Make calls to Inference Providers** permission.
3. Put it in `HF_TOKEN`. Set `HF_FREE_ACCOUNT_ONLY=1` only for an account without purchased credits, auto-recharge or custom provider billing.

The installed environment already has the HF client. Free accounts currently receive only $0.10 monthly inference credit, subject to change; it is a small fallback allowance, not a bulk-generation solution. Models may be unavailable through routing. See <https://huggingface.co/docs/inference-providers/index> and <https://huggingface.co/docs/inference-providers/pricing>.

## 4. Save settings locally

This workspace has a private `.env` configured with owner-only file permissions, including the local Ollama setting. On a fresh checkout, copy `.env.example` to `.env` first. Edit it locally; never paste keys into chat, screenshots, theme notes, or tracked files.

```dotenv
CF_ACCOUNT_ID=your_account_id
CF_API_TOKEN=your_workers_ai_token
CF_FREE_ACCOUNT_ONLY=1
GEMINI_API_KEY=your_ai_studio_key
GEMINI_FREE_ACCOUNT_ONLY=1
# Optional:
HF_TOKEN=
HF_FREE_ACCOUNT_ONLY=0
OLLAMA_ENABLED=0
```

Qwen 2.5 3B is already downloaded through Ollama in this workspace and needs no API key. Set `OLLAMA_ENABLED=1` on another installation and start `ollama serve` if its service is not already running. Local theme analysis uses the brief and reference notes/text, not reference pixels.

The `*_FREE_ACCOUNT_ONLY` flags are your declarations, not remote billing checks or spending caps. Leave a hosted service disabled if its account billing is uncertain. Keys stay on the local server; hosted features send the selected prompts/references to the corresponding service.

## 5. Check and run

From the project directory:

```bash
.venv/bin/python scripts/check_setup.py
.venv/bin/python app.py
```

Open <http://127.0.0.1:7860>. Restart the server after changing `.env`; shell environment values take precedence over the file. The check command prints configuration status without making network calls or displaying credentials.

### Docker

With Docker Compose installed, `docker compose up --build -d` builds and starts the app at <http://127.0.0.1:7860>. Hosted credentials are read from the local `.env`; the image excludes that file. Themes, uploads, and generated assets persist in the `studio-data` volume. This default image does not include the optional PyTorch/Diffusers image models.

To run the local Qwen text-analysis model as an Ollama container, use `docker compose -f compose.yaml -f compose.ollama.yaml up --build -d`, then `docker compose -f compose.yaml -f compose.ollama.yaml exec ollama ollama pull qwen2.5:3b`. Model files persist in the separate `ollama-models` volume. No Ollama API key is required.

To verify actual requests (uses free quota):

```bash
.venv/bin/python scripts/check_setup.py --live
```

This exercises the job API with one 1024 px Cloudflare text-to-image generation, then a reference-guided variation. If Gemini is configured, it also analyzes that reference. Images and a dated JSON verification report are saved in `test_img/`. Tests use a disposable library so they do not clutter your saved themes. HF remains separately unverified by this command.

In the app: upload inspiration, suggest a direction, review its palette/fonts, save, choose **Final**, then generate. Choose **Reference pixels** when you want images to condition the generation directly. Klein supports four non-palette image references; local Draft models support one. Additional documents and palette references remain available as written guidance. The app never silently drops excess pixel references or downgrades Final jobs to local drafts.

## What still requires your input

- No additional API keys are needed for the providers configured in this workspace. A fresh installation needs its own provider credentials for hosted services; Ollama is local and keyless.
- A representative theme or your own inspiration images when you want to assess quality for your real use case.

No more hardware information is needed for the current CPU-safe configuration. Existing local samples are in `test_img/`; they are drafts. Final hosted samples cannot be assessed until the accounts are connected.
