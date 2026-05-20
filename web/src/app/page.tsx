import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UploadCard } from "@/components/upload-card";

export default async function Home() {
  const recent = await prisma.psd.findMany({
    orderBy: { createdAt: "desc" },
    take: 12,
    include: { _count: { select: { renders: true, groups: true } } },
  });

  return (
    <div className="min-h-screen bg-zinc-50">
      <main className="mx-auto max-w-5xl px-6 py-10 space-y-10">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Resizer</h1>
            <p className="text-sm text-muted-foreground max-w-lg">
              AI-first PSD resizing. Upload a key visual; generate every ad size with four modes — from a free
              algorithmic baseline to a full AI HTML rewrite — and compare them side by side.
            </p>
          </div>
          <Link href="/settings" className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline shrink-0">
            Brand context →
          </Link>
        </header>

        <UploadCard />

        <section className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
            Recent · {recent.length}
          </h2>
          {recent.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No PSDs yet. Upload one above to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recent.map((p) => (
                <Link key={p.id} href={`/psd/${p.id}`} className="block">
                  <Card className="hover:border-zinc-400 transition-colors h-full">
                    <CardContent className="space-y-2">
                      <div className="aspect-video bg-zinc-100 rounded-md overflow-hidden flex items-center justify-center">
                        <img
                          src={`/api/asset/${p.hash}/flattened.png`}
                          alt={p.filename}
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium truncate">{p.filename}</span>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {p.width}×{p.height}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[9px]">{p._count.groups} groups</Badge>
                        <Badge variant="secondary" className="text-[9px]">{p._count.renders} renders</Badge>
                        <span className="text-[10px] font-mono text-muted-foreground ml-auto">{p.hash.slice(0, 8)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
