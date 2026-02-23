import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH =
  process.env.DATABASE_PATH ||
  path.join(process.cwd(), "data", "rescue-info.db");

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS manufacturers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    logo_url TEXT
  );

  CREATE TABLE IF NOT EXISTS models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    manufacturer_id INTEGER NOT NULL REFERENCES manufacturers(id),
    name TEXT NOT NULL,
    UNIQUE(manufacturer_id, name)
  );

  CREATE TABLE IF NOT EXISTS rescue_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id INTEGER NOT NULL REFERENCES models(id),
    year_from INTEGER,
    year_to INTEGER,
    pdf_path TEXT,
    source_url TEXT NOT NULL,
    source_name TEXT NOT NULL,
    last_updated TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(model_id, year_from, year_to)
  );

  CREATE TABLE IF NOT EXISTS pending_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    manufacturer_name TEXT NOT NULL,
    model_name TEXT NOT NULL,
    year_from INTEGER,
    year_to INTEGER,
    pdf_path TEXT NOT NULL,
    submitter_note TEXT,
    submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'pending'
  );

  CREATE INDEX IF NOT EXISTS idx_models_manufacturer ON models(manufacturer_id);
  CREATE INDEX IF NOT EXISTS idx_rescue_cards_model ON rescue_cards(model_id);
`);

console.log("Database initialized at", DB_PATH);
db.close();
