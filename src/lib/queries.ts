import { getDb } from "./db";

export interface Manufacturer {
  id: number;
  name: string;
  logo_url: string | null;
}

export interface Model {
  id: number;
  manufacturer_id: number;
  name: string;
}

export interface RescueCard {
  id: number;
  model_id: number;
  year_from: number | null;
  year_to: number | null;
  pdf_path: string | null;
  source_url: string;
  source_name: string;
  last_updated: string;
  manufacturer_name: string;
  model_name: string;
}

export function getManufacturers(): Manufacturer[] {
  const db = getDb();
  return db.prepare("SELECT * FROM manufacturers ORDER BY name").all() as Manufacturer[];
}

export function getModelsByManufacturer(manufacturerId: number): Model[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM models WHERE manufacturer_id = ? ORDER BY name")
    .all(manufacturerId) as Model[];
}

export function searchRescueCards(params: {
  make?: string;
  model?: string;
  year?: number;
}): RescueCard[] {
  const db = getDb();
  let sql = `
    SELECT rc.*, m.name as manufacturer_name, mo.name as model_name
    FROM rescue_cards rc
    JOIN models mo ON rc.model_id = mo.id
    JOIN manufacturers m ON mo.manufacturer_id = m.id
    WHERE 1=1
  `;
  const bindings: (string | number)[] = [];

  if (params.make) {
    sql += " AND LOWER(m.name) = LOWER(?)";
    bindings.push(params.make);
  }
  if (params.model) {
    sql += " AND LOWER(mo.name) = LOWER(?)";
    bindings.push(params.model);
  }
  if (params.year) {
    sql += " AND (rc.year_from IS NULL OR rc.year_from <= ?)";
    sql += " AND (rc.year_to IS NULL OR rc.year_to >= ?)";
    bindings.push(params.year, params.year);
  }

  sql += " ORDER BY m.name, mo.name, rc.year_from";

  return db.prepare(sql).all(...bindings) as RescueCard[];
}

export function getRescueCard(
  make: string,
  model: string,
  year: number
): RescueCard | undefined {
  const results = searchRescueCards({ make, model, year });
  return results[0];
}

export interface PendingSubmission {
  id: number;
  manufacturer_name: string;
  model_name: string;
  year_from: number | null;
  year_to: number | null;
  pdf_path: string;
  submitter_note: string | null;
  submitted_at: string;
  status: string;
}

export function getPendingSubmissions(): PendingSubmission[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM pending_submissions WHERE status = 'pending' ORDER BY submitted_at DESC")
    .all() as PendingSubmission[];
}

export function approveSubmission(id: number): void {
  const db = getDb();
  const submission = db
    .prepare("SELECT * FROM pending_submissions WHERE id = ?")
    .get(id) as PendingSubmission | undefined;
  if (!submission) throw new Error("Submission not found");

  const slugify = (t: string) =>
    t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // Ensure manufacturer
  db.prepare("INSERT OR IGNORE INTO manufacturers (name) VALUES (?)").run(
    submission.manufacturer_name
  );
  const mfr = db.prepare("SELECT id FROM manufacturers WHERE name = ?").get(
    submission.manufacturer_name
  ) as { id: number };

  // Ensure model
  db.prepare(
    "INSERT OR IGNORE INTO models (manufacturer_id, name) VALUES (?, ?)"
  ).run(mfr.id, submission.model_name);
  const mdl = db.prepare(
    "SELECT id FROM models WHERE manufacturer_id = ? AND name = ?"
  ).get(mfr.id, submission.model_name) as { id: number };

  // Move PDF from pending/ to final location
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const pdfDir = path.join(process.cwd(), "data", "pdfs");
  const mfrSlug = slugify(submission.manufacturer_name);
  const modelSlug = slugify(submission.model_name);
  const yearPart =
    submission.year_from || submission.year_to
      ? `_${submission.year_from ?? "x"}-${submission.year_to ?? "x"}`
      : "";
  const newRelPath = `${mfrSlug}/${modelSlug}${yearPart}.pdf`;
  const oldAbs = path.join(pdfDir, submission.pdf_path);
  const newAbs = path.join(pdfDir, newRelPath);

  fs.mkdirSync(path.dirname(newAbs), { recursive: true });
  if (fs.existsSync(oldAbs)) {
    fs.renameSync(oldAbs, newAbs);
  }

  // Insert rescue card
  db.prepare(
    `INSERT OR REPLACE INTO rescue_cards (model_id, year_from, year_to, pdf_path, source_url, source_name)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    mdl.id,
    submission.year_from,
    submission.year_to,
    newRelPath,
    "community-upload",
    "Community Upload"
  );

  // Mark approved
  db.prepare("UPDATE pending_submissions SET status = 'approved' WHERE id = ?").run(id);
}

export function rejectSubmission(id: number): void {
  const db = getDb();
  const submission = db
    .prepare("SELECT pdf_path FROM pending_submissions WHERE id = ?")
    .get(id) as { pdf_path: string } | undefined;
  if (!submission) throw new Error("Submission not found");

  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const absPath = path.join(process.cwd(), "data", "pdfs", submission.pdf_path);
  if (fs.existsSync(absPath)) {
    fs.unlinkSync(absPath);
  }

  db.prepare("UPDATE pending_submissions SET status = 'rejected' WHERE id = ?").run(id);
}
