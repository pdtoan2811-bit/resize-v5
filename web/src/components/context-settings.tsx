"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Fields {
  brandName: string;
  voice: string;
  audience: string;
  doRules: string;
  dontRules: string;
  freeform: string;
  groupingContext: string;
  sourceEngineContext: string;
  resizeContext: string;
  verifyContext: string;
}

type TabKey = "brand" | "grouping" | "sourceEngine" | "resize" | "verify";

interface TabSpec {
  key: TabKey;
  title: string;
  affects: string;
  blurb: string;
}

const TABS: TabSpec[] = [
  {
    key: "brand",
    title: "Brand identity",
    affects: "every AI call",
    blurb: "Persistent voice / audience / do's / don'ts. Always-on background context.",
  },
  {
    key: "grouping",
    title: "Semantic grouping",
    affects: "the semantic-pass prompt",
    blurb: "How to recognise design units in this brand's PSDs. Naming conventions, repeated patterns, what reads as one composition.",
  },
  {
    key: "sourceEngine",
    title: "AI HTML/CSS engine",
    affects: "the AI source-engine prompt",
    blurb: "How AI should write the source HTML when you switch to the AI engine. Layout primitives, type rules, brand-specific styling.",
  },
  {
    key: "resize",
    title: "Resize",
    affects: "the AI Responsive + AI Rewrite resize prompts",
    blurb: "How groups should move and scale across aspect ratios. Banner-vs-portrait rules, what to hide, what to preserve.",
  },
  {
    key: "verify",
    title: "Verify critique",
    affects: "the vision-critique prompt",
    blurb: "Scoring priorities — what counts as a good ad in your taste. Which rubric matters most.",
  },
];

