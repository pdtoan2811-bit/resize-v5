"use client";

import { useState, type ReactNode } from "react";

/**
 * Minimal collapsible block. Used for secondary panels on the PSD page so the
 * primary flow (Source → Generate → Compare) reads cleanly without nested
 * cards-within-cards.
 */
export function Disclosure({
  title,
  meta,
  defaultOpen = false,
  children,
}: {
  title: string;
  meta?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-zinc-200/70">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full flex items-center justify-between py-2.5 text-left hover:opacity-80"
      >
        <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
          {title}
        </span>
        <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {meta && <span>{meta}</span>}
          <span className="font-mono">{open ? "−" : "+"}</span>
        </span>
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}
