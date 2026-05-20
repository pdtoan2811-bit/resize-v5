import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { DeletePsdButton } from "@/components/delete-psd-button";
import { InspectContext } from "@/components/inspect-context";
import { Stepper } from "@/components/wizard/stepper";
import { StepPrep } from "@/components/wizard/step-prep";
import { StepGroups } from "@/components/wizard/step-groups";
import { StepSource } from "@/components/wizard/step-source";
import { StepResize } from "@/components/wizard/step-resize";
import { defaultStep, canEnter, STEPS, type Step } from "@/lib/wizard";

export default async function PsdPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { id } = await params;
  const { step: stepParam } = await searchParams;

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

  const wizState = { groupsCount: psd.groups.length, rendersCount: psd.renders.length };
  const requestedStep = (STEPS as readonly string[]).includes(stepParam ?? "")
    ? (stepParam as Step)
    : null;
  const step: Step =
    requestedStep && canEnter(requestedStep, wizState)
      ? requestedStep
      : defaultStep(wizState);

  return (
    <div className="min-h-screen bg-zinc-50">
      <main className="mx-auto max-w-7xl px-6 py-7 space-y-5">
        {/* Toolbar */}
        <header className="space-y-2">
          <div className="flex items-center justify-between gap-4 text-[11px] text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">← All PSDs</Link>
            <div className="flex items-center gap-4">
              <Link href="/settings" className="hover:text-foreground transition-colors" title="Brand context">
                Context · <span className="font-mono">{ctxOnCount}/5</span>
              </Link>
              <InspectContext psdId={psd.id} />
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

        {/* Step indicator */}
        <Stepper psdId={psd.id} current={step} state={wizState} />

        {/* Step body */}
        {step === "prep" && (
          <StepPrep
            psdId={psd.id}
            psdHash={psd.hash}
            filename={psd.filename}
            width={psd.width}
            height={psd.height}
            layerCount={psd._count.layers}
            iterationNotes={psd.iterationNotes ?? ""}
            ctxFlags={ctxFlags}
          />
        )}

        {step === "groups" && (
          <StepGroups
            psdId={psd.id}
            psdHash={psd.hash}
            groups={psd.groups.map((g) => ({
              id: g.id, gid: g.gid, label: g.label, role: g.role,
              importance: g.importance, layerIds: g.layerIds, rationale: g.rationale,
            }))}
            renderCount={psd.renders.length}
          />
        )}

        {step === "source" && (
          <StepSource
            psdId={psd.id}
            psdHash={psd.hash}
            width={psd.width}
            height={psd.height}
            current={(psd.sourceEngine === "ai" ? "ai" : "algorithm") as "algorithm" | "ai"}
            reasoning={psd.sourceAiReason ?? null}
            rewriteRenderCount={psd.renders.filter((r) => r.mode === "rewrite").length}
          />
        )}

        {step === "resize" && (
          <StepResize
            psdId={psd.id}
            psdHash={psd.hash}
            initialRenders={psd.renders.map((r) => ({
              id: r.id, mode: r.mode, targetW: r.targetW, targetH: r.targetH,
              presetName: r.presetName, status: r.status, score: r.score,
              reasoning: r.reasoning, latencyMs: r.latencyMs,
            }))}
          />
        )}
      </main>
    </div>
  );
}
