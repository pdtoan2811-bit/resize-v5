import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { layersDir, psdDir } from "@/lib/storage";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/asset/[hash]/[file]">) {
  const { hash, file } = await ctx.params;
  if (!/^[a-f0-9]{64}$/.test(hash) || /[\/\\]/.test(file)) {
    return new Response("bad request", { status: 400 });
  }
  const base = file === "flattened.png" || file === "source.psd" ? psdDir(hash) : layersDir(hash);
  const full = path.join(base, file);
  try {
    const data = await readFile(full);
    const ext = path.extname(file).toLowerCase();
    const ct = ext === ".png" ? "image/png" : ext === ".psd" ? "image/vnd.adobe.photoshop" : "application/octet-stream";
    return new Response(new Uint8Array(data), { headers: { "content-type": ct, "cache-control": "public, max-age=31536000, immutable" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
