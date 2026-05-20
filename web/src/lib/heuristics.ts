import type { ParsedLayer, ParsedPsd } from "./types";
import type { HeuristicHints } from "./ai-provider";

/**
 * Spatial + naming heuristics that detect when separate PSD layers actually
 * belong together as one design unit:
 *
 *   • Logo + the background plate underneath it (z-adjacent, plate larger)
 *   • Text + its baked shadow / glow / stroke layer (z-adjacent, similar bbox)
 *   • Decorative shape behind a small element (centroid inside, smaller area)
 *
 * Designers tend to be messy — these clusters give the AI semantic pass strong
 * hints, and the stub provider uses them directly to build groups offline.
 */

const EFFECT_NAME_RE = /(shadow|glow|reflection|outline|stroke|fx|shade|blur|highlight)/i;
const PLATE_NAME_RE = /(plate|bg|background|fill|panel|chip|pill|ribbon|badge|bar)/i;

interface BBox { x: number; y: number; w: number; h: number }

function area(b: BBox): number { return b.w * b.h }
function bboxOf(l: ParsedLayer): BBox { return { x: l.x, y: l.y, w: l.w, h: l.h } }
function centroid(b: BBox): { x: number; y: number } { return { x: b.x + b.w / 2, y: b.y + b.h / 2 } }
function intersection(a: BBox, b: BBox): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}
function contains(outer: BBox, p: { x: number; y: number }): boolean {
  return p.x >= outer.x && p.x <= outer.x + outer.w && p.y >= outer.y && p.y <= outer.y + outer.h;
}

interface Cluster { lids: string[]; rationale: string }

function clusterLayers(psd: ParsedPsd): Cluster[] {
  const visible = psd.layers.filter((l) => !l.hidden);
  if (visible.length < 2) return visible.map((l) => ({ lids: [l.lid], rationale: "single layer" }));

  // Disjoint-set / union-find over layers.
  const parent = new Map<string, string>();
  for (const l of visible) parent.set(l.lid, l.lid);
  const find = (a: string): string => {
    let r = parent.get(a)!;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let cur = a;
    while (parent.get(cur) !== r) { const nxt = parent.get(cur)!; parent.set(cur, r); cur = nxt; }
    return r;
  };
  const rationale = new Map<string, string>();
  const unionWithReason = (a: string, b: string, why: string) => {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    parent.set(ra, rb);
    rationale.set(rb, [rationale.get(rb), rationale.get(ra), why].filter(Boolean).join("; "));
  };

  // Sort top-down for "is this layer sitting on top of that one?".
  const sorted = [...visible].sort((a, b) => b.z - a.z);
  const canvasArea = psd.width * psd.height;

  for (let i = 0; i < sorted.length; i++) {
    const top = sorted[i];
    const tb = bboxOf(top);
    const ta = area(tb);
    if (ta / canvasArea > 0.85) continue; // skip background-sized layers

    for (let j = i + 1; j < sorted.length; j++) {
      const bot = sorted[j];
      const bb = bboxOf(bot);
      const ba = area(bb);
      if (ba / canvasArea > 0.85) continue; // skip background-sized layers

      const overlap = intersection(tb, bb);
      if (overlap === 0) continue;

      const overlapOfTop = overlap / ta;
      const overlapOfBot = overlap / ba;
      const zGap = Math.abs(top.z - bot.z);

      // (a) Bottom is a plate / background-shape sitting BEHIND a smaller element on top.
      //     The smaller element's bbox is mostly inside the bigger element's bbox.
      if (ba > ta * 1.5 && overlapOfTop > 0.7 && zGap <= 2 &&
          (PLATE_NAME_RE.test(bot.name) || EFFECT_NAME_RE.test(bot.name) || ba / canvasArea < 0.5)) {
        unionWithReason(top.lid, bot.lid, `${bot.lid} (plate/${bot.name}) sits behind ${top.lid}`);
        continue;
      }

      // (b) Top layer looks like an effect of the bottom layer (shadow/glow with same footprint).
      if (zGap <= 2 && EFFECT_NAME_RE.test(top.name) && overlapOfBot > 0.5) {
        unionWithReason(top.lid, bot.lid, `${top.lid} (${top.name}) is an effect for ${bot.lid}`);
        continue;
      }

      // (c) Bottom layer is an unnamed shadow/glow under the top layer (centroid match, smaller area, z-adjacent).
      if (zGap === 1 && contains(bb, centroid(tb)) && ba < ta * 4 && overlapOfTop > 0.4) {
        unionWithReason(top.lid, bot.lid, `${bot.lid} reads as a shadow plate under ${top.lid}`);
        continue;
      }
    }
  }

  // Collect clusters.
  const groups = new Map<string, ParsedLayer[]>();
  for (const l of visible) {
    const r = find(l.lid);
    const arr = groups.get(r) ?? [];
    arr.push(l);
    groups.set(r, arr);
  }
  return [...groups.values()].map((layers) => {
    const lids = layers.map((l) => l.lid);
    const root = find(layers[0].lid);
    const why = rationale.get(root) ?? (layers.length === 1 ? "single layer" : "spatial proximity");
    return { lids, rationale: why };
  });
}

export function runHeuristics(psd: ParsedPsd): HeuristicHints {
  const canvasArea = psd.width * psd.height;
  let backgroundLid: string | undefined;
  const shadowLids: string[] = [];
  const textureLids: string[] = [];

  for (const l of psd.layers) {
    if (l.hidden) continue;
    const ratio = (l.w * l.h) / canvasArea;
    if (!backgroundLid && ratio >= 0.9 && l.z <= 1) backgroundLid = l.lid;
    if (/shadow|glow|reflection|fx/i.test(l.name)) shadowLids.push(l.lid);
    if (l.bm !== "normal" && ratio >= 0.7) textureLids.push(l.lid);
  }

  return {
    backgroundLid,
    shadowLids,
    textureLids,
    groupCandidates: clusterLayers(psd),
  };
}
