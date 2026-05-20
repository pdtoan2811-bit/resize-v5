import { NextRequest } from "next/server";
import { writeFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { psdDir, rendersDir, imagineDir } from "@/lib/storage";
import { loadParsed } from "@/lib/load";
import { runHeuristics } from "@/lib/heuristics";
import { getProvider } from "@/lib/ai-provider";
import { loadLayeredContext } from "@/lib/context";
import { compositeGroups } from "@/lib/group-composite";

export const maxDuration = 120;

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/psd/[id]/resemantic">) {
  const { id } = await ctx.params;
  try {
    const psd = await prisma.psd.findUnique({ where: { id } });
    if (!psd) return Response.json({ error: "PSD not found" }, { status: 404 });

    const parsed = await loadParsed(psd.hash);
    const provider = getProvider();
    const hints = runHeuristics(parsed);
    const layered = await loadLayeredContext(null, null);

    const semantic = await provider.semanticPass(parsed, hints, layered);

    if (!semantic.groups || semantic.groups.length === 0) {
      return Response.json({ error: "Semantic pass returned no groups. Check OPENAI_API_KEY and OPENAI_MODEL_TEXT — and that the model has vision input enabled." }, { status: 502 });
    }

    await writeFile(path.join(psdDir(psd.hash), "semantic.json"), JSON.stringify(semantic));

    // Composite each semantic group into a single PNG so downstream AI
    // prompts can SEE each group, not just read its metadata.
    await compositeGroups(parsed, semantic.groups);

    const rDir = rendersDir(psd.id);
    await safeRmDir(rDir);
    await safeRmDir(imagineDir(psd.hash));

    await prisma.$transaction([
      prisma.render.deleteMany({ where: { psdId: psd.id } }),
      prisma.group.deleteMany({ where: { psdId: psd.id } }),
      prisma.group.createMany({
        data: semantic.groups.map((g) => ({
          psdId: psd.id, gid: g.gid, role: g.role, label: g.label, importance: g.importance,
          layerIds: JSON.stringify(g.layerIds), anchorHint: g.anchorHint ?? null, rationale: g.rationale ?? null,
        })),
      }),
    ]);

    return Response.json({ ok: true, groupsCount: semantic.groups.length, rendersCleared: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[resemantic] failed:", message, e);
    return Response.json(
      { error: message || "Semantic pass failed (no message). Check the server log for details." },
      { status: 500 },
    );
  }
}

async function safeRmDir(dir: string) {
  try {
    const entries = await readdir(dir);
    await Promise.all(entries.map((e) => rm(path.join(dir, e), { force: true, recursive: true })));
  } catch { /* not there */ }
}
