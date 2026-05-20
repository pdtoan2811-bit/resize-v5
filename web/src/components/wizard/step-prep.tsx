"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProjectNotes } from "@/components/project-notes";
import { toast } from "sonner";

interface Props {
  psdId: string;
  psdHash: string;
  filename: string;
  width: number;
  height: number;
  layerCount: number;
  iterationNotes: string;
  ctxFlags: { brand: boolean; grouping: boolean; sourceEngine: boolean; resize: boolean; verify: boolean };
}

export function StepPrep({
  psdId, psdHash, filename, width, height, layerCount, iterationNotes, ctxFlags,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function runGrouping() {
    setBusy(true);
    try {
      const res = await fetch(`/api/psd/${psdId}/resemantic`, { method: "POST" });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        const msg = (data as { error?: string }).error
          || `Server returned ${res.status} ${res.statusText || ""}`.trim()
          || "Grouping failed with no message";
        throw new Error(msg);
      }
      toast.success(`Grouped · ${(data as { groupsCount?: number }).groupsCount ?? 0} semantic units`);
      router.push(`/psd/${psdId}?step=groups`);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || "Grouping failed", {
        description: "Check server console for the full stack. Often: bad OPENAI_API_KEY, wrong OPENAI_MODEL_TEXT, or the model doesn't accept image input.",
        duration: 10000,
      });
      console.error("Grouping failed:", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
      {/* Left: large source preview */}
      <Card>
        <CardContent className="space-y-3">
          <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
            Uploaded PSD · flattened preview
          </div>
          <div className="rounded-md overflow-hidden ring-1 ring-zinc-200 bg-[radial-gradient(circle_at_1px_1px,_#e4e4e7_1px,_transparent_0)] [background-size:12px_12px] p-3">
            <img
              src={`/api/asset/${psdHash}/flattened.png`}
              alt={filename}
              className="max-w-full max-h-[60vh] object-contain mx-auto block bg-white shadow-sm"
            />
          </div>
          <div className="text-[10px] text-muted-foreground font-mono flex items-center justify-between">
            <span>{filename}</span>
            <span>{width}×{height} · {layerCount} layers</span>
          </div>
        </CardContent>
      </Card>

      {/* Right: context review + CTA */}
      <div className="space-y-3 lg:sticky lg:top-6">
        <Card>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                Before AI runs · review context
              </div>
              <p className="text-xs text-muted-foreground">
                Semantic grouping (next step) will use the brand context + grouping rules + the project notes below.
                Edit anything that&apos;s off — the AI sees this verbatim.
              </p>
            </div>

            {/* Brand context status with deep links */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-muted-foreground">Brand context</div>
              <div className="grid grid-cols-2 gap-1.5">
                <CtxRow label="Brand identity" on={ctxFlags.brand} href="/settings#brand" />
                <CtxRow label="Grouping rules" on={ctxFlags.grouping} href="/settings#grouping" />
                <CtxRow label="HTML engine" on={ctxFlags.sourceEngine} href="/settings#sourceEngine" />
                <CtxRow label="Resize rules" on={ctxFlags.resize} href="/settings#resize" />
              </div>
            </div>

            {/* Project notes (inline editor) */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-muted-foreground">Project notes (this PSD)</div>
              <ProjectNotes psdId={psdId} initial={iterationNotes} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <div className="text-xs text-muted-foreground leading-relaxed">
              Ready to identify semantic units in this PSD? The grouping AI will combine layers that read as one design
              element (logo + plate, headline + shadow, sparkles + subject).
            </div>
            <Button onClick={runGrouping} disabled={busy} className="w-full">
              {busy ? "Running grouping…" : "Run semantic grouping →"}
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">
              ~$0.02 · gpt-5.3-codex vision · cached forever
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CtxRow({ label, on, href }: { label: string; on: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] transition-colors ${
        on
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
          : "bg-zinc-50 text-zinc-500 ring-1 ring-zinc-200 hover:bg-zinc-100"
      }`}
    >
      <span className={`size-1.5 rounded-full ${on ? "bg-emerald-500" : "bg-zinc-300"}`} />
      <span className="truncate">{label}</span>
      {!on && <Badge variant="outline" className="text-[8px] px-1 py-0 ml-auto">empty</Badge>}
    </Link>
  );
}
