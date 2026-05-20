import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const Body = z.object({
  brandName: z.string().nullable().optional(),
  voice: z.string().nullable().optional(),
  audience: z.string().nullable().optional(),
  doRules: z.string().nullable().optional(),
  dontRules: z.string().nullable().optional(),
  freeform: z.string().nullable().optional(),
  groupingContext: z.string().nullable().optional(),
  sourceEngineContext: z.string().nullable().optional(),
  resizeContext: z.string().nullable().optional(),
  verifyContext: z.string().nullable().optional(),
});

export async function GET() {
  const org = await prisma.organization.findUnique({ where: { id: "default" } });
  return Response.json(org ?? {
    id: "default",
    brandName: null, voice: null, audience: null, doRules: null, dontRules: null, freeform: null,
    groupingContext: null, sourceEngineContext: null, resizeContext: null, verifyContext: null,
  });
}

export async function PUT(req: NextRequest) {
  const body = Body.parse(await req.json());
  const data = {
    brandName: body.brandName ?? null,
    voice: body.voice ?? null,
    audience: body.audience ?? null,
    doRules: body.doRules ?? null,
    dontRules: body.dontRules ?? null,
    freeform: body.freeform ?? null,
    groupingContext: body.groupingContext ?? null,
    sourceEngineContext: body.sourceEngineContext ?? null,
    resizeContext: body.resizeContext ?? null,
    verifyContext: body.verifyContext ?? null,
  };
  const org = await prisma.organization.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
  return Response.json(org);
}
