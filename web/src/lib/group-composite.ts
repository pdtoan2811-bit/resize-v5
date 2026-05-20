import sharp from "sharp";
import path from "node:path";
import { mkdir, rm, readdir } from "node:fs/promises";
import { psdDir, layersDir } from "./storage";
import type { ParsedPsd, SemanticGroup } from "./types";

/**
 * For each semantic group, composite its layers onto a transparent canvas
 * (cropped to the group's visible bbox) and write a single PNG. This gives
 * AI prompts a *visual* of each group — what the logo looks like, what the
 * headline+shadow combo looks like — instead of just metadata.
 *
 * Output: <psdDir>/groups/<gid>.png plus a manifest <psdDir>/groups/manifest.json
 *         mapping gid → relative path and source-canvas bbox of the composite.
 *
 * Idempotent: clears the groups/ dir first.
 */
export interface GroupComposite {
  gid: string;
  pngPath: string;
  /** Bounding box in source-canvas pixels covered by this composite. */
  bbox: { x: number; y: number; w: number; h: number };
}

export async function compositeGroups(
  psd: ParsedPsd,
  groups: SemanticGroup[],
): Promise<GroupComposite[]> {
  const outDir = path.join(psdDir(psd.hash), "groups");
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const byLid = new Map(psd.layers.map((l) => [l.lid, l]));
  const out: GroupComposite[] = [];

  for (const g of groups) {
    const layers = g.layerIds.map((lid) => byLid.get(lid)).filter(Boolean) as ParsedPsd["layers"];
    const visible = layers.filter((l) => !l.hidden);
    if (visible.length === 0) continue;

    // Compute the group's union bbox.
    const x = Math.min(...visible.map((l) => l.x));
    const y = Math.min(...visible.map((l) => l.y));
    const x2 = Math.max(...visible.map((l) => l.x + l.w));
    const y2 = Math.max(...visible.map((l) => l.y + l.h));
    const w = Math.max(1, x2 - x);
    const h = Math.max(1, y2 - y);

    // Transparent canvas of size (w,h); composite each layer at (layer.x - x, layer.y - y).
    // Sort by z so painter's order is correct.
    const sorted = [...visible].sort((a, b) => a.z - b.z);
    const composites = await Promise.all(sorted.map(async (l) => ({
      input: path.join(layersDir(psd.hash), `${l.lid}.png`),
      top: l.y - y,
      left: l.x - x,
    })));

    const pngPath = path.join(outDir, `${g.gid}.png`);
    await sharp({
      create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite(composites)
      .png({ compressionLevel: 9 })
      .toFile(pngPath);

    out.push({ gid: g.gid, pngPath, bbox: { x, y, w, h } });
  }

  return out;
}

/** Best-effort: list group composites already on disk for this PSD. */
export async function listGroupComposites(psdHash: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const dir = path.join(psdDir(psdHash), "groups");
    const entries = await readdir(dir);
    for (const e of entries) {
      if (e.endsWith(".png")) {
        const gid = e.replace(/\.png$/, "");
        out.set(gid, path.join(dir, e));
      }
    }
  } catch { /* none yet */ }
  return out;
}
