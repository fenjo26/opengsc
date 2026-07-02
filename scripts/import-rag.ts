// Import the Casino RAG knowledge base (slots + casinos) from CSV exports into the SQLite DB.
// Uses sql.js (pure WASM, no native engines) so it runs anywhere. Stop the dev server first.
//
// Usage:
//   npx tsx scripts/import-rag.ts \
//     --db prisma/dev.db \
//     --slots35 "Slots-35k-no-demo - 35000.csv" \
//     --slotsDemo "Slots-4.6k-demo - 4600.csv" \
//     --casinos "casinos.csv"
//
// All file args are optional — pass whichever sources you have. Re-running is safe:
// slots are upserted by (nameNorm, provider), casinos by (nameNorm, website).

import fs from "fs";
import initSqlJs from "sql.js";

// ─── tiny CSV parser (handles quoted fields with commas/newlines) ───────────────
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
const rid = (p: string) => p + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const dbPath = arg("db") || "prisma/dev.db";
  if (!fs.existsSync(dbPath)) { console.error(`DB not found: ${dbPath}`); process.exit(1); }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));

  // Tables match prisma/schema.prisma (RagSlot / RagCasino) — created here so the import
  // works even before `prisma db push` ran.
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

  const col = (header: string[], name: string) => header.findIndex(h => norm(h) === norm(name));

  // ─── 35k slots (no demo) ──────────────────────────────────────────────────────
  const f35 = arg("slots35");
  if (f35) {
    const rows = parseCsv(fs.readFileSync(f35, "utf8"));
    const h = rows[0];
    const c = {
      name: col(h, "Название слота"), provider: col(h, "Провайдер"), released: col(h, "Дата выхода"),
      slotType: col(h, "Тип слота"), rtp: col(h, "RTP (%)"), volatility: col(h, "Волатильность"),
      maxWin: col(h, "Макс. выигрыш"), minBet: col(h, "Мин. ставка"), maxBet: col(h, "Макс. ставка"),
      layout: col(h, "Игровое поле"), lines: col(h, "Кол-во линий"), features: col(h, "Фичи и Бонусы"),
      themes: col(h, "Тема"),
    };
    const st = db.prepare(`INSERT INTO "RagSlot" (id,name,nameNorm,provider,released,slotType,rtp,volatility,maxWin,minBet,maxBet,layout,lines,features,themes,demoUrl,platform,source)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'','','35k')`);
    const del = db.prepare(`DELETE FROM "RagSlot" WHERE nameNorm=? AND provider=? AND source='35k'`);
    db.run("BEGIN");
    let n = 0;
    for (const r of rows.slice(1)) {
      const name = (r[c.name] || "").trim();
      if (!name) continue;
      const provider = (r[c.provider] || "").trim();
      del.run([norm(name), provider]);
      st.run([rid("rs35"), name, norm(name), provider, r[c.released] || "", r[c.slotType] || "", r[c.rtp] || "",
        r[c.volatility] || "", r[c.maxWin] || "", r[c.minBet] || "", r[c.maxBet] || "", r[c.layout] || "",
        r[c.lines] || "", r[c.features] || "", r[c.themes] || ""]);
      n++;
    }
    db.run("COMMIT");
    console.log(`slots35: imported ${n}`);
  }

  // ─── 4.6k slots (with demo links) — merge demoUrl into existing, else insert ──
  const fDemo = arg("slotsDemo");
  if (fDemo) {
    const rows = parseCsv(fs.readFileSync(fDemo, "utf8"));
    const h = rows[0];
    const c = {
      name: col(h, "Название"), provider: col(h, "Провайдер"), released: col(h, "Дата создания"),
      demoUrl: col(h, "ссылка на демо"), genre: col(h, "Жанр"), features: col(h, "Доп функции слота"),
      rtp: col(h, "RTP (%)"), minBet: col(h, "Минимальная ставка"), maxBet: col(h, "Максимальная ставка"),
      maxWin: col(h, "Максимальная выплата"), reels: col(h, "Кол-во барабанов"), rws: col(h, "Кол-во рядов"),
      lines: col(h, "Кол-во линий"), volatility: col(h, "Волатильность"), platform: col(h, "Платформа"),
    };
    const upd = db.prepare(`UPDATE "RagSlot" SET demoUrl=?, platform=? WHERE nameNorm=? AND (provider=? OR provider='')`);
    const ins = db.prepare(`INSERT INTO "RagSlot" (id,name,nameNorm,provider,released,slotType,rtp,volatility,maxWin,minBet,maxBet,layout,lines,features,themes,demoUrl,platform,source)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'',?,?,'demo')`);
    const delDemo = db.prepare(`DELETE FROM "RagSlot" WHERE nameNorm=? AND provider=? AND source='demo'`);
    db.run("BEGIN");
    let merged = 0, added = 0;
    for (const r of rows.slice(1)) {
      const name = (r[c.name] || "").trim();
      if (!name) continue;
      const provider = (r[c.provider] || "").trim();
      const demoUrl = (r[c.demoUrl] || "").trim();
      const platform = (r[c.platform] || "").trim();
      upd.run([demoUrl, platform, norm(name), provider]);
      if (db.getRowsModified() > 0) { merged++; continue; }
      const layout = [r[c.reels], r[c.rws]].filter(Boolean).join("-");
      delDemo.run([norm(name), provider]);
      ins.run([rid("rsd"), name, norm(name), provider, r[c.released] || "", r[c.genre] || "", r[c.rtp] || "",
        r[c.volatility] || "", r[c.maxWin] || "", r[c.minBet] || "", r[c.maxBet] || "", layout,
        r[c.lines] || "", r[c.features] || "", demoUrl, platform]);
      added++;
    }
    db.run("COMMIT");
    console.log(`slotsDemo: merged demo links into ${merged}, added ${added} new`);
  }

  // ─── casinos (LinkedIn business export) ───────────────────────────────────────
  const fCas = arg("casinos");
  if (fCas) {
    const rows = parseCsv(fs.readFileSync(fCas, "utf8"));
    const h = rows[0];
    const c = {
      name: col(h, "name"), website: col(h, "website"), country: col(h, "country"), founded: col(h, "founded"),
      locality: col(h, "locality"), region: col(h, "region"), size: col(h, "size"), linkedin: col(h, "linkedin_url"),
    };
    const del = db.prepare(`DELETE FROM "RagCasino" WHERE nameNorm=? AND website=?`);
    const ins = db.prepare(`INSERT INTO "RagCasino" (id,name,nameNorm,website,country,founded,locality,region,size,linkedinUrl,source)
      VALUES (?,?,?,?,?,?,?,?,?,?,'linkedin')`);
    db.run("BEGIN");
    let n = 0;
    for (const r of rows.slice(1)) {
      const name = (r[c.name] || "").trim();
      if (!name) continue;
      const website = (r[c.website] || "").trim();
      del.run([norm(name), website]);
      ins.run([rid("rc"), name, norm(name), website, r[c.country] || "", r[c.founded] || "",
        r[c.locality] || "", r[c.region] || "", r[c.size] || "", r[c.linkedin] || ""]);
      n++;
    }
    db.run("COMMIT");
    console.log(`casinos: imported ${n}`);
  }

  const cnt = (q: string) => (db.exec(q)[0]?.values[0][0] as number) || 0;
  console.log(`TOTALS → slots: ${cnt('SELECT COUNT(*) FROM "RagSlot"')}, casinos: ${cnt('SELECT COUNT(*) FROM "RagCasino"')}`);

  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  db.close();
  console.log(`written: ${dbPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
