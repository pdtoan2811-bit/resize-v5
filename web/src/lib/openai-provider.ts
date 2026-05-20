import OpenAI, { toFile } from "openai";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ROLE_DEFAULT_IMPORTANCE,
  ROLES,
  type ParsedPsd,
  type ReLayoutResult,
  type SemanticResult,
  type SemanticGroup,
  type Role,
  type Importance,
} from "./types";
import type { AIProvider, HeuristicHints, ReLayoutArgs, RewriteHtmlArgs, VerifyArgs } from "./ai-provider";
import { sanitizeRewrittenHtml } from "./sanitize-html";
import { renderContextPrompt, type LayeredContext } from "./context";
import { imagineDir, ensureDir } from "./storage";

const TEXT_MODEL = process.env.OPENAI_MODEL_TEXT ?? "gpt-5.4-mini";
const IMAGE_MODEL = process.env.OPENAI_MODEL_IMAGE ?? "gpt-image-2-2026-04-21";

function client(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  return new OpenAI({ apiKey });
}

async function fileToDataUrl(filePath: string, mime = "image/png"): Promise<string> {
  const buf = await readFile(filePath);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

// ─── Semantic pass ──────────────────────────────────────────────────────────────

const SEMANTIC_SYSTEM = `You are a senior creative director analyzing a key-visual PSD.
Group its layers into semantic units that a layout engine can re-flow at any aspect ratio.

Designers are often messy — they leave layers unnamed, draw plates and shadows
as separate floating layers, and don't always put related layers in a folder.
Your job is to recognise these aesthetic relationships and *combine* layers into
the right semantic groups. Specifically, combine layers when:

  • A layer sits visually behind another and shares its footprint (a logo plate
    behind a logo, a CTA pill behind CTA text, a callout chip behind a number).
  • A layer is a baked shadow / glow / stroke / reflection of another layer
    (z-adjacent, similar bbox, often unnamed).
  • A decorative shape, sparkle, or arc visually wraps or attaches to a focal
    element — group it with that element.
  • A small floating accent (badge, ribbon, "NEW" mark) hugs a focal element.

Rules:
- Every visible layer must appear in exactly one group OR in "unassigned".
- A group is one or more layers that READ AS ONE design unit at a glance.
- Choose roles from the closed set provided. Importance follows role defaults unless you justify otherwise.
- anchorHint: where the group naturally sits in the source composition.
- label is human-readable, used in the designer UI.
- rationale: one sentence on why these layers belong together — especially valuable for messy/unnamed layers.
- notes flags anything weird (stray scratch layers, ambiguous naming).

The heuristic pre-pass provides candidate clusters based on spatial overlap.
Treat these as STRONG suggestions: keep them grouped unless they visually
read as separate units. You may also merge or split them when the image says otherwise.`;

const SEMANTIC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    groups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          gid: { type: "string" },
          role: { type: "string", enum: [...ROLES] },
          label: { type: "string" },
          importance: { type: "string", enum: ["primary", "secondary", "structural", "optional"] },
          layerIds: { type: "array", items: { type: "string" } },
          anchorHint: {
            type: ["string", "null"],
            enum: ["top-left","top","top-right","left","center","right","bottom-left","bottom","bottom-right","full", null],
          },
          rationale: { type: ["string", "null"] },
        },
        required: ["gid", "role", "label", "importance", "layerIds", "anchorHint", "rationale"],
      },
    },
    unassigned: { type: "array", items: { type: "string" } },
    notes: { type: ["string", "null"] },
  },
  required: ["groups", "unassigned", "notes"],
} as const;

function layerInventoryForPrompt(psd: ParsedPsd): string {
  const lines = psd.layers
    .filter((l) => !l.hidden)
    .map(
      (l) =>
        `- ${l.lid}  name="${l.name}"  kind=${l.kind}  bbox=${l.x},${l.y} ${l.w}x${l.h}  z=${l.z}  bm=${l.bm}  op=${l.opacity}`
    );
  return lines.join("\n");
}

// ─── Re-layout ──────────────────────────────────────────────────────────────────

