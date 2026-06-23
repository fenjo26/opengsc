import { PrismaClient } from '@/generated/prisma'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createPrismaClient() {
  const rawUrl = process.env.DATABASE_URL || "file:./data/prod.db"
  // Strip "file:" prefix to get a raw file path for better-sqlite3
  const url = rawUrl.replace(/^file:/, "")
  console.log("DEBUG: createPrismaClient: rawUrl =", rawUrl, "url =", url);
  const adapter = new PrismaBetterSqlite3({ url })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma || createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
