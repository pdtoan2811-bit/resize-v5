# PRD — AI-First PSD Resizer (Iteration 6)

**Owner:** Thomas
**Date:** 2026-05-20
**Status:** Draft / R&D

---

## 1. Problem

Brands need to resize a single hero PSD key visual into many ad formats (square → portrait → wide banner → thin skyscraper, etc.). Existing tools (Smartly.io) work for *similar* aspect ratios but break catastrophically on aggressive aspect-ratio changes because they treat layers as geometric boxes, not semantic design elements.

Real-world PSDs are messy:
- Hand-drawn layers, weird sizes, unnamed shadow/effect/decorative layers
- Designers rely on aesthetic intuition that pure x/y/w/h math cannot reproduce

Five prior iterations failed because the AI was asked to push raw layer coordinates around in bulk — it has no spatial grounding when reasoning over flat JSON of boxes.

## 2. Hypothesis (this iteration)

**Treat the PSD as an HTML/CSS document. Let the AI redesign the layout the way a web designer would re-flow a page.**

HTML/CSS is the AI's native habitat: flexbox, grid, absolute positioning, responsive breakpoints. Asking it to "make this layout work at 300×600 instead of 1080×1080" inside HTML/CSS gives it a representation it can actually reason about, instead of a list of opaque rectangles.

Then we render the modified HTML/CSS back to a flattened image (or back-map to PSD layers).

## 3. Goals / Non-Goals

**Goals**
- AI-first resizing across drastically different aspect ratios
- Semantic grouping & naming of layers, **cached per PSD** (cost + speed)
- Cheap, fast R&D loop using small OpenAI models where possible
- Designer can preview, accept, or nudge the result

**Non-Goals (for this iteration)**
- Round-trip back to editable PSD (export to PNG/JPG is enough for v1)
- Animation / video formats
- Multi-user collaboration, accounts, billing
- Pixel-perfect parity with the original — *aesthetic* parity is the bar

## 4. Target User

Performance marketers & creative ops at brands who already use PSD-based key visuals and currently rely on Smartly.io or manual designer hours to resize.

## 5. Core Flow

1. **Upload PSD** → parse layers (psd.js / ag-psd in browser, or psd-tools in Python worker)
2. **Semantic pass (cached)** → AI labels and groups layers (logo, headline, subhead, product, model/subject, background, decoration, shadow/effect). Cache keyed by PSD content hash.
3. **HTML/CSS transform** → emit a structured HTML doc where each semantic group is a positioned element with the layer's rendered PNG as its visual. Original square layout is the "source of truth" stylesheet.
4. **Target reference imagination** → for each target size, GPT Image 2 generates a low-fi aesthetic reference at the target ratio, conditioned on the flattened source + brief.
5. **AI re-layout** → small/fast model rewrites the HTML/CSS for the target viewport, using the imagined reference as an aesthetic anchor and the semantic group inventory as the parts list.
6. **Render** → headless Chromium screenshots the HTML at the target size → PNG/JPG.
7. **Verify loop** → vision model compares render vs. imagined reference + checks legibility, overlap, safe margins. If fail → up to N retries with critique fed back.
8. **Designer review** → side-by-side gallery; accept / regenerate / nudge with text.

## 6. Why HTML/CSS Beats Raw Coordinates

| Coordinates approach (failed) | HTML/CSS approach (this iter) |
|---|---|
| AI moves N boxes with x/y/w/h | AI edits flex/grid/absolute rules |
| No notion of "stack", "row", "center" | First-class layout primitives |
| Each layer independent → chaos | Containers enforce relationships |
| Hard to express "headline above product" | Trivial in DOM order + CSS |
| No standard to copy from | Trained on billions of responsive pages |

## 7. Caching Strategy (critical for cost)

**Cache key:** `sha256(psd_bytes)`

