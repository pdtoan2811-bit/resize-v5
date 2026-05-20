import { prisma } from "./db";

export type Stage =
  | "grouping"        // semantic pass
  | "sourceEngine"    // AI source HTML/CSS engine
  | "resize"          // AI Responsive + AI Rewrite
  | "verify";         // vision critique

export interface OrgContext {
  // Brand identity — always-on
  brandName?: string | null;
  voice?: string | null;
  audience?: string | null;
  doRules?: string | null;
  dontRules?: string | null;
  freeform?: string | null;
  // Stage-specific
  groupingContext?: string | null;
  sourceEngineContext?: string | null;
  resizeContext?: string | null;
  verifyContext?: string | null;
}

export interface LayeredContext {
  /** Level 3: org-wide context */
  org: OrgContext | null;
  /** Level 2: per-PSD persistent notes */
  iterationNotes: string | null;
  /** Level 1: this-render-only brief */
  taskBrief: string | null;
}

export async function loadLayeredContext(psdId: string | null, taskBrief: string | null | undefined): Promise<LayeredContext> {
  const [org, psd] = await Promise.all([
    prisma.organization.findUnique({ where: { id: "default" } }),
    psdId ? prisma.psd.findUnique({ where: { id: psdId }, select: { iterationNotes: true } }) : Promise.resolve(null),
  ]);
  return {
    org: org && orgHasAny(org) ? {
      brandName: org.brandName,
      voice: org.voice,
      audience: org.audience,
      doRules: org.doRules,
      dontRules: org.dontRules,
      freeform: org.freeform,
      groupingContext: org.groupingContext,
      sourceEngineContext: org.sourceEngineContext,
      resizeContext: org.resizeContext,
      verifyContext: org.verifyContext,
    } : null,
    iterationNotes: psd?.iterationNotes ?? null,
    taskBrief: taskBrief ?? null,
  };
}

function orgHasAny(o: OrgContext): boolean {
  return !!(
    o.brandName || o.voice || o.audience || o.doRules || o.dontRules || o.freeform ||
    o.groupingContext || o.sourceEngineContext || o.resizeContext || o.verifyContext
  );
}

const STAGE_LABEL: Record<Stage, string> = {
  grouping: "Semantic grouping rules",
  sourceEngine: "AI source HTML/CSS preferences",
  resize: "Resize / re-layout preferences",
  verify: "Critique priorities",
};

const STAGE_FIELD: Record<Stage, keyof OrgContext> = {
  grouping: "groupingContext",
  sourceEngine: "sourceEngineContext",
  resize: "resizeContext",
  verify: "verifyContext",
};

/**
 * Source of truth for which stage blocks each AI call receives.
 * Used by both the provider implementations and the context-preview endpoint.
 */
export const STEPS_BY_AI_CALL = {
  semanticPass:        ["grouping"]                    as Stage[],
  generateSourceHtml:  ["sourceEngine"]                as Stage[],
  imagineReference:    ["resize"]                      as Stage[],
  reLayout:            ["resize"]                      as Stage[],
  rewriteHtml:         ["sourceEngine", "resize"]      as Stage[],
  verifyCritique:      ["verify"]                      as Stage[],
} as const;

/**
 * Render the layered context prompt for one or more stages.
 * Layer order in the prompt (always — top to bottom):
 *   1. Brand identity (every AI call)
 *   2. One block per requested stage (skipped when that stage's field is empty)
 *   3. Project notes (L2)
 *   4. Task brief (L1, highest priority)
 *
 * Pass an array of stages when an AI call sits at the intersection of two
 * concerns (e.g. rewriteHtml writes HTML *for* a target — needs both the
 * `sourceEngine` HTML/CSS prefs and the `resize` re-layout rules).
 */
export function renderContextPrompt(ctx: LayeredContext, stages: Stage | Stage[]): string {
  const stageList = Array.isArray(stages) ? stages : [stages];
  const sections: string[] = [];

  if (ctx.org) {
    const id: string[] = [];
    if (ctx.org.brandName) id.push(`Brand: ${ctx.org.brandName}`);
    if (ctx.org.voice) id.push(`Tone of voice / persona: ${ctx.org.voice}`);
    if (ctx.org.audience) id.push(`Target audience: ${ctx.org.audience}`);
    if (ctx.org.doRules) id.push(`Do's:\n${ctx.org.doRules}`);
    if (ctx.org.dontRules) id.push(`Don'ts:\n${ctx.org.dontRules}`);
    if (ctx.org.freeform) id.push(`Other notes:\n${ctx.org.freeform}`);
    if (id.length) sections.push("### Brand identity (applies to every AI call)\n" + id.join("\n"));

    for (const s of stageList) {
      const v = ctx.org[STAGE_FIELD[s]];
      if (v && typeof v === "string" && v.trim()) {
        sections.push(`### ${STAGE_LABEL[s]}\n${v.trim()}`);
      }
    }
  }

  if (ctx.iterationNotes && ctx.iterationNotes.trim()) {
    sections.push("### Project notes (learned from past renders of this PSD)\n" + ctx.iterationNotes.trim());
  }

  if (ctx.taskBrief && ctx.taskBrief.trim()) {
    sections.push("### Designer brief for THIS render (highest priority — overrides above when in conflict)\n" + ctx.taskBrief.trim());
  }

  if (sections.length === 0) return "";
  return [
    "── CONTEXT ──",
    "Apply the layered context below. Higher-priority layers (designer brief → project notes → stage rules → brand identity) override lower ones when they conflict.",
    "",
    ...sections,
    "── END CONTEXT ──",
  ].join("\n\n");
}

/**
 * Append a new auto-derived note to a PSD's iteration notes. Used after a
 * verify critique returns suggestions.
 */
export async function recordCritiqueLearning(psdId: string, suggestions: string[]): Promise<void> {
  if (suggestions.length === 0) return;
  const psd = await prisma.psd.findUnique({ where: { id: psdId }, select: { iterationNotes: true } });
  if (!psd) return;

  const existing = (psd.iterationNotes ?? "").trim();
  const tag = "<!-- auto:critique -->";
  const manualPart = existing.split(tag)[0].trim();
  const autoBlock = [
    tag,
    "## Common AI critique notes (last batch, auto-collected)",
    ...suggestions.slice(0, 6).map((s) => `- ${s}`),
  ].join("\n");

  const merged = manualPart ? `${manualPart}\n\n${autoBlock}` : autoBlock;
  await prisma.psd.update({ where: { id: psdId }, data: { iterationNotes: merged } });
}
