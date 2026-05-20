import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { loadParsed, loadSemantic } from "@/lib/load";
import { emitHtml } from "@/lib/emit";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/psd/[id]/source.html">) {
  const { id } = await ctx.params;
  const psd = await prisma.psd.findUnique({ where: { id } });
  if (!psd) return new Response("not found", { status: 404 });
  const parsed = await loadParsed(psd.hash);
  const semantic = await loadSemantic(psd.hash);
  const { html } = emitHtml({ psd: parsed, semantic, assetBaseUrl: `/api/asset/${psd.hash}` });
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
