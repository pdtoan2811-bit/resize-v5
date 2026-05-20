/**
 * Turn a non-OK fetch Response into a useful Error.
 * Reads the body as JSON ({error: string}) when possible, falls back to text,
 * and as a last resort uses the HTTP status line so we never throw `new Error("")`.
 */
export async function describeFetchError(res: Response): Promise<Error> {
  let detail = "";
  try {
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("json")) {
      const j = (await res.json()) as Record<string, unknown>;
      detail = String(j.error ?? j.message ?? "");
    } else {
      detail = await res.text();
    }
  } catch {
    // give up; status will carry the meaning
  }
  const fallback = `Request failed (${res.status}${res.statusText ? " " + res.statusText : ""})`;
  return new Error(detail || fallback);
}
