import { NextRequest } from "next/server";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureDir, rendersDir } from "@/lib/storage";
import { loadParsed, loadSemantic } from "@/lib/load";
import { getProvider } from "@/lib/ai-provider";
import { applyLayout } from "@/lib/apply-layout";
import { autoLayout } from "@/lib/auto-layout";
import { emitHtml } from "@/lib/emit";
import { verifyTier1 } from "@/lib/verify";
import { renderHtmlToPng } from "@/lib/render";
import type { ReLayoutResult, VerifyTier1Issue } from "@/lib/types";
import { loadLayeredContext, recordCritiqueLearning } from "@/lib/context";

export const maxDuration = 300;

const Body = z.object({
  mode: z.enum(["naive", "auto", "responsive", "rewrite"]).default("auto"),
  targets: z.array(z.object({ w: z.number().int().positive(), h: z.number().int().positive(), name: z.string().optional() })).min(1),
  nudge: z.string().optional(),
});

const MAX_ATTEMPTS = 3;
const PASS_SCORE = 0.7;

function issuesToMustFix(issues: VerifyTier1Issue[]): unknown[] {
  return issues.map((i) => ({ gid: i.gid, kind: i.kind, detail: i.detail }));
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/psd/[id]/resize">) {
  const { id } = await ctx.params;
  const psd = await prisma.psd.findUnique({ where: { id } });
  if (!psd) return Response.json({ error: "psd not found" }, { status: 404 });
  const body = Body.parse(await req.json());

  const parsed = await loadParsed(psd.hash);
  const semantic = await loadSemantic(psd.hash);
  const provider = getProvider();
  const layered = await loadLayeredContext(psd.id, body.nudge);
  const baseUrl = `/api/asset/${psd.hash}`;
  const outDir = rendersDir(psd.id);
  await ensureDir(outDir);

  // Source HTML used by Mode 2 (rewrite) as the starting point. Honors the
  // PSD's selected engine — AI-authored source if available, else algorithm.
  let sourceHtml: string;
  if (psd.sourceEngine === "ai") {
    try {
      const { readFile } = await import("node:fs/promises");
      const { psdDir } = await import("@/lib/storage");
      sourceHtml = await readFile(path.join(psdDir(psd.hash), "source-ai.html"), "utf8");
    } catch {
      sourceHtml = emitHtml({ psd: parsed, semantic, assetBaseUrl: baseUrl }).html;
    }
  } else {
    sourceHtml = emitHtml({ psd: parsed, semantic, assetBaseUrl: baseUrl }).html;
  }

  const results = [];
  for (const t of body.targets) {
    const t0 = Date.now();
    // Naive + Auto modes are AI-free; no imagine ref needed.
    const imagined = body.mode === "auto" || body.mode === "naive"
      ? null
      : await provider.imagineReference(parsed, t.w, t.h);
    const slug = `${body.mode}_${t.w}x${t.h}`;

    type Candidate = {
      html: string;
      pngPath: string | null;
      score: number;
      tier1Issues: VerifyTier1Issue[];
      critiqueSuggestions: string[];
      renderErr: string | null;
      layoutJson: string;
      reasoning: string;
    };
    let best: Candidate | null = null;
    let previousAttempt: { score: number; mustFix: unknown[]; freeAdvice: string[] } | undefined;

    const maxAttempts = body.mode === "auto" || body.mode === "naive" ? 1 : MAX_ATTEMPTS;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let html: string;
      let layoutJson: string;
      let layoutForVerify: ReLayoutResult;
      let reasoning = "";

      if (body.mode === "naive") {
        // Empty groups[] → applyLayout falls back to per-layer proportional rescale.
        const layout: ReLayoutResult = { canvas: { w: t.w, h: t.h }, groups: [], reasoning: "Naive proportional rescale (each layer scaled independently)." };
        ({ html } = applyLayout({ psd: parsed, semantic, layout, assetBaseUrl: baseUrl }));
        layoutJson = JSON.stringify(layout);
        layoutForVerify = layout;
        reasoning = layout.reasoning ?? "";
      } else if (body.mode === "auto") {
        const layout = autoLayout(parsed, semantic, t.w, t.h);
        ({ html } = applyLayout({ psd: parsed, semantic, layout, assetBaseUrl: baseUrl }));
        layoutJson = JSON.stringify(layout);
        layoutForVerify = layout;
        reasoning = layout.reasoning ?? "";
      } else if (body.mode === "responsive") {
        const layout = await provider.reLayout({
          psd: parsed, semantic, targetW: t.w, targetH: t.h,
          imaginedRefPath: imagined?.pngPath, nudge: body.nudge, previousAttempt,
          context: layered,
        });
        ({ html } = applyLayout({ psd: parsed, semantic, layout, assetBaseUrl: baseUrl }));
        layoutJson = JSON.stringify(layout);
        layoutForVerify = layout;
        reasoning = layout.reasoning ?? "";
      } else {
        const rewrite = await provider.rewriteHtml({
          psd: parsed, semantic, sourceHtml, targetW: t.w, targetH: t.h,
          imaginedRefPath: imagined?.pngPath, nudge: body.nudge, previousAttempt,
          context: layered,
        });
        html = rewrite.html;
        reasoning = rewrite.reasoning;
        // Synthesize a minimal layout shape so Tier-1 can run (verify needs canvas dims + groups list).
        layoutForVerify = {
          canvas: { w: t.w, h: t.h },
          groups: semantic.groups.map((g) => ({ gid: g.gid })),
        };
        layoutJson = JSON.stringify({ mode: "rewrite", reasoning });
      }

      const htmlPath = path.join(outDir, `${slug}.html`);
      const pngPath = path.join(outDir, `${slug}.png`);
      await writeFile(htmlPath, html);

      // Tier-1 verify only makes sense for responsive mode (which has rect coords).
      // For rewrite mode, skip Tier-1 and let Tier-2 vision critique judge.
      const tier1 = body.mode === "responsive"
        ? verifyTier1({ psd: parsed, semantic, layout: layoutForVerify })
        : { tier1Pass: true, tier1Issues: [] as VerifyTier1Issue[], pass: true };

      let renderErr: string | null = null;
      try {
        await renderHtmlToPng({ html, width: t.w, height: t.h, outPath: pngPath, assetBaseUrl: baseUrl });
      } catch (e) {
        renderErr = e instanceof Error ? e.message : String(e);
      }

      let score = tier1.tier1Pass ? 0.8 : 0.4;
      let critique: Awaited<ReturnType<typeof provider.verifyCritique>> = null;
      // Naive + Auto modes are AI-free: skip the vision critique. Tier-1 verdict is the score.
      if (!renderErr && tier1.tier1Pass && body.mode !== "auto" && body.mode !== "naive") {
        critique = await provider.verifyCritique({
          renderPngPath: pngPath,
          imaginedRefPath: imagined?.pngPath,
          sourceFlattenedPath: parsed.flattenedPath,
          semantic,
          context: layered,
        });
        if (critique) score = critique.score;
      }

      const candidate: Candidate = {
        html, pngPath: renderErr ? null : pngPath, score,
        tier1Issues: tier1.tier1Issues,
        critiqueSuggestions: critique?.suggestions ?? [],
        renderErr, layoutJson, reasoning,
      };
      if (!best || score > best.score) best = candidate;

      const passed = !renderErr && tier1.tier1Pass && score >= PASS_SCORE;
      if (passed || attempt === maxAttempts) break;

      previousAttempt = {
        score,
        mustFix: [
          ...issuesToMustFix(tier1.tier1Issues),
          ...(critique?.issues ?? []).map((i) => ({ gid: i.gid, kind: i.kind, detail: i.detail })),
        ],
        freeAdvice: critique?.suggestions ?? [],
      };
    }

    if (!best) continue;
    const status = best.renderErr ? "failed" : best.score >= PASS_SCORE ? "passed" : "flagged";

    const render = await prisma.render.upsert({
      where: { psdId_mode_targetW_targetH: { psdId: psd.id, mode: body.mode, targetW: t.w, targetH: t.h } },
      create: {
        psdId: psd.id, mode: body.mode, targetW: t.w, targetH: t.h, presetName: t.name,
        layoutJson: best.layoutJson,
        htmlPath: path.join(outDir, `${slug}.html`),
        pngPath: best.pngPath, status, score: best.score,
        rubricJson: JSON.stringify({ tier1Issues: best.tier1Issues, critiqueSuggestions: best.critiqueSuggestions, renderErr: best.renderErr }),
        reasoning: best.reasoning,
        attempts: MAX_ATTEMPTS,
        latencyMs: Date.now() - t0,
      },
      update: {
        layoutJson: best.layoutJson,
        pngPath: best.pngPath, status, score: best.score,
        rubricJson: JSON.stringify({ tier1Issues: best.tier1Issues, critiqueSuggestions: best.critiqueSuggestions, renderErr: best.renderErr }),
        reasoning: best.reasoning,
        attempts: { increment: 1 },
        latencyMs: Date.now() - t0,
      },
    });
    results.push({ id: render.id, mode: body.mode, targetW: t.w, targetH: t.h, status, score: best.score, issues: best.tier1Issues, suggestions: best.critiqueSuggestions, renderErr: best.renderErr, reasoning: best.reasoning });

    // Roll critique suggestions into Level-2 iteration notes so the next render starts smarter.
    if (best.critiqueSuggestions.length > 0) {
      await recordCritiqueLearning(psd.id, best.critiqueSuggestions);
    }
  }

  return Response.json({ results });
}
