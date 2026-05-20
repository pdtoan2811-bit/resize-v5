"use client";

import { describeFetchError } from "@/lib/fetch-error";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface GroupRow {
  id: string;
  gid: string;
  label: string;
  role: string;
  importance: string;
  layerIds: string;
  rationale: string | null;
}

interface Props {
  psdId: string;
  psdHash: string;
  groups: GroupRow[];
  renderCount: number;
}

export function StepGroups({ psdId, psdHash, groups, renderCount }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function reRun() {
    if (renderCount > 0 && !confirm(`Re-running will wipe ${renderCount} existing render${renderCount === 1 ? "" : "s"}. Continue?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/psd/${psdId}/resemantic`, { method: "POST" });
      if (!res.ok) throw await describeFetchError(res);
      const data = await res.json();
      toast.success(`Re-grouped · ${data.groupsCount} units`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
      {/* Left: groups list, with rationale */}
      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Semantic groups</div>
              <h2 className="text-sm font-semibold tracking-tight mt-0.5">{groups.length} units</h2>
            </div>
            <span className="text-[10px] text-muted-foreground">Layers combined into design units</span>
          </div>

          <ul className="divide-y divide-zinc-100 -mx-1">
            {groups.map((g) => {
              const lids = JSON.parse(g.layerIds) as string[];
              return (
                <li key={g.id} className="px-1 py-2 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{g.label}</span>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0">{g.role}</Badge>
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{g.importance}</Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">{lids.join(" + ")}</div>
                    {g.rationale && (
                      <div className="text-[10px] text-muted-foreground italic mt-0.5 leading-snug">{g.rationale}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Right: flattened preview + re-run + continue */}
      <div className="space-y-3 lg:sticky lg:top-6">
        <Card>
          <CardContent className="space-y-3">
            <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Reference</div>
            <div className="rounded-md overflow-hidden ring-1 ring-zinc-200 bg-zinc-50 p-2">
              <img
                src={`/api/asset/${psdHash}/flattened.png`}
                alt=""
                className="max-w-full max-h-[280px] object-contain mx-auto block bg-white shadow-sm"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Tune the grouping</div>
              <p className="text-xs text-muted-foreground">
                Wrong groups? Add or refine your grouping rules in <Link href="/settings#grouping" className="underline">brand context</Link>, then re-run.
              </p>
            </div>
            <Button variant="outline" onClick={reRun} disabled={busy} className="w-full">
              {busy ? "Re-running…" : "Re-run grouping"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Groups look good? Next, pick how the source HTML is authored.
            </p>
            <Link href={`/psd/${psdId}?step=source`} className="block">
              <Button className="w-full">Continue to source HTML →</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
