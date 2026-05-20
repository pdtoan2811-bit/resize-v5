"use client";

import { describeFetchError } from "@/lib/fetch-error";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Engine = "algorithm" | "ai";

const COPY: Record<Engine, { title: string; desc: string }> = {
  algorithm: { title: "Algorithm", desc: "Deterministic emit · free · instant" },
  ai: { title: "AI HTML", desc: "AI authors HTML+CSS using brand context · ~$0.04 once" },
};

export function InlineEngine({
  psdId, current, reasoning, hasRewriteRenders,
}: { psdId: string; current: Engine; reasoning: string | null; hasRewriteRenders: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const next: Engine = current === "algorithm" ? "ai" : "algorithm";

  async function switchTo() {
    if (hasRewriteRenders) {
      if (!confirm("Switching engines invalidates AI Rewrite renders. Continue?")) return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/psd/${psdId}/source-engine`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ engine: next }),
      });
      if (!res.ok) throw await describeFetchError(res);
      toast.success(next === "ai" ? "AI source generated" : "Back to algorithm engine");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="uppercase tracking-wider text-muted-foreground">Source engine</span>
        <button
          type="button"
          onClick={switchTo}
          disabled={busy}
          className="text-foreground hover:underline underline-offset-2 disabled:opacity-50"
        >
          {busy ? "generating…" : `switch to ${COPY[next].title} →`}
        </button>
      </div>
      <div className="text-xs">
        <span className="font-medium">{COPY[current].title}</span>
        <span className="text-muted-foreground"> · {COPY[current].desc}</span>
      </div>
      {current === "ai" && reasoning && (
        <p className="text-[10px] text-muted-foreground leading-snug italic pt-1">{reasoning}</p>
      )}
    </div>
  );
}
