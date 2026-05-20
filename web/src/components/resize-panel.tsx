"use client";

import { describeFetchError } from "@/lib/fetch-error";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const PRESETS = [
  { name: "1:1", w: 1080, h: 1080 },
  { name: "4:5", w: 1080, h: 1350 },
  { name: "9:16", w: 1080, h: 1920 },
  { name: "16:9", w: 1920, h: 1080 },
  { name: "300×600", w: 300, h: 600 },
  { name: "728×90", w: 728, h: 90 },
  { name: "160×600", w: 160, h: 600 },
];

export function ResizePanel({ psdId }: { psdId: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(["1:1", "9:16", "728×90"]));
  const [customW, setCustomW] = useState("");
  const [customH, setCustomH] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(name: string) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name); else next.add(name);
    setSelected(next);
  }

  async function run() {
    setBusy(true);
    setErr(null);
    const targets = PRESETS.filter((p) => selected.has(p.name)).map((p) => ({ name: p.name, w: p.w, h: p.h }));
    const w = parseInt(customW, 10), h = parseInt(customH, 10);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      targets.push({ name: `${w}×${h}`, w, h });
    }
    if (targets.length === 0) { setErr("Pick at least one size."); setBusy(false); return; }
    try {
      const res = await fetch(`/api/psd/${psdId}/resize`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ targets }),
      });
      if (!res.ok) throw await describeFetchError(res);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Generate sizes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => toggle(p.name)}
              className="cursor-pointer"
              type="button"
            >
              <Badge variant={selected.has(p.name) ? "default" : "outline"}>{p.name}</Badge>
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <Input type="number" placeholder="W" value={customW} onChange={(e) => setCustomW(e.target.value)} className="w-20 h-8" />
          <span className="text-muted-foreground">×</span>
          <Input type="number" placeholder="H" value={customH} onChange={(e) => setCustomH(e.target.value)} className="w-20 h-8" />
        </div>
        <Button onClick={run} disabled={busy} className="w-full">
          {busy ? "Generating…" : "Generate"}
        </Button>
        {err && <div className="text-xs text-red-600">{err}</div>}
      </CardContent>
    </Card>
  );
}
