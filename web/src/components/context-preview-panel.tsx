"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

const CALLS = [
  "semanticPass",
  "generateSourceHtml",
  "imagineReference",
  "reLayout",
  "rewriteHtml",
  "verifyCritique",
] as const;
type Call = (typeof CALLS)[number];

const LABEL: Record<Call, string> = {
  semanticPass: "Semantic grouping",
  generateSourceHtml: "AI source HTML",
  imagineReference: "Aesthetic reference",
  reLayout: "AI Responsive resize",
  rewriteHtml: "AI Rewrite resize",
  verifyCritique: "Vision critique",
};

interface Preview {
  stages: string[];
  hasOrg: boolean;
  hasIterationNotes: boolean;
  hasTaskBrief: boolean;
  preview: string;
}

export function ContextPreviewPanel({ psdId }: { psdId: string }) {
  const [call, setCall] = useState<Call>("reLayout");
  const [brief, setBrief] = useState("");
  const [data, setData] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    const qs = new URLSearchParams({ call });
    if (brief.trim()) qs.set("brief", brief.trim());
    fetch(`/api/psd/${psdId}/context-preview?${qs}`)
      .then((r) => r.json())
      .then((d: Preview) => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [call, brief, psdId]);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {CALLS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCall(c)}
            className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
              c === call ? "bg-zinc-900 text-white" : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700"
            }`}
          >
            {LABEL[c]}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
          Hypothetical task brief (L1)
        </label>
        <input
          type="text"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="(optional) e.g. headline big, CTA small"
          className="w-full text-xs px-2 py-1.5 rounded border border-zinc-200 bg-white"
        />
      </div>

      {data && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className="text-[9px] font-mono">
              stages: {data.stages.join(" + ") || "—"}
            </Badge>
            <Badge variant={data.hasOrg ? "default" : "outline"} className="text-[9px]">
              L3 brand {data.hasOrg ? "✓" : "—"}
            </Badge>
            <Badge variant={data.hasIterationNotes ? "default" : "outline"} className="text-[9px]">
              L2 notes {data.hasIterationNotes ? "✓" : "—"}
            </Badge>
            <Badge variant={data.hasTaskBrief ? "default" : "outline"} className="text-[9px]">
              L1 brief {data.hasTaskBrief ? "✓" : "—"}
            </Badge>
          </div>
          <pre className="text-[10px] leading-snug whitespace-pre-wrap break-words bg-zinc-50 ring-1 ring-zinc-200 rounded p-2 max-h-[280px] overflow-auto font-mono">
            {busy ? "loading…" : data.preview}
          </pre>
        </div>
      )}
    </div>
  );
}
