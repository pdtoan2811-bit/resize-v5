"use client";

import { describeFetchError } from "@/lib/fetch-error";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { ResponsivePreview } from "@/components/responsive-preview";
import { toast } from "sonner";

type Mode = "naive" | "auto" | "responsive" | "rewrite";
const MODE_ORDER: Mode[] = ["naive", "auto", "responsive", "rewrite"];

const MODE_META: Record<Mode, { title: string; tag: string; long: string; cost: string; speed: string }> = {
  naive: {
    title: "Naive",
    tag: "baseline",
    long: "Each layer scales independently. No grouping, no AI. The cheapest possible thing — useful as a control to see what the smarter modes actually fix.",
    cost: "free", speed: "instant",
  },
  auto: {
    title: "Group",
    tag: "semantic · no AI",
    long: "Semantic groups are treated as atomic units. Each group is anchored by its role (logo → top-left, headline → top, CTA → bottom, product → center) and scaled to fit. No AI calls per resize.",
    cost: "free", speed: "instant",
  },
  responsive: {
    title: "AI Responsive",
    tag: "AI moves groups",
    long: "AI emits per-group transforms; server converts to %. Single responsive document that scales fluidly within a ratio family. Retries on critique up to 3 times.",
    cost: "~$0.02", speed: "~10s",
  },
  rewrite: {
    title: "AI Rewrite",
    tag: "AI authors HTML",
    long: "AI rewrites the entire HTML+CSS for the target. Free use of flex/grid/gradients. Layer images and semantic data-* attrs preserved. Most creative, highest variance.",
    cost: "~$0.05", speed: "~30s",
  },
};

const PRESETS = [
  { name: "1:1", w: 1080, h: 1080 },
  { name: "4:5", w: 1080, h: 1350 },
  { name: "9:16", w: 1080, h: 1920 },
  { name: "16:9", w: 1920, h: 1080 },
  { name: "300×600", w: 300, h: 600 },
  { name: "728×90", w: 728, h: 90 },
  { name: "160×600", w: 160, h: 600 },
];

interface RenderRow {
  id: string;
  mode: string;
  targetW: number;
  targetH: number;
  presetName: string | null;
  status: string;
  score: number | null;
  reasoning: string | null;
  latencyMs: number | null;
}

