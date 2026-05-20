import {
  ROLE_DEFAULT_IMPORTANCE,
  type ParsedPsd,
  type SemanticResult,
  type SemanticGroup,
  type ReLayoutResult,
  type Role,
  type AnchorHint,
} from "./types";
import type { LayeredContext } from "./context";

export interface AIProvider {
  semanticPass(psd: ParsedPsd, heuristics: HeuristicHints, context?: LayeredContext): Promise<SemanticResult>;
  imagineReference(psd: ParsedPsd, targetW: number, targetH: number): Promise<{ pngPath: string; prompt: string } | null>;
  reLayout(args: ReLayoutArgs): Promise<ReLayoutResult>;
  rewriteHtml(args: RewriteHtmlArgs): Promise<{ html: string; reasoning: string }>;
  generateSourceHtml(args: GenerateSourceArgs): Promise<{ html: string; reasoning: string }>;
  verifyCritique(args: VerifyArgs): Promise<{
    score: number;
    rubric: Record<string, { score: number; note: string }>;
    issues: Array<{ gid: string | null; kind: string; detail: string }>;
    suggestions: string[];
  } | null>;
}

export interface GenerateSourceArgs {
  psd: ParsedPsd;
  semantic: SemanticResult;
  algorithmHtml: string;
  context?: LayeredContext;
  /** Per-group composite PNG paths, by gid. Passed as multimodal context. */
  groupImagePaths?: Record<string, string>;
}

export interface RewriteHtmlArgs {
  psd: ParsedPsd;
  semantic: SemanticResult;
  sourceHtml: string;
  targetW: number;
  targetH: number;
  imaginedRefPath?: string;
  nudge?: string;
  previousAttempt?: { score: number; mustFix: unknown[]; freeAdvice: string[] };
  context?: LayeredContext;
  /** Per-group composite PNG paths, by gid. Passed as multimodal context. */
  groupImagePaths?: Record<string, string>;
}

export interface HeuristicHints {
  backgroundLid?: string;
  shadowLids: string[];
  textureLids: string[];
  groupCandidates: Array<{ lids: string[]; rationale: string }>;
}

export interface ReLayoutArgs {
  psd: ParsedPsd;
  semantic: SemanticResult;
  targetW: number;
  targetH: number;
  imaginedRefPath?: string;
  nudge?: string;
  previousAttempt?: { score: number; mustFix: unknown[]; freeAdvice: string[] };
  context?: LayeredContext;
  /**
   * Optional Naive baseline (proportional rescale at target). When provided,
   * the AI is instructed to REFINE this layout rather than design from scratch.
   * This dramatically reduces variance and prevents the AI from dropping
   * critical elements (the most common failure mode).
   */
  baselineLayout?: ReLayoutResult;
  /** Per-group composite PNG paths, by gid. Passed as multimodal context. */
  groupImagePaths?: Record<string, string>;
}

export interface VerifyArgs {
  renderPngPath: string;
  imaginedRefPath?: string;
  sourceFlattenedPath: string;
  semantic: SemanticResult;
  brief?: string;
  context?: LayeredContext;
}

// ─── Stub provider — deterministic, no network ──────────────────────────────────

function classifyLayer(name: string, layer: ParsedPsd["layers"][number], canvasArea: number): Role {
  const n = name.toLowerCase();
  if (/(shadow|glow|reflection|fx)/.test(n)) return "shadow_effect";
  if (/(texture|noise|grain|paper)/.test(n)) return "texture";
  if (/logo|brand/.test(n)) return "logo";
  if (/headline|title|hero/.test(n)) return "headline";
  if (/sub(head)?|subtitle/.test(n)) return "subhead";
  if (/cta|button/.test(n)) return "cta";
  if (/disclaimer|legal|fine/.test(n)) return "disclaimer";
  if (/badge|ribbon|frame|sale/.test(n)) return "frame";
  if (/decor|sparkle|confetti|dot|star/.test(n)) return "decoration";
  if (/product|pack|bottle|item/.test(n)) return "product";
  if (/model|person|character|hero/.test(n)) return "subject";
  const layerArea = layer.w * layer.h;
  if (layerArea / canvasArea >= 0.85 && layer.z <= 1) return "background";
  return "decoration";
}

function anchorFor(layer: ParsedPsd["layers"][number], psd: ParsedPsd): AnchorHint {
  const cx = layer.x + layer.w / 2;
  const cy = layer.y + layer.h / 2;
  const hThird = psd.height / 3;
  const wThird = psd.width / 3;
  const row = cy < hThird ? "top" : cy < 2 * hThird ? "" : "bottom";
  const col = cx < wThird ? "left" : cx < 2 * wThird ? "" : "right";
  if (!row && !col) return "center";
  if (row && col) return `${row}-${col}` as AnchorHint;
  return (row || col) as AnchorHint;
}

export class StubAIProvider implements AIProvider {
  async semanticPass(psd: ParsedPsd, hints: HeuristicHints): Promise<SemanticResult> {
    const canvasArea = psd.width * psd.height;
    const byLid = new Map(psd.layers.map((l) => [l.lid, l]));

    // Use the spatial clusters from heuristics — each cluster = one semantic group.
    // For each cluster, pick the dominant layer's name+role as the group identity.
    const groups: SemanticGroup[] = hints.groupCandidates.map((c, i) => {
      const layers = c.lids.map((lid) => byLid.get(lid)).filter(Boolean) as ParsedPsd["layers"];
      if (layers.length === 0) return null!;
      // Dominant = highest z (rendered on top) — that usually carries the role meaning.
      const dom = [...layers].sort((a, b) => b.z - a.z)[0];
      const role = classifyLayer(dom.name, dom, canvasArea);
      return {
        gid: `g${i}`,
        role,
        label: dom.name || role,
        importance: ROLE_DEFAULT_IMPORTANCE[role],
        layerIds: layers.map((l) => l.lid),
        anchorHint: anchorFor(dom, psd),
        rationale: c.rationale,
      } satisfies SemanticGroup;
    }).filter(Boolean);

    return { groups, unassigned: [], notes: "stub semantic pass with spatial clustering" };
  }

  async imagineReference(): Promise<null> {
    return null; // no AI image gen in stub mode
  }

  async reLayout({ targetW, targetH }: ReLayoutArgs): Promise<ReLayoutResult> {
    return { canvas: { w: targetW, h: targetH, background: "#ffffff" }, groups: [], reasoning: "stub: proportional rescale" };
  }

  async rewriteHtml({ sourceHtml }: RewriteHtmlArgs): Promise<{ html: string; reasoning: string }> {
    return { html: sourceHtml, reasoning: "stub: pass-through" };
  }

  async generateSourceHtml({ algorithmHtml }: GenerateSourceArgs): Promise<{ html: string; reasoning: string }> {
    return { html: algorithmHtml, reasoning: "stub: returns algorithm output unchanged" };
  }

  async verifyCritique(): Promise<null> {
    return null;
  }
}

let _cached: AIProvider | null = null;
export function getProvider(): AIProvider {
  if (_cached) return _cached;
  const choice = (process.env.AI_PROVIDER ?? "stub").toLowerCase();
  if (choice === "openai" && process.env.OPENAI_API_KEY) {
    // Lazy import so the OpenAI SDK is only loaded when actually needed.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OpenAIProvider } = require("./openai-provider") as typeof import("./openai-provider");
    _cached = new OpenAIProvider();
  } else {
    _cached = new StubAIProvider();
  }
  return _cached;
}
