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
