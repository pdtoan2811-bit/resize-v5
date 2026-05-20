import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { writeFile, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { ensureDir, psdDir, layersDir } from "@/lib/storage";
import { parsePsdViaWorker } from "@/lib/worker";
// Upload only parses & rasters layers — semantic grouping is deferred to
// Step 1 of the post-upload wizard so the designer can review context first.

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "no file" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(buf).digest("hex");

  // Cache hit?
  const existing = await prisma.psd.findUnique({ where: { hash } });
  if (existing) {
    return Response.json({ id: existing.id, hash, cached: true });
  }

  const dir = psdDir(hash);
  await ensureDir(dir);
  await ensureDir(layersDir(hash));
  const psdPath = path.join(dir, "source.psd");
  await writeFile(psdPath, buf);

  const parsed = await parsePsdViaWorker(buf, file.name, layersDir(hash));
  await writeFile(path.join(dir, "parsed.json"), JSON.stringify(parsed));

  // DB write — layers only. Groups stay empty until Step 1 (Prep → Run grouping).
  const psd = await prisma.psd.create({
    data: {
      hash,
      filename: file.name,
      width: parsed.width,
      height: parsed.height,
      layers: {
        create: parsed.layers.map((l) => ({
          lid: l.lid,
          name: l.name,
          x: l.x, y: l.y, w: l.w, h: l.h, z: l.z,
          opacity: l.opacity, bm: l.bm, pngPath: l.pngPath, kind: l.kind,
        })),
      },
    },
  });

  return Response.json({ id: psd.id, hash, cached: false });
}
