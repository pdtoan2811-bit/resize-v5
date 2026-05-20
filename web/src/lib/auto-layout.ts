import type { AnchorHint, ParsedPsd, ReLayoutResult, SemanticGroup, SemanticResult } from "./types";

/**
 * Algorithmic re-layout — no AI calls.
 *
 * Uses the semantic anchors and role/importance already computed at upload
 * time to place each group on the target canvas. Background fills the canvas
 * (responsive `object-fit: cover` is set in the emit). Other groups are scaled
 * to fit their natural aspect ratio and anchored to a region of the target.
 *
 * Cheap, instant, and produces correct-looking layouts when:
 *   • Roles are reliable (logo / headline / cta / product / subject / background)
 *   • Anchors are populated (the AI semantic pass sets them; the stub does too)
 *
 * The output conforms to ReLayoutResult so it goes through the same
 * `applyLayout` → render → verify pipeline as the AI modes.
 */
export function autoLayout(
  psd: ParsedPsd,
  semantic: SemanticResult,
  targetW: number,
  targetH: number,
): ReLayoutResult {
  const safe = Math.max(8, Math.round(0.04 * Math.min(targetW, targetH)));
  const targetArea = targetW * targetH;
  const sourceArea = psd.width * psd.height;
  const ratioRatio = targetArea / sourceArea;

  const groups = semantic.groups.map((g) => layoutGroup(g, psd, targetW, targetH, safe, ratioRatio));
  return {
    canvas: { w: targetW, h: targetH, background: pickBackground(semantic, psd) },
    groups,
    reasoning: "Auto-layout: semantic anchors + heuristic placement (no AI).",
  };
}

function pickBackground(semantic: SemanticResult, psd: ParsedPsd): string {
  const bg = semantic.groups.find((g) => g.role === "background");
  if (bg) return "#ffffff"; // background group will paint itself via cover
  // No background group → guess from the flattened preview's corner color would be ideal, but
  // we don't have that here. Default to white; AI modes will override per their own logic.
  void psd;
  return "#ffffff";
}

function layoutGroup(
  g: SemanticGroup,
  psd: ParsedPsd,
  W: number,
  H: number,
  safe: number,
  ratioRatio: number,
): ReLayoutResult["groups"][number] {
  // Background → no transform; default cascading rescale fills the canvas.
  if (g.role === "background") return { gid: g.gid };

  // Hide optional groups when target shrinks dramatically.
  if (g.importance === "optional" && ratioRatio < 0.5) {
    return { gid: g.gid, hidden: true };
  }

  // Source-bbox of the group (union of its layers in source-canvas coords).
  const layers = g.layerIds.map((lid) => psd.layers.find((l) => l.lid === lid)).filter(Boolean) as ParsedPsd["layers"];
  if (layers.length === 0) return { gid: g.gid };
  const srcMinX = Math.min(...layers.map((l) => l.x));
  const srcMinY = Math.min(...layers.map((l) => l.y));
  const srcMaxX = Math.max(...layers.map((l) => l.x + l.w));
  const srcMaxY = Math.max(...layers.map((l) => l.y + l.h));
  const srcW = Math.max(1, srcMaxX - srcMinX);
  const srcH = Math.max(1, srcMaxY - srcMinY);
  const srcRatio = srcW / srcH;

  // Pick an anchor: explicit anchorHint, else fall back from role.
  const anchor = g.anchorHint ?? roleDefaultAnchor(g.role);

  // Decide the target box. Strategy:
  //   - logo/cta/badge: small fixed-fraction of canvas
  //   - headline/subhead/disclaimer: full safe-width band
  //   - product/subject: large central region
  //   - others: proportional
  let targetBoxW: number, targetBoxH: number;

  if (g.role === "logo") {
    targetBoxW = Math.min(W * 0.28, srcW * (W / psd.width));
    targetBoxH = targetBoxW / srcRatio;
  } else if (g.role === "cta") {
    targetBoxW = Math.min(W * 0.55, Math.max(120, srcW * (W / psd.width)));
    targetBoxH = Math.max(36, targetBoxW / srcRatio);
  } else if (g.role === "headline" || g.role === "subhead" || g.role === "disclaimer") {
    targetBoxW = W - 2 * safe;
    targetBoxH = targetBoxW / srcRatio;
    // Don't let text-band be taller than 35% of canvas.
    if (targetBoxH > H * 0.35) {
      targetBoxH = H * 0.35;
      targetBoxW = targetBoxH * srcRatio;
    }
  } else if (g.role === "product" || g.role === "subject") {
    // Fit inside the canvas (minus safe areas) maximizing area while keeping aspect.
    const maxW = W - 2 * safe;
    const maxH = H * 0.7;
    if (maxW / maxH > srcRatio) {
      targetBoxH = maxH;
      targetBoxW = maxH * srcRatio;
    } else {
      targetBoxW = maxW;
      targetBoxH = maxW / srcRatio;
    }
  } else {
    // Default: proportional rescale by min axis.
    const s = Math.min(W / psd.width, H / psd.height);
    targetBoxW = srcW * s;
    targetBoxH = srcH * s;
  }

  // Position via anchor.
  const { x, y } = anchorPosition(anchor, W, H, targetBoxW, targetBoxH, safe);

  return {
    gid: g.gid,
    transform: {
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(targetBoxW),
      h: Math.round(targetBoxH),
    },
  };
}

function roleDefaultAnchor(role: SemanticGroup["role"]): AnchorHint {
  switch (role) {
    case "logo": return "top-left";
    case "headline": return "top";
    case "subhead": return "top";
    case "cta": return "bottom";
    case "disclaimer": return "bottom";
    case "frame": return "center";
    case "product": return "center";
    case "subject": return "center";
    case "decoration": return "center";
    case "shadow_effect": return "center";
    case "texture": return "full";
    case "background": return "full";
  }
}

function anchorPosition(
  anchor: AnchorHint,
  W: number,
  H: number,
  boxW: number,
  boxH: number,
  safe: number,
): { x: number; y: number } {
  const cx = (W - boxW) / 2;
  const cy = (H - boxH) / 2;
  const rightX = W - boxW - safe;
  const bottomY = H - boxH - safe;
  switch (anchor) {
    case "top-left":     return { x: safe,    y: safe };
    case "top":          return { x: cx,      y: safe };
    case "top-right":    return { x: rightX,  y: safe };
    case "left":         return { x: safe,    y: cy };
    case "center":       return { x: cx,      y: cy };
    case "right":        return { x: rightX,  y: cy };
    case "bottom-left":  return { x: safe,    y: bottomY };
    case "bottom":       return { x: cx,      y: bottomY };
    case "bottom-right": return { x: rightX,  y: bottomY };
    case "full":         return { x: 0,       y: 0 };
  }
}
