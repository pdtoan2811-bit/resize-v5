# PRD — AI-First PSD Resizer (v2 — built state)

**Owner:** Thomas
**Last updated:** 2026-05-20
**Status:** Working prototype on GitHub at `pdtoan2811-bit/resize-v5`
**Run:** `./start.command`

---

## 0. Changelog vs. v1

The v1 PRD proposed **one** AI-driven flow (semantic pass → imagined reference → AI re-layout → render → verify). The implementation went further. This v2 documents the system as built.

What changed:
1. **Two source engines** — the PSD can be translated to source HTML deterministically (algorithm) **or** rewritten by AI from brand context.
2. **Four resize modes**, not one — Naive, Group, AI Responsive, AI Rewrite — that you can select **as a multi-set** and compare side-by-side per target size.
3. **Three-level context stack** — Organization (with five stage-specific blocks), per-PSD project notes, per-render task brief. Each block routes to the right AI prompt only.
4. **Responsive output** — coords stored as %, `aspect-ratio` + `container-type: size`. Previews are pixel-perfect transform-scaled iframes at native target dimensions.
5. **UX** — workspace shape is Source → Generate → Compare with a sticky source column. Reset / delete flows for clean iteration.

---

## 1. Problem

Brands need to resize a hero PSD key visual into many ad formats (square → portrait → wide banner → thin skyscraper). Existing tools (Smartly.io) work for *similar* aspect ratios but break catastrophically on aggressive aspect-ratio changes because they treat layers as geometric boxes, not semantic design elements.

Real-world PSDs are messy:
- Hand-drawn layers, weird sizes, unnamed shadow/effect/decorative layers
- A logo and its background plate often sit as **two separate layers** that read as one element
- Designers rely on aesthetic intuition that pure x/y/w/h math cannot reproduce

Five prior iterations failed because the AI was asked to push raw layer coordinates around in bulk — it has no spatial grounding when reasoning over flat JSON of boxes.

## 2. Hypothesis

**Treat the PSD as an HTML/CSS document. Let the AI redesign the layout the way a web designer would re-flow a page.**

HTML/CSS is the AI's native habitat: flexbox, grid, absolute positioning, container queries. Asking it to make a layout work at 300×600 instead of 1080×1080 inside HTML/CSS gives it a representation it can actually reason about.

Two refinements added in v2:
- **Coordinates are emitted as percentages**, the canvas uses `aspect-ratio` + `container-type: size`. The same HTML scales fluidly within a ratio family without re-rendering.
- The **semantic grouping** is treated as the system's contract with the AI — every AI call sees the same group inventory, so groups can move as atomic units.

## 3. Goals / Non-Goals

**Goals**
- Resize across drastically different aspect ratios with brand-aware aesthetic outcomes
- Multiple resize strategies (cheap algorithmic → expensive AI rewrite) interchangeable per render and comparable side-by-side
- Semantic grouping that survives messy designer layers (unnamed plates, baked shadows, hand-drawn decoration)
- Cheap, fast R&D loop using small OpenAI models where possible
- Per-organisation context that doesn't have to be retyped per PSD or per render

**Non-Goals (this iteration)**
- Round-trip back to editable PSD (PNG/JPG export is enough)
- Animation / video / Lottie
- Multi-user collaboration, accounts, billing
- Pixel-perfect parity with the original — *aesthetic* parity is the bar

## 4. Target User

Performance marketers & creative ops at brands who already use PSD-based key visuals and currently rely on Smartly.io or manual designer hours to resize.

## 5. Core Flow (as built)

