"use client";

import { describeFetchError } from "@/lib/fetch-error";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function UploadCard() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  async function onFile(file: File) {
    setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw await describeFetchError(res);
      const { id } = await res.json();
      startTransition(() => router.push(`/psd/${id}`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card>
      <CardContent>
        <label className="flex flex-col items-center justify-center gap-2 py-12 border-2 border-dashed border-zinc-300 rounded-lg cursor-pointer hover:border-zinc-400 transition-colors">
          <input
            type="file"
            accept=".psd,image/vnd.adobe.photoshop"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          <div className="text-sm font-medium">{isPending ? "Uploading…" : "Drop a PSD or click to select"}</div>
          <div className="text-xs text-muted-foreground">.psd · cached by content hash · pick engine (algorithm or AI) after upload</div>
          {err && <div className="text-xs text-red-600 mt-2">{err}</div>}
        </label>
        <div className="flex justify-end mt-3">
          <Button variant="ghost" size="sm" disabled>Upload from URL (soon)</Button>
        </div>
      </CardContent>
    </Card>
  );
}