const RELAYOUT_SYSTEM = `You are an ad-layout designer translating a square key visual into a target ad size.

You output STRUCTURED JSON, never raw CSS. The server applies it.

Hard constraints (must respect):
- Only reference gids that exist in the input.
- 'primary' groups must be fully inside the safe area.
- 'structural' groups (typically background) must remain visible.
- 'primary' and 'structural' groups may NOT be hidden.
- 'optional' groups (decoration, shadow_effect, texture) MAY be hidden when space is tight — explain in hiddenJustified.
- Do not invent new layers or change blend modes.
- Preserve relative depth: background underneath, text/cta on top.

Soft guidance:
- The imagined reference image is an aesthetic anchor — match its composition energy, NOT its pixels.
- Use each group's anchorHint as a prior when the target ratio differs sharply from source.
- Prefer scaling groups uniformly over squashing them.
- Keep logo/headline/cta legible (height >= max(14, 4% of min canvas dim)).
- Reasoning: one sentence explaining your layout choice for this target.

Output coordinates are in target-canvas pixels. The server will translate them to
percentages of the canvas so the final HTML is responsive: it must look correct
when the canvas is scaled up or down (within the same aspect ratio). Therefore,
think relationally — anchor groups to canvas edges/centers, leave breathing room
proportional to the canvas, and avoid placements that only work at one resolution.`;

const RELAYOUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    canvas: {
      type: "object",
      additionalProperties: false,
      properties: {
        w: { type: "integer" },
        h: { type: "integer" },
        background: { type: ["string", "null"] },
      },
      required: ["w", "h", "background"],
    },
    groups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          gid: { type: "string" },
          hidden: { type: ["boolean", "null"] },
          transform: {
            type: ["object", "null"],
            additionalProperties: false,
            properties: {
              x: { type: ["integer", "null"] },
              y: { type: ["integer", "null"] },
              w: { type: ["integer", "null"] },
              h: { type: ["integer", "null"] },
              rot: { type: ["number", "null"] },
              scale: { type: ["number", "null"] },
            },
            required: ["x", "y", "w", "h", "rot", "scale"],
          },
          layerOverrides: {
            type: ["array", "null"],
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                lid: { type: "string" },
                x: { type: ["integer", "null"] },
                y: { type: ["integer", "null"] },
                w: { type: ["integer", "null"] },
                h: { type: ["integer", "null"] },
                op: { type: ["number", "null"] },
              },
              required: ["lid", "x", "y", "w", "h", "op"],
            },
          },
        },
        required: ["gid", "hidden", "transform", "layerOverrides"],
      },
    },
    domOrder: { type: ["array", "null"], items: { type: "string" } },
    reasoning: { type: ["string", "null"] },
    hiddenJustified: {
      type: ["object", "null"],
      additionalProperties: { type: "string" },
    },
  },
  required: ["canvas", "groups", "domOrder", "reasoning", "hiddenJustified"],
} as const;

// ─── Verify critique ────────────────────────────────────────────────────────────

const VERIFY_SYSTEM = `You are reviewing a generated ad layout against an aesthetic reference.
Score 5 rubrics 0-1 and list concrete issues. Be specific about which group/edge.

- hierarchy: does the eye land where it should?
- legibility: is every primary group readable, not crushed, not over-cropped?
- balance: weight distribution; any group floating or stranded?
- fidelity: brand identity preserved (logo/product/colors)?
- aesthetic: polish vs the reference's composition energy.

Issues use 'kind' from: too_close_to_edge, feels_floating, overlap, too_small, hidden_primary, color_clash, awkward_crop, other.
Suggestions are short imperatives the layout engine can act on.`;

const VERIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "number" },
    rubric: {
      type: "object",
      additionalProperties: false,
      properties: {
        hierarchy: { type: "object", additionalProperties: false, properties: { score: { type: "number" }, note: { type: "string" } }, required: ["score", "note"] },
        legibility: { type: "object", additionalProperties: false, properties: { score: { type: "number" }, note: { type: "string" } }, required: ["score", "note"] },
        balance: { type: "object", additionalProperties: false, properties: { score: { type: "number" }, note: { type: "string" } }, required: ["score", "note"] },
        fidelity: { type: "object", additionalProperties: false, properties: { score: { type: "number" }, note: { type: "string" } }, required: ["score", "note"] },
        aesthetic: { type: "object", additionalProperties: false, properties: { score: { type: "number" }, note: { type: "string" } }, required: ["score", "note"] },
      },
      required: ["hierarchy", "legibility", "balance", "fidelity", "aesthetic"],
    },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          gid: { type: ["string", "null"] },
          kind: { type: "string" },
          detail: { type: "string" },
        },
        required: ["gid", "kind", "detail"],
      },
    },
    suggestions: { type: "array", items: { type: "string" } },
  },
  required: ["score", "rubric", "issues", "suggestions"],
} as const;

