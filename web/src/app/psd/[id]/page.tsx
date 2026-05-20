import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Studio } from "@/components/studio";
import { ResponsivePreview } from "@/components/responsive-preview";
import { ProjectNotes } from "@/components/project-notes";
import { ReSemanticButton } from "@/components/re-semantic-button";
import { InlineEngine } from "@/components/inline-engine";
import { DeletePsdButton } from "@/components/delete-psd-button";
import { Disclosure } from "@/components/disclosure";

export default async function PsdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const psd = await prisma.psd.findUnique({
    where: { id },
    include: {
      groups: true,
      renders: { orderBy: [{ targetW: "asc" }, { targetH: "asc" }] },
      _count: { select: { layers: true } },
    },
  });
  if (!psd) notFound();

  const org = await prisma.organization.findUnique({ where: { id: "default" } });
  const ctxFlags = {
    brand: !!(org?.brandName || org?.voice || org?.audience || org?.doRules || org?.dontRules || org?.freeform),
    grouping: !!org?.groupingContext,
    sourceEngine: !!org?.sourceEngineContext,
    resize: !!org?.resizeContext,
    verify: !!org?.verifyContext,
  };
  const ctxOnCount = Object.values(ctxFlags).filter(Boolean).length;
  const rewriteRenderCount = psd.renders.filter((r) => r.mode === "rewrite").length;

  return (
    <div className="min-h-screen bg-zinc-50">
      <main className="mx-auto max-w-7xl px-6 py-7 space-y-6">
        {/* ── Toolbar ────────────────────────────────────────────── */}
        <header className="space-y-2">
          <div className="flex items-center justify-between gap-4 text-[11px] text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">← All PSDs</Link>
            <div className="flex items-center gap-4">
              <Link
                href="/settings"
                className="hover:text-foreground transition-colors"
                title="Brand context"
              >
                Context · <span className="font-mono">{ctxOnCount}/5</span>
              </Link>
              <DeletePsdButton psdId={psd.id} filename={psd.filename} renderCount={psd.renders.length} />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight truncate">{psd.filename}</h1>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] font-mono">{psd.width}×{psd.height}</Badge>
              <Badge variant="outline" className="text-[10px]">{psd._count.layers} layers · {psd.groups.length} groups</Badge>
              <Badge variant="secondary" className="text-[10px] font-mono">{psd.hash.slice(0, 8)}</Badge>
            </div>
          </div>
        </header>

        {/* ── Workspace: SOURCE | GENERATE ───────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">
          {/* SOURCE column */}
          <aside className="space-y-3 lg:sticky lg:top-6">
            <Card>
              <CardContent className="space-y-3">
                <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                  Source
                </div>
                <ResponsivePreview
                  psdId={psd.id}
                  targetW={psd.width}
                  targetH={psd.height}
                  label=""
                  status="passed"
                  srcUrl={`/api/psd/${psd.id}/source.html`}
                />
                <InlineEngine
                  psdId={psd.id}
                  current={(psd.sourceEngine === "ai" ? "ai" : "algorithm") as "algorithm" | "ai"}
                  reasoning={psd.sourceAiReason ?? null}
                  hasRewriteRenders={rewriteRenderCount > 0}
                />

                <Disclosure
                  title="Semantic groups"
                  meta={`${psd.groups.length} groups`}
                  defaultOpen={false}
                >
                  <div className="flex items-center justify-end pb-2">
                    <ReSemanticButton psdId={psd.id} renderCount={psd.renders.length} />
                  </div>
                  <ul className="space-y-1">
                    {psd.groups.map((g) => {
                      const layerIds = JSON.parse(g.layerIds) as string[];
                      return (
                        <li key={g.id} className="py-1.5 border-b border-zinc-100 last:border-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium truncate">{g.label}</span>
                            <span className="flex items-center gap-1 shrink-0">
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0">{g.role}</Badge>
                              <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{g.importance}</Badge>
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                            {layerIds.join(" + ")}
                          </div>
                          {g.rationale && (
                            <div className="text-[10px] text-muted-foreground italic mt-0.5 line-clamp-2 leading-snug">
                              {g.rationale}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Disclosure>

                <Disclosure
                  title="Project notes"
                  meta={psd.iterationNotes ? "set" : "empty"}
                  defaultOpen={false}
                >
                  <ProjectNotes psdId={psd.id} initial={psd.iterationNotes ?? ""} />
                </Disclosure>
              </CardContent>
            </Card>
          </aside>

          {/* GENERATE column */}
          <div className="space-y-6">
            <Studio
              psdId={psd.id}
              psdHash={psd.hash}
              initialRenders={psd.renders.map((r) => ({
                id: r.id,
                mode: r.mode,
                targetW: r.targetW,
                targetH: r.targetH,
                presetName: r.presetName,
                status: r.status,
                score: r.score,
                reasoning: r.reasoning,
                latencyMs: r.latencyMs,
              }))}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
