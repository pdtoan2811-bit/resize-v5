import { rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { STORAGE_ROOT } from "@/lib/storage";

/**
 * Nuke every PSD + all cached files. Brand context (Organization) is kept —
 * that's hand-curated and unrelated to PSDs.
 */
export async function POST() {
  await prisma.render.deleteMany({});
  await prisma.imagineRef.deleteMany({});
  await prisma.group.deleteMany({});
  await prisma.layer.deleteMany({});
  await prisma.psd.deleteMany({});
  await rm(path.join(STORAGE_ROOT, "psd"), { recursive: true, force: true });
  await rm(path.join(STORAGE_ROOT, "renders"), { recursive: true, force: true });
  return Response.json({ ok: true });
}
