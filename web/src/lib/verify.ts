import type { ParsedPsd, SemanticResult, ReLayoutResult, VerifyResult, VerifyTier1Issue, SemanticGroup } from "./types";

const LEGIBILITY_ROLES = new Set(["logo", "headline", "cta"]);

interface Rect { x: number; y: number; w: number; h: number }

function rectOf(g: SemanticGroup, layout: ReLayoutResult, psd: ParsedPsd): Rect {
  const ov = layout.groups.find((x) => x.gid === g.gid);
  const sx = layout.canvas.w / psd.width;
  const sy = layout.canvas.h / psd.height;
  const layers = g.layerIds.map((lid) => psd.layers.find((l) => l.lid === lid)).filter(Boolean) as ParsedPsd["layers"];
  const srcMinX = Math.min(...layers.map((l) => l.x));
  const srcMinY = Math.min(...layers.map((l) => l.y));
  const srcMaxX = Math.max(...layers.map((l) => l.x + l.w));
  const srcMaxY = Math.max(...layers.map((l) => l.y + l.h));
  if (ov?.transform?.w != null && ov.transform.h != null && ov.transform.x != null && ov.transform.y != null) {
    return { x: ov.transform.x, y: ov.transform.y, w: ov.transform.w, h: ov.transform.h };
  }
  return {
    x: Math.round(srcMinX * sx),
    y: Math.round(srcMinY * sy),
    w: Math.max(1, Math.round((srcMaxX - srcMinX) * sx)),
    h: Math.max(1, Math.round((srcMaxY - srcMinY) * sy)),
  };
}

function overlapArea(a: Rect, b: Rect): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

export function verifyTier1(args: {
  psd: ParsedPsd;
  semantic: SemanticResult;
  layout: ReLayoutResult;
  safePx?: number;
}): VerifyResult {
  const { psd, semantic, layout } = args;
  const issues: VerifyTier1Issue[] = [];
  const safePx = args.safePx ?? Math.round(0.04 * Math.min(layout.canvas.w, layout.canvas.h));
  const safe: Rect = { x: safePx, y: safePx, w: layout.canvas.w - 2 * safePx, h: layout.canvas.h - 2 * safePx };
  const legibilityMin = Math.max(14, Math.round(0.04 * Math.min(layout.canvas.w, layout.canvas.h)));

  const visible = semantic.groups.filter((g) => !layout.groups.find((x) => x.gid === g.gid)?.hidden);

  // Hidden-primary check
  for (const g of semantic.groups) {
    const ov = layout.groups.find((x) => x.gid === g.gid);
    if (ov?.hidden && (g.importance === "primary" || g.importance === "structural")) {
      issues.push({ kind: "out_of_bounds", gid: g.gid, detail: `${g.importance} role hidden` });
    }
  }

  const rects = visible.map((g) => ({ g, r: rectOf(g, layout, psd) }));

  for (const { g, r } of rects) {
    if (r.x < 0 || r.y < 0 || r.x + r.w > layout.canvas.w || r.y + r.h > layout.canvas.h) {
      issues.push({ kind: "out_of_bounds", gid: g.gid, detail: `rect ${r.x},${r.y} ${r.w}x${r.h}` });
    }
    if (g.importance === "primary") {
      if (r.x < safe.x || r.y < safe.y || r.x + r.w > safe.x + safe.w || r.y + r.h > safe.y + safe.h) {
        issues.push({ kind: "outside_safe_area", gid: g.gid, detail: `primary outside safe area` });
      }
    }
    if (LEGIBILITY_ROLES.has(g.role) && r.h < legibilityMin) {
      issues.push({ kind: "legibility_floor", gid: g.gid, detail: `${g.role} height ${r.h}<${legibilityMin}` });
    }
  }

  // Pairwise overlap among primaries
  const primaries = rects.filter(({ g }) => g.importance === "primary" && g.role !== "background");
  for (let i = 0; i < primaries.length; i++) {
    for (let j = i + 1; j < primaries.length; j++) {
      const a = primaries[i], b = primaries[j];
      const ov = overlapArea(a.r, b.r);
      const smaller = Math.min(a.r.w * a.r.h, b.r.w * b.r.h);
      if (smaller > 0 && ov / smaller > 0.15) {
        issues.push({ kind: "overlap", gid: a.g.gid, detail: `overlaps ${b.g.gid} by ${Math.round((ov / smaller) * 100)}%` });
      }
    }
  }

  // Background coverage: ensure a background-role group exists and covers canvas, or canvas has a non-white background.
  const hasBg = visible.some((g) => g.role === "background");
  const bg = layout.canvas.background ?? "#ffffff";
  if (!hasBg && (bg === "#ffffff" || bg === "#fff")) {
    issues.push({ kind: "background_gap", detail: "no background group and canvas is white" });
  }

  return { tier1Pass: issues.length === 0, tier1Issues: issues, pass: issues.length === 0 };
}