**Cached artifacts per PSD:**
- Parsed layer tree + each layer rendered as transparent PNG
- Semantic labels + groupings (the expensive AI pass)
- Source HTML/CSS at native size
- Flattened preview PNG
- Per-layer embedding (optional, for similarity nudges)

**Cache miss only on:** new PSD upload. Every subsequent resize for that PSD reuses everything above and only pays for the per-target re-layout call + image gen + render.

Storage: local filesystem (dev) → S3-compatible (later). Index in SQLite/Postgres.

## 8. Tech Stack (simple, R&D-friendly)

**Frontend**
- Next.js 15 App Router, React 19, TypeScript
- Tailwind + **shadcn/ui**, **light mode only**
- Canvas preview via plain `<img>` + CSS; no Konva/Fabric needed in v1
- File upload via dropzone

**Backend**
- Next.js Route Handlers for thin API
- Python worker (FastAPI) for PSD parsing — `psd-tools` is the most reliable
- Headless rendering: Playwright (Chromium) — screenshot the generated HTML
- Queue: lightweight — start with in-process; upgrade to BullMQ/Redis only if needed

**AI**
- **GPT-4.1-mini / GPT-5-mini** for semantic labeling, HTML/CSS rewriting, verification critique (cheap, fast)
- **GPT-4.1** only for the final re-layout if mini struggles on a target
- **GPT Image 2** for aesthetic reference generation per target ratio
- **gpt-4.1-mini vision** for the verify-loop critique

**Storage**
- SQLite + local FS for R&D
- Prisma ORM (so swap to Postgres is one env var later)

**No** Redis, no Kafka, no microservices, no auth provider, no Docker compose sprawl in v1.

## 9. Data Model (minimal)

```
Psd       id, hash, filename, width, height, createdAt
Layer     id, psdId, name, x, y, w, h, z, pngPath, kind
Group     id, psdId, label, semanticRole, layerIds[]
Render    id, psdId, targetW, targetH, html, css, pngPath, status, score
ImagineRef id, psdId, targetW, targetH, prompt, pngPath
```

## 10. AI Prompts (sketch)

**Semantic pass** — see §10b.

### 10b. Semantic Pass + Cache (the expensive step, run once per PSD)

**Goal:** turn a messy bag of layers into a tidy inventory of *semantic groups* the re-layout AI can reason about. This is the single most expensive AI call in the pipeline, so it's aggressively cached.

**Role taxonomy (closed set, v1)**

| Role | Description | Importance default |
|---|---|---|
| `logo` | Brand mark / wordmark | primary |
| `headline` | Main message text | primary |
| `subhead` | Secondary text | secondary |
| `cta` | Button or call-to-action text | primary |
| `product` | The thing being sold | primary |
| `subject` | Model, person, mascot, hero illustration | primary |
| `background` | Full-canvas backdrop (photo, gradient, solid) | structural |
| `decoration` | Confetti, sparkles, dots, arbitrary shapes | optional |
| `shadow_effect` | Drop shadows, glows, reflections rendered as separate layers | optional |
| `texture` | Noise, grain, paper texture overlays | optional |
| `frame` | Borders, badges, ribbons, sale tags | secondary |
| `disclaimer` | Legal / fine print | secondary |

**Importance tiers** (drives what the re-layout AI may hide or shrink):
- `primary` — must remain visible & legible at every target size
- `secondary` — may shrink, may move below the fold of a banner, must not be hidden
- `structural` — must remain (e.g., background)
- `optional` — may be hidden when space-constrained

**Input to the model**

- A contact-sheet PNG: grid of every layer's thumbnail (max 256px each), labeled with `lid`, original layer name, bbox, and a tiny crop preview of where it sits on the full canvas.
- The flattened source PNG at ≤1024px wide, for global context.
- The PSD's native size and layer count.

We pass the contact sheet as one multimodal image rather than N image attachments — much cheaper and the model can compare layers spatially.

**Output schema (strict JSON)**

