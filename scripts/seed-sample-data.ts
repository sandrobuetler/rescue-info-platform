import Database from "better-sqlite3";
import path from "path";

const DB_PATH =
  process.env.DATABASE_PATH ||
  path.join(process.cwd(), "data", "rescue-info.db");

const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");

const insertManufacturer = db.prepare(
  "INSERT OR IGNORE INTO manufacturers (name) VALUES (?)"
);
const insertModel = db.prepare(
  "INSERT OR IGNORE INTO models (manufacturer_id, name) VALUES (?, ?)"
);
const insertCard = db.prepare(`
  INSERT OR IGNORE INTO rescue_cards (model_id, year_from, year_to, source_url, source_name)
  VALUES (?, ?, ?, ?, ?)
`);

const sampleData = [
  {
    make: "BMW",
    models: [
      { name: "3 Series (G20)", yearFrom: 2019, yearTo: 2025 },
      { name: "X5 (G05)", yearFrom: 2018, yearTo: 2025 },
    ],
  },
  {
    make: "Volkswagen",
    models: [
      { name: "Golf 8", yearFrom: 2020, yearTo: 2025 },
      { name: "ID.4", yearFrom: 2021, yearTo: 2025 },
    ],
  },
  {
    make: "Toyota",
    models: [
      { name: "Corolla (E210)", yearFrom: 2019, yearTo: 2025 },
      { name: "RAV4 (XA50)", yearFrom: 2019, yearTo: 2025 },
    ],
  },
];

const seedAll = db.transaction(() => {
  for (const mfr of sampleData) {
    insertManufacturer.run(mfr.make);
    const mfrRow = db
      .prepare("SELECT id FROM manufacturers WHERE name = ?")
      .get(mfr.make) as { id: number };

    for (const model of mfr.models) {
      insertModel.run(mfrRow.id, model.name);
      const modelRow = db
        .prepare(
          "SELECT id FROM models WHERE manufacturer_id = ? AND name = ?"
        )
        .get(mfrRow.id, model.name) as { id: number };

      insertCard.run(
        modelRow.id,
        model.yearFrom,
        model.yearTo,
        `https://example.com/rescue-cards/${mfr.make.toLowerCase()}/${model.name.toLowerCase().replace(/\s+/g, "-")}`,
        "Sample Data"
      );
    }
  }
});

seedAll();
console.log("Sample data seeded.");
db.close();
