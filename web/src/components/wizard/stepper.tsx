"use client";

import Link from "next/link";
import { STEPS, STEP_META, canEnter, type Step, type PsdStateLike } from "@/lib/wizard";

export function Stepper({
  psdId, current, state,
}: { psdId: string; current: Step; state: PsdStateLike }) {
  return (
    <nav aria-label="Workflow steps" className="border border-zinc-200 rounded-lg bg-white px-3 py-2">
      <ol className="flex items-center gap-1">
        {STEPS.map((s, i) => {
          const meta = STEP_META[s];
          const reachable = canEnter(s, state);
          const isCurrent = s === current;
          const isPast = STEPS.indexOf(current) > i;

          const num = (
            <span
              className={`size-5 rounded-full grid place-items-center text-[10px] font-medium shrink-0 ${
                isCurrent ? "bg-zinc-900 text-white"
                  : isPast ? "bg-emerald-500 text-white"
                  : reachable ? "bg-zinc-200 text-zinc-700"
                  : "bg-zinc-100 text-zinc-400"
              }`}
            >
              {isPast ? "✓" : meta.num}
            </span>
          );

          const label = (
            <span className={`text-sm tracking-tight ${
              isCurrent ? "font-semibold text-foreground"
                : reachable ? "text-foreground"
                : "text-zinc-400"
            }`}>{meta.title}</span>
          );

          const item = (
            <span className="flex items-center gap-2 px-2 py-1 rounded">
              {num}
              {label}
            </span>
          );

          return (
            <li key={s} className="flex items-center">
              {reachable ? (
                <Link
                  href={`/psd/${psdId}?step=${s}`}
                  scroll={false}
                  className={`block ${isCurrent ? "" : "hover:bg-zinc-50 rounded"}`}
                  prefetch={false}
                >
                  {item}
                </Link>
              ) : (
                <span className="block cursor-not-allowed opacity-60" title="Complete earlier steps first">{item}</span>
              )}
              {i < STEPS.length - 1 && (
                <span aria-hidden className={`mx-1 h-px w-6 ${isPast ? "bg-emerald-300" : "bg-zinc-200"}`} />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
