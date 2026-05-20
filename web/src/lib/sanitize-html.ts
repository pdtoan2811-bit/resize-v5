/**
 * Conservative HTML sanitizer for AI-rewritten layouts.
 *
 * Allows the AI broad CSS/HTML freedom but blocks anything that could phone home
 * or execute code: scripts, event handlers, external resources, javascript: URLs.
 */

const ASSET_PATTERN = /^\/api\/asset\/[a-f0-9]{64}\/l\d+\.png$/;

export interface SanitizeResult {
  html: string;
  warnings: string[];
}

export function sanitizeRewrittenHtml(input: string, allowedLids: ReadonlySet<string>): SanitizeResult {
  const warnings: string[] = [];
  let html = input;

  // Strip <script> blocks and external <link>/<meta http-equiv>.
  html = html.replace(/<script\b[\s\S]*?<\/script>/gi, () => {
    warnings.push("stripped <script>");
    return "";
  });
  html = html.replace(/<script\b[^>]*\/?>/gi, () => {
    warnings.push("stripped self-closing <script>");
    return "";
  });
  html = html.replace(/<link\b[^>]*>/gi, (m) => {
    if (/rel\s*=\s*["']?(stylesheet|preload|preconnect|dns-prefetch)/i.test(m)) {
      warnings.push("stripped external <link>");
      return "";
    }
    return m;
  });
  html = html.replace(/<meta\b[^>]*http-equiv[^>]*>/gi, () => {
    warnings.push("stripped <meta http-equiv>");
    return "";
  });
  html = html.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, () => {
    warnings.push("stripped <iframe>");
    return "";
  });

  // Strip inline event handlers: on*="..."
  html = html.replace(/\s on[a-z]+\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+)/gi, () => {
    warnings.push("stripped on* handler");
    return "";
  });

  // Strip javascript: URLs in href/src.
  html = html.replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, () => {
    warnings.push("stripped javascript: URL");
    return "";
  });

  // For <img>, validate src against asset pattern.
  html = html.replace(/<img\b([^>]*)>/gi, (_full, attrs: string) => {
    const srcMatch = /\bsrc\s*=\s*("([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(attrs);
    const src = srcMatch ? (srcMatch[2] ?? srcMatch[3] ?? srcMatch[4]) : "";
    if (!src) return "";
    if (!ASSET_PATTERN.test(src)) {
      warnings.push(`stripped <img> with invalid src: ${src.slice(0, 64)}`);
      return "";
    }
    // Ensure the referenced layer exists in our inventory.
    const lidMatch = /\/(l\d+)\.png$/.exec(src);
    if (!lidMatch || !allowedLids.has(lidMatch[1])) {
      warnings.push(`stripped <img> referencing unknown layer: ${src}`);
      return "";
    }
    return `<img${attrs}>`;
  });

  // Block url(...) pointing outside /api/asset/.
  html = html.replace(/url\(\s*("([^"]+)"|'([^']+)'|([^)\s]+))\s*\)/gi, (m, _q, a, b, c) => {
    const u = (a ?? b ?? c) as string;
    if (u.startsWith("data:") || u.startsWith("/api/asset/")) return m;
    warnings.push(`stripped url() pointing outside: ${u.slice(0, 64)}`);
    return "url(none)";
  });

  return { html, warnings };
}
