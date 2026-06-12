# NYC 311 Complaint Optimizer

A single-page civic tool that turns plain English frustrations into strong, legally grounded 311 complaints — routed to the right NYC agency with a direct filing link.

## What It Does

- Takes a plain English complaint as input
- Lets you pick a tone: **Polite**, **Firm**, or **Urgent**
- Calls the Anthropic Claude API to return a structured result:
  - Rewritten complaint (specific and legally grounded)
  - 311 category (e.g. `HEAT/HOT WATER`, `NOISE`, `SANITATION`)
  - Responsible agency acronym and full name
  - Legal note (what the city is obligated to do and by when)
  - Response likelihood (High / Medium / Low)
- Shows the result as a styled card with a **Copy Complaint** button
- Includes a **Submit to 311** link that goes directly to the right NYC portal page
- Pre-loads 3 ready-to-file example complaints on page load

## Project Structure

```text
.
├── index.html        # entire app — HTML, CSS, and JS in one file
├── package.json      # Vite dev/build scripts
└── .env              # VITE_ANTHROPIC_API_KEY (not committed)
```

## Setup

1. Copy `.env.example` or create `.env`:

```bash
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

2. Install and run:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`

## Build

```bash
npm run build
```

Output goes to `dist/`. The app is entirely static — deploy anywhere (Netlify, Vercel, GitHub Pages).

## Tech

- Vanilla JS + Vite (no framework)
- Anthropic Claude API (`claude-haiku-4-5-20251001`) via direct browser fetch
- No backend, no login, no database
