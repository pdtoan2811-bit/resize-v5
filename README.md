# Resizer — AI-first PSD resizing

Resize a single PSD key visual into every ad size with four interchangeable approaches and three layered levels of context. Built as a prototyping playground — compare modes side-by-side, drag previews to inspect responsiveness, fold critique back into project notes automatically.

## What it does

Upload a `.psd`. We parse it once with `psd-tools`, raster each layer with its effects-inclusive bbox, run a semantic pass (heuristic + spatial clustering + optional GPT vision) to group layers into design units (e.g. logo + plate behind it, headline + baked shadow). Then you generate any target size in any combination of these modes:

| Mode | What it does | Cost | Speed |
|---|---|---|---|
| **Naive** | Per-layer proportional rescale. Baseline / control. | free | instant |
| **Group** | Semantic groups treated as atomic units, anchored by role. | free | instant |
| **AI Responsive** | AI emits per-group transforms; server converts to %. One responsive HTML scales fluidly within a ratio family. | ~$0.02 | ~10 s |
| **AI Rewrite** | AI rewrites the entire HTML+CSS for the target. Free use of flex / grid / gradients. | ~$0.05 | ~30 s |

Renders go into a comparison gallery grouped by target size — every mode you generated for that size sits side-by-side at equal display height with a per-row zoom control (fit / 25 % / 50 % / 100 %).

## Context stack (three levels)

Every AI call gets a layered preamble:

1. **Brand context** (`/settings`) — brand name, voice, audience, do's and don'ts. Applies to every render across every PSD.
2. **Project notes** (PSD detail sidebar) — per-PSD persistent notes. Critique suggestions are auto-collected here so the next render starts smarter.
3. **Task brief** (resize panel) — highest-priority context for *this* render only.

Higher levels override lower ones when they conflict.

## Run

```sh
./start.command
```

Double-click installs `pnpm`, `uv`, Playwright Chromium and Python deps if missing, runs Prisma migrations, starts the Python worker on `:8787` and the Next.js app on `:3000`, opens the browser.

Manual:
```sh
# worker
cd worker && uv run uvicorn app:app --host 127.0.0.1 --port 8787

# web (separate terminal)
cd web && pnpm install && pnpm dlx prisma migrate dev && pnpm dev
```

## Stack

- **Next.js 16** App Router + React 19 + Tailwind 4 + shadcn (light mode only)
- **Prisma 7** with `better-sqlite3` adapter for local zero-config persistence
- **Playwright** Chromium for rendering HTML → PNG
- **psd-tools** (Python / FastAPI) for parsing and layer rasterization
- **OpenAI** — `gpt-5.3-codex` for semantic / layout / verify; `gpt-image-2` for aesthetic references

Swap `AI_PROVIDER=stub` in `web/.env` to run fully offline (heuristics only).

## Config

Copy `web/.env.example` → `web/.env` and set `OPENAI_API_KEY`. Everything else has sensible defaults.

## Repo layout

```
.
├── start.command       # one-click installer + launcher (macOS)
├── run.sh / run.bat    # same, for headless / Windows
├── PRD.md              # the spec this implementation follows
├── web/                # Next.js app (UI + API)
└── worker/             # Python FastAPI worker (psd-tools)
```
