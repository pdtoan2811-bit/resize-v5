"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function DeletePsdButton({ psdId, filename, renderCount }: { psdId: string; filename: string; renderCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch(`/api/psd/${psdId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      toast.success("PSD deleted");
      router.push("/");
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
          <button
            className="text-[11px] text-muted-foreground hover:text-red-600 transition-colors underline-offset-2 hover:underline"
            type="button"
          >
            Delete · start over
          </button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this PSD?</DialogTitle>
          <DialogDescription className="space-y-2 pt-1">
            <span className="block">
              <strong>{filename}</strong> — the PSD file, parsed layers, semantic groups, all{" "}
              {renderCount} render{renderCount === 1 ? "" : "s"}, imagined references, and project notes will be removed.
            </span>
            <span className="block text-xs text-muted-foreground">
              Brand context at /settings stays. You&apos;ll be sent back to the home screen.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={run} disabled={busy}>
            {busy ? "Deleting…" : "Delete PSD"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