```json
{
  "groups": [
    {
      "gid": "g1",
      "role": "headline",
      "label": "Summer Sale headline",
      "importance": "primary",
      "layerIds": ["l4", "l5"],
      "rationale": "Two layers — text + its baked stroke — read as one semantic unit",
      "anchorHint": "top-left"
    }
  ],
  "unassigned": ["l22"],
  "notes": "l22 looks like a stray scratch layer"
}
```

- Every non-hidden layer must appear in exactly one group **or** in `unassigned`. Validated; failure → one retry with the error message, then fall back to "each layer is its own group" + flag for designer review.
- `anchorHint` ∈ `top-left | top | top-right | left | center | right | bottom-left | bottom | bottom-right | full`. Used as a soft prior by the re-layout AI.
- `label` is human-readable, used in the UI's group tree.

**Heuristic pre-pass (deterministic, before AI)**

Runs in the Python worker to cheapen the AI call:
- Detect background: any layer whose opaque bbox ≥ 90% of canvas and z-index is lowest → tentatively `background`.
- Detect shadow/effect: layer whose name matches `/shadow|glow|reflection|fx/i` **or** whose pixels are ≥95% single-hue low-saturation and sit directly under another layer → tentatively `shadow_effect`.
- Detect texture: layer with `mix-blend-mode` ≠ normal and covering ≥70% of canvas → tentatively `texture`.
- Cluster spatially-overlapping layers with similar centroid into candidate groups.

These hints are passed to the AI as *suggestions*, not commitments. The AI can override.

**Cache**

