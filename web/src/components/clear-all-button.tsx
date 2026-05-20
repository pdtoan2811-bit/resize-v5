"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ClearAllButton({ count }: { count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/reset", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Everything cleared");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  if (count === 0) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-red-600 transition-colors underline-offset-2 hover:underline"
          >
            Clear all · start fresh
          </button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clear everything?</DialogTitle>
          <DialogDescription className="space-y-2 pt-1">
            <span className="block">
              Removes all {count} PSD{count === 1 ? "" : "s"} — every uploaded file, every cached layer,
              every render, every imagined reference, every project note.
            </span>
            <span className="block text-xs text-muted-foreground">
              Brand context at /settings is kept (it&apos;s not tied to any specific PSD).
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={run} disabled={busy}>
            {busy ? "Clearing…" : "Clear all"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