export function Studio({
  psdId,
  psdHash,
  initialRenders,
}: {
  psdId: string;
  psdHash: string;
  initialRenders: RenderRow[];
}) {
  const router = useRouter();
  const [modes, setModes] = useState<Set<Mode>>(new Set(["auto"]));
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set(["1:1", "9:16", "300×600"]));
  const [customW, setCustomW] = useState("");
  const [customH, setCustomH] = useState("");
  const [nudge, setNudge] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ total: number; done: number; current?: string } | null>(null);

  // Group renders by (targetW, targetH) for the comparison gallery.
  const groupedBySize = useMemo(() => {
    const m = new Map<string, { w: number; h: number; presetName: string | null; renders: Map<string, RenderRow> }>();
    for (const r of initialRenders) {
      const key = `${r.targetW}x${r.targetH}`;
      const slot = m.get(key) ?? { w: r.targetW, h: r.targetH, presetName: r.presetName, renders: new Map() };
      slot.renders.set(r.mode, r);
      m.set(key, slot);
    }
    return [...m.values()].sort((a, b) => a.w / a.h - b.w / b.h || a.w - b.w);
  }, [initialRenders]);

  function toggleMode(m: Mode) {
    const next = new Set(modes);
    if (next.has(m)) next.delete(m); else next.add(m);
    if (next.size === 0) next.add("auto");
    setModes(next);
  }

  function toggleSize(name: string) {
    const next = new Set(selectedSizes);
    if (next.has(name)) next.delete(name); else next.add(name);
    setSelectedSizes(next);
  }

  async function run() {
    const targets = PRESETS.filter((p) => selectedSizes.has(p.name)).map((p) => ({ name: p.name, w: p.w, h: p.h }));
    const w = parseInt(customW, 10), h = parseInt(customH, 10);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      targets.push({ name: `${w}×${h}`, w, h });
    }
    if (targets.length === 0) { toast.error("Pick at least one size."); return; }
    if (modes.size === 0) { toast.error("Pick at least one mode."); return; }

    const tasks: { mode: Mode; target: { name: string; w: number; h: number } }[] = [];
    for (const m of MODE_ORDER) if (modes.has(m)) for (const t of targets) tasks.push({ mode: m, target: t });

    setBusy(true);
    setProgress({ total: tasks.length, done: 0, current: `${tasks[0].mode} · ${tasks[0].target.name}` });
    const t0 = performance.now();
    try {
      for (let i = 0; i < tasks.length; i++) {
        const { mode, target } = tasks[i];
        setProgress({ total: tasks.length, done: i, current: `${MODE_META[mode].title} · ${target.name}` });
        const res = await fetch(`/api/psd/${psdId}/resize`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode, targets: [target], nudge: nudge || undefined }),
        });
        if (!res.ok) throw await describeFetchError(res);
      }
      setProgress({ total: tasks.length, done: tasks.length });
      const dt = ((performance.now() - t0) / 1000).toFixed(1);
      toast.success(`${tasks.length} render${tasks.length > 1 ? "s" : ""} in ${dt}s`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(null), 1500);
    }
  }

  const totalTasks = modes.size * (selectedSizes.size + (customW && customH ? 1 : 0));

  return (
    <div className="space-y-6">
      {/* Control panel */}
      <Card>
        <CardContent className="space-y-5">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Generate</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Pick mode(s) × size(s). Each combination becomes one render in the comparison below.
              </p>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">
              {modes.size}·mode {selectedSizes.size + (customW && customH ? 1 : 0)}·size
            </span>
          </div>
          {/* Mode multi-select */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Modes</label>
              <span className="text-[10px] text-muted-foreground">{modes.size} selected</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {MODE_ORDER.map((m) => {
                const active = modes.has(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMode(m)}
                    className={`text-left rounded-md border px-3 py-2.5 transition-colors ${active ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white hover:border-zinc-400"}`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="font-medium text-sm">{MODE_META[m].title}</div>
                      <div className={`text-[10px] font-mono ${active ? "text-zinc-300" : "text-muted-foreground"}`}>{MODE_META[m].cost}</div>
                    </div>
                    <div className={`text-[10px] mt-0.5 ${active ? "text-zinc-300" : "text-muted-foreground"}`}>
                      {MODE_META[m].tag} · {MODE_META[m].speed}
                    </div>
                  </button>
                );
              })}
            </div>
            {modes.size === 1 && (
              <p className="text-[11px] text-muted-foreground leading-snug pt-0.5">
                {MODE_META[[...modes][0]].long}
              </p>
            )}
            {modes.size > 1 && (
              <p className="text-[11px] text-muted-foreground leading-snug pt-0.5">
                Comparing {modes.size} modes — each size will render once per mode for side-by-side review.
              </p>
            )}
          </div>

          {/* Sizes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Target sizes</label>
              <span className="text-[10px] text-muted-foreground">
                {selectedSizes.size + (customW && customH ? 1 : 0)} selected
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.name} onClick={() => toggleSize(p.name)} type="button" className="cursor-pointer">
                  <Badge variant={selectedSizes.has(p.name) ? "default" : "outline"} className="px-2.5 py-1 text-xs font-mono">
                    {p.name}
                  </Badge>
                </button>
              ))}
            </div>
            <div className="flex gap-2 items-center pt-1">
              <Input type="number" placeholder="W" value={customW} onChange={(e) => setCustomW(e.target.value)} className="w-20 h-8 font-mono text-xs" />
              <span className="text-muted-foreground text-xs">×</span>
              <Input type="number" placeholder="H" value={customH} onChange={(e) => setCustomH(e.target.value)} className="w-20 h-8 font-mono text-xs" />
              <span className="text-[10px] text-muted-foreground">custom</span>
            </div>
          </div>

          {/* Task brief (Level 1) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                Task brief <span className="text-zinc-400 normal-case">· Level 1 · this render only</span>
              </label>
              <span className="text-[10px] text-muted-foreground">+ Project notes (L2) + Brand context (L3)</span>
            </div>
            <Textarea
              placeholder='e.g. "headline on top, product centered, hide decorations"'
              value={nudge} onChange={(e) => setNudge(e.target.value)}
              rows={2} className="text-xs leading-relaxed"
            />
            <p className="text-[10px] text-muted-foreground">
              Highest-priority context. Layered on top of project notes and brand context. Passed to AI modes only.
            </p>
          </div>

          {/* Action */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="text-[11px] text-muted-foreground">
              {progress
                ? <>Generating <span className="font-medium text-foreground">{progress.current}</span> · {progress.done}/{progress.total}</>
                : <>{totalTasks > 0 ? `${totalTasks} render${totalTasks > 1 ? "s" : ""} queued` : "Pick at least one mode and one size"}</>}
            </div>
            <Button onClick={run} disabled={busy || totalTasks === 0} size="default">
              {busy ? "Generating…" : totalTasks > 1 ? `Generate ${totalTasks}` : "Generate"}
            </Button>
          </div>
          {progress && <Progress value={(progress.done / progress.total) * 100} className="h-1" />}
        </CardContent>
      </Card>

      {/* Comparison gallery */}
      <ComparisonGallery psdId={psdId} groups={groupedBySize} />
    </div>
  );
}

interface SizeSlot {
  w: number;
  h: number;
  presetName: string | null;
  renders: Map<string, RenderRow>;
}

function ComparisonGallery({ psdId, groups }: { psdId: string; psdHash?: string; groups: SizeSlot[] }) {
  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center space-y-1">
          <div className="text-sm text-muted-foreground">No renders yet.</div>
          <div className="text-xs text-muted-foreground">Pick modes + sizes above and hit Generate.</div>
        </CardContent>
      </Card>
    );
  }
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Comparison · by size</h2>
        <span className="text-[10px] text-muted-foreground">Drag any preview corner to see how it reflows.</span>
      </div>
      <div className="space-y-5">
        {groups.map((slot) => (
          <SizeRow key={`${slot.w}x${slot.h}`} psdId={psdId} slot={slot} />
        ))}
      </div>
    </section>
  );
}

