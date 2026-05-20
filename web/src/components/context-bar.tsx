import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

const STAGES: { key: keyof Flags; label: string; tab: string; affects: string }[] = [
  { key: "brand", label: "Brand identity", tab: "brand", affects: "every AI call" },
  { key: "grouping", label: "Grouping", tab: "grouping", affects: "semantic pass" },
  { key: "sourceEngine", label: "HTML engine", tab: "sourceEngine", affects: "AI source HTML" },
  { key: "resize", label: "Resize", tab: "resize", affects: "AI resize" },
  { key: "verify", label: "Verify", tab: "verify", affects: "critique" },
];

interface Flags {
  brand: boolean;
  grouping: boolean;
  sourceEngine: boolean;
  resize: boolean;
  verify: boolean;
}

export function ContextBar({ flags }: { flags: Flags }) {
  return (
    <Card>
      <CardContent className="py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground shrink-0">
            Brand context
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {STAGES.map((s) => {
              const on = flags[s.key];
              return (
                <Link
                  key={s.key}
                  href={`/settings#${s.tab}`}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                    on
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                      : "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200 hover:bg-zinc-200"
                  }`}
                  title={`${s.label} · ${s.affects} · ${on ? "configured" : "empty"}`}
                >
                  <span className={`size-1.5 rounded-full ${on ? "bg-emerald-500" : "bg-zinc-300"}`} />
                  <span>{s.label}</span>
                </Link>
              );
            })}
          </div>
          <Link href="/settings" className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline ml-auto">
            Edit context →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
