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
});

export async function GET() {
  const org = await prisma.organization.findUnique({ where: { id: "default" } });
  return Response.json(org ?? {
    id: "default", brandName: null, voice: null, audience: null, doRules: null, dontRules: null, freeform: null,
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
  };
  const org = await prisma.organization.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
  return Response.json(org);
}