```
                       /settings (Brand context)  ←─── always-on
                                  │
                                  ▼
1. Upload PSD ──► 2. Parse + raster layers (Python / psd-tools)
                                  │
                                  ▼
                  3. Semantic pass (heuristic clustering + AI grouping)
                          ─ cached on disk + DB
                                  │
                                  ▼
                  4. Choose source engine:
                       ┌── algorithm (deterministic emit)
                       └── ai HTML/CSS (AI authors using brand context)
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────┐
   │ Resize studio — pick MODES × SIZES                      │
   │                                                         │
   │ Modes: [Naive] [Group] [AI Responsive] [AI Rewrite]     │
   │ Sizes: [1:1] [4:5] [9:16] [16:9] [300×600] [728×90] …   │
   │ Task brief: free-form text for this run                 │
   │                                                         │
   │ For each (mode × size):                                 │
   │   imagine ref (AI modes only) ──► layout JSON / HTML    │
   │       ──► Playwright render ──► Tier-1 verify ──►       │
   │       Tier-2 critique ──► retry up to 3 ──► best wins   │
   └─────────────────────────────────────────────────────────┘
                                  │
                                  ▼
              5. Comparison gallery — by-size, all modes side-by-side
                       with per-row zoom (fit / 25 / 50 / 100 %)
```

## 6. Why HTML/CSS Beats Raw Coordinates

| Coordinates approach (failed) | HTML/CSS approach (this iter) |
|---|---|
| AI moves N boxes with x/y/w/h | AI edits flex/grid/absolute rules |
| No notion of "stack", "row", "center" | First-class layout primitives |
| Each layer independent → chaos | Containers enforce relationships |
| Hard to express "headline above product" | Trivial in DOM order + CSS |
| No standard to copy from | Trained on billions of responsive pages |

---

# Part 2 · Architecture (as built)

## 7. Source engines

The PSD has one "source" HTML representation that everything else builds on. Two ways to produce it:

### 7a. Algorithm engine (default)

A pure function `emitHtml(psd, semantic) → { html, css }`. Same bytes in → byte-identical output. Each layer is an `<img>` of its rasterized PNG, positioned with CSS variables in **percentages of the canvas**. The canvas uses `aspect-ratio: W / H; container-type: size; width:100%; height:100%`.

- **Free**, instant, exact
- Default after upload — use as a baseline
- See §10a

### 7b. AI HTML/CSS engine

