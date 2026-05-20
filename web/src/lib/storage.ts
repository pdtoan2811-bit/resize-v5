import path from "node:path";
import { mkdir } from "node:fs/promises";

export const STORAGE_ROOT = process.env.STORAGE_ROOT ?? path.join(process.cwd(), ".cache");

export function psdDir(hash: string) {
  return path.join(STORAGE_ROOT, "psd", hash);
}
export function layersDir(hash: string) {
  return path.join(psdDir(hash), "layers");
}
export function rendersDir(psdId: string) {
  return path.join(STORAGE_ROOT, "renders", psdId);
}
export function imagineDir(hash: string) {
  return path.join(psdDir(hash), "imagine");
}

export async function ensureDir(p: string) {
  await mkdir(p, { recursive: true });
}
