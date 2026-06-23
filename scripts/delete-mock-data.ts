import { PrismaClient } from '../src/generated/prisma'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

function createPrismaClient() {
  const rawUrl = process.env.DATABASE_URL || "file:./dev.db"
  const url = rawUrl.replace(/^file:/, "")
  const adapter = new PrismaBetterSqlite3({ url })
  return new PrismaClient({ adapter })
}

const prisma = createPrismaClient()

async function main() {
  const mockDomains = [
    'expired-gold-blog.info',
    'seo-crawling-hub.xyz',
    'best-deals-shop.net'
  ]

  console.log('Starting cleanup of mock indexer data...')

  const result = await prisma.indexerDomain.deleteMany({
    where: {
      domain: {
        in: mockDomains
      }
    }
  })

  console.log(`Successfully deleted ${result.count} mock domains (and their logs/queue items).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
