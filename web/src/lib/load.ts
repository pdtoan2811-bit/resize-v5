import { readFile } from "node:fs/promises";
import path from "node:path";
import { psdDir } from "./storage";
import type { ParsedPsd, SemanticResult } from "./types";

export async function loadParsed(hash: string): Promise<ParsedPsd> {
  const buf = await readFile(path.join(psdDir(hash), "parsed.json"), "utf8");
  return JSON.parse(buf) as ParsedPsd;
}

export async function loadSemantic(hash: string): Promise<SemanticResult> {
  try {
    const buf = await readFile(path.join(psdDir(hash), "semantic.json"), "utf8");
    return JSON.parse(buf) as SemanticResult;
  } catch {
    // Pre-grouping (Step 1 not yet run). Return an empty result so downstream
    // code doesn't crash; callers should check `groups.length` if they need
    // actual semantic data.
    return { groups: [], unassigned: [], notes: "no semantic pass yet" };
  }
}
