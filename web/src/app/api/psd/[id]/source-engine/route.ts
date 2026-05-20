import { NextRequest } from "next/server";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { psdDir, ensureDir, rendersDir } from "@/lib/storage";
import { loadParsed, loadSemantic } from "@/lib/load";
import { emitHtml } from "@/lib/emit";
import { getProvider } from "@/lib/ai-provider";
import { loadLayeredContext } from "@/lib/context";

export const maxDuration = 120;

const Body = z.object({ engine: z.enum(["algorithm", "ai"]) });

/**
 * Switch which engine produces the source HTML for this PSD.
 *
 *   • "algorithm" → free, instant, deterministic emit
 *   • "ai"        → AI authors HTML+CSS using semantic + brand context, cached on disk
 *
 * Switching invalidates Rewrite-mode renders only — they depend on the source
 * HTML as their starting point. Naive / Group / Responsive renders are layout
 * transforms that don't read the source HTML, so they survive untouched.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/psd/[id]/source-engine">) {
  const { id } = await ctx.params;
  const body = Body.parse(await req.json());
  const psd = await prisma.psd.findUnique({ where: { id } });
  if (!psd) return Response.json({ error: "psd not found" }, { status: 404 });

  let sourceAiReason: string | null = null;

  if (body.engine === "ai") {
    const parsed = await loadParsed(psd.hash);
    const semantic = await loadSemantic(psd.hash);
    const baseUrl = `/api/asset/${psd.hash}`;
    const { html: algorithmHtml } = emitHtml({ psd: parsed, semantic, assetBaseUrl: baseUrl });
    const layered = await loadLayeredContext(psd.id, null);
    const provider = getProvider();
    const result = await provider.generateSourceHtml({ psd: parsed, semantic, algorithmHtml, context: layered });

    await ensureDir(psdDir(psd.hash));
    await writeFile(path.join(psdDir(psd.hash), "source-ai.html"), result.html);
    sourceAiReason = result.reasoning;
  } else {
    // Best-effort: remove the cached AI source so disk doesn't drift.
    try { await unlink(path.join(psdDir(psd.hash), "source-ai.html")); } catch { /* not there */ }
  }

  // Invalidate Rewrite-mode renders (their source HTML changed).
  await prisma.render.deleteMany({ where: { psdId: psd.id, mode: "rewrite" } });
  // Best-effort: remove their on-disk files.
  try {
    const { readdir, rm } = await import("node:fs/promises");
    const dir = rendersDir(psd.id);
    const entries = await readdir(dir);
    await Promise.all(
      entries.filter((e) => e.startsWith("rewrite_")).map((e) => rm(path.join(dir, e), { force: true }))
    );
  } catch { /* dir may not exist */ }

  const updated = await prisma.psd.update({
    where: { id: psd.id },
    data: { sourceEngine: body.engine, sourceAiReason },
    select: { id: true, sourceEngine: true, sourceAiReason: true },
  });

  return Response.json(updated);
}