type ZoomMode = "fit" | "0.25" | "0.5" | "1";

function SizeRow({ psdId, slot }: { psdId: string; slot: SizeSlot }) {
  const label = slot.presetName ?? `${slot.w}×${slot.h}`;
  const modesPresent = MODE_ORDER.filter((m) => slot.renders.has(m));
  const [zoom, setZoom] = useState<ZoomMode>("fit");

  // Fit-mode: pick the largest cell that fits the practical column box.
  // Numbers chosen so 3-up at md+ stays clean in the studio's right pane.
  const ratio = slot.w / slot.h;
  const MAX_CELL_W = 320;
  const MAX_CELL_H = 520;
  let fitW = MAX_CELL_W, fitH = fitW / ratio;
  if (fitH > MAX_CELL_H) { fitH = MAX_CELL_H; fitW = fitH * ratio; }
  const FIT_DISPLAY_HEIGHT = Math.round(fitH);

  const scale =
    zoom === "fit" ? undefined
      : zoom === "1" ? 1
      : zoom === "0.5" ? 0.5
      : 0.25;
  const displayHeight = zoom === "fit" ? FIT_DISPLAY_HEIGHT : undefined;

  return (
    <Card>
      <CardContent className="space-y-3">
        <header className="flex items-center justify-between border-b border-zinc-100 pb-2 gap-3 flex-wrap">
          <div className="flex items-baseline gap-3">
            <h3 className="font-semibold text-sm tracking-tight">{label}</h3>
            <span className="text-[10px] font-mono text-muted-foreground">{slot.w}×{slot.h}</span>
            <span className="text-[10px] text-muted-foreground">{modesPresent.length} mode{modesPresent.length > 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-muted-foreground uppercase tracking-wider">zoom</span>
            <ZoomToggle value={zoom} onChange={setZoom} />
          </div>
        </header>
        <div
          className={`grid gap-4 ${
            modesPresent.length === 1 ? "grid-cols-1"
              : modesPresent.length === 2 ? "grid-cols-1 sm:grid-cols-2"
              : modesPresent.length === 3 ? "grid-cols-1 md:grid-cols-3"
              : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
          }`}
        >
          {modesPresent.map((m) => (
            <RenderCell
              key={m}
              psdId={psdId}
              mode={m}
              render={slot.renders.get(m)!}
              displayHeight={displayHeight}
              scale={scale}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ZoomToggle({ value, onChange }: { value: ZoomMode; onChange: (z: ZoomMode) => void }) {
  const opts: { v: ZoomMode; label: string }[] = [
    { v: "fit", label: "fit" },
    { v: "0.25", label: "25%" },
    { v: "0.5", label: "50%" },
    { v: "1", label: "100%" },
  ];
  return (
    <div className="inline-flex rounded-md ring-1 ring-zinc-200 overflow-hidden">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`px-2 py-1 text-[10px] font-mono transition-colors ${
            value === o.v ? "bg-zinc-900 text-white" : "bg-white text-muted-foreground hover:bg-zinc-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RenderCell({
  psdId, mode, render, displayHeight, scale,
}: {
  psdId: string; mode: Mode; render: RenderRow;
  displayHeight?: number; scale?: number;
}) {
  const score = render.score ?? 0;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className={`size-1.5 rounded-full ${
            render.status === "passed" ? "bg-emerald-500" :
            render.status === "flagged" ? "bg-amber-500" :
            render.status === "failed" ? "bg-red-500" : "bg-zinc-400"
          }`} />
          <span className="font-medium tracking-tight">{MODE_META[mode].title}</span>
        </div>
        <span className="text-muted-foreground font-mono">{render.latencyMs != null ? `${(render.latencyMs / 1000).toFixed(1)}s` : ""}</span>
      </div>
      <div className="relative bg-[radial-gradient(circle_at_1px_1px,_#e4e4e7_1px,_transparent_0)] [background-size:12px_12px] rounded-md ring-1 ring-zinc-200 p-2 overflow-auto max-h-[640px]">
        <div className="flex items-start justify-center min-h-full">
          <ResponsivePreview
            psdId={psdId}
            targetW={render.targetW}
            targetH={render.targetH}
            mode={render.mode}
            displayHeight={displayHeight}
            scale={scale}
            bare
          />
        </div>
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
        <span>{render.targetW}×{render.targetH}</span>
        <span>{scale != null ? `${(scale * 100).toFixed(0)}%` : `fit · h:${displayHeight}px`}</span>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="uppercase tracking-wider">score</span>
          <span className="font-mono">{score.toFixed(2)}</span>
        </div>
        <div className="h-1 rounded-full bg-zinc-100 overflow-hidden">
          <div
            className={`h-full transition-all ${score >= 0.7 ? "bg-emerald-500" : score >= 0.5 ? "bg-amber-500" : "bg-red-500"}`}
            style={{ width: `${Math.max(2, score * 100)}%` }}
          />
        </div>
      </div>
      {render.reasoning && (
        <Tooltip>
          <TooltipTrigger>
            <p className="text-[10px] text-muted-foreground line-clamp-2 leading-snug cursor-help text-left">{render.reasoning}</p>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">{render.reasoning}</TooltipContent>
        </Tooltip>
      )}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
        <a href={`/api/render/${psdId}/${render.mode}_${render.targetW}x${render.targetH}.html`} target="_blank" className="underline hover:text-foreground" rel="noreferrer">
          open html
        </a>
        <a href={`/api/render/${psdId}/${render.mode}_${render.targetW}x${render.targetH}.png`} download className="underline hover:text-foreground">
          .png
        </a>
      </div>
    </div>
  );
}
