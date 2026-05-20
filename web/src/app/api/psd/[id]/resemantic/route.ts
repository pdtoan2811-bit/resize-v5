import { NextRequest } from "next/server";
import { writeFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { psdDir, rendersDir, imagineDir } from "@/lib/storage";
import { loadParsed } from "@/lib/load";
import { runHeuristics } from "@/lib/heuristics";
import { getProvider } from "@/lib/ai-provider";
import { loadLayeredContext } from "@/lib/context";

export const maxDuration = 120;

/**
 * Re-run the semantic pass for a PSD.
 *
 * This is destructive: every previous render of this PSD becomes invalid the
 * moment groups change (a render's layout JSON references gids that may no
 * longer exist or carry different roles/anchors). We clear them in one
 * transaction so the user starts fresh.
 *
 * What is and isn't wiped:
 *   ✓ Semantic cache (semantic.json on disk)
 *   ✓ Group rows in DB
 *   ✓ Render rows in DB + their HTML/PNG files
 *   ✓ Cached "imagined references" (target-ratio aesthetic anchors) — these
 *     were generated against the old semantic understanding too
 *   ✗ Parsed layers (those come from the PSD bytes themselves)
 *   ✗ iterationNotes — designer's hand-written notes survive; the
 *     auto-critique block will get refreshed by the next render anyway
 */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/psd/[id]/resemantic">) {
  const { id } = await ctx.params;
  const psd = await prisma.psd.findUnique({ where: { id } });
  if (!psd) return Response.json({ error: "psd not found" }, { status: 404 });

  const parsed = await loadParsed(psd.hash);
  const provider = getProvider();
  const hints = runHeuristics(parsed);
  const layered = await loadLayeredContext(null, null); // org context only on a re-run
  const semantic = await provider.semanticPass(parsed, hints, layered);

  // Overwrite the disk cache.
  await writeFile(path.join(psdDir(psd.hash), "semantic.json"), JSON.stringify(semantic));

  // Wipe Render PNG/HTML files on disk (best-effort — keep going on failure).
  const rDir = rendersDir(psd.id);
  await safeRmDir(rDir);

  // Wipe cached imagined references (now stale aesthetics).
  await safeRmDir(imagineDir(psd.hash));

  // DB: replace groups + clear renders atomically.
  await prisma.$transaction([
    prisma.render.deleteMany({ where: { psdId: psd.id } }),
    prisma.group.deleteMany({ where: { psdId: psd.id } }),
    prisma.group.createMany({
      data: semantic.groups.map((g) => ({
        psdId: psd.id,
        gid: g.gid,
        role: g.role,
        label: g.label,
        importance: g.importance,
        layerIds: JSON.stringify(g.layerIds),
        anchorHint: g.anchorHint ?? null,
        rationale: g.rationale ?? null,
      })),
    }),
  ]);

  return Response.json({
    ok: true,
    groupsCount: semantic.groups.length,
    rendersCleared: true,
  });
}

async function safeRmDir(dir: string) {
  try {
    const entries = await readdir(dir);
    await Promise.all(entries.map((e) => rm(path.join(dir, e), { force: true, recursive: true })));
  } catch {
    // directory doesn't exist or is empty — fine
  }
}
