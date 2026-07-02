// Seed the Casino RAG knowledge base from the bundled snapshot (data/rag-seed.json.gz)
// into whatever SQLite DB DATABASE_URL points to. Plain Node + sql.js (no native engines),
// safe to run on any install. Used by install.sh and manual deploys:
//
//   node scripts/seed-rag.mjs            # skips if the base is already populated
//   node scripts/seed-rag.mjs --force    # re-seed from the snapshot
//
// To refresh the snapshot itself from fresh CSVs, run scripts/import-rag.ts locally,
// then re-export data/rag-seed.json.gz (see README / commit history).

import fs from "fs";
import path from "path";
import zlib from "zlib";
import initSqlJs from "sql.js";

function dbPathFromEnv() {
  let url = process.env.DATABASE_URL || "";
  if (!url && fs.existsSync(".env")) {
    const m = fs.readFileSync(".env", "utf8").match(/^\s*DATABASE_URL\s*=\s*"?file:([^"\n]+)"?/m);
    if (m) url = "file:" + m[1];
  }
  if (!url.startsWith("file:")) return null;
  const p = url.slice(5);
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p.replace(/^\.\//, ""));
}

const SEED = path.resolve("data/rag-seed.json.gz");
const force = process.argv.includes("--force");

async function main() {
  const dbPath = dbPathFromEnv();
  if (!dbPath) { console.log("seed-rag: DATABASE_URL is not a file: SQLite url — skipping"); return; }
  if (!fs.existsSync(dbPath)) { console.log(`seed-rag: DB not found at ${dbPath} — run 'npx prisma db push' first`); return; }
  if (!fs.existsSync(SEED)) { console.log("seed-rag: data/rag-seed.json.gz missing — skipping"); return; }

  const seed = JSON.parse(zlib.gunzipSync(fs.readFileSync(SEED)).toString("utf8"));
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));

  db.run(`CREATE TABLE IF NOT EXISTS "RagSlot" (
    "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "nameNorm" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT '', "released" TEXT NOT NULL DEFAULT '',
    "slotType" TEXT NOT NULL DEFAULT '', "rtp" TEXT NOT NULL DEFAULT '',
    "volatility" TEXT NOT NULL DEFAULT '', "maxWin" TEXT NOT NULL DEFAULT '',
    "minBet" TEXT NOT NULL DEFAULT '', "maxBet" TEXT NOT NULL DEFAULT '',
    "layout" TEXT NOT NULL DEFAULT '', "lines" TEXT NOT NULL DEFAULT '',
    "features" TEXT NOT NULL DEFAULT '', "themes" TEXT NOT NULL DEFAULT '',
    "demoUrl" TEXT NOT NULL DEFAULT '', "platform" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '')`);
  db.run(`CREATE INDEX IF NOT EXISTS "RagSlot_nameNorm_idx" ON "RagSlot"("nameNorm")`);
  db.run(`CREATE INDEX IF NOT EXISTS "RagSlot_provider_idx" ON "RagSlot"("provider")`);
  db.run(`CREATE TABLE IF NOT EXISTS "RagCasino" (
    "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "nameNorm" TEXT NOT NULL,
    "website" TEXT NOT NULL DEFAULT '', "country" TEXT NOT NULL DEFAULT '',
    "founded" TEXT NOT NULL DEFAULT '', "locality" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '', "size" TEXT NOT NULL DEFAULT '',
    "linkedinUrl" TEXT NOT NULL DEFAULT '', "source" TEXT NOT NULL DEFAULT '')`);
  db.run(`CREATE INDEX IF NOT EXISTS "RagCasino_nameNorm_idx" ON "RagCasino"("nameNorm")`);

  const count = (t) => db.exec(`SELECT COUNT(*) FROM "${t}"`)[0].values[0][0];
  if (!force && count("RagSlot") >= seed.slots.length && count("RagCasino") >= seed.casinos.length) {
    console.log(`seed-rag: already populated (${count("RagSlot")} slots, ${count("RagCasino")} casinos) — skipping (use --force to re-seed)`);
    db.close();
    return;
  }

  db.run("BEGIN");
  db.run(`DELETE FROM "RagSlot"`);
  db.run(`DELETE FROM "RagCasino"`);
  const sIns = db.prepare(`INSERT INTO "RagSlot" (id,name,nameNorm,provider,released,slotType,rtp,volatility,maxWin,minBet,maxBet,layout,lines,features,themes,demoUrl,platform,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const s of seed.slots)
    sIns.run([s.id, s.name, s.nameNorm, s.provider, s.released, s.slotType, s.rtp, s.volatility, s.maxWin, s.minBet, s.maxBet, s.layout, s.lines, s.features, s.themes, s.demoUrl, s.platform, s.source]);
  const cIns = db.prepare(`INSERT INTO "RagCasino" (id,name,nameNorm,website,country,founded,locality,region,size,linkedinUrl,source) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  for (const c of seed.casinos)
    cIns.run([c.id, c.name, c.nameNorm, c.website, c.country, c.founded, c.locality, c.region, c.size, c.linkedinUrl, c.source]);
  db.run("COMMIT");

  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  console.log(`seed-rag: seeded ${seed.slots.length} slots + ${seed.casinos.length} casinos → ${dbPath}`);
  db.close();
}

main().catch(e => { console.error("seed-rag failed:", e.message); process.exit(1); });
