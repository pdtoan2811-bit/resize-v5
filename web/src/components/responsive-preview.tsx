"use client";

import { useRef, useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";

interface Props {
  psdId: string;
  targetW: number;
  targetH: number;
  label?: string;
  status?: string;
  mode?: string;
  /** Override the iframe URL — used for the Source preview. */
  srcUrl?: string;
  /**
   * Display height in CSS pixels. The iframe is rendered at actual targetW×targetH
   * and CSS-scaled to this height — so what you see is pixel-correct to what ships.
   * If omitted, falls back to a draggable mode.
   */
  displayHeight?: number;
  /**
   * Override the scale factor (1 = native target px). When set, ignores displayHeight.
   */
  scale?: number;
  /** When true, omits the chrome (label/badges/footer) for embedding inside a custom card. */
  bare?: boolean;
}

const statusColor: Record<string, string> = {
  passed: "bg-emerald-500",
  flagged: "bg-amber-500",
  failed: "bg-red-500",
  pending: "bg-zinc-400",
  rendering: "bg-zinc-400",
};

const FIT_MAX_W = 320;
const FIT_MAX_H = 360;
const MIN_SHORT_AXIS = 22;

function fitToBox(ratio: number, maxW: number, maxH: number): { w: number; h: number } {
  let w = maxW; let h = w / ratio;
  if (h > maxH) { h = maxH; w = h * ratio; }
  return { w: Math.round(w), h: Math.round(h) };
}

export function ResponsivePreview({
  psdId, targetW, targetH,
  label, status = "passed", mode = "responsive", srcUrl,
  displayHeight, scale, bare = false,
}: Props) {
  const ratio = targetW / targetH;
  const renderUrl = srcUrl ?? `/api/render/${psdId}/${mode}_${targetW}x${targetH}.html`;

  /**
   * Two modes:
   *   1. Controlled (displayHeight or scale provided): the iframe renders at
   *      targetW×targetH at native pixel resolution and is CSS-scaled down to
   *      the requested display size. Pixel-perfect preview of the final render.
   *   2. Uncontrolled (neither provided): draggable corner, like before.
   */
  const controlled = displayHeight != null || scale != null;

  if (controlled) {
    const effectiveScale =
      scale != null
        ? scale
        : Math.max(0.01, (displayHeight ?? FIT_MAX_H) / targetH);
    const displayW = Math.round(targetW * effectiveScale);
    const displayH = Math.round(targetH * effectiveScale);

    const content = (
      <div
        className="relative bg-white shadow-sm ring-1 ring-zinc-200/60"
        style={{ width: displayW, height: displayH }}
      >
        <iframe
          src={renderUrl}
          sandbox="allow-same-origin"
          loading="lazy"
          title={`${targetW}×${targetH}`}
          style={{
            width: targetW,
            height: targetH,
            border: 0,
            transform: `scale(${effectiveScale})`,
            transformOrigin: "0 0",
            display: "block",
          }}
        />
      </div>
    );

    if (bare) return content;

    return (
      <div className="space-y-1.5">
        {label && (
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium tracking-tight truncate">{label}</span>
            <span className="flex items-center gap-1.5 shrink-0">
              <span className={`size-1.5 rounded-full ${statusColor[status] ?? "bg-zinc-400"}`} />
              <Badge variant="outline" className="text-[10px]">{status}</Badge>
            </span>
          </div>
        )}
        <div className="relative bg-[radial-gradient(circle_at_1px_1px,_#e4e4e7_1px,_transparent_0)] [background-size:12px_12px] rounded-md ring-1 ring-zinc-200 overflow-hidden p-2 flex items-center justify-center">
          {content}
        </div>
        <div className="text-[10px] text-muted-foreground flex items-center justify-between font-mono">
          <span>{targetW}×{targetH}</span>
          <span>{(effectiveScale * 100).toFixed(0)}%</span>
        </div>
      </div>
    );
  }

  // Uncontrolled / draggable mode (used in the sidebar Source card).
  return <DraggablePreview targetW={targetW} targetH={targetH} ratio={ratio} srcUrl={renderUrl} label={label} status={status} />;
}

function DraggablePreview({
  targetW, targetH, ratio, srcUrl, label, status,
}: { targetW: number; targetH: number; ratio: number; srcUrl: string; label?: string; status?: string }) {
  const init = fitToBox(ratio, FIT_MAX_W, FIT_MAX_H);
  const [size, setSize] = useState(init);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  // Reset when ratio changes (different PSD).
  useEffect(() => setSize(fitToBox(ratio, FIT_MAX_W, FIT_MAX_H)), [ratio]);

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: size.w };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });
  }
  function onMove(e: MouseEvent) {
    if (!dragRef.current) return;
    let w = dragRef.current.startW + (e.clientX - dragRef.current.startX);
    const minW = ratio >= 1 ? MIN_SHORT_AXIS * ratio : MIN_SHORT_AXIS;
    if (w < minW) w = minW;
    setSize({ w: Math.round(w), h: Math.round(w / ratio) });
  }
  function onUp() {
    dragRef.current = null;
    window.removeEventListener("mousemove", onMove);
  }

  const scale = size.w / targetW;

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium tracking-tight truncate">{label}</span>
          <span className="flex items-center gap-1.5 shrink-0">
            <span className={`size-1.5 rounded-full ${statusColor[status ?? "passed"] ?? "bg-zinc-400"}`} />
            <Badge variant="outline" className="text-[10px]">{status}</Badge>
          </span>
        </div>
      )}
      <div className="relative bg-[radial-gradient(circle_at_1px_1px,_#e4e4e7_1px,_transparent_0)] [background-size:12px_12px] rounded-md ring-1 ring-zinc-200 overflow-hidden p-3 min-h-[88px] flex items-center justify-center">
        <div className="relative bg-white shadow-sm ring-1 ring-zinc-200/60" style={{ width: size.w, height: size.h }}>
          <iframe
            src={srcUrl}
            sandbox="allow-same-origin"
            loading="lazy"
            title={`${targetW}×${targetH} preview`}
            style={{
              width: targetW, height: targetH, border: 0, display: "block",
              transform: `scale(${scale})`, transformOrigin: "0 0",
            }}
          />
          <button
            onMouseDown={onMouseDown}
            className="absolute -right-1 -bottom-1 size-3 bg-zinc-900 rounded-sm cursor-se-resize hover:bg-zinc-700 ring-2 ring-white shadow-sm"
            aria-label="Resize preview"
            type="button"
          />
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground flex items-center justify-between font-mono">
        <span>{targetW}×{targetH}</span>
        <span>{(scale * 100).toFixed(0)}% · {size.w}×{size.h}</span>
      </div>
    </div>
  );
}
