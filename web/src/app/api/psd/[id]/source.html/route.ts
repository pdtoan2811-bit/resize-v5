import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { loadParsed, loadSemantic } from "@/lib/load";
import { emitHtml } from "@/lib/emit";
import { psdDir } from "@/lib/storage";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/psd/[id]/source.html">) {
  const { id } = await ctx.params;
  const psd = await prisma.psd.findUnique({ where: { id } });
  if (!psd) return new Response("not found", { status: 404 });

  if (psd.sourceEngine === "ai") {
    try {
      const html = await readFile(path.join(psdDir(psd.hash), "source-ai.html"), "utf8");
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    } catch {
      // AI version missing — fall through to algorithm so the user isn't blocked.
    }
  }

  const parsed = await loadParsed(psd.hash);
  const semantic = await loadSemantic(psd.hash);
  const { html } = emitHtml({ psd: parsed, semantic, assetBaseUrl: `/api/asset/${psd.hash}` });
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
