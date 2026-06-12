# Repository Guidelines

## Architecture

NYC 311 Complaint Optimizer is a single-page civic tool that rewrites plain English complaints into legally grounded 311 filings using the Anthropic Claude API.

- `index.html` — the entire frontend: HTML, CSS, and vanilla JS in one file. Handles the complaint form, tone picker, skeleton loading, result cards, copy-to-clipboard, and 311 submit links.
- `api/optimize.js` — Vercel serverless function. Receives `{ input, tone }` from the browser, calls the Anthropic API server-side, parses the JSON response, and returns the result. The API key never reaches the browser.

## Engineering Rules

- Keep all business logic (URL lookup, likelihood display, card rendering) in `index.html` — there is no separate JS module layer.
- The Anthropic API key must only live in `api/optimize.js` via `process.env.ANTHROPIC_API_KEY`. Never reference it in frontend code or use the `VITE_` prefix.
- Strip any markdown code fences from model output before parsing JSON — do this in `api/optimize.js`, not the frontend.
- All API calls go through `/api/optimize`. Do not call `api.anthropic.com` directly from the browser.
- Keep the frontend dependency-free. Do not add npm packages to the client bundle.
- The `SUBMIT_URLS` lookup table in `index.html` is the authoritative map of 311 categories to portal links. Update it there when adding new categories.

## Product Rules

- The three pre-loaded examples (heat, noise, pothole) must always work on page load — they exercise the full API path.
- Tone options are exactly: `polite`, `firm`, `urgent`. Do not add or rename tones without updating the model prompt.
- Result cards must always show: category, agency acronym, full agency name, likelihood badge, optimized complaint, legal note, Submit to 311 link, and Copy Complaint button.
- Never show a blank screen. Show skeleton cards while loading and a clear error message on failure.
- Likelihood values from the model are `High`, `Medium`, or `Low` — map them to green, yellow, and red badge styles respectively.

## Verification

Run locally before handing off changes:

```bash
npm run dev
```

This starts the Vite dev server with an inline API middleware that mirrors `api/optimize.js`. Open `http://localhost:5173`.

To deploy:

```bash
git push
```

Vercel auto-deploys `main` to https://nyc-311-optimizer.vercel.app.
