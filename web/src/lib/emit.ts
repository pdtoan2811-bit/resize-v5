import { EMIT_VERSION, type ParsedPsd, type SemanticResult, type SemanticGroup } from "./types";

const SUPPORTED_BLEND_MODES = new Set([
  "normal", "multiply", "screen", "overlay", "darken", "lighten",
  "color-dodge", "color-burn", "hard-light", "soft-light",
  "difference", "exclusion", "hue", "saturation", "color", "luminosity",
]);

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function safeBm(bm: string): { used: string; original: string } {
  const lower = bm.toLowerCase().replace(/_/g, "-");
  if (SUPPORTED_BLEND_MODES.has(lower)) return { used: lower, original: lower };
  return { used: "normal", original: lower };
}

function pct(n: number): string {
  // Five decimals is enough for sub-pixel accuracy at 8K and keeps output stable.
  return (Math.round(n * 100000) / 100000).toString();
}

export interface EmitInput {
  psd: ParsedPsd;
  semantic: SemanticResult;
  assetBaseUrl: string;
  safeAreaPct?: number;
}

export interface EmitOutput {
  html: string;
  css: string;
}

/**
 * Pure function: emitHtml(psd, groups) → {html, css}.
 * Same inputs → byte-identical output.
 *
 * Layout is **responsive**: layer coordinates are emitted as percentages of the
 * canvas, and the canvas itself uses CSS aspect-ratio + container-type, so the
 * same HTML renders correctly at any size within the source ratio family.
 */
export function emitHtml({ psd, semantic, assetBaseUrl, safeAreaPct = 0.04 }: EmitInput): EmitOutput {
  const layerById = new Map(psd.layers.map((l) => [l.lid, l]));
  const W = psd.width, H = psd.height;

  const groupMinZ = (g: SemanticGroup) =>
    Math.min(...g.layerIds.map((lid) => layerById.get(lid)?.z ?? 0));
  const orderedGroups = [...semantic.groups].sort((a, b) => {
    const dz = groupMinZ(a) - groupMinZ(b);
    return dz !== 0 ? dz : a.gid.localeCompare(b.gid);
  });

  const css = [
    `*,*::before,*::after{box-sizing:border-box}`,
    `html,body{margin:0;padding:0;height:100%;background:#fff}`,
    `.kv-wrap{width:100%;height:100%;display:grid;place-items:center;background:#f4f4f5}`,
    `.kv{position:relative;width:100%;height:100%;max-width:100vw;max-height:100vh;aspect-ratio:var(--ratio);container-type:size;overflow:hidden;background:var(--bg,#fff)}`,
    `.group{position:absolute;inset:0}`,
    `.group[hidden]{display:none}`,
    `.layer{position:absolute;left:var(--xp);top:var(--yp);width:var(--wp);height:var(--hp);z-index:var(--z);opacity:var(--op);transform:rotate(var(--rot,0deg));transform-origin:center;mix-blend-mode:var(--bm);object-fit:contain}`,
    `.layer[data-fit=cover]{object-fit:cover}`,
  ].join("");

  const groupHtml: string[] = [];
  for (const g of orderedGroups) {
    const layers = g.layerIds
      .map((lid) => layerById.get(lid))
      .filter((l): l is NonNullable<typeof l> => !!l && !l.hidden);
    if (layers.length === 0) continue;

    const isBg = g.role === "background";

    const layerHtml = layers
      .map((l) => {
        const { used, original } = safeBm(l.bm);
        const xp = pct((l.x / W) * 100);
        const yp = pct((l.y / H) * 100);
        const wp = pct((l.w / W) * 100);
        const hp = pct((l.h / H) * 100);
        const style = [
          `--xp:${xp}%`,
          `--yp:${yp}%`,
          `--wp:${wp}%`,
          `--hp:${hp}%`,
          `--z:${l.z}`,
          `--op:${l.opacity}`,
          `--rot:0deg`,
          `--bm:${used}`,
        ].join(";");
        return `<img class="layer" data-lid="${escapeAttr(l.lid)}" data-bm-original="${escapeAttr(original)}" data-kind="${l.kind}" data-fit="${isBg ? "cover" : "contain"}" src="${assetBaseUrl}/${l.lid}.png" style="${style}" alt="" />`;
      })
      .join("");

    groupHtml.push(
      `<div class="group" data-gid="${escapeAttr(g.gid)}" data-role="${g.role}" data-importance="${g.importance}"${g.anchorHint ? ` data-anchor="${g.anchorHint}"` : ""}>${layerHtml}</div>`
    );
  }

  const safePctNum = (safeAreaPct * 100).toFixed(2);
  const html =
    `<!doctype html>\n` +
    `<html data-emit-version="${EMIT_VERSION}" data-w="${W}" data-h="${H}">\n` +
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head>\n` +
    `<body>\n` +
    `<div class="kv-wrap">` +
    `<div class="kv" data-safe="${safePctNum}" style="--ratio:${W} / ${H};--bg:#fff">\n` +
    groupHtml.join("") +
    `</div></div>\n</body>\n</html>\n`;

  return { html, css };
}
