import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const Body = z.object({ iterationNotes: z.string().nullable() });

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/psd/[id]/notes">) {
  const { id } = await ctx.params;
  const body = Body.parse(await req.json());
  const psd = await prisma.psd.update({
    where: { id },
    data: { iterationNotes: body.iterationNotes },
    select: { id: true, iterationNotes: true },
  });
  return Response.json(psd);
}