export function ContextSettings({ initial }: { initial: Fields }) {
  const [v, setV] = useState<Fields>(initial);
  const [savedV, setSavedV] = useState<Fields>(initial);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabKey>("brand");

  const dirty = useMemo(() => JSON.stringify(v) !== JSON.stringify(savedV), [v, savedV]);

  function patch<K extends keyof Fields>(k: K, val: string) {
    setV((s) => ({ ...s, [k]: val }));
  }

  const filled: Record<TabKey, boolean> = {
    brand: !!(v.brandName || v.voice || v.audience || v.doRules || v.dontRules || v.freeform),
    grouping: !!v.groupingContext,
    sourceEngine: !!v.sourceEngineContext,
    resize: !!v.resizeContext,
    verify: !!v.verifyContext,
  };

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
          groupingContext: v.groupingContext.trim() || null,
          sourceEngineContext: v.sourceEngineContext.trim() || null,
          resizeContext: v.resizeContext.trim() || null,
          verifyContext: v.verifyContext.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSavedV(v);
      toast.success("Saved · applied to all future AI calls");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Tabs value={tab} onValueChange={(t) => setTab(t as TabKey)}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="relative">
              {t.title}
              {filled[t.key] && (
                <span className="ml-1.5 size-1.5 rounded-full bg-emerald-500" aria-label="filled" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{dirty ? "unsaved" : "saved"}</span>
          <Button onClick={save} disabled={!dirty || saving} size="sm">
            {saving ? "Saving…" : "Save context"}
          </Button>
        </div>
      </div>

      <TabsContent value="brand">
        <Card>
          <CardContent className="space-y-5">
            <StageHeader spec={TABS[0]} />
            <Field label="Brand name">
              <Input value={v.brandName} onChange={(e) => patch("brandName", e.target.value)} placeholder="e.g. GreenSM" />
            </Field>
            <Field label="Tone of voice / persona">
              <Textarea rows={2} value={v.voice} onChange={(e) => patch("voice", e.target.value)} placeholder="Confident, modern, slightly playful. Avoid clichés." />
            </Field>
            <Field label="Target audience">
              <Textarea rows={2} value={v.audience} onChange={(e) => patch("audience", e.target.value)} placeholder="Urban commuters 22–35 in SEA, mobile-first, value pragmatism over hype." />
            </Field>
            <Field label="Do's">
              <Textarea rows={3} value={v.doRules} onChange={(e) => patch("doRules", e.target.value)} placeholder={`- Keep wordmark in the top-left when possible\n- Use brand green for primary CTAs`} />
            </Field>
            <Field label="Don'ts">
              <Textarea rows={3} value={v.dontRules} onChange={(e) => patch("dontRules", e.target.value)} placeholder={`- Don't crop the product subject\n- Don't put the CTA in red`} />
            </Field>
            <Field label="Other notes">
              <Textarea rows={3} value={v.freeform} onChange={(e) => patch("freeform", e.target.value)} placeholder="Anything else the AI should know about the brand." />
            </Field>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="grouping">
        <Card>
          <CardContent className="space-y-5">
            <StageHeader spec={TABS[1]} />
            <Examples items={[
              "Always combine the logo with the green plate behind it as one 'brand mark' group.",
              "Treat any numeric callout (e.g. '50%') and its yellow chip as a single 'promo badge'.",
              "If a layer is named with a numeric suffix like 'shadow 2', group it with the layer directly above.",
              "Decorative confetti and arrows are one 'sparkle' decoration group, not separate.",
            ]} />
            <Field label="Grouping rules" hint="Bullets or sentences. The semantic pass treats these as soft constraints — strong suggestions, not absolutes.">
              <Textarea rows={8} className="font-mono text-xs" value={v.groupingContext} onChange={(e) => patch("groupingContext", e.target.value)} placeholder={`- Combine the wordmark with its background plate.\n- Treat hand-drawn shapes named "blob*" as one decoration group with the nearest element.\n- Sparkle / confetti layers always belong with the focal subject they orbit.`} />
            </Field>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="sourceEngine">
        <Card>
          <CardContent className="space-y-5">
            <StageHeader spec={TABS[2]} />
            <Examples items={[
              "Use flexbox for the headline + subhead stack. CSS grid for product + logo placement.",
              "Always set headline as a <h1> with font-weight 800.",
              "CTAs are pill-shaped (border-radius: 999px), brand-green background.",
              "Use container queries (cqi / cqh) instead of media queries.",
            ]} />
            <Field label="HTML/CSS preferences" hint="Used only when you switch the source engine to AI on a PSD.">
              <Textarea rows={8} className="font-mono text-xs" value={v.sourceEngineContext} onChange={(e) => patch("sourceEngineContext", e.target.value)} placeholder={`- Prefer semantic tags: <header>, <main>, <footer> sections.\n- CTAs use border-radius:999px and brand-green #00C853.\n- Headlines use a strong type stack — Geist, Inter, system-ui.\n- Avoid drop shadows except on the CTA.`} />
            </Field>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="resize">
        <Card>
          <CardContent className="space-y-5">
            <StageHeader spec={TABS[3]} />
            <Examples items={[
              "In 9:16, stack: logo → headline → subject → CTA top-to-bottom with 12% gaps.",
              "In any banner < 200px tall, hide all decorations and shadows.",
              "Preserve logo width within 10% across all sizes.",
              "When aspect ratio flips, regenerate the imagined reference from scratch.",
            ]} />
            <Field label="Resize / re-layout rules" hint="Used by AI Responsive and AI Rewrite modes when generating each target size.">
              <Textarea rows={8} className="font-mono text-xs" value={v.resizeContext} onChange={(e) => patch("resizeContext", e.target.value)} placeholder={`- In thin banners, drop everything except logo + headline + CTA.\n- Preserve product subject height as a % of canvas across all formats.\n- Aggressive layout changes are OK in portrait; banners should stay literal.`} />
            </Field>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="verify">
        <Card>
          <CardContent className="space-y-5">
            <StageHeader spec={TABS[4]} />
            <Examples items={[
              "Legibility of the CTA is the single highest priority — never below 0.8.",
              "Aesthetic score weighted lower; brand fidelity higher.",
              "Penalize compositions that lose the product subject's recognizability.",
            ]} />
            <Field label="Critique priorities" hint="Used by the vision-critique pass when scoring each render.">
              <Textarea rows={8} className="font-mono text-xs" value={v.verifyContext} onChange={(e) => patch("verifyContext", e.target.value)} placeholder={`- Rank rubric importance: legibility > fidelity > hierarchy > balance > aesthetic.\n- Always flag if the CTA is < 4% of canvas min dimension.\n- Penalize layouts where the wordmark loses its breathing room.`} />
            </Field>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function StageHeader({ spec }: { spec: TabSpec }) {
  return (
    <div className="space-y-1 pb-3 border-b border-zinc-100">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">{spec.title}</h2>
        <Badge variant="outline" className="text-[10px] font-mono">affects {spec.affects}</Badge>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{spec.blurb}</p>
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

function Examples({ items }: { items: string[] }) {
  return (
    <details className="text-[11px] text-muted-foreground">
      <summary className="cursor-pointer hover:text-foreground inline-flex items-center gap-1">
        <span className="uppercase tracking-wider font-medium">Examples</span>
        <span>↓</span>
      </summary>
      <ul className="mt-2 space-y-1 pl-3 list-disc list-outside">
        {items.map((s, i) => <li key={i} className="leading-snug">{s}</li>)}
      </ul>
    </details>
  );
}