// ─── Provider ───────────────────────────────────────────────────────────────────

function safeRole(r: string): Role {
  return (ROLES as readonly string[]).includes(r) ? (r as Role) : "decoration";
}

export class OpenAIProvider implements AIProvider {
  async semanticPass(psd: ParsedPsd, hints: HeuristicHints, context?: LayeredContext): Promise<SemanticResult> {
    const c = client();
    const flatDataUrl = await fileToDataUrl(psd.flattenedPath);
    const inventory = layerInventoryForPrompt(psd);
    const clustersTxt = hints.groupCandidates
      .filter((c) => c.lids.length >= 2)
      .map((c) => `  - [${c.lids.join(", ")}]  — ${c.rationale}`)
      .join("\n");
    const hintsTxt = [
      hints.backgroundLid ? `Likely background: ${hints.backgroundLid}` : "",
      hints.shadowLids.length ? `Likely shadow/effects: ${hints.shadowLids.join(", ")}` : "",
      hints.textureLids.length ? `Likely textures: ${hints.textureLids.join(", ")}` : "",
      clustersTxt ? `Spatial cluster candidates (strong suggestions):\n${clustersTxt}` : "",
    ].filter(Boolean).join("\n");

    const ctxPreamble = context ? renderContextPrompt(context) : "";
    const systemMsg = ctxPreamble ? `${SEMANTIC_SYSTEM}\n\n${ctxPreamble}` : SEMANTIC_SYSTEM;

    const res = await c.chat.completions.create({
      model: TEXT_MODEL,
      messages: [
        { role: "system", content: systemMsg },
        {
          role: "user",
          content: [
            { type: "text", text:
`Canvas: ${psd.width}×${psd.height}

Layer inventory (lid, name, bbox=x,y w x h, z, blend mode, opacity):
${inventory}

Heuristic hints (suggestions, not commitments):
${hintsTxt || "(none)"}

The image below is the flattened source. Group the layers semantically and return JSON.` },
            { type: "image_url", image_url: { url: flatDataUrl } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "SemanticResult", strict: true, schema: SEMANTIC_SCHEMA as unknown as Record<string, unknown> },
      },
    });

    const raw = res.choices[0]?.message?.content;
    if (!raw) throw new Error("semanticPass: empty response");
    const parsed = JSON.parse(raw) as {
      groups: Array<{ gid: string; role: string; label: string; importance: string; layerIds: string[]; anchorHint: string | null; rationale: string | null }>;
      unassigned: string[];
      notes: string | null;
    };

    const validLids = new Set(psd.layers.filter((l) => !l.hidden).map((l) => l.lid));
    const groups: SemanticGroup[] = parsed.groups
      .filter((g) => g.layerIds.some((lid) => validLids.has(lid)))
      .map((g, i) => {
        const role = safeRole(g.role);
        const importance = (["primary", "secondary", "structural", "optional"] as Importance[]).includes(g.importance as Importance)
          ? (g.importance as Importance)
          : ROLE_DEFAULT_IMPORTANCE[role];
        return {
          gid: g.gid || `g${i}`,
          role,
          label: g.label,
          importance,
          layerIds: g.layerIds.filter((lid) => validLids.has(lid)),
          anchorHint: (g.anchorHint as SemanticGroup["anchorHint"]) ?? undefined,
          rationale: g.rationale ?? undefined,
        };
      });

    // Anything the model dropped becomes its own decoration group so the renderer doesn't lose it.
    const covered = new Set(groups.flatMap((g) => g.layerIds));
    const orphans = [...validLids].filter((lid) => !covered.has(lid));
    let idx = groups.length;
    for (const lid of orphans) {
      const layer = psd.layers.find((l) => l.lid === lid)!;
      groups.push({
        gid: `g${idx++}`,
        role: "decoration",
        label: layer.name || lid,
        importance: "optional",
        layerIds: [lid],
        rationale: "Orphan layer not covered by AI grouping",
      });
    }

    return { groups, unassigned: parsed.unassigned ?? [], notes: parsed.notes ?? undefined };
  }

  async imagineReference(psd: ParsedPsd, targetW: number, targetH: number): Promise<{ pngPath: string; prompt: string } | null> {
    const c = client();
    const dir = imagineDir(psd.hash);
    await ensureDir(dir);
    const outPath = path.join(dir, `${targetW}x${targetH}.png`);

    // Cache: skip if already generated
    try { await readFile(outPath); return { pngPath: outPath, prompt: "cached" }; } catch {}

    const ratioDesc = targetW === targetH
      ? "square"
      : targetW > targetH * 1.5
        ? "wide landscape banner"
        : targetH > targetW * 1.5
          ? "tall portrait / skyscraper"
          : targetW > targetH
            ? "landscape"
            : "portrait";

    const prompt = `Aesthetic composition reference for a ${targetW}x${targetH} (${ratioDesc}) ad layout, derived from the supplied source key visual.
Keep the brand identity, color palette, and main subject. Re-flow composition for this aspect ratio with proper hierarchy: brand mark, headline area, focal subject/product, CTA region. Use clean ad-design composition with breathing room and safe margins. No text content needed — block shapes are fine. Output should read as a low-fi layout study, not a finished render.`;

    // Pick the closest supported size to the target ratio.
    const size = pickImageSize(targetW, targetH);
    try {
      const refBuf = await readFile(psd.flattenedPath);
      const refFile = await toFile(refBuf, "source.png", { type: "image/png" });
      const result = await c.images.edit({
        model: IMAGE_MODEL,
        image: refFile,
        prompt,
        size: size as "1024x1024" | "1024x1536" | "1536x1024" | "auto",
        n: 1,
      });
      const b64 = result.data?.[0]?.b64_json;
      if (b64) {
        await writeFile(outPath, Buffer.from(b64, "base64"));
        return { pngPath: outPath, prompt };
      }
      const url = result.data?.[0]?.url;
      if (url) {
        const res = await fetch(url);
        const buf = Buffer.from(await res.arrayBuffer());
        await writeFile(outPath, buf);
        return { pngPath: outPath, prompt };
      }
      return null;
    } catch (e) {
      console.error("imagineReference failed:", e instanceof Error ? e.message : e);
      return null;
    }
  }

  async reLayout(args: ReLayoutArgs): Promise<ReLayoutResult> {
    const c = client();
    const sourceUrl = await fileToDataUrl(args.psd.flattenedPath);
    const refUrl = args.imaginedRefPath ? await fileToDataUrl(args.imaginedRefPath) : null;

    const inventory = args.semantic.groups.map((g) => ({
      gid: g.gid,
      role: g.role,
      importance: g.importance,
      anchorHint: g.anchorHint ?? null,
      label: g.label,
      layerIds: g.layerIds,
      sourceBbox: bboxOfGroup(args.psd, g.layerIds),
    }));

    const safePx = Math.max(8, Math.round(0.04 * Math.min(args.targetW, args.targetH)));
    const legibilityMin = Math.max(14, Math.round(0.04 * Math.min(args.targetW, args.targetH)));

    const userText =
`Source canvas: ${args.psd.width}×${args.psd.height}
Target canvas: ${args.targetW}×${args.targetH}
Safe area inset: ${safePx}px
Legibility floor (height) for logo/headline/cta: ${legibilityMin}px

Semantic group inventory (in source-canvas pixels):
${JSON.stringify(inventory, null, 2)}

${args.nudge ? `Designer nudge: ${args.nudge}\n` : ""}${args.previousAttempt ? `Previous attempt scored ${args.previousAttempt.score}. mustFix=${JSON.stringify(args.previousAttempt.mustFix)} freeAdvice=${JSON.stringify(args.previousAttempt.freeAdvice)}\n` : ""}
Image 1 is the source. ${refUrl ? "Image 2 is the aesthetic reference for the target ratio." : ""}
Return JSON conforming to the schema. Coordinates in target-canvas pixels.`;

    const content: Array<Record<string, unknown>> = [
      { type: "text", text: userText },
      { type: "image_url", image_url: { url: sourceUrl } },
    ];
    if (refUrl) content.push({ type: "image_url", image_url: { url: refUrl } });

    const ctxPreamble = args.context ? renderContextPrompt(args.context) : "";
    const sysMsg = ctxPreamble ? `${RELAYOUT_SYSTEM}\n\n${ctxPreamble}` : RELAYOUT_SYSTEM;

    const res = await c.chat.completions.create({
      model: TEXT_MODEL,
      messages: [
        { role: "system", content: sysMsg },
        { role: "user", content: content as never },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "ReLayoutResult", strict: true, schema: RELAYOUT_SCHEMA as unknown as Record<string, unknown> },
      },
    });

    const raw = res.choices[0]?.message?.content;
    if (!raw) throw new Error("reLayout: empty response");
    const parsed = JSON.parse(raw) as ReLayoutResult & { canvas: { background: string | null } };

    // Force canvas dims to target — the model occasionally returns slight drift.
    parsed.canvas.w = args.targetW;
    parsed.canvas.h = args.targetH;
    if (parsed.canvas.background == null) delete (parsed.canvas as { background?: string | null }).background;
    return parsed;
  }

  async rewriteHtml(args: RewriteHtmlArgs): Promise<{ html: string; reasoning: string }> {
    const c = client();
    const refUrl = args.imaginedRefPath ? await fileToDataUrl(args.imaginedRefPath) : null;
    const sourceUrl = await fileToDataUrl(args.psd.flattenedPath);

    const inventory = args.semantic.groups.map((g) => ({
      gid: g.gid, role: g.role, importance: g.importance, anchorHint: g.anchorHint ?? null,
      label: g.label, layerIds: g.layerIds,
    }));
    const allowedLids = new Set(args.psd.layers.filter((l) => !l.hidden).map((l) => l.lid));

    const system = `You are a senior front-end designer rewriting an ad layout for a new canvas size.

You are given:
- The current source HTML+CSS (for the source ratio)
- A semantic inventory describing each group's role and importance
- A target canvas size W×H
- Optionally, an "imagined reference" image to anchor the aesthetic

TASK: output a COMPLETE new HTML document (<!doctype html>...) that displays the layout beautifully at the target canvas size.

Hard rules:
- Use ONLY the existing layer images. Every <img src> must match exactly: /api/asset/<hash>/l<N>.png — copy these from the source HTML.
- Do NOT add <script>, <link rel="stylesheet">, <iframe>, or any external resource.
- All CSS must be inline in a single <style> tag.
- Preserve each layer's semantic identity: keep data-lid, data-gid, data-role, data-importance attributes.
- Primary groups must remain visible, fully on canvas, with proper margins.
- Structural groups (typically background) must remain.
- Optional groups (decoration/shadow_effect/texture) MAY be omitted if space is tight.
- The root .kv container should set aspect-ratio: ${args.targetW} / ${args.targetH}; container-type: size; and use width:100%; height:100% so the layout stays responsive.

Creative freedom (this is the point of this mode):
- Use ANY modern CSS: flexbox, grid, absolute positioning, container queries, clip-path, transforms.
- Reorganize the DOM however you like — you are NOT constrained to the source structure.
- Use background-color or background-image (only with allowed asset URLs) for the canvas.
- Use percentage, vw/vh, cqi/cqh, em, rem units freely.

Output format: a single JSON object with two fields:
{ "html": "<!doctype html>...the full document...", "reasoning": "one sentence" }`;

    const userText =
`Target canvas: ${args.targetW}×${args.targetH}
Aspect ratio change: ${args.psd.width}/${args.psd.height} → ${args.targetW}/${args.targetH}

Semantic inventory:
${JSON.stringify(inventory, null, 2)}

Allowed layer IDs (use only these in <img src>):
${[...allowedLids].join(", ")}

${args.nudge ? `Designer nudge: ${args.nudge}\n` : ""}${args.previousAttempt ? `Previous attempt scored ${args.previousAttempt.score}.
Must fix: ${JSON.stringify(args.previousAttempt.mustFix)}
Advice: ${JSON.stringify(args.previousAttempt.freeAdvice)}\n` : ""}
Source HTML:
${args.sourceHtml}

The first image is the flattened source. ${refUrl ? "The second image is the aesthetic reference for the target ratio." : ""}
Return JSON with the full new HTML.`;

    const content: Array<Record<string, unknown>> = [
      { type: "text", text: userText },
      { type: "image_url", image_url: { url: sourceUrl } },
    ];
    if (refUrl) content.push({ type: "image_url", image_url: { url: refUrl } });

    const ctxPreamble = args.context ? renderContextPrompt(args.context) : "";
    const sysMsg = ctxPreamble ? `${system}\n\n${ctxPreamble}` : system;

    const res = await c.chat.completions.create({
      model: TEXT_MODEL,
      messages: [
        { role: "system", content: sysMsg },
        { role: "user", content: content as never },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "RewriteResult",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              html: { type: "string" },
              reasoning: { type: "string" },
            },
            required: ["html", "reasoning"],
          },
        },
      },
    });

    const raw = res.choices[0]?.message?.content;
    if (!raw) throw new Error("rewriteHtml: empty response");
    const parsed = JSON.parse(raw) as { html: string; reasoning: string };
    const { html, warnings } = sanitizeRewrittenHtml(parsed.html, allowedLids);
    if (warnings.length) console.warn("rewriteHtml sanitize:", warnings.slice(0, 5));
    return { html, reasoning: parsed.reasoning };
  }

  async verifyCritique(args: VerifyArgs): Promise<{
    score: number;
    rubric: Record<string, { score: number; note: string }>;
    issues: Array<{ gid: string | null; kind: string; detail: string }>;
    suggestions: string[];
  } | null> {
    const c = client();
    try {
      const renderUrl = await fileToDataUrl(args.renderPngPath);
      const sourceUrl = await fileToDataUrl(args.sourceFlattenedPath);
      const refUrl = args.imaginedRefPath ? await fileToDataUrl(args.imaginedRefPath) : null;

      const content: Array<Record<string, unknown>> = [
        { type: "text", text:
`Rendered ad below. Score it against the source brand and (if provided) the aesthetic reference.
Semantic inventory: ${JSON.stringify(args.semantic.groups.map((g) => ({ gid: g.gid, role: g.role, importance: g.importance })))}
${args.brief ? `Brief: ${args.brief}` : ""}` },
        { type: "image_url", image_url: { url: renderUrl } },
        { type: "image_url", image_url: { url: sourceUrl } },
      ];
      if (refUrl) content.push({ type: "image_url", image_url: { url: refUrl } });

      const ctxPreamble = args.context ? renderContextPrompt(args.context) : "";
      const sysMsg = ctxPreamble ? `${VERIFY_SYSTEM}\n\n${ctxPreamble}` : VERIFY_SYSTEM;

      const res = await c.chat.completions.create({
        model: TEXT_MODEL,
        messages: [
          { role: "system", content: sysMsg },
          { role: "user", content: content as never },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "VerifyCritique", strict: true, schema: VERIFY_SCHEMA as unknown as Record<string, unknown> },
        },
      });

      const raw = res.choices[0]?.message?.content;
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error("verifyCritique failed:", e instanceof Error ? e.message : e);
      return null;
    }
  }
}

function pickImageSize(w: number, h: number): string {
  const r = w / h;
  if (r > 1.5) return "1536x1024";
  if (r < 1 / 1.5) return "1024x1536";
  return "1024x1024";
}

function bboxOfGroup(psd: ParsedPsd, lids: string[]): { x: number; y: number; w: number; h: number } {
  const layers = lids.map((lid) => psd.layers.find((l) => l.lid === lid)).filter(Boolean) as ParsedPsd["layers"];
  if (layers.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...layers.map((l) => l.x));
  const y = Math.min(...layers.map((l) => l.y));
  const x2 = Math.max(...layers.map((l) => l.x + l.w));
  const y2 = Math.max(...layers.map((l) => l.y + l.h));
  return { x, y, w: x2 - x, h: y2 - y };
}
