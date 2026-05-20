import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Studio } from "@/components/studio";
import { ResponsivePreview } from "@/components/responsive-preview";
import { ProjectNotes } from "@/components/project-notes";
import { ReSemanticButton } from "@/components/re-semantic-button";
import { EngineChoice } from "@/components/engine-choice";
import { ContextBar } from "@/components/context-bar";

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

  return (
    <div className="min-h-screen bg-zinc-50">
      <main className="mx-auto max-w-7xl px-6 py-8 space-y-7">
        {/* Header */}
        <header className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <Link href="/" className="hover:text-foreground transition-colors">All PSDs</Link>
              <span>/</span>
              <span className="font-mono">{psd.hash.slice(0, 8)}</span>
            </div>
            <Link href="/settings" className="hover:text-foreground transition-colors underline-offset-2 hover:underline">Brand context →</Link>
          </div>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight truncate">{psd.filename}</h1>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] font-mono">{psd.width}×{psd.height}</Badge>
              <Badge variant="outline" className="text-[10px]">{psd._count.layers} layers</Badge>
              <Badge variant="secondary" className="text-[10px]">{psd.groups.length} groups</Badge>
            </div>
          </div>
        </header>

        <ContextBar flags={ctxFlags} />

        <EngineChoice
          psdId={psd.id}
          current={(psd.sourceEngine === "ai" ? "ai" : "algorithm") as "algorithm" | "ai"}
          reasoning={psd.sourceAiReason ?? null}
          hasRewriteRenders={psd.renders.some((r) => r.mode === "rewrite")}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Sidebar */}
          <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                  Source · live preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsivePreview
                  psdId={psd.id}
                  targetW={psd.width}
                  targetH={psd.height}
                  label="Original"
                  status="passed"
                  srcUrl={`/api/psd/${psd.id}/source.html`}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground flex items-center justify-between">
                  <span>Project notes <span className="text-zinc-400">· Level 2</span></span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ProjectNotes psdId={psd.id} initial={psd.iterationNotes ?? ""} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground flex items-center justify-between gap-2">
                  <span>Semantic groups</span>
                  <ReSemanticButton psdId={psd.id} renderCount={psd.renders.length} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64 pr-2">
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
                            {layerIds.length} layer{layerIds.length > 1 ? "s" : ""} · {layerIds.join(" + ")}
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
                </ScrollArea>
              </CardContent>
            </Card>
          </aside>

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
      </main>
    </div>
  );
}
