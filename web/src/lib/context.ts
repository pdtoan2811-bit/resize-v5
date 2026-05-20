import { prisma } from "./db";

export interface OrgContext {
  brandName?: string | null;
  voice?: string | null;
  audience?: string | null;
  doRules?: string | null;
  dontRules?: string | null;
  freeform?: string | null;
}

export interface LayeredContext {
  /** Level 3: organisation context — applies to every render */
  org: OrgContext | null;
  /** Level 2: accumulated learnings for this specific PSD */
  iterationNotes: string | null;
  /** Level 1: the brief for this specific task (designer nudge, etc.) */
  taskBrief: string | null;
}

export async function loadLayeredContext(psdId: string | null, taskBrief: string | null | undefined): Promise<LayeredContext> {
  const [org, psd] = await Promise.all([
    prisma.organization.findUnique({ where: { id: "default" } }),
    psdId ? prisma.psd.findUnique({ where: { id: psdId }, select: { iterationNotes: true } }) : Promise.resolve(null),
  ]);
  return {
    org: org && hasAny(org) ? { brandName: org.brandName, voice: org.voice, audience: org.audience, doRules: org.doRules, dontRules: org.dontRules, freeform: org.freeform } : null,
    iterationNotes: psd?.iterationNotes ?? null,
    taskBrief: taskBrief ?? null,
  };
}

function hasAny(o: OrgContext): boolean {
  return !!(o.brandName || o.voice || o.audience || o.doRules || o.dontRules || o.freeform);
}

/**
 * Render the layered context as a single prompt-block. Returns "" if nothing is set
 * so the resulting prompts stay clean for ad-hoc use without any context configured.
 */
export function renderContextPrompt(ctx: LayeredContext): string {
  const sections: string[] = [];

  if (ctx.org) {
    const lines: string[] = ["### Brand context (applies to every render)"];
    if (ctx.org.brandName) lines.push(`Brand: ${ctx.org.brandName}`);
    if (ctx.org.voice) lines.push(`Tone of voice / persona: ${ctx.org.voice}`);
    if (ctx.org.audience) lines.push(`Target audience: ${ctx.org.audience}`);
    if (ctx.org.doRules) lines.push(`Do's:\n${ctx.org.doRules}`);
    if (ctx.org.dontRules) lines.push(`Don'ts:\n${ctx.org.dontRules}`);
    if (ctx.org.freeform) lines.push(`Other notes:\n${ctx.org.freeform}`);
    sections.push(lines.join("\n"));
  }

  if (ctx.iterationNotes && ctx.iterationNotes.trim()) {
    sections.push(
      "### Project notes (learned from past renders of this PSD)\n" + ctx.iterationNotes.trim()
    );
  }

  if (ctx.taskBrief && ctx.taskBrief.trim()) {
    sections.push(
      "### Designer brief for THIS render (highest priority — overrides above when in conflict)\n" + ctx.taskBrief.trim()
    );
  }

  if (sections.length === 0) return "";
  return [
    "── CONTEXT ──",
    "Apply the following layered context when designing this layout. Higher-priority layers (designer brief, then project notes, then brand context) override lower ones when they conflict.",
    "",
    ...sections,
    "── END CONTEXT ──",
  ].join("\n\n");
}

/**
 * Append a new auto-derived note to a PSD's iteration notes. Used after a
 * verify critique returns suggestions — we keep the most recent batch so the
 * next render benefits from them without ballooning the notes.
 */
export async function recordCritiqueLearning(psdId: string, suggestions: string[]): Promise<void> {
  if (suggestions.length === 0) return;
  const psd = await prisma.psd.findUnique({ where: { id: psdId }, select: { iterationNotes: true } });
  if (!psd) return;

  const existing = (psd.iterationNotes ?? "").trim();
  const tag = "<!-- auto:critique -->";
  // Keep one auto-derived block. Replace if it exists.
  const manualPart = existing.split(tag)[0].trim();
  const autoBlock = [
    tag,
    "## Common AI critique notes (last batch, auto-collected)",
    ...suggestions.slice(0, 6).map((s) => `- ${s}`),
  ].join("\n");

  const merged = manualPart ? `${manualPart}\n\n${autoBlock}` : autoBlock;
  await prisma.psd.update({ where: { id: psdId }, data: { iterationNotes: merged } });
}
