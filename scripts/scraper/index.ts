import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import type { ScrapedCard, SourceAdapter } from "./types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DB_PATH =
  process.env.DATABASE_PATH ||
  path.join(process.cwd(), "data", "rescue-info.db");

const PDF_DIR = path.join(process.cwd(), "data", "pdfs");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pdfFilePath(card: ScrapedCard): string {
  const mfr = slugify(card.manufacturer);
  const model = slugify(card.model);
  const years = `${card.yearFrom ?? "unknown"}-${card.yearTo ?? "unknown"}`;
  return path.join(PDF_DIR, mfr, `${model}_${years}.pdf`);
}

async function downloadPdf(url: string, dest: string): Promise<void> {
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} downloading ${url}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function openDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

function upsertManufacturer(db: Database.Database, name: string): number {
  db.prepare("INSERT OR IGNORE INTO manufacturers (name) VALUES (?)").run(name);
  const row = db.prepare("SELECT id FROM manufacturers WHERE name = ?").get(name) as {
    id: number;
  };
  return row.id;
}

function upsertModel(
  db: Database.Database,
  manufacturerId: number,
  name: string,
): number {
  db.prepare(
    "INSERT OR IGNORE INTO models (manufacturer_id, name) VALUES (?, ?)",
  ).run(manufacturerId, name);
  const row = db
    .prepare("SELECT id FROM models WHERE manufacturer_id = ? AND name = ?")
    .get(manufacturerId, name) as { id: number };
  return row.id;
}

interface RescueCardRow {
  id: number;
  pdf_path: string | null;
  source_url: string;
  source_name: string;
}

function upsertRescueCard(
  db: Database.Database,
  card: ScrapedCard,
  modelId: number,
  pdfPath: string,
): "new" | "updated" | "unchanged" {
  const existing = db
    .prepare(
      `SELECT id, pdf_path, source_url, source_name
       FROM rescue_cards
       WHERE model_id = ? AND year_from IS ? AND year_to IS ?`,
    )
    .get(modelId, card.yearFrom, card.yearTo) as RescueCardRow | undefined;

  const relativePdf = path.relative(process.cwd(), pdfPath);

  if (!existing) {
    db.prepare(
      `INSERT INTO rescue_cards (model_id, year_from, year_to, pdf_path, source_url, source_name, last_updated)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run(modelId, card.yearFrom, card.yearTo, relativePdf, card.sourceUrl, card.sourceName);
    return "new";
  }

  // Check whether anything has changed
  if (
    existing.pdf_path === relativePdf &&
    existing.source_url === card.sourceUrl &&
    existing.source_name === card.sourceName
  ) {
    return "unchanged";
  }

  db.prepare(
    `UPDATE rescue_cards
     SET pdf_path = ?, source_url = ?, source_name = ?, last_updated = datetime('now')
     WHERE id = ?`,
  ).run(relativePdf, card.sourceUrl, card.sourceName, existing.id);
  return "updated";
}

// ---------------------------------------------------------------------------
// Adapter loader
// ---------------------------------------------------------------------------

async function loadAdapters(): Promise<SourceAdapter[]> {
  const sourcesDir = path.join(__dirname, "sources");

  if (!fs.existsSync(sourcesDir)) {
    console.log("No sources/ directory found — nothing to scrape.");
    return [];
  }

  const files = fs
    .readdirSync(sourcesDir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"));

  const adapters: SourceAdapter[] = [];

  for (const file of files) {
    const modulePath = path.join(sourcesDir, file);
    const mod = await import(modulePath);
    const adapter: SourceAdapter | undefined = mod.default ?? mod.adapter;
    if (adapter && typeof adapter.scrape === "function") {
      adapters.push(adapter);
    } else {
      console.warn(`  Skipping ${file} — no valid adapter export found.`);
    }
  }

  return adapters;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("Rescue Info — Scraper Runner");
  console.log("============================\n");

  const adapters = await loadAdapters();
  console.log(`Loaded ${adapters.length} adapter(s).\n`);

  if (adapters.length === 0) {
    console.log("Scraper finished.");
    return;
  }

  const db = openDb();

  for (const adapter of adapters) {
    console.log(`--- Source: ${adapter.name} ---`);

    const stats = { new: 0, updated: 0, unchanged: 0, failed: 0 };

    let cards: ScrapedCard[];
    try {
      cards = await adapter.scrape();
    } catch (err) {
      console.error(`  Scrape failed for ${adapter.name}:`, err);
      continue;
    }

    console.log(`  Found ${cards.length} card(s).`);

    for (const card of cards) {
      try {
        // 1. Download PDF (skip if already on disk)
        const dest = pdfFilePath(card);
        if (!fs.existsSync(dest)) {
          await downloadPdf(card.pdfUrl, dest);
        }

        // 2. Upsert into DB
        const mfrId = upsertManufacturer(db, card.manufacturer);
        const modelId = upsertModel(db, mfrId, card.model);
        const result = upsertRescueCard(db, card, modelId, dest);

        stats[result]++;
      } catch (err) {
        stats.failed++;
        console.error(
          `  Failed: ${card.manufacturer} ${card.model} (${card.yearFrom}-${card.yearTo}):`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    console.log(
      `  Results — new: ${stats.new}, updated: ${stats.updated}, unchanged: ${stats.unchanged}, failed: ${stats.failed}\n`,
    );
  }

  db.close();
  console.log("Scraper finished.");
}

main().catch((err) => {
  console.error("Fatal scraper error:", err);
  process.exit(1);
});
