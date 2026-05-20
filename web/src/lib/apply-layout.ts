import { EMIT_VERSION, type ParsedPsd, type SemanticResult, type ReLayoutResult, type SemanticGroup } from "./types";

const SUPPORTED_BLEND_MODES = new Set([
  "normal", "multiply", "screen", "overlay", "darken", "lighten",
  "color-dodge", "color-burn", "hard-light", "soft-light",
  "difference", "exclusion", "hue", "saturation", "color", "luminosity",
]);

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function safeBm(bm: string): string {
  const lower = bm.toLowerCase().replace(/_/g, "-");
  return SUPPORTED_BLEND_MODES.has(lower) ? lower : "normal";
}

function pct(n: number): string {
  return (Math.round(n * 100000) / 100000).toString();
}

export interface ApplyLayoutInput {
  psd: ParsedPsd;
  semantic: SemanticResult;
  layout: ReLayoutResult;
  assetBaseUrl: string;
}

/**
 * Apply a re-layout JSON to the source, producing **responsive** target HTML.
 *
 * AI output (in target-canvas pixels) is converted to percentages of the target
 * canvas. The resulting HTML uses aspect-ratio + container-type so the layout
 * scales fluidly at any resolution — useful for live preview and arbitrary
 * device pixel ratios.
 */
export function applyLayout({ psd, semantic, layout, assetBaseUrl }: ApplyLayoutInput): { html: string } {
  const layerById = new Map(psd.layers.map((l) => [l.lid, l]));
  const groupById = new Map(semantic.groups.map((g) => [g.gid, g]));
  const layoutByGid = new Map(layout.groups.map((g) => [g.gid, g]));

  const groupMinZ = (g: SemanticGroup) =>
    Math.min(...g.layerIds.map((lid) => layerById.get(lid)?.z ?? 0));
  const defaultOrder = [...semantic.groups]
    .sort((a, b) => groupMinZ(a) - groupMinZ(b) || a.gid.localeCompare(b.gid))
    .map((g) => g.gid);
  const order = layout.domOrder?.length
    ? [...layout.domOrder, ...defaultOrder.filter((g) => !layout.domOrder!.includes(g))]
    : defaultOrder;

  const W = layout.canvas.w, H = layout.canvas.h;
  const sx = W / psd.width;
  const sy = H / psd.height;

  const css = [
    `*,*::before,*::after{box-sizing:border-box}`,
    `html,body{margin:0;padding:0;height:100%}`,
    `.kv-wrap{width:100%;height:100%;display:grid;place-items:center;background:#f4f4f5}`,
    `.kv{position:relative;width:100%;height:100%;max-width:100vw;max-height:100vh;aspect-ratio:var(--ratio);container-type:size;overflow:hidden;background:var(--bg,#fff)}`,
    `.group{position:absolute;inset:0}`,
    `.group[hidden]{display:none}`,
    `.layer{position:absolute;left:var(--xp);top:var(--yp);width:var(--wp);height:var(--hp);z-index:var(--z);opacity:var(--op);transform:rotate(var(--rot,0deg));transform-origin:center;mix-blend-mode:var(--bm);object-fit:contain}`,
    `.layer[data-fit=cover]{object-fit:cover}`,
  ].join("");

  const groupHtml: string[] = [];
  for (const gid of order) {
    const g = groupById.get(gid);
    if (!g) continue;
    const ov = layoutByGid.get(gid);
    if (ov?.hidden) continue;

    const layers = g.layerIds
      .map((lid) => layerById.get(lid))
      .filter((l): l is NonNullable<typeof l> => !!l && !l.hidden);
    if (layers.length === 0) continue;

    const isBg = g.role === "background";

    // Resolve per-layer target-pixel coords from the layout JSON, then convert to %.
    let mapLayer: (l: typeof layers[number]) => { x: number; y: number; w: number; h: number };

    if (ov?.transform && ov.transform.w != null && ov.transform.h != null && ov.transform.x != null && ov.transform.y != null) {
      const srcMinX = Math.min(...layers.map((l) => l.x));
      const srcMinY = Math.min(...layers.map((l) => l.y));
      const srcMaxX = Math.max(...layers.map((l) => l.x + l.w));
      const srcMaxY = Math.max(...layers.map((l) => l.y + l.h));
      const srcW = Math.max(1, srcMaxX - srcMinX);
      const srcH = Math.max(1, srcMaxY - srcMinY);
      const tx = ov.transform.x, ty = ov.transform.y, tw = ov.transform.w, th = ov.transform.h;
      mapLayer = (l) => ({
        x: tx + ((l.x - srcMinX) / srcW) * tw,
        y: ty + ((l.y - srcMinY) / srcH) * th,
        w: Math.max(1, (l.w / srcW) * tw),
        h: Math.max(1, (l.h / srcH) * th),
      });
    } else if (ov?.transform?.scale != null) {
      const s = ov.transform.scale;
      mapLayer = (l) => ({
        x: l.x * sx + (ov.transform!.x ?? 0),
        y: l.y * sy + (ov.transform!.y ?? 0),
        w: Math.max(1, l.w * s),
        h: Math.max(1, l.h * s),
      });
    } else {
      mapLayer = (l) => ({
        x: l.x * sx,
        y: l.y * sy,
        w: Math.max(1, l.w * sx),
        h: Math.max(1, l.h * sy),
      });
    }

    const overrideByLid = new Map((ov?.layerOverrides ?? []).map((o) => [o.lid, o]));

    const layerHtml = layers
      .map((l) => {
        const mapped = mapLayer(l);
        const o = overrideByLid.get(l.lid);
        const xPx = o?.x ?? mapped.x;
        const yPx = o?.y ?? mapped.y;
        const wPx = o?.w ?? mapped.w;
        const hPx = o?.h ?? mapped.h;
        const op = o?.op ?? l.opacity;
        const bm = safeBm(l.bm);
        const xp = pct((xPx / W) * 100);
        const yp = pct((yPx / H) * 100);
        const wp = pct((wPx / W) * 100);
        const hp = pct((hPx / H) * 100);
        const rot = ov?.transform?.rot ?? 0;
        const style = [
          `--xp:${xp}%`,
          `--yp:${yp}%`,
          `--wp:${wp}%`,
          `--hp:${hp}%`,
          `--z:${l.z}`,
          `--op:${op}`,
          `--rot:${rot}deg`,
          `--bm:${bm}`,
        ].join(";");
        return `<img class="layer" data-lid="${escapeAttr(l.lid)}" data-kind="${l.kind}" data-fit="${isBg ? "cover" : "contain"}" src="${assetBaseUrl}/${l.lid}.png" style="${style}" alt="" />`;
      })
      .join("");

    groupHtml.push(
      `<div class="group" data-gid="${escapeAttr(g.gid)}" data-role="${g.role}" data-importance="${g.importance}">${layerHtml}</div>`
    );
  }

  const bg = layout.canvas.background ?? "#ffffff";
  const html =
    `<!doctype html>\n` +
    `<html data-emit-version="${EMIT_VERSION}" data-w="${W}" data-h="${H}">\n` +
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head>\n` +
    `<body>\n` +
    `<div class="kv-wrap">` +
    `<div class="kv" style="--ratio:${W} / ${H};--bg:${bg}">\n` +
    groupHtml.join("") +
    `</div></div>\n</body>\n</html>\n`;

  return { html };
}
