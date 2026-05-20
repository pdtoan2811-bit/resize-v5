"use client";

import { describeFetchError } from "@/lib/fetch-error";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResponsivePreview } from "@/components/responsive-preview";
import { toast } from "sonner";

type Engine = "algorithm" | "ai";

interface Props {
  psdId: string;
  psdHash: string;
  width: number;
  height: number;
  current: Engine;
  reasoning: string | null;
  rewriteRenderCount: number;
}

export function StepSource({
  psdId, current, width, height, reasoning, rewriteRenderCount,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<Engine | null>(null);

  async function switchTo(next: Engine) {
    if (next === current) return;
    if (rewriteRenderCount > 0 && !confirm(`Switching invalidates ${rewriteRenderCount} AI Rewrite renders. Continue?`)) return;
    setBusy(next);
    try {
      const res = await fetch(`/api/psd/${psdId}/source-engine`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ engine: next }),
      });
      if (!res.ok) throw await describeFetchError(res);
      toast.success(next === "ai" ? "AI source ready" : "Back to algorithm");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Engine picker */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <EngineCard
          name="Algorithm"
          subtitle="Deterministic emit"
          desc="Each layer placed at its exact source coordinates. Free, instant, reproducible."
          cost="free · instant"
          active={current === "algorithm"}
          busy={busy === "algorithm"}
          onPick={() => switchTo("algorithm")}
        />
        <EngineCard
          name="AI HTML / CSS"
          subtitle="AI authors a clean HTML+CSS document"
          desc="The AI rewrites the source as modern semantic HTML conditioned on brand context. Used as the starting point for AI Rewrite resize mode."
          cost="~$0.04 once"
          active={current === "ai"}
          busy={busy === "ai"}
          onPick={() => switchTo("ai")}
        />
      </div>

      {/* Tune the engine context */}
      {current === "ai" && (
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">AI reasoning</div>
              <Link href="/settings#sourceEngine" className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
                Tune HTML engine context →
              </Link>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground italic">
              {reasoning ?? "(no reasoning recorded)"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Live preview of active engine */}
      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
              Source preview · {current === "ai" ? "AI engine" : "Algorithm engine"}
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">{width}×{height}</span>
          </div>
          <ResponsivePreview
            psdId={psdId}
            targetW={width}
            targetH={height}
            label=""
            status="passed"
            srcUrl={`/api/psd/${psdId}/source.html`}
          />
        </CardContent>
      </Card>

      {/* Continue */}
      <div className="flex justify-end">
        <Link href={`/psd/${psdId}?step=resize`}>
          <Button>Continue to resize →</Button>
        </Link>
      </div>
    </div>
  );
}

function EngineCard({
  name, subtitle, desc, cost, active, busy, onPick,
}: {
  name: string; subtitle: string; desc: string; cost: string;
  active: boolean; busy: boolean; onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={active || busy}
      className={`text-left rounded-lg border px-4 py-4 transition-colors disabled:cursor-default ${
        active
          ? "border-zinc-900 bg-zinc-900 text-white"
          : "border-zinc-200 bg-white hover:border-zinc-400"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="font-semibold tracking-tight">{name}</div>
        <Badge variant={active ? "secondary" : "outline"} className="text-[10px] font-mono">{cost}</Badge>
      </div>
      <div className={`text-xs mb-2 ${active ? "text-zinc-300" : "text-muted-foreground"}`}>{subtitle}</div>
      <p className={`text-[11px] leading-snug ${active ? "text-zinc-300" : "text-muted-foreground"}`}>{desc}</p>
      <div className={`text-[10px] mt-3 font-mono ${active ? "text-zinc-200" : "text-zinc-500"}`}>
        {busy ? "generating…" : active ? "active" : "use this →"}
      </div>
    </button>
  );
}
