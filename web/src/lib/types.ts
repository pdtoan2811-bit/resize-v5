export const EMIT_VERSION = "1";

export const ROLES = [
  "logo",
  "headline",
  "subhead",
  "cta",
  "product",
  "subject",
  "background",
  "decoration",
  "shadow_effect",
  "texture",
  "frame",
  "disclaimer",
] as const;
export type Role = (typeof ROLES)[number];

export const IMPORTANCE = ["primary", "secondary", "structural", "optional"] as const;
export type Importance = (typeof IMPORTANCE)[number];

export const ROLE_DEFAULT_IMPORTANCE: Record<Role, Importance> = {
  logo: "primary",
  headline: "primary",
  subhead: "secondary",
  cta: "primary",
  product: "primary",
  subject: "primary",
  background: "structural",
  decoration: "optional",
  shadow_effect: "optional",
  texture: "optional",
  frame: "secondary",
  disclaimer: "secondary",
};

export type AnchorHint =
  | "top-left" | "top" | "top-right"
  | "left" | "center" | "right"
  | "bottom-left" | "bottom" | "bottom-right"
  | "full";

export interface ParsedLayer {
  lid: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  opacity: number;
  bm: string;
  pngPath: string;
  kind: "raster" | "text" | "smartObject" | "shape";
  hidden?: boolean;
  contentBbox?: { x: number; y: number; w: number; h: number };
}

export interface ParsedPsd {
  hash: string;
  filename: string;
  width: number;
  height: number;
  flattenedPath: string;
  layers: ParsedLayer[];
}

export interface SemanticGroup {
  gid: string;
  role: Role;
  label: string;
  importance: Importance;
  layerIds: string[];
  anchorHint?: AnchorHint;
  rationale?: string;
}

export interface SemanticResult {
  groups: SemanticGroup[];
  unassigned: string[];
  notes?: string;
}

export interface ReLayoutGroup {
  gid: string;
  hidden?: boolean;
  transform?: { x?: number; y?: number; w?: number; h?: number; rot?: number; scale?: number };
  layerOverrides?: Array<{ lid: string; x?: number; y?: number; w?: number; h?: number; op?: number }>;
}

export interface ReLayoutResult {
  canvas: { w: number; h: number; background?: string };
  groups: ReLayoutGroup[];
  domOrder?: string[];
  reasoning?: string;
  hiddenJustified?: Record<string, string>;
}

export interface VerifyTier1Issue {
  kind:
    | "out_of_bounds"
    | "outside_safe_area"
    | "overlap"
    | "legibility_floor"
    | "background_gap"
    | "blank_render";
  gid?: string;
  detail: string;
}

export interface VerifyResult {
  tier1Pass: boolean;
  tier1Issues: VerifyTier1Issue[];
  score?: number;
  rubric?: Record<string, { score: number; note: string }>;
  pass: boolean;
}
