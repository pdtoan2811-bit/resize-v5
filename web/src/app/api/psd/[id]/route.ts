import { NextRequest } from "next/server";
import { rm } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { psdDir, rendersDir } from "@/lib/storage";

/**
 * Delete a single PSD: DB cascade (layers/groups/renders/imagineRefs) +
 * its on-disk cache + its render outputs. iterationNotes go with the row.
 */
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/psd/[id]">) {
  const { id } = await ctx.params;
  const psd = await prisma.psd.findUnique({ where: { id } });
  if (!psd) return Response.json({ ok: true });

  await prisma.psd.delete({ where: { id } });
  await rm(psdDir(psd.hash), { recursive: true, force: true });
  await rm(rendersDir(id), { recursive: true, force: true });

  return Response.json({ ok: true });
}
