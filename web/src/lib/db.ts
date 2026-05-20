import path from "node:path";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function build(): PrismaClient {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const file = url.startsWith("file:") ? url.slice("file:".length) : url;
  const resolved = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${resolved}` }) });
}

export const prisma = global.__prisma ?? build();
if (process.env.NODE_ENV !== "production") global.__prisma = prisma;
