import { chromium, type Browser } from "playwright";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { layersDir, psdDir } from "./storage";

let _browser: Browser | null = null;
async function getBrowser(): Promise<Browser> {
  if (_browser) return _browser;
  _browser = await chromium.launch({ headless: true });
  return _browser;
}

export interface RenderArgs {
  html: string;
  width: number;
  height: number;
  outPath: string;
  /** baseUrl like /api/asset/<hash>; we intercept these to read from disk */
  assetBaseUrl: string;
}

export async function renderHtmlToPng({ html, width, height, outPath, assetBaseUrl }: RenderArgs): Promise<void> {
  const browser = await getBrowser();
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  // Intercept asset requests: map /api/asset/<hash>/<file> to local files.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    // Match path that contains the assetBaseUrl
    const idx = url.pathname.indexOf("/api/asset/");
    if (idx >= 0) {
      const rest = url.pathname.slice(idx + "/api/asset/".length);
      const [hash, file] = rest.split("/");
      if (/^[a-f0-9]{64}$/.test(hash) && file && !/[\\]/.test(file)) {
        const base = file === "flattened.png" ? psdDir(hash) : layersDir(hash);
        try {
          const data = await readFile(path.join(base, file));
          const ct = file.endsWith(".png") ? "image/png" : "application/octet-stream";
          await route.fulfill({ status: 200, contentType: ct, body: data });
          return;
        } catch {
          await route.fulfill({ status: 404, body: "not found" });
          return;
        }
      }
    }
    await route.continue();
  });

  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: outPath, type: "png", omitBackground: false, clip: { x: 0, y: 0, width, height } });
  await ctx.close();
}
