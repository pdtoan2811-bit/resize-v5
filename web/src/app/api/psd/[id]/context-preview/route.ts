import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { loadLayeredContext, renderContextPrompt, STEPS_BY_AI_CALL } from "@/lib/context";

/**
 * GET /api/psd/[id]/context-preview?call=<callName>&brief=<taskBrief>
 *
 * Returns the exact prompt-block that will be appended to <callName>'s system
 * prompt. Use this to debug "is my context actually reaching the model?".
 *
 * call ∈ semanticPass | generateSourceHtml | reLayout | rewriteHtml |
 *        verifyCritique | imagineReference
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/psd/[id]/context-preview">) {
  const { id } = await ctx.params;
  const url = req.nextUrl;
  const call = url.searchParams.get("call") ?? "reLayout";
  const brief = url.searchParams.get("brief") ?? null;

  if (!(call in STEPS_BY_AI_CALL)) {
    return Response.json({ error: `Unknown call "${call}". Valid: ${Object.keys(STEPS_BY_AI_CALL).join(", ")}` }, { status: 400 });
  }

  const psd = await prisma.psd.findUnique({ where: { id } });
  if (!psd) return Response.json({ error: "psd not found" }, { status: 404 });

  const layered = await loadLayeredContext(psd.id, brief);
  const stages = STEPS_BY_AI_CALL[call as keyof typeof STEPS_BY_AI_CALL];
  const preamble = renderContextPrompt(layered, stages);

  return Response.json({
    call,
    stages,
    hasOrg: !!layered.org,
    hasIterationNotes: !!layered.iterationNotes,
    hasTaskBrief: !!layered.taskBrief,
    preview: preamble || "(no context — nothing will be prepended)",
  });
}