- **Key:** `sha256(psd_bytes) || ":" || semantic_prompt_version`
- **Value:** the JSON above + the contact-sheet PNG + per-layer PNGs + heuristic pre-pass output
- **Invalidation:** bumping `semantic_prompt_version` (when we improve the prompt) invalidates; uploading a new PSD with different bytes is a new key by definition
- **Designer override:** when the designer renames a group or moves a layer between groups in the UI, we **don't** re-run the AI. We patch the cached JSON in place and bump a `userEdits` counter. The patched JSON is what downstream steps see. This means designer corrections are free.
- **Re-run trigger:** explicit "Re-analyze" button in UI (rare; for when the AI got it badly wrong and designer doesn't want to hand-fix).

**Cost target:** one semantic pass < $0.02 with gpt-4.1-mini vision. Every resize after that pays $0 for this step.

**HTML emit** — deterministic; not an AI call. See §10a below for the full spec.

### 10a. PSD → HTML/CSS Emit Rules (deterministic)

This step is **not** an AI call. It is a pure function `emitHtml(psd, groups) → {html, css}`. Determinism matters because the re-layout AI edits this output; if emit is unstable, the AI's edits stop being meaningful.

**Document shape**

```html
<!doctype html>
<html data-w="1080" data-h="1080">
  <body>
    <div class="kv" style="--w:1080;--h:1080">
      <div class="bg" data-role="background">…</div>
      <div class="group" data-role="product" data-importance="primary" data-gid="g3">
        <img class="layer" data-lid="l17" src="/cache/<hash>/l17.png"
             style="--x:120;--y:340;--w:540;--h:540;--z:5;--op:1;--rot:0;
                    --bm:normal" />
        …
      </div>
      …
    </div>
  </body>
</html>
```

CSS uses CSS variables so the re-layout AI can rewrite *values* without rewriting structure:

```css
.kv { position:relative; width:calc(var(--w)*1px); height:calc(var(--h)*1px); background:#fff; }
.group { position:absolute; inset:0; }                       /* groups span the canvas; children are positioned */
.layer {
  position:absolute;
  left:  calc(var(--x)*1px);
  top:   calc(var(--y)*1px);
  width: calc(var(--w)*1px);
  height:calc(var(--h)*1px);
  z-index: var(--z);
  opacity: var(--op);
  transform: rotate(calc(var(--rot)*1deg));
  mix-blend-mode: var(--bm);
}
```

**Per-layer mapping**

| PSD concept | HTML/CSS treatment |
|---|---|
| Raster layer | `<img>` of the layer's transparent PNG (pre-rasterized by Python worker) |
| Text layer | **Rasterized to PNG in v1.** No live `<p>` / web fonts. Avoids font-substitution drift. Original text stored in `data-text` for future. |
| Smart object | Flattened to PNG at its rendered resolution |
| Vector shape | Rasterized to PNG at 2× for crispness |
| Adjustment layer (curves, hue/sat, etc.) | **Dropped in v1.** Their effect is baked into the flattened preview but not into individual layer PNGs. Tracked as risk. |
| Clipping mask | Apply mask in the worker, export the already-clipped PNG |
| Vector / raster layer mask | Same — bake into the PNG |
| Layer effects (drop shadow, outer glow, stroke) | Baked into the PNG with sufficient padding (see "bbox padding") |
| Blend mode | Mapped to `mix-blend-mode` when supported (`multiply`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion`, `hue`, `saturation`, `color`, `luminosity`). Unsupported modes (`linear-dodge`, `vivid-light`, etc.) → fallback to `normal` and flag in `data-bm-original`. |
| Opacity / fill | Combined into `--op` (0–1). If layer has effects with independent fill, bake into PNG. |
| Group / folder | Becomes a semantic `<div class="group">` only if the semantic pass assigns it a role; otherwise its children are flattened to the parent semantic group. PSD folder structure is *not* preserved 1:1. |
| Hidden layer | Skipped entirely |
| Locked layer | Treated normally; lock flag stored in `data-locked` so re-layout AI may avoid moving it |

**Bbox & padding**

- Each layer PNG is exported at its **effects-inclusive bounding box** (shadow/glow extends the bbox). `x,y` are the top-left of that bbox in canvas coords — not the layer's logical position.
- Worker stores both `effectsBbox` and `contentBbox` (tight crop of opaque pixels) so the re-layout AI can reason about visual vs. hit-area extents.
- All coords are **integer pixels at native PSD resolution**. No subpixel.

**Z-order**

- `--z` is the PSD stacking index (0 = bottom). Re-layout AI may reorder *within* a group but must not cross the `background` ↔ `subject` ↔ `foreground/text` band without an explicit reason logged in its response.

**Group → div rules**

- One `<div class="group">` per semantic group from §10's semantic pass.
- Groups are ordered in the DOM by ascending min-`--z` of their layers (painter's order). Re-layout AI may reorder DOM but the renderer relies on `--z` for actual stacking; DOM order is a hint for the AI's reasoning.
- A group's children retain their relative offsets so the group reads as one composable unit. The re-layout AI typically moves the *group* (by adjusting all child `--x/--y` by a delta, or by wrapping in a transform) rather than individual layers.

**Background special-case**

- If the semantic pass tags a layer/group as `background`, emit it with `inset:0; width:100%; height:100%` and `object-fit:cover` on its `<img>`. This lets the AI resize the canvas without leaving white edges.
- If background is a solid color or simple gradient (detected by the worker via histogram), emit as CSS `background` on `.kv` instead of an `<img>` — cheaper and cleaner to re-flow.

**Safe areas**

- Emit `data-safe-top/right/bottom/left` on `.kv` (default 4% of min dimension). Re-layout AI must keep `logo`, `headline`, `cta` groups inside the safe area at the target size.

**Fonts (v1 policy)**

- All text rasterized. No `@font-face`. No live text editing.
- Original font name, size, tracking, leading, color are stored in `data-text-meta` on the group for future iterations (live-text mode, font-substitution mode).

**Determinism guarantees**

- Same PSD bytes → byte-identical HTML and CSS output (sorted keys, stable ids `l<layerIndex>` / `g<groupIndex>`, no timestamps, no random ids).
- Layer PNG filenames are content-hashed so cache hits work cross-session.
- Emit is versioned: `data-emit-version="1"` on `<html>`. Bumping the version invalidates rendered caches but **not** the semantic cache.

**What the re-layout AI is allowed to change**

- Any CSS variable on `.kv` (`--w`, `--h`) and on `.layer` (`--x`, `--y`, `--w`, `--h`, `--rot`, `--op`)
- `.kv` background color/gradient
- DOM order of `.group` elements
- Add `hidden` attribute to a `.group` (only `decoration` or `shadow_effect` roles, unless explicitly justified)
- Wrap a `.group` in an extra positioning div if needed (rare; flagged in response)

**What the AI must not change**

- `data-lid`, `data-gid`, `data-role`, `data-importance`
- `src` of any `<img>` (no swapping assets)
- `--bm` (blend mode) — visual identity
- `data-emit-version`

**Re-layout** — see §10c.

### 10c. Re-layout Prompt Spec

The hot path. Called once per (PSD, target size) — and possibly retried by the verify loop. Cost discipline is critical: this is the only step that scales with the number of target sizes.

**Inputs** (multimodal, single call)

1. **System prompt** — role, hard constraints, output contract (constant, cached server-side as a string).
2. **Source HTML+CSS** (the §10a emit) — full text.
3. **Group inventory JSON** — the §10b output, trimmed to `{gid, role, importance, anchorHint, contentBbox, effectsBbox}` per group.
4. **Source flattened PNG** (≤1024 wide).
5. **Imagined reference PNG** for this target ratio (≤1024 wide).
6. **Target size** — `{w, h, name, safeArea}`.
7. **Optional designer nudge** — free text + optional reference image.
8. **Optional critique** — from the previous verify-loop failure (see §10d).

**Output (strict JSON, not raw CSS)**

```json
{
  "canvas": { "w": 300, "h": 600, "background": "#F5E9D6" },
  "groups": [
    {
      "gid": "g3",
      "hidden": false,
      "transform": { "x": 20, "y": 380, "w": 260, "h": 200, "rot": 0, "scale": 0.62 },
      "layerOverrides": [
        { "lid": "l17", "x": 0, "y": 0, "w": 260, "h": 200, "op": 1 }
      ]
    }
  ],
  "domOrder": ["g0", "g2", "g3", "g1"],
  "reasoning": "Banner is tall+narrow. Stacked headline on top, product mid, CTA bottom. Hid g5 decoration — no room.",
  "hiddenJustified": { "g5": "decoration, insufficient vertical space" }
}
```

- The server applies this to the §10a emit deterministically. **The AI does not write raw CSS.** This kills a whole class of failures (typos, broken selectors, units, calc errors) and lets us validate structurally.
- `transform.scale` is a convenience: applied uniformly to the group's children if `layerOverrides` is empty.
- Coords are in target-canvas pixels. Server validates: every group fits in canvas (warn if not), primary groups inside `safeArea`, no `hidden:true` on primary/structural roles without explicit override flag.

**Hard constraints (in system prompt)**

- You may only reference `gid`s and `lid`s that exist in the input. Inventing ids → reject + retry.
- `primary` groups must be fully inside the safe area.
- `primary` and `structural` groups may not be hidden.
- `secondary` may be hidden only if the designer's nudge explicitly allows.
- `optional` may be hidden freely; explain in `hiddenJustified`.
- Do not change blend modes, asset srcs, or roles.
- `logo`, `headline`, and `cta` must be at least N pixels tall (N = `max(14, 0.04 * min(w,h))`) to ensure legibility.
- Preserve relative ordering of `background` < everything else < `frame`/`disclaimer` unless you justify in `reasoning`.

**Soft guidance**

- The imagined reference is an **aesthetic anchor**, not a ground truth. Match its composition energy (where mass sits, breathing room, focal hierarchy) — not its pixels.
- Use `anchorHint` from the inventory as the prior for each group's placement when the target ratio differs sharply from source.
- Prefer scaling groups uniformly to squashing them. If a group must change aspect, prefer cropping via container, not stretching.

**Model selection**

- Default: `gpt-4.1-mini` (or current "mini" equivalent).
- Auto-escalate to `gpt-4.1` if:
  - Target ratio differs from source by > 2× in either axis, **or**
  - Verify loop failed twice with `gpt-4.1-mini`.
- Cap escalations per resize.

**Token economy**

- Source HTML can be large with many layers. Strip the `<img src>` paths to bare `l<id>` references in the prompt copy (the AI doesn't need the URLs; the server reconstructs them). Roughly halves token count on layer-heavy PSDs.
- Inventory JSON is sent compact (no whitespace).
- Reference images at 1024 wide max; auto-resize.

**Failure modes & handling**

| Failure | Handling |
|---|---|
| Invalid JSON | One repair retry with parser error appended |
| Unknown gid/lid | Reject, retry with diff of valid ids |
| Primary group outside safe area | Auto-nudge into safe area if shift < 8% of canvas; else send back as critique |
| Hidden primary | Hard reject, retry |
| All groups overlap > 80% | Treat as a layout collapse; retry with stricter prompt + smaller temperature |

**Determinism**

- `temperature: 0.4` default. Set to `0.1` on retries to converge.
- `seed` derived from `(psdHash, targetW, targetH, attemptN)` so retries are reproducible during eval.

**Verify** — see §10d.

### 10d. Verify Loop

The safety net. A small vision model audits each render before it ships to the gallery, and feeds structured critique back into §10c on failure.

**Two-tier verification**

**Tier 1 — Programmatic checks (no AI call, runs first)**

Fast, cheap, catches obvious breakage:

- **Bounds:** every primary group's rendered bbox fully inside canvas and inside safe area.
- **Overlap:** primary groups overlap each other by ≤ 15% of the smaller group's area. (`background` and `texture` exempt.)
- **Legibility floor:** `logo`, `headline`, `cta` rendered height ≥ legibility minimum.
- **Coverage:** background covers 100% of canvas (no white edges).
- **Off-canvas:** no visible group's centroid is outside the canvas.
- **Empty render:** rendered PNG isn't blank / single-color (entropy check).

If Tier 1 fails, skip the AI call — generate a synthetic critique from the failing checks and go straight to retry.

**Tier 2 — Vision-model critique**

Only if Tier 1 passes. Cheap model (mini), one call.

Inputs:
- The rendered PNG at target size
- The imagined reference PNG for this target
- The source flattened PNG (for brand recognition)
- Group inventory (compact)
- Designer brief / nudge if any

Output schema:

```json
{
  "pass": false,
  "score": 0.62,
  "rubric": {
    "hierarchy":   { "score": 0.7, "note": "Headline reads first, good." },
    "legibility":  { "score": 0.4, "note": "CTA text is squeezed against the right edge." },
    "balance":     { "score": 0.6, "note": "Heavy bottom; top feels empty." },
    "fidelity":    { "score": 0.8, "note": "Brand identity preserved." },
    "aesthetic":   { "score": 0.5, "note": "Less polished than reference." }
  },
  "issues": [
    { "gid": "g4", "kind": "too_close_to_edge", "side": "right", "severityPx": 12 },
    { "gid": "g2", "kind": "feels_floating", "suggestion": "anchor to headline baseline" }
  ],
  "suggestions": [
    "Move g4 left by ~16px",
    "Increase g1 size by 10% to fill top breathing room"
  ]
}
```

**Pass rule**

- `pass = true` iff Tier 1 clean **and** `score ≥ 0.7` **and** no `legibility` rubric < 0.5.
- Borderline: `0.6 ≤ score < 0.7` → ship but flag in UI with "needs review" badge.
- Below 0.6 → retry.

**Retry policy**

- Max 3 total attempts per (PSD, target size).
- Attempt 1: `gpt-4.1-mini`, temp 0.4.
- Attempt 2: same model, temp 0.1, critique appended.
- Attempt 3: escalate to `gpt-4.1`, temp 0.1, full critique history.
- After 3 fails: ship the highest-scored attempt and mark "best effort" in the UI.

**Critique → constraint translation**

The raw critique is not fed back as prose. The server translates `issues[]` into structured constraints appended to the next §10c prompt:

```json
{
  "previousAttempt": { "score": 0.62 },
  "mustFix": [
    { "gid": "g4", "constraint": "rightEdgeGte", "value": 16 },
    { "gid": "g2", "constraint": "attachBelow", "ref": "g1", "gap": 8 }
  ],
  "freeAdvice": ["Increase g1 size by 10% to fill top breathing room"]
}
```

Structured `mustFix` items are also re-checked in Tier 1 of the next attempt — closes the loop deterministically.

**Cost ceiling per resize**

- 1 semantic pass (amortized: ~$0 after cache hit on subsequent resizes)
- 1 imagined reference (GPT Image 2)
- 1–3 re-layout calls (mini, occasionally 4.1)
- 1–3 verify calls (mini)
- Target: ≤ $0.05 per resize on the median PSD after cache warm-up.

**Metrics emitted per resize** (for the eval set)

`attempts`, `tier1FailCounts{check→n}`, `finalScore`, `rubricBreakdown`, `escalatedToBig`, `latencyMs`, `costUsd`. Logged to SQLite for the eval dashboard.

## 11. UI (shadcn, light mode)

- **Upload screen**: dropzone, recent PSDs list
- **PSD detail**: left = source preview + semantic group tree (editable labels), right = "Generate sizes" panel with preset chips (1:1, 4:5, 9:16, 16:9, 300×600, 728×90, 160×600) + custom W×H
- **Results gallery**: grid of target sizes, each card shows render + status badge + actions (regenerate, nudge, download, view HTML)
- **Nudge dialog**: text input + optional reference image; triggers re-layout with extra constraint
- Components: `Card`, `Button`, `Input`, `Dialog`, `Tabs`, `Badge`, `Tooltip`, `ScrollArea`, `Sonner` for toasts

## 12. Milestones

**M1 — Parse + Semantic Cache (week 1)**
Upload PSD → parse → label/group via AI → cache. UI shows group tree.

**M2 — HTML Emit + Render (week 1–2)**
Deterministic PSD→HTML. Playwright screenshot matches source within visual tolerance.

**M3 — Imagined Reference (week 2)**
GPT Image 2 produces target-ratio refs from flattened source.

**M4 — AI Re-layout v1 (week 2–3)**
Mini model rewrites CSS for one new ratio. Manual eval on 10 PSDs × 4 ratios.

**M5 — Verify Loop (week 3)**
Add critique + retry. Track pass rate.

**M6 — Gallery + Nudge UI (week 4)**
End-to-end demoable.

## 13. Success Metrics (R&D)

- ≥70% of generated sizes accepted without nudging on the 10-PSD eval set
- ≥85% with one nudge
- Average cost per resize < $0.05 (after semantic cache hit)
- Average time per resize < 20s end-to-end

## 14. Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| HTML render ≠ PSD render (fonts, blend modes) | Rasterize each layer to PNG up front; HTML just positions PNGs. No live text in v1. |
| AI ignores imagined reference | Pass reference image directly in the multimodal prompt; verify loop scores against it. |
| Aggressive ratio still breaks | Allow AI to hide `decoration`/`shadow_effect` groups; mark `importance` tiers. |
| Cost blowup on iteration | Cache semantic pass; default to mini models; cap retries at 3. |
| Messy unnamed layers | Semantic pass *renames* them; designer can correct in the group tree and re-cache. |

## 15. Out of Scope (explicit)

- Editable PSD export
- Video / Lottie / animation
- Live text editing / font substitution intelligence
- Brand-kit memory across PSDs (later)
- Auth, billing, multi-tenant
