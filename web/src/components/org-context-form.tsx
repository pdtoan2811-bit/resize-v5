"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface OrgFields {
  brandName: string;
  voice: string;
  audience: string;
  doRules: string;
  dontRules: string;
  freeform: string;
}

export function OrgContextForm({ initial }: { initial: OrgFields }) {
  const [v, setV] = useState<OrgFields>(initial);
  const [saving, setSaving] = useState(false);

  function patch<K extends keyof OrgFields>(k: K, val: string) {
    setV((s) => ({ ...s, [k]: val }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/org-context", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brandName: v.brandName.trim() || null,
          voice: v.voice.trim() || null,
          audience: v.audience.trim() || null,
          doRules: v.doRules.trim() || null,
          dontRules: v.dontRules.trim() || null,
          freeform: v.freeform.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Saved · applied to all future renders");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Field label="Brand name" hint="Used as a reference identifier.">
        <Input value={v.brandName} onChange={(e) => patch("brandName", e.target.value)} placeholder="e.g. Acme Co." />
      </Field>
      <Field label="Tone of voice / persona" hint="How should the design feel? Bold, calm, premium, playful, technical…">
        <Textarea rows={2} value={v.voice} onChange={(e) => patch("voice", e.target.value)} placeholder="e.g. Confident, modern, slightly playful. Avoid clichés." />
      </Field>
      <Field label="Target audience" hint="Who is the layout speaking to?">
        <Textarea rows={2} value={v.audience} onChange={(e) => patch("audience", e.target.value)} placeholder="e.g. Urban commuters 22–35 in SEA, mobile-first, value pragmatism over hype." />
      </Field>
      <Field label="Do's" hint="Things to always include or aim for. Markdown bullets welcome.">
        <Textarea rows={3} value={v.doRules} onChange={(e) => patch("doRules", e.target.value)} placeholder={`- Keep the wordmark in the top-left when possible\n- Use the brand's green for primary CTAs\n- Maintain at least 24px breathing room around the logo`} />
      </Field>
      <Field label="Don'ts" hint="Things to never do.">
        <Textarea rows={3} value={v.dontRules} onChange={(e) => patch("dontRules", e.target.value)} placeholder={`- Don't crop the product subject\n- Don't put the CTA in red\n- Don't stretch the wordmark`} />
      </Field>
      <Field label="Other notes" hint="Anything else you want the AI to know.">
        <Textarea rows={3} value={v.freeform} onChange={(e) => patch("freeform", e.target.value)} placeholder="Free-form brand context, ongoing campaign details, etc." />
      </Field>
      <div className="flex justify-end pt-2 border-t border-zinc-100">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save context"}</Button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground leading-snug">{hint}</p>}
    </div>
  );
}
