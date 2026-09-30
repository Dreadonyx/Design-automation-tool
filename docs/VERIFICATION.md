# Verification status

## Verified locally

- API tests: 20 passing, including local Qwen draft validation, malformed model-output fallback, final-mode no-downgrade policy, native resolution checks, queued cancellation, imports, metadata export, version restores and persistence. Added reference-only themes, multi-reference Final jobs, local capacity enforcement, and Cloudflare multipart request/response contract coverage.
- Browser smoke: desktop and 390 px mobile; reference upload, palette extraction, save, procedural batch, web prompt, ZIP contents, reload; no JavaScript exceptions or horizontal overflow.
- Real Tiny SD text-to-image on CPU: 256 × 256, seed 42, 20 steps; approximately 26 seconds denoising.
- Real Tiny SD through the job API: 512 × 512, seed 42, 20 steps; **172.4 seconds end-to-end**, **3,475 MB peak child RSS** on this machine. Saved under `test_img/`.
- Real Tiny SD image-to-image: 256 × 256 with the earlier generated image as reference, strength 0.65, seed 84; 13 effective denoising steps completed in approximately 16 seconds. Saved in `test_img/tiny-sd-reference-variation-256.png`.
- The test outputs are draft quality. The model did not follow the requested dark background reliably; it is therefore excluded from Final mode.
- Publisher model revision is stored in `.studio/models/local-tiny/studio-ready.json`. Optional dependencies are installed in `.venv/`; runtime is in `.runtime/`.
- Ollama Qwen 2.5 3B is installed locally (1.9 GB) and enabled in the private `.env`. A real theme-analysis request returned a validated palette and font selection in approximately 15 seconds. It analyzes text/notes, not reference pixels, and requires the Ollama service to be running.

## Hosted live checks (2026-09-29)

- Cloudflare FLUX.2 Klein: text generation and reference-guided variation both succeeded at 1024 × 1024. Samples and a report are in `test_img/`.
- Hugging Face FLUX.1 Schnell: request returned a 1024 × 1024 image, but it was nearly a solid color and failed the quality check. Do not rely on this provider for usable output based on this check.
- Gemini theme analysis returned HTTP 503; the app fell back to its rules-based draft. This does not establish whether the configured key is invalid.
- Live hosted requests consume provider quota/credits. Outputs are smoke tests, not guarantees of aesthetic quality or exact palette adherence.

## Not live-verified

- Stable Diffusion 1.5: adapter and download path exist, but its larger weights have not been downloaded or benchmarked.
- Stable Diffusion 1.5: adapter and download path exist, but its larger weights have not been downloaded or benchmarked.
- No claim of exact theme/palette matching, automatic aesthetic acceptance, unlimited hosted free usage, or AI-undetectable output.

## Boundaries

This is a localhost, single-user application. Do not expose Flask's development server publicly. The legacy n8n workflow remains separate from the new studio and does not automatically gain the studio's persistence or provider features.
