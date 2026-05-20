"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function ProjectNotes({ psdId, initial }: { psdId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [savedValue, setSavedValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = value !== savedValue;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/psd/${psdId}/notes`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ iterationNotes: value.trim() || null }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSavedValue(value);
      toast.success("Project notes saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={6}
        className="text-xs leading-relaxed font-mono"
        placeholder={`Persistent notes for this PSD — applied to every render.\nThe most recent batch of AI critique suggestions is auto-collected below the marker.`}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">
          {dirty ? "unsaved changes" : "saved"} · auto-updated after each AI render
        </span>
        <Button size="sm" variant={dirty ? "default" : "outline"} disabled={!dirty || saving} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
