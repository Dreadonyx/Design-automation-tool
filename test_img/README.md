# Real local model test outputs

These images were generated with `segmind/tiny-sd` on CPU, not by the procedural renderer.

- `tiny-sd-botanical-256.png`: 256 × 256, seed 42, 20 steps. Prompt: “botanical illustration of violet flowers, midnight blue paper background, editorial poster background, elegant composition, no lettering”. Denoising took approximately 26 seconds.
- `tiny-sd-botanical-512.png`: 512 × 512, seed 42, 20 steps. Generated through the complete studio job pipeline from the brief “Violet botanical flowers on a midnight blue background, clean editorial illustration, no text”. End-to-end time: 172.4 seconds; child process peak RSS: approximately 3,475 MB.

- `tiny-sd-reference-variation-256.png`: image-to-image using the first 256 px sample as input, seed 84, strength 0.65. Prompt: “violet botanical flowers, dark midnight blue background, elegant editorial illustration”. Approximately 16 seconds denoising.

The prompts differ, so these are not a controlled resolution comparison. Tiny SD is a compact draft model; these samples do not establish exact palette or reference fidelity.
