# OCR hardening: decisions and references

Checked 14 October 2026 while investigating production HTTP 503 failures for `gemini-3.6-flash`.

## Findings used for the implementation

- Google lists `gemini-3.8-flash` as a stable model with image input. The configured `gemini-3.6-flash` is also still listed as stable. This supports trying an alternate current Flash model after a transient failure, while recording which model actually returns the result.
- Google describes `gemini-3.5-flash-lite` as a stable multimodal model that accepts images and is designed for high-throughput document parsing. This is suitable as a final OCR fallback, but its output still needs the app's confidence and arithmetic validation.
- Google's troubleshooting guidance for 429/503/5xx recommends bounded exponential backoff, delays such as 1, 2, 4, 8 seconds, jitter, and no retries for client errors such as 400/402/403. The prior implementation only waited 1 and 2 seconds and retried the same model three times, which was insufficient for the repeated 503s in the live logs.
- The attached receipt is rotated in its source photo, faded, and folded. The app already has manual rotation; OCR instructions and an alternate contrast-enhanced view should explicitly handle rotated/skewed, stained, folded, faded, and partially obscured paper. Preserve an original color view because handwriting/stamps may disappear in grayscale enhancement.

## Official references

- [Gemini models](https://ai.google.dev/gemini-api/docs/models) — stable model IDs and supported capabilities.
- [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) — stable model that accepts image input.
- [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) — stable multimodal model for high-throughput document parsing; image input and structured outputs supported.
- [Gemini API troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting) — retryable status codes, exponential backoff, jitter, and retry limits.
- [Gemini models.list API](https://ai.google.dev/api/models) — account-level model list and supported generation methods; validate model availability on the actual API key when possible.
