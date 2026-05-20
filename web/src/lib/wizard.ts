export const STEPS = ["prep", "groups", "source", "resize"] as const;
export type Step = (typeof STEPS)[number];

export const STEP_META: Record<Step, { num: number; title: string; subtitle: string }> = {
  prep:   { num: 1, title: "Review",   subtitle: "Inspect layers + context before any AI runs" },
  groups: { num: 2, title: "Group",    subtitle: "AI semantic grouping (or re-run with new context)" },
  source: { num: 3, title: "Source",   subtitle: "Pick the source HTML engine: algorithm or AI" },
  resize: { num: 4, title: "Resize",   subtitle: "Generate every target size and compare" },
};

export interface PsdStateLike {
  groupsCount: number;
  rendersCount: number;
}

/** Infer the next-most-useful step from the PSD's current state. */
export function defaultStep(s: PsdStateLike): Step {
  if (s.groupsCount === 0) return "prep";
  if (s.rendersCount === 0) return "source";
  return "resize";
}

/** Can this step be entered with the given data? */
export function canEnter(step: Step, s: PsdStateLike): boolean {
  switch (step) {
    case "prep": return true;
    case "groups": return true; // accessible to review groups (or empty state)
    case "source": return s.groupsCount > 0;
    case "resize": return s.groupsCount > 0;
  }
}
