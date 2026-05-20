"use client";

import { Studio } from "@/components/studio";

interface Props {
  psdId: string;
  psdHash: string;
  initialRenders: Array<{
    id: string; mode: string; targetW: number; targetH: number;
    presetName: string | null; status: string; score: number | null;
    reasoning: string | null; latencyMs: number | null;
  }>;
}

export function StepResize({ psdId, psdHash, initialRenders }: Props) {
  return <Studio psdId={psdId} psdHash={psdHash} initialRenders={initialRenders} />;
}
