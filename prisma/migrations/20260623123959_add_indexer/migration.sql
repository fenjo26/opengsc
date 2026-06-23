-- AlterTable
ALTER TABLE "Account" ADD COLUMN "refresh_token_expires_in" INTEGER;

-- AlterTable
ALTER TABLE "Site" ADD COLUMN "brandedKeywords" TEXT;
ALTER TABLE "Site" ADD COLUMN "clarityInterval" TEXT;
ALTER TABLE "Site" ADD COLUMN "clarityProjectId" TEXT;
ALTER TABLE "Site" ADD COLUMN "clarityToken" TEXT;
ALTER TABLE "Site" ADD COLUMN "crawlInterval" TEXT;
ALTER TABLE "Site" ADD COLUMN "ga4PropertyId" TEXT;
ALTER TABLE "Site" ADD COLUMN "ga4PropertyName" TEXT;
ALTER TABLE "Site" ADD COLUMN "lastSitemapSync" DATETIME;
ALTER TABLE "Site" ADD COLUMN "sitemapUrl" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "neuralIndexerToken" TEXT;
ALTER TABLE "User" ADD COLUMN "twoIndexToken" TEXT;
ALTER TABLE "User" ADD COLUMN "xmlRiverApiKey" TEXT;
ALTER TABLE "User" ADD COLUMN "xmlRiverUserId" TEXT;

-- CreateTable
CREATE TABLE "SitemapUrl" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "googleStatus" TEXT,
    "googleCoverage" TEXT,
    "googleReason" TEXT,
    "googleChecked" DATETIME,
    "xrStatus" TEXT,
    "xrChecked" DATETIME,
    "twoIndexStatus" TEXT,
    "twoIndexAt" DATETIME,
    "neuralStatus" TEXT,
    "neuralAt" DATETIME,
    "neuralQueue" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SitemapUrl_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Backlink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "isAlive" BOOLEAN,
    "aliveChecked" DATETIME,
    "xrStatus" TEXT,
    "xrChecked" DATETIME,
    "twoIndexStatus" TEXT,
    "twoIndexAt" DATETIME,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Backlink_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IndexingOperation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "urlCount" INTEGER,
    "type" TEXT NOT NULL,
    "result" TEXT,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IndexingOperation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TopicCluster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rules" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TopicCluster_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PageInspection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastCrawl" DATETIME,
    "richResults" TEXT,
    "lastInspect" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PageInspection_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PageInspectionHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    CONSTRAINT "PageInspectionHistory_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClaritySnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodDays" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    CONSTRAINT "ClaritySnapshot_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SiteHealth" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sslData" TEXT,
    "safeBrowsing" TEXT,
    "vitals" TEXT,
    "virusTotal" TEXT,
    CONSTRAINT "SiteHealth_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IndexerDomain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "apiKey" TEXT NOT NULL,
    "template" TEXT NOT NULL DEFAULT 'ecommerce',
    "moneyUrl" TEXT,
    "allowedBots" TEXT NOT NULL DEFAULT 'google,bing,yandex',
    "pagesCount" INTEGER NOT NULL DEFAULT 0,
    "subdomainsCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "IndexerDomain_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IndexerLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domainId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "url" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "botType" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 200,
    "referer" TEXT,
    CONSTRAINT "IndexerLog_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "IndexerDomain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IndexerQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domainId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "crawledAt" DATETIME,
    CONSTRAINT "IndexerQueue_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "IndexerDomain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IndexerDictionary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IndexerDictionary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SitemapUrl_siteId_idx" ON "SitemapUrl"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "SitemapUrl_siteId_url_key" ON "SitemapUrl"("siteId", "url");

-- CreateIndex
CREATE INDEX "Backlink_siteId_idx" ON "Backlink"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "Backlink_siteId_url_key" ON "Backlink"("siteId", "url");

-- CreateIndex
CREATE INDEX "IndexingOperation_siteId_createdAt_idx" ON "IndexingOperation"("siteId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PageInspection_siteId_url_key" ON "PageInspection"("siteId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "PageInspectionHistory_siteId_url_date_key" ON "PageInspectionHistory"("siteId", "url", "date");

-- CreateIndex
CREATE INDEX "ClaritySnapshot_siteId_fetchedAt_idx" ON "ClaritySnapshot"("siteId", "fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SiteHealth_siteId_key" ON "SiteHealth"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "IndexerDomain_userId_domain_key" ON "IndexerDomain"("userId", "domain");

-- CreateIndex
CREATE INDEX "IndexerLog_domainId_timestamp_idx" ON "IndexerLog"("domainId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "IndexerQueue_domainId_url_key" ON "IndexerQueue"("domainId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "IndexerDictionary_userId_word_key" ON "IndexerDictionary"("userId", "word");
