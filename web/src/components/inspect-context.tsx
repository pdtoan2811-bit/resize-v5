"use client";

import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription,
} from "@/components/ui/sheet";
import { ContextPreviewPanel } from "@/components/context-preview-panel";

export function InspectContext({ psdId }: { psdId: string }) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
          >
            Inspect AI context
          </button>
        }
      />
      <SheetContent side="right" className="w-[480px] sm:max-w-[520px]">
        <SheetHeader>
          <SheetTitle className="text-base">AI context for each call</SheetTitle>
          <SheetDescription className="text-xs">
            The exact preamble that will be prepended to each AI call&apos;s system prompt.
            If something looks wrong here, fix it in <code className="font-mono text-[10px]">/settings</code> or the project notes.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          <ContextPreviewPanel psdId={psdId} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
