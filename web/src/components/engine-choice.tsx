"use client";

import { describeFetchError } from "@/lib/fetch-error";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Engine = "algorithm" | "ai";

const META: Record<Engine, { title: string; subtitle: string; long: string; cost: string }> = {
  algorithm: {
    title: "Algorithm engine",
    subtitle: "Deterministic, exact reproduction",
    long: "Each layer is placed at its exact source coordinates and rasterized image. Cheap, instant, and what-you-see-is-what-the-PSD-was. The default — choose this when you want a faithful starting point.",
    cost: "free · instant",
  },
  ai: {
    title: "AI HTML engine",
    subtitle: "AI authors a clean HTML+CSS using semantic groups + brand context",
    long: "The AI rewrites the layout as a modern HTML+CSS document at the source ratio — semantic structure, flex/grid where appropriate, brand voice applied. Same layer assets, fresher composition. All resize modes operate on this richer source.",
    cost: "~$0.04 once",
  },
};

export function EngineChoice({
  psdId,
  current,
  reasoning,
  hasRewriteRenders,
}: {
  psdId: string;
  current: Engine;
  reasoning: string | null;
  hasRewriteRenders: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Engine | null>(null);

  async function switchTo(engine: Engine) {
    if (engine === current) return;
    if (hasRewriteRenders) {
      const ok = window.confirm(
        `Switching the source engine invalidates ${hasRewriteRenders ? "all AI Rewrite renders" : "no renders"}.\n\nContinue?`
      );
      if (!ok) return;
    }
    setBusy(engine);
    try {
      const res = await fetch(`/api/psd/${psdId}/source-engine`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ engine }),
      });
      if (!res.ok) throw await describeFetchError(res);
      toast.success(
        engine === "ai"
          ? "AI source ready · brand context applied"
          : "Switched back to algorithm engine"
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Source engine</div>
            <div className="text-sm font-semibold tracking-tight mt-0.5">
              {META[current].title} <span className="font-normal text-muted-foreground">— {META[current].subtitle}</span>
            </div>
          </div>
          <Badge variant="secondary" className="text-[10px] font-mono">{current}</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(["algorithm", "ai"] as Engine[]).map((e) => {
            const active = e === current;
            return (
              <button
                key={e}
                type="button"
                onClick={() => switchTo(e)}
                disabled={busy !== null || active}
                className={`text-left rounded-md border px-3 py-3 transition-colors disabled:cursor-default ${
                  active
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white hover:border-zinc-400"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium text-sm">{META[e].title}</div>
                  <div className={`text-[10px] font-mono ${active ? "text-zinc-300" : "text-muted-foreground"}`}>
                    {META[e].cost}
                  </div>
                </div>
                <div className={`text-[11px] mt-1 leading-snug ${active ? "text-zinc-300" : "text-muted-foreground"}`}>
                  {META[e].long}
                </div>
                <div className="text-[10px] mt-2 font-mono">
                  {busy === e ? "generating…" : active ? "active" : "switch →"}
                </div>
              </button>
            );
          })}
        </div>

        {current === "ai" && reasoning && (
          <div className="text-[11px] text-muted-foreground leading-relaxed border-l-2 border-zinc-200 pl-3 py-1">
            <span className="uppercase tracking-wider text-[10px] font-medium">AI reasoning</span>
            <p className="mt-1">{reasoning}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
