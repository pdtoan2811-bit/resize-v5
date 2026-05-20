"use client";

import { describeFetchError } from "@/lib/fetch-error";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export function ReSemanticButton({ psdId, renderCount }: { psdId: string; renderCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch(`/api/psd/${psdId}/resemantic`, { method: "POST" });
      if (!res.ok) throw await describeFetchError(res);
      const data = await res.json();
      toast.success(`Re-analyzed · ${data.groupsCount} groups · past renders cleared`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] uppercase tracking-wider">
            Re-analyze
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Re-run semantic analysis?</DialogTitle>
          <DialogDescription className="space-y-2 pt-1">
            <span className="block">
              Layers will be re-grouped and re-named using the latest heuristics and AI semantic pass.
              The cached groups will be replaced.
            </span>
            {renderCount > 0 && (
              <span className="block text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded-md px-3 py-2 text-xs">
                ⚠ This will wipe <strong>{renderCount} existing render{renderCount === 1 ? "" : "s"}</strong>.
                Past layouts reference the old group ids and won&apos;t match the new analysis.
              </span>
            )}
            <span className="block text-xs text-muted-foreground">
              Your project notes (manual part) stay. Brand context stays. Designer task briefs aren&apos;t affected.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={run} disabled={busy}>
            {busy ? "Re-analyzing…" : renderCount > 0 ? "Re-analyze and wipe renders" : "Re-analyze"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
