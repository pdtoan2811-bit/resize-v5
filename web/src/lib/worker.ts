import type { ParsedPsd } from "./types";

const WORKER_URL = process.env.PSD_WORKER_URL ?? "http://127.0.0.1:8787";

export async function parsePsdViaWorker(file: Buffer, filename: string, outDir: string): Promise<ParsedPsd> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(file)]), filename);
  form.append("out_dir", outDir);
  const res = await fetch(`${WORKER_URL}/parse`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`worker /parse failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as ParsedPsd;
}