`generateSourceHtml(psd, semantic, brandContext)` — the AI rewrites the source HTML as a clean modern document (semantic tags, flex/grid, container queries) using the brand identity + the **AI HTML/CSS** stage context. Output is sanitized through an allowlist (no scripts, no external resources, only the PSD's own layer asset URLs).

- **~$0.04 per PSD**, generated once, cached on disk
- AI Rewrite mode (§8.4) automatically reads from this version when active
- Algorithm version is always recoverable

Both versions are served by the same endpoint `GET /api/psd/[id]/source.html`. Engine choice persists on `Psd.sourceEngine`.

## 8. Resize modes (multi-select)

The four modes share the same input (parsed layers + semantic groups + target W/H) and the same render pipeline (apply layout → Playwright screenshot → Tier-1 verify). They differ in how the layout is produced.

### 8.1 Naive — proportional rescale

`autoLayout = empty groups[]` → `applyLayout` falls back to per-layer proportional rescale. Each layer scales by `canvasRatio`. No grouping, no AI. **Baseline / control.**

- Cost: **free** · Latency: **instant** · No retries

### 8.2 Group — algorithmic anchor

`autoLayout(psd, semantic, w, h)` ([src/lib/auto-layout.ts](web/src/lib/auto-layout.ts)) — semantic groups are atomic units placed by role-driven anchors: logo → top-left, headline → top safe band, CTA → bottom safe band, product/subject → centered max-area fit, optional groups (decoration/shadow/texture) hidden when target area < 50 % of source. **No AI per resize.**

- Cost: **free** · Latency: **instant** · No retries

### 8.3 AI Responsive — AI moves groups

`provider.reLayout()` returns a structured `ReLayoutResult` of per-group transforms; the server converts pixels → % at apply time so one HTML scales fluidly inside a ratio family. AI never authors raw CSS — it emits JSON the server validates and applies. See §10c.

- Cost: ~**$0.02 / size** · Latency: ~10 s · Up to 3 retries with critique-driven `mustFix`

### 8.4 AI Rewrite — AI authors HTML

`provider.rewriteHtml()` takes the active source HTML (algorithm or AI) and rewrites the entire document for the target. Free use of flex/grid/transform/gradients. Sanitized to the same asset allowlist. See §10c.

- Cost: ~**$0.05 / size** · Latency: ~30 s · Up to 3 retries

### Comparison gallery

Renders are grouped by target size. Each row shows every mode you've generated for that size, **fixed display height**, side-by-side. Per-row zoom toggle (fit / 25 / 50 / 100 %) for inspecting at native target resolution.

## 9. Context stack (three levels, stage-routed)

The biggest UX surface in v2. Each AI call receives a layered preamble.

```
┌─────────────────────────────────────────────────────────────────────┐
│  L3 · Organization (singleton row, /settings)                       │
│      ├── Brand identity ── prepended to every AI call               │
│      ├── Grouping ──────── semanticPass only                        │
│      ├── HTML engine ──── generateSourceHtml only                   │
│      ├── Resize ────────── reLayout + rewriteHtml only              │
│      └── Verify ────────── verifyCritique only                      │
│                                                                     │
│  L2 · Project notes (per PSD)                                       │
│      Hand-written + auto-collected critique suggestions             │
│                                                                     │
│  L1 · Task brief (per render)                                       │
│      Highest priority, overrides L2 + L3 on conflict                │
└─────────────────────────────────────────────────────────────────────┘
```

`renderContextPrompt(ctx, stage)` ([src/lib/context.ts](web/src/lib/context.ts)) assembles the preamble — brand identity always present, the stage's specific block only if the stage matches, then L2 + L1.

This split keeps each prompt focused: the resize prompt never sees grouping-specific guidance, the critique prompt never sees CSS preferences, etc.

### Auto-learning loop

After every AI render returning critique suggestions, `recordCritiqueLearning(psdId, suggestions)` merges them into L2 under a `<!-- auto:critique -->` marker. The next render starts smarter without the user lifting a finger. Manual L2 content above the marker is preserved.

## 10. Engineering specs (kept from v1, updated)

### 10a. Algorithm emit (deterministic, %)

**Goal:** pure function `emitHtml(psd, semantic) → {html, css}` that produces byte-identical output for identical inputs. The re-layout AI edits values within this structure; if emit is unstable, the AI's edits stop being meaningful.

**Document shape**

```html
<!doctype html>
<html data-emit-version="1" data-w="1080" data-h="1080">
  <body>
    <div class="kv-wrap">
      <div class="kv" style="--ratio:1080 / 1080;--bg:#fff">
        <div class="group" data-gid="g1" data-role="background" data-importance="structural">
          <img class="layer" data-lid="l0" data-fit="cover"
               src="/api/asset/<hash>/l0.png"
               style="--xp:0%;--yp:0%;--wp:100%;--hp:100%;
                      --z:0;--op:1;--rot:0deg;--bm:normal" />
        </div>
        …
      </div>
    </div>
  </body>
</html>
```

**Key v2 changes from the original spec**

| v1 | v2 |
|---|---|
| `--x:120; --y:340; --w:540; --h:540` in pixels | `--xp:11.11%; --yp:31.48%; --wp:50%; --hp:50%` |
| `.kv { width: var(--w)*1px; height: var(--h)*1px; }` | `.kv { aspect-ratio:var(--ratio); width:100%; height:100%; container-type:size }` |
| Single resolution | Same HTML reflows fluidly inside its ratio family |
| Background as raster `<img>` | `data-fit="cover"` on the background layer |

**Per-layer mapping** — same as v1 except text/vector/smartObject are pre-rasterised by the Python worker and embedded as `<img>`. Adjustment layers are baked into the flattened preview only (not per-layer PNG) — known limitation.

**Determinism guarantees**
- Same PSD bytes → byte-identical HTML/CSS (sorted keys, stable ids `l<i>` / `g<i>`, no timestamps)
- Layer PNG filenames are content-hashed → cache hits cross-session
- Emit versioned via `data-emit-version`; bumping invalidates render caches but **not** the semantic cache

**Allowed AI edits** (Mode 8.3)
- CSS-variable values on `.layer` and `.kv` background
- `hidden` attr on `optional`-importance groups
- DOM order of `.group` elements

**Forbidden**
- `data-lid` / `data-gid` / `data-role` / `data-importance` — semantic identity
- `src` of any `<img>` — no swapping assets
- `--bm` (blend mode) — visual identity

### 10b. Semantic grouping (v2 — clustering-aware)

The expensive AI step, **cached aggressively** per PSD content hash.

**Heuristic pre-pass** ([src/lib/heuristics.ts](web/src/lib/heuristics.ts)) — runs in Node before the AI call. Spatial clustering via union-find detects:

- **Logo + plate behind it** — bottom layer is named "plate / bg / panel / chip / pill" or larger and z-adjacent, while a smaller layer above sits mostly inside it
- **Text + baked shadow/glow/stroke** — top layer name matches `shadow|glow|reflection|outline|stroke|fx|shade|blur|highlight` and its bbox overlaps the layer beneath
- **Unnamed shadow plates** — z-adjacent layer whose centroid is inside a smaller layer above, area within 4× ratio

These clusters are passed to the AI as **strong suggestions**, and used directly by the offline `StubAIProvider` for fully-offline operation.

**AI semantic pass** — multimodal call with the flattened source PNG + the heuristic clusters + the **Grouping** stage context. JSON-schema output:

```json
{
  "groups": [
    { "gid": "g1", "role": "headline", "label": "Opening celebration headline",
      "importance": "primary", "layerIds": ["l4", "l5"],
      "anchorHint": "top",
      "rationale": "Two text layers form one stacked headline" }
  ],
  "unassigned": ["l22"],
  "notes": "l22 looks like a stray scratch layer"
}
```

**Role taxonomy** (12 values) — `logo | headline | subhead | cta | product | subject | background | decoration | shadow_effect | texture | frame | disclaimer`. Closed set; importance defaults from role.

**Re-analyse** (new in v2) — `POST /api/psd/[id]/resemantic` re-runs the pass, overwrites the cache, replaces `Group` DB rows, **wipes every Render row + its files + the imagined references** (they referenced stale gids). Manual L2 notes survive.

### 10c. Re-layout prompts

Both AI resize modes share a structured output contract.

**AI Responsive** ([openai-provider.ts `reLayout`](web/src/lib/openai-provider.ts)) returns JSON conforming to a strict `ReLayoutResult` schema: `canvas: { w,h,background }, groups: [{ gid, hidden?, transform: {x,y,w,h,rot,scale}, layerOverrides[] }], domOrder, reasoning, hiddenJustified`. Server validates gid existence + applies the layout deterministically; AI never writes raw CSS.

**AI Rewrite** ([openai-provider.ts `rewriteHtml`](web/src/lib/openai-provider.ts)) returns `{ html, reasoning }`. HTML is sanitized via [sanitize-html.ts](web/src/lib/sanitize-html.ts) — strips `<script>`, external `<link rel=stylesheet>`, event handlers, javascript: URLs, off-asset `<img src>`, off-asset `url()`.

Both prompts receive: source flattened PNG + (imagined target reference if generated) + semantic inventory (`gid`/`role`/`importance`/`anchorHint`) + designer brief + previous-attempt `mustFix` (on retries).

### 10d. Verify loop

**Tier 1 — programmatic** ([src/lib/verify.ts](web/src/lib/verify.ts)) — bounds / safe-area / overlap / legibility-floor / background-coverage / hidden-primary. No AI call. If it fails, skip Tier-2 and feed the structured issues into the next retry's `mustFix`.

**Tier 2 — vision critique** — multimodal call with the rendered PNG + imagined reference + source flat + semantic inventory + the **Verify** stage context. Outputs:

```json
{
  "score": 0.78,
  "rubric": { "hierarchy": …, "legibility": …, "balance": …, "fidelity": …, "aesthetic": … },
  "issues": [{ "gid": "g4", "kind": "too_close_to_edge", "detail": "right edge" }],
  "suggestions": ["Move g4 left by ~16px", …]
}
```

**Pass rule:** Tier-1 clean **and** score ≥ 0.7 **and** legibility rubric ≥ 0.5. Borderline (0.6–0.7) ships with a "flagged" badge.

**Retry policy:** 3 attempts max. Attempt 1 mini @ temp 0.4; attempt 2 mini @ temp 0.1 + critique; attempt 3 escalates to the big model + full critique history. Best score wins.

**Critique → constraint translation:** `issues` become structured `mustFix` items appended to the next call's prompt. `suggestions` get rolled into L2 project notes for the next *generation*, not just the next attempt.

---

# Part 3 · Tech stack & data model

## 11. Tech stack

**Frontend**
- Next.js 16 (App Router, Turbopack), React 19, TypeScript
- Tailwind 4 + shadcn/ui, **light mode only**
- `transform: scale()` previews — iframes render at native target dimensions, scaled by CSS

**Backend**
- Next.js route handlers (no separate API server)
- Python FastAPI worker (`psd-tools` + Pillow) for PSD parse + per-layer raster
- Playwright (Chromium) for HTML → PNG screenshotting
- Queue: in-process, sequential per request

**Persistence**
- Prisma 7 with `@prisma/adapter-better-sqlite3` (zero-config local dev)
- File cache at `.cache/psd/<hash>/{layers,imagine}/`, `.cache/renders/<psdId>/`

**AI**
- **gpt-5.4-mini** for semantic / re-layout / verify / rewriteHtml / generateSourceHtml (configurable via `OPENAI_MODEL_TEXT`)
- **gpt-image-2-2026-04-21** for aesthetic reference generation via `images.edit` conditioned on the flattened source (configurable via `OPENAI_MODEL_IMAGE`)
- `AI_PROVIDER=stub` runs fully offline — heuristic semantic clustering + deterministic algorithm modes only

## 12. Data model (Prisma)

```prisma
Psd            id, hash, filename, w, h, createdAt,
               iterationNotes,           -- L2 context
               sourceEngine (algorithm|ai),
               sourceAiReason
Layer          psdId, lid, name, x,y,w,h,z, opacity, bm, pngPath, kind
Group          psdId, gid, role, label, importance, layerIds[], anchorHint, rationale
Render         psdId, mode, targetW, targetH, presetName, layoutJson,
               htmlPath, pngPath, status, score, rubricJson, reasoning,
               attempts, latencyMs, costUsd
               @@unique(psdId, mode, targetW, targetH)
ImagineRef     psdId, targetW, targetH, prompt, pngPath
Organization   id="default", brandName, voice, audience, doRules, dontRules, freeform,
               groupingContext, sourceEngineContext, resizeContext, verifyContext
```

## 13. API surface

| Endpoint | Purpose |
|---|---|
| `POST /api/upload` | Upload PSD; parse + heuristics + semantic pass; cache |
| `GET /api/asset/[hash]/[file]` | Serve layer PNGs / flattened previews |
| `GET /api/psd/[id]/source.html` | Serve active source engine's HTML |
| `POST /api/psd/[id]/source-engine` | Switch source engine; AI option generates and caches |
| `POST /api/psd/[id]/resemantic` | Re-run semantic pass; invalidate Renders + imagined refs |
| `POST /api/psd/[id]/resize` | Body: `mode` + `targets[]` + optional `nudge`. Runs full pipeline per (mode × target) |
| `PUT /api/psd/[id]/notes` | Update L2 project notes |
| `DELETE /api/psd/[id]` | Delete one PSD + its caches |
| `GET /api/render/[psdId]/[file]` | Serve rendered HTML / PNG |
| `GET / PUT /api/org-context` | L3 org context (10 fields) |
| `POST /api/admin/reset` | Wipe every PSD + caches; brand context kept |

---

# Part 4 · UX

## 14. Workspace shape (PSD detail page)

Reasoning: every new feature in v1 added another Card. The result was 9 cards stacked vertically with no hierarchy. v2 reshapes the page to match the user's actual job: **Source → Generate → Compare.**

```
┌─────────────────────────────────────────────────────────────────────┐
│ ← All PSDs                  Context · 3/5    Delete · start over    │
│ filename.psd                       1080×1080 · 12 layers · 5 groups │
├──────────────────────┬──────────────────────────────────────────────┤
│ SOURCE (sticky 340)  │ GENERATE                                     │
│  [live preview]      │   Pick mode(s) × size(s)…                    │
│                      │   [Naive][Group][AI Resp.][AI Rewrite]       │
│  Source engine       │   Sizes: [1:1][9:16][16:9][728×90] …         │
│  Algorithm · switch ▸│   Task brief …                               │
│                      │   [Generate · 12 renders]                    │
│  ─ Semantic groups + │                                              │
│  ─ Project notes   + │ ─────────────────────────────────────────── │
│                      │  COMPARE · by size                           │
│                      │   1080×1350           [fit/25/50/100]        │
│                      │   [Naive][Group][AI R.][AI W.]               │
│                      │   …                                          │
└──────────────────────┴──────────────────────────────────────────────┘
```

Engine choice and re-analyse, which were full-width cards in v1, are now **inline controls** inside the Source card. Semantic groups and Project notes are **collapsibles**, closed by default. The top context bar (5 stage chips) compresses to a single `Context · N/5` link in the toolbar.

## 15. Context surfaces

| # | Where | Scope · Stage | Action |
|---|---|---|---|
| 1 | `/settings` → Brand identity tab | L3 · brand | Brand name, voice, audience, do/don'ts |
| 2 | `/settings` → Grouping tab | L3 · grouping | Cluster rules, naming conventions |
| 3 | `/settings` → HTML engine tab | L3 · sourceEngine | Layout / type / styling preferences |
| 4 | `/settings` → Resize tab | L3 · resize | Ratio-change rules, what to hide |
| 5 | `/settings` → Verify tab | L3 · verify | Critique scoring priorities |
| 6 | PSD toolbar → `Context · N/5` | L3 status | Read-only deep-link |
| 7 | PSD source card → `Project notes` disclosure | L2 | Per-PSD hand notes + auto critique |
| 8 | PSD source card → inline engine switcher | reads L3 · sourceEngine | Trigger AI engine generation |
| 9 | PSD source card → Re-analyze button | reads L3 · grouping | Re-run semantic pass |
| 10 | Studio → Task brief textarea | L1 | This-render-only brief |

## 16. Reset / iteration touchpoints

| # | Where | Action |
|---|---|---|
| 1 | PSD toolbar → `Delete · start over` | Wipes this PSD + caches; back to home |
| 2 | Home header → `Clear all · start fresh` | Wipes every PSD + caches; brand context kept |
| 3 | Source card → `Re-analyze` (in Groups disclosure) | Re-runs semantic pass; clears Renders + imagined refs for this PSD |
| 4 | Source card → engine switcher | Switching invalidates AI Rewrite renders only |

---

# Part 5 · R&D evaluation

## 17. Success metrics

- ≥ 70 % of generated sizes accepted without nudging on the 10-PSD eval set
- ≥ 85 % with one nudge
- Average cost per resize < $0.05 after semantic cache hit
- Average time per resize < 20 s end-to-end
- Naive mode produces visibly worse outputs in ≥ 70 % of sizes vs. Group mode (sanity check that grouping matters)

## 18. Known limitations

- Adjustment layers (curves, hue/sat) are baked into the flattened preview but **not** into per-layer PNGs — visible if you isolate a layer in a non-trivial blend stack
- Live text editing not supported; all text rasterised
- No bring-your-own font / font-substitution intelligence in AI Rewrite
- One-shot HTML rewrite per target — no multi-pass progressive refinement beyond the 3-retry critique loop
- `gpt-image-2` reference can ignore the supplied source image; rate-limited under heavy use

## 19. Run

```sh
./start.command          # macOS — installs missing deps, runs migrations,
                         # starts worker (:8787) + web (:3000), opens browser

# manual
cd worker && uv run uvicorn app:app --host 127.0.0.1 --port 8787
cd web    && pnpm install && pnpm dlx prisma migrate dev && pnpm dev
```

Copy `web/.env.example` → `web/.env`, set `OPENAI_API_KEY`. Switch `AI_PROVIDER=stub` to run entirely offline.
