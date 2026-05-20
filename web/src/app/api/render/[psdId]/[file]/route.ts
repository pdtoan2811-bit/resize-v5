import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { rendersDir } from "@/lib/storage";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/render/[psdId]/[file]">) {
  const { psdId, file } = await ctx.params;
  if (!/^[a-z0-9_]+$/i.test(psdId) || /[\/\\]/.test(file)) {
    return new Response("bad request", { status: 400 });
  }
  try {
    const data = await readFile(path.join(rendersDir(psdId), file));
    const ext = path.extname(file).toLowerCase();
    const ct = ext === ".png" ? "image/png" : ext === ".html" ? "text/html" : "application/octet-stream";
    return new Response(new Uint8Array(data), { headers: { "content-type": ct } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
