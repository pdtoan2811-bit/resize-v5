import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { writeFile, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { ensureDir, psdDir, layersDir } from "@/lib/storage";
import { parsePsdViaWorker } from "@/lib/worker";
import { runHeuristics } from "@/lib/heuristics";
import { getProvider } from "@/lib/ai-provider";
import { loadLayeredContext } from "@/lib/context";

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
  // Persist parsed result
  await writeFile(path.join(dir, "parsed.json"), JSON.stringify(parsed));

  // Semantic pass (stub provider in v0)
  const provider = getProvider();
  const hints = runHeuristics(parsed);
  const ctx = await loadLayeredContext(null, null); // no per-PSD context yet; org-level only at upload time
  const semantic = await provider.semanticPass(parsed, hints, ctx);
  await writeFile(path.join(dir, "semantic.json"), JSON.stringify(semantic));

  // DB write
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
      groups: {
        create: semantic.groups.map((g) => ({
          gid: g.gid,
          role: g.role,
          label: g.label,
          importance: g.importance,
          layerIds: JSON.stringify(g.layerIds),
          anchorHint: g.anchorHint,
          rationale: g.rationale,
        })),
      },
    },
  });

  return Response.json({ id: psd.id, hash, cached: false });
}
