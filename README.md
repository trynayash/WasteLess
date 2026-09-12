# WasteLess

WasteLess helps people decide whether an everyday object should be reused, donated, sold, or recycled before it reaches the bin.

## What it does

- Uploads or captures a photo in the browser
- Identifies the object when a vision provider is available
- Returns one recommended next step, a condition check, practical actions, alternatives, and second-life ideas
- Keeps a deterministic manual fallback when image analysis is unavailable
- Lets users copy, download, or print the action plan

## Stack

- React, Vite, TypeScript, and Tailwind CSS
- Express API with Zod validation
- pnpm workspaces
- Gemini, Hugging Face, or Anthropic vision providers

## Run locally

```bash
pnpm install
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/wasteless run dev
```

The frontend uses port `5173` by default and proxies `/api` to the API on port `8080`. Set `PORT` or `BASE_PATH` when your environment needs different values.

## Configuration

Copy `.env.example` to `.env` and add at least one server-side provider credential:

- `GEMINI_API_KEY` — primary provider
- `HF_TOKEN` — optional caption fallback
- `ANTHROPIC_API_KEY` — optional alternate provider

Never commit `.env` or provider credentials.

## Checks

```bash
pnpm test
pnpm run typecheck
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/wasteless run build
pnpm --filter @workspace/api-server run build
```

## Project layout

- `artifacts/wasteless` — browser application
- `artifacts/api-server` — analysis API
- `lib/api-spec` — OpenAPI contract
- `lib/api-zod` — generated request types and validation
- `lib/api-client-react` — generated frontend client