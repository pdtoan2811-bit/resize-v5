import Link from "next/link";
import { prisma } from "@/lib/db";
import { ContextSettings } from "@/components/context-settings";

export default async function SettingsPage() {
  const org = await prisma.organization.findUnique({ where: { id: "default" } });
  const initial = {
    brandName: org?.brandName ?? "",
    voice: org?.voice ?? "",
    audience: org?.audience ?? "",
    doRules: org?.doRules ?? "",
    dontRules: org?.dontRules ?? "",
    freeform: org?.freeform ?? "",
    groupingContext: org?.groupingContext ?? "",
    sourceEngineContext: org?.sourceEngineContext ?? "",
    resizeContext: org?.resizeContext ?? "",
    verifyContext: org?.verifyContext ?? "",
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <main className="mx-auto max-w-4xl px-6 py-10 space-y-7">
        <header className="space-y-1">
          <div className="text-[11px] text-muted-foreground">
            <Link href="/" className="hover:text-foreground">All PSDs</Link>
            <span> / </span>
            <span>Brand context</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Brand context</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Level&nbsp;3 of the context stack. Brand identity is injected into every AI prompt;
            each <em>stage</em> tab adds context that only goes to that stage&apos;s prompts —
            keeps each call focused without bloating every prompt.
          </p>
        </header>

        <ContextSettings initial={initial} />
      </main>
    </div>
  );
}
