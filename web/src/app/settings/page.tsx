import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OrgContextForm } from "@/components/org-context-form";

export default async function SettingsPage() {
  const org = await prisma.organization.findUnique({ where: { id: "default" } });
  const initial = {
    brandName: org?.brandName ?? "",
    voice: org?.voice ?? "",
    audience: org?.audience ?? "",
    doRules: org?.doRules ?? "",
    dontRules: org?.dontRules ?? "",
    freeform: org?.freeform ?? "",
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <main className="mx-auto max-w-3xl px-6 py-10 space-y-7">
        <header className="space-y-1">
          <div className="text-[11px] text-muted-foreground">
            <Link href="/" className="hover:text-foreground">All PSDs</Link>
            <span> / </span>
            <span>Settings</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Organization context</h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Level&nbsp;3 of the context stack. These fields are injected into every AI prompt so you don&apos;t need to repeat brand
            guidelines on every render. Override anything per-PSD in &ldquo;Project notes&rdquo;, or per-render in the &ldquo;Task brief&rdquo; field.
          </p>
        </header>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Brand</CardTitle>
            <CardDescription className="text-xs">Reused on every render. Leave any field blank to skip it.</CardDescription>
          </CardHeader>
          <CardContent>
            <OrgContextForm initial={initial} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">How context layers stack</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs leading-relaxed">
            <p>
              <span className="font-medium">Level 3 — Brand context</span> (this page).
              Persistent. Auto-applied to every render across every PSD.
            </p>
            <p>
              <span className="font-medium">Level 2 — Project notes</span> (per PSD).
              On each PSD&apos;s page. Critique suggestions are auto-collected so the next render
              starts smarter. You can edit them freely.
            </p>
            <p>
              <span className="font-medium">Level 1 — Task brief</span> (per render).
              The textarea above the &ldquo;Generate&rdquo; button. Highest priority — overrides Level 2 and 3 when in conflict.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
