# Scraper, Uploads & Deployment — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add automated rescue card scraping from easy sources, community upload with moderation, PDF caching/serving, and multi-app DigitalOcean deployment with automated CI/CD.

**Architecture:** Plugin-based scraper with one adapter per source, writing to SQLite + `data/pdfs/`. Community uploads go through a pending queue with admin review. Docker Compose revised for external Traefik on shared `web` network. GitHub Actions deploys on push to `main`.

**Tech Stack:** cheerio (HTML parsing), Node 22+ native fetch, Next.js API routes, SQLite (better-sqlite3), Docker, Traefik v3, GitHub Actions

**Design doc:** `docs/plans/2026-02-23-scraper-uploads-deployment-design.md`

---

## Phase A: Scraper Framework

### Task 1: Install cheerio dependency

**Files:**
- Modify: `package.json`

**Step 1: Install cheerio**

Run: `npm install cheerio`

**Step 2: Verify installation**

Run: `node -e "require('cheerio'); console.log('ok')"`
Expected: `ok`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add cheerio for HTML scraping"
```

---

### Task 2: Create scraper types and runner framework

**Files:**
- Create: `scripts/scraper/types.ts`
- Create: `scripts/scraper/index.ts`

**Step 1: Create `scripts/scraper/types.ts`**

```typescript
export interface ScrapedCard {
  manufacturer: string;
  model: string;
  yearFrom: number | null;
  yearTo: number | null;
  pdfUrl: string;
  sourceUrl: string;
  sourceName: string;
}

export interface SourceAdapter {
  name: string;
  scrape(): Promise<ScrapedCard[]>;
}
```

**Step 2: Create `scripts/scraper/index.ts`**

This is the runner. It:
1. Loads all adapters from `sources/`
2. Runs each adapter's `scrape()`
3. For each result: downloads PDF to `data/pdfs/{manufacturer}/`, upserts into SQLite
4. Logs summary per source

```typescript
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import type { SourceAdapter, ScrapedCard } from "./types";

const DB_PATH =
  process.env.DATABASE_PATH ||
  path.join(process.cwd(), "data", "rescue-info.db");
const PDF_DIR = path.join(process.cwd(), "data", "pdfs");

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function downloadPdf(
  url: string,
  destPath: string
): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`  Failed to download ${url}: ${res.status}`);
      return false;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, buffer);
    return true;
  } catch (err) {
    console.error(`  Error downloading ${url}:`, err);
    return false;
  }
}

function upsertCard(
  db: Database.Database,
  card: ScrapedCard,
  pdfRelPath: string | null
): "new" | "updated" | "unchanged" {
  // Ensure manufacturer exists
  db.prepare(
    "INSERT OR IGNORE INTO manufacturers (name) VALUES (?)"
  ).run(card.manufacturer);
  const mfr = db.prepare(
    "SELECT id FROM manufacturers WHERE name = ?"
  ).get(card.manufacturer) as { id: number };

  // Ensure model exists
  db.prepare(
    "INSERT OR IGNORE INTO models (manufacturer_id, name) VALUES (?, ?)"
  ).run(mfr.id, card.model);
  const mdl = db.prepare(
    "SELECT id FROM models WHERE manufacturer_id = ? AND name = ?"
  ).get(mfr.id, card.model) as { id: number };

  // Check existing rescue card
  const existing = db.prepare(
    `SELECT id, pdf_path FROM rescue_cards
     WHERE model_id = ? AND year_from IS ? AND year_to IS ?`
  ).get(mdl.id, card.yearFrom, card.yearTo) as
    | { id: number; pdf_path: string | null }
    | undefined;

  if (existing) {
    if (existing.pdf_path !== pdfRelPath) {
      db.prepare(
        `UPDATE rescue_cards SET pdf_path = ?, source_url = ?, source_name = ?,
         last_updated = datetime('now') WHERE id = ?`
      ).run(pdfRelPath, card.sourceUrl, card.sourceName, existing.id);
      return "updated";
    }
    return "unchanged";
  }

  db.prepare(
    `INSERT INTO rescue_cards (model_id, year_from, year_to, pdf_path, source_url, source_name)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    mdl.id,
    card.yearFrom,
    card.yearTo,
    pdfRelPath,
    card.sourceUrl,
    card.sourceName
  );
  return "new";
}

async function main() {
  console.log("Scraper starting...");
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Dynamically load all adapters from sources/
  const sourcesDir = path.join(__dirname, "sources");
  if (!fs.existsSync(sourcesDir)) {
    console.log("No sources/ directory found. Nothing to scrape.");
    db.close();
    return;
  }

  const adapterFiles = fs
    .readdirSync(sourcesDir)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".js"));

  const adapters: SourceAdapter[] = [];
  for (const file of adapterFiles) {
    const mod = await import(path.join(sourcesDir, file));
    if (mod.default && typeof mod.default.scrape === "function") {
      adapters.push(mod.default);
    }
  }

  console.log(`Loaded ${adapters.length} adapter(s)\n`);

  for (const adapter of adapters) {
    console.log(`--- ${adapter.name} ---`);
    let stats = { new: 0, updated: 0, unchanged: 0, failed: 0 };

    try {
      const cards = await adapter.scrape();
      console.log(`  Found ${cards.length} card(s)`);

      for (const card of cards) {
        const mfrSlug = slugify(card.manufacturer);
        const modelSlug = slugify(card.model);
        const yearPart =
          card.yearFrom || card.yearTo
            ? `_${card.yearFrom ?? "x"}-${card.yearTo ?? "x"}`
            : "";
        const filename = `${modelSlug}${yearPart}.pdf`;
        const relPath = `${mfrSlug}/${filename}`;
        const absPath = path.join(PDF_DIR, relPath);

        // Skip download if PDF already exists
        let pdfRelPath: string | null = null;
        if (fs.existsSync(absPath)) {
          pdfRelPath = relPath;
        } else {
          const ok = await downloadPdf(card.pdfUrl, absPath);
          pdfRelPath = ok ? relPath : null;
          if (!ok) {
            stats.failed++;
            continue;
          }
        }

        const result = upsertCard(db, card, pdfRelPath);
        stats[result]++;
      }
    } catch (err) {
      console.error(`  Adapter error:`, err);
    }

    console.log(
      `  Results: ${stats.new} new, ${stats.updated} updated, ${stats.unchanged} unchanged, ${stats.failed} failed\n`
    );
  }

  db.close();
  console.log("Scraper finished.");
}

main().catch((err) => {
  console.error("Scraper failed:", err);
  process.exit(1);
});
```

**Step 3: Add npm script**

In `package.json` scripts, add:
```json
"scrape": "tsx scripts/scraper/index.ts"
```

**Step 4: Verify runner starts with no adapters**

Run: `npm run scrape`
Expected output should contain: `Loaded 0 adapter(s)` and `Scraper finished.`

**Step 5: Commit**

```bash
git add scripts/scraper/types.ts scripts/scraper/index.ts package.json
git commit -m "feat: add scraper runner framework with PDF download and DB upsert"
```

---

### Task 3: ADAC index adapter

**Files:**
- Create: `scripts/scraper/sources/adac-index.ts`

The ADAC page lists manufacturer names with links to their rescue card portals. This adapter scrapes that directory. It does NOT download PDFs — it records the manufacturer portal URLs as `source_url` so users can navigate there directly.

**Step 1: Create `scripts/scraper/sources/adac-index.ts`**

```typescript
import * as cheerio from "cheerio";
import type { SourceAdapter, ScrapedCard } from "../types";

const ADAC_URL =
  "https://www.adac.de/rund-ums-fahrzeug/unfall-schaden-panne/rettungskarte/";

const adapter: SourceAdapter = {
  name: "ADAC Index",

  async scrape(): Promise<ScrapedCard[]> {
    const res = await fetch(ADAC_URL);
    if (!res.ok) throw new Error(`ADAC fetch failed: ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const cards: ScrapedCard[] = [];

    // ADAC lists manufacturers with links to their rescue card portals
    // The page structure uses a list of links — we parse all anchors
    // within the manufacturer directory section
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim();

      // Filter for manufacturer links — they typically point to external
      // manufacturer domains and have reasonable text lengths
      if (
        href &&
        text &&
        text.length > 1 &&
        text.length < 50 &&
        (href.startsWith("http://") || href.startsWith("https://")) &&
        !href.includes("adac.de")
      ) {
        cards.push({
          manufacturer: text,
          model: "All Models",
          yearFrom: null,
          yearTo: null,
          pdfUrl: href, // This is the portal URL, not a direct PDF
          sourceUrl: ADAC_URL,
          sourceName: "ADAC",
        });
      }
    });

    return cards;
  },
};

export default adapter;
```

> **Note to implementer:** The ADAC page structure may differ from what's assumed here. After running the scraper, inspect the output. If no cards are found, use `curl` to download the page and inspect the HTML structure. Adjust the CSS selectors accordingly. The key goal is to extract manufacturer names + their rescue card portal URLs.

**Step 2: Test the adapter manually**

Run: `npm run scrape`
Inspect output — should show cards found from ADAC. If 0, debug by fetching the URL and inspecting HTML.

**Step 3: Commit**

```bash
git add scripts/scraper/sources/adac-index.ts
git commit -m "feat: add ADAC index scraper adapter"
```

---

### Task 4: Toyota DE adapter

**Files:**
- Create: `scripts/scraper/sources/toyota.ts`

Toyota Germany hosts static HTML pages with direct PDF download links.

**Step 1: Create `scripts/scraper/sources/toyota.ts`**

```typescript
import * as cheerio from "cheerio";
import type { SourceAdapter, ScrapedCard } from "../types";

const TOYOTA_URL =
  "https://www.toyota.de/service-zubehoer/rettungsdatenblaetter";

const adapter: SourceAdapter = {
  name: "Toyota DE",

  async scrape(): Promise<ScrapedCard[]> {
    const res = await fetch(TOYOTA_URL);
    if (!res.ok) throw new Error(`Toyota fetch failed: ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const cards: ScrapedCard[] = [];

    // Look for PDF links on the page
    $('a[href$=".pdf"]').each((_, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim();
      if (!href || !text) return;

      const pdfUrl = href.startsWith("http")
        ? href
        : `https://www.toyota.de${href}`;

      // Try to extract model name and year range from link text or parent
      // Toyota typically names files like "Corolla_2019-2025.pdf"
      const modelMatch = text.match(/^(.+?)(?:\s*[\(\[]?\s*(\d{4})\s*[-–]\s*(\d{4})\s*[\)\]]?)?$/);
      const modelName = modelMatch?.[1]?.trim() || text;
      const yearFrom = modelMatch?.[2] ? parseInt(modelMatch[2]) : null;
      const yearTo = modelMatch?.[3] ? parseInt(modelMatch[3]) : null;

      cards.push({
        manufacturer: "Toyota",
        model: modelName,
        yearFrom,
        yearTo,
        pdfUrl,
        sourceUrl: TOYOTA_URL,
        sourceName: "Toyota Deutschland",
      });
    });

    return cards;
  },
};

export default adapter;
```

> **Note to implementer:** Same as ADAC — run the scraper and verify output. If no PDF links found, download the page with `curl` and inspect HTML structure. Adjust selectors accordingly.

**Step 2: Run scraper and verify Toyota cards appear**

Run: `npm run scrape`
Expected: Toyota adapter reports found cards with PDF URLs.

**Step 3: Commit**

```bash
git add scripts/scraper/sources/toyota.ts
git commit -m "feat: add Toyota DE scraper adapter"
```

---

### Task 5: Skoda adapter

**Files:**
- Create: `scripts/scraper/sources/skoda.ts`

Skoda provides per-model pages with UUID-based PDF downloads.

**Step 1: Create `scripts/scraper/sources/skoda.ts`**

```typescript
import * as cheerio from "cheerio";
import type { SourceAdapter, ScrapedCard } from "../types";

const SKODA_URL =
  "https://www.skoda-auto.de/service/rettungskarten";

const adapter: SourceAdapter = {
  name: "Skoda",

  async scrape(): Promise<ScrapedCard[]> {
    const res = await fetch(SKODA_URL);
    if (!res.ok) throw new Error(`Skoda fetch failed: ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const cards: ScrapedCard[] = [];

    // Look for PDF download links on the rescue card page
    $('a[href*=".pdf"], a[href*="download"], a[href*="rettungskarte"]').each(
      (_, el) => {
        const href = $(el).attr("href");
        const text = $(el).text().trim();
        if (!href || !text) return;

        const pdfUrl = href.startsWith("http")
          ? href
          : `https://www.skoda-auto.de${href}`;

        // Extract model name from link text
        const modelMatch = text.match(
          /^(.+?)(?:\s*[\(\[]?\s*(\d{4})\s*[-–]\s*(\d{4})\s*[\)\]]?)?$/
        );
        const modelName = modelMatch?.[1]?.trim() || text;
        const yearFrom = modelMatch?.[2] ? parseInt(modelMatch[2]) : null;
        const yearTo = modelMatch?.[3] ? parseInt(modelMatch[3]) : null;

        cards.push({
          manufacturer: "Skoda",
          model: modelName,
          yearFrom,
          yearTo,
          pdfUrl,
          sourceUrl: SKODA_URL,
          sourceName: "Skoda Auto Deutschland",
        });
      }
    );

    return cards;
  },
};

export default adapter;
```

**Step 2: Run scraper and verify**

Run: `npm run scrape`

**Step 3: Commit**

```bash
git add scripts/scraper/sources/skoda.ts
git commit -m "feat: add Skoda scraper adapter"
```

---

### Task 6: rettungskarten-service.de adapter

**Files:**
- Create: `scripts/scraper/sources/rettungskarten-service.ts`

WordPress-based site with direct PDF links across many brands.

**Step 1: Create `scripts/scraper/sources/rettungskarten-service.ts`**

```typescript
import * as cheerio from "cheerio";
import type { SourceAdapter, ScrapedCard } from "../types";

const BASE_URL = "https://www.rettungskarten-service.de";
const INDEX_URL = `${BASE_URL}/rettungskarten/`;

const adapter: SourceAdapter = {
  name: "rettungskarten-service.de",

  async scrape(): Promise<ScrapedCard[]> {
    const res = await fetch(INDEX_URL);
    if (!res.ok)
      throw new Error(`rettungskarten-service fetch failed: ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const cards: ScrapedCard[] = [];

    // This site lists manufacturers with sub-pages per brand
    // Collect manufacturer page URLs first, then scrape each
    const manufacturerLinks: { name: string; url: string }[] = [];

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim();
      if (
        href &&
        text &&
        href.includes("/rettungskarten/") &&
        href !== INDEX_URL &&
        !href.endsWith("/rettungskarten/")
      ) {
        const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
        manufacturerLinks.push({ name: text, url });
      }
    });

    // Deduplicate by URL
    const seen = new Set<string>();
    const unique = manufacturerLinks.filter((l) => {
      if (seen.has(l.url)) return false;
      seen.add(l.url);
      return true;
    });

    // Scrape each manufacturer page for PDF links
    for (const mfr of unique) {
      try {
        const mfrRes = await fetch(mfr.url);
        if (!mfrRes.ok) continue;
        const mfrHtml = await mfrRes.text();
        const $m = cheerio.load(mfrHtml);

        $m('a[href$=".pdf"]').each((_, el) => {
          const href = $m(el).attr("href");
          const text = $m(el).text().trim();
          if (!href) return;

          const pdfUrl = href.startsWith("http")
            ? href
            : `${BASE_URL}${href}`;

          cards.push({
            manufacturer: mfr.name,
            model: text || "Unknown Model",
            yearFrom: null,
            yearTo: null,
            pdfUrl,
            sourceUrl: mfr.url,
            sourceName: "rettungskarten-service.de",
          });
        });
      } catch {
        console.error(`  Failed to scrape ${mfr.name}: ${mfr.url}`);
      }
    }

    return cards;
  },
};

export default adapter;
```

**Step 2: Run scraper and verify**

Run: `npm run scrape`

**Step 3: Commit**

```bash
git add scripts/scraper/sources/rettungskarten-service.ts
git commit -m "feat: add rettungskarten-service.de scraper adapter"
```

---

## Phase B: PDF Serving

### Task 7: Create PDF serving API route

**Files:**
- Create: `src/app/api/pdfs/[...path]/route.ts`
- Modify: `src/app/[locale]/vehicle/[make]/[model]/[year]/page.tsx:34` — update PDF link to use API route

**Step 1: Create `src/app/api/pdfs/[...path]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

const PDF_DIR = path.join(process.cwd(), "data", "pdfs");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const filePath = path.join(PDF_DIR, ...segments);

  // Prevent directory traversal
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(PDF_DIR))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (!fs.existsSync(resolved) || !resolved.endsWith(".pdf")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = fs.readFileSync(resolved);
  const filename = path.basename(resolved);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
```

**Step 2: Update vehicle detail page PDF link**

In `src/app/[locale]/vehicle/[make]/[model]/[year]/page.tsx`, change the PDF link from:
```tsx
href={`/data/pdfs/${card.pdf_path}`}
```
to:
```tsx
href={`/api/pdfs/${card.pdf_path}`}
```

**Step 3: Verify the route compiles**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 4: Commit**

```bash
git add src/app/api/pdfs/\[...path\]/route.ts src/app/\[locale\]/vehicle/\[make\]/\[model\]/\[year\]/page.tsx
git commit -m "feat: add PDF serving API route with directory traversal protection"
```

---

## Phase C: Community Upload

### Task 8: Add pending_submissions table

**Files:**
- Modify: `scripts/init-db.ts:30-44` — add `pending_submissions` table after `rescue_cards`

**Step 1: Add table to init-db.ts**

After the existing `CREATE TABLE IF NOT EXISTS rescue_cards` block, add:

```sql
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
```

**Step 2: Re-run db:init to apply**

Run: `npm run db:init`
Expected: `Database initialized at ...`

**Step 3: Verify table exists**

Run: `npx tsx -e "const Database = require('better-sqlite3'); const db = new Database('data/rescue-info.db'); console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name='pending_submissions'\").get());"`
Expected: `{ name: 'pending_submissions' }`

**Step 4: Commit**

```bash
git add scripts/init-db.ts
git commit -m "feat: add pending_submissions table for community uploads"
```

---

### Task 9: Create upload API route and Contribute page

**Files:**
- Create: `src/app/api/submissions/route.ts`
- Create: `src/app/[locale]/contribute/page.tsx`
- Modify: `src/messages/en.json` — add `contribute` section
- Modify: `src/messages/de.json` — add `contribute` section
- Modify: `src/messages/fr.json` — add `contribute` section
- Modify: `src/messages/it.json` — add `contribute` section

**Step 1: Create upload API route `src/app/api/submissions/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import path from "path";
import fs from "fs";

const PENDING_DIR = path.join(process.cwd(), "data", "pdfs", "pending");

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const manufacturer = formData.get("manufacturer") as string;
  const model = formData.get("model") as string;
  const yearFrom = formData.get("yearFrom") as string;
  const yearTo = formData.get("yearTo") as string;
  const note = formData.get("note") as string;
  const honeypot = formData.get("website") as string;
  const file = formData.get("pdf") as File | null;

  // Honeypot check
  if (honeypot) {
    // Bot detected — return success silently
    return NextResponse.json({ success: true });
  }

  if (!manufacturer || !model || !file) {
    return NextResponse.json(
      { error: "Manufacturer, model, and PDF file are required" },
      { status: 400 }
    );
  }

  if (!file.name.endsWith(".pdf") || file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Only PDF files are accepted" },
      { status: 400 }
    );
  }

  // Max 10MB
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File too large (max 10MB)" },
      { status: 400 }
    );
  }

  // Save PDF to pending directory
  fs.mkdirSync(PENDING_DIR, { recursive: true });
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${timestamp}_${safeName}`;
  const filePath = path.join(PENDING_DIR, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  // Insert into pending_submissions
  const db = getDb();
  db.prepare(
    `INSERT INTO pending_submissions (manufacturer_name, model_name, year_from, year_to, pdf_path, submitter_note)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    manufacturer.trim(),
    model.trim(),
    yearFrom ? parseInt(yearFrom) : null,
    yearTo ? parseInt(yearTo) : null,
    `pending/${filename}`,
    note?.trim() || null
  );

  return NextResponse.json({ success: true });
}
```

**Step 2: Add translation keys to all 4 locale files**

Add `contribute` section to each message file:

**en.json:**
```json
"contribute": {
  "title": "Contribute a Rescue Card",
  "intro": "Help expand our database by uploading rescue cards that are not yet available on this platform.",
  "manufacturer": "Manufacturer",
  "manufacturerPlaceholder": "e.g. BMW, Volvo, Tesla",
  "model": "Model",
  "modelPlaceholder": "e.g. Model 3, XC90",
  "yearFrom": "Year from",
  "yearTo": "Year to",
  "pdfFile": "Rescue Card PDF",
  "note": "Note (optional)",
  "notePlaceholder": "e.g. source URL, generation info",
  "submit": "Submit for Review",
  "success": "Thank you! Your submission will be reviewed by a moderator.",
  "error": "Something went wrong. Please try again."
}
```

**de.json:**
```json
"contribute": {
  "title": "Rettungskarte beitragen",
  "intro": "Helfen Sie mit, unsere Datenbank zu erweitern, indem Sie Rettungskarten hochladen, die noch nicht auf dieser Plattform verfügbar sind.",
  "manufacturer": "Hersteller",
  "manufacturerPlaceholder": "z.B. BMW, Volvo, Tesla",
  "model": "Modell",
  "modelPlaceholder": "z.B. Model 3, XC90",
  "yearFrom": "Baujahr von",
  "yearTo": "Baujahr bis",
  "pdfFile": "Rettungskarte PDF",
  "note": "Anmerkung (optional)",
  "notePlaceholder": "z.B. Quell-URL, Generationsinfo",
  "submit": "Zur Prüfung einreichen",
  "success": "Vielen Dank! Ihre Einreichung wird von einem Moderator geprüft.",
  "error": "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut."
}
```

**fr.json:**
```json
"contribute": {
  "title": "Contribuer une fiche de secours",
  "intro": "Aidez à enrichir notre base de données en téléchargeant des fiches de secours qui ne sont pas encore disponibles sur cette plateforme.",
  "manufacturer": "Constructeur",
  "manufacturerPlaceholder": "p.ex. BMW, Volvo, Tesla",
  "model": "Modèle",
  "modelPlaceholder": "p.ex. Model 3, XC90",
  "yearFrom": "Année de début",
  "yearTo": "Année de fin",
  "pdfFile": "PDF de la fiche de secours",
  "note": "Note (optionnel)",
  "notePlaceholder": "p.ex. URL source, infos de génération",
  "submit": "Soumettre pour vérification",
  "success": "Merci ! Votre soumission sera examinée par un modérateur.",
  "error": "Une erreur est survenue. Veuillez réessayer."
}
```

**it.json:**
```json
"contribute": {
  "title": "Contribuisci con una scheda di soccorso",
  "intro": "Aiuta ad ampliare il nostro database caricando schede di soccorso non ancora disponibili su questa piattaforma.",
  "manufacturer": "Produttore",
  "manufacturerPlaceholder": "es. BMW, Volvo, Tesla",
  "model": "Modello",
  "modelPlaceholder": "es. Model 3, XC90",
  "yearFrom": "Anno da",
  "yearTo": "Anno a",
  "pdfFile": "PDF scheda di soccorso",
  "note": "Nota (opzionale)",
  "notePlaceholder": "es. URL fonte, info generazione",
  "submit": "Invia per revisione",
  "success": "Grazie! La tua sottomissione sarà esaminata da un moderatore.",
  "error": "Qualcosa è andato storto. Riprova."
}
```

**Step 3: Create the Contribute page `src/app/[locale]/contribute/page.tsx`**

This is a client component with a form that POSTs to `/api/submissions`.

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

export default function ContributePage() {
  const t = useTranslations("contribute");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");

    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        setStatus("success");
        form.reset();
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-4">{t("title")}</h1>
      <p className="text-gray-600 mb-8">{t("intro")}</p>

      {status === "success" && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-4 mb-6">
          {t("success")}
        </div>
      )}

      {status === "error" && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 mb-6">
          {t("error")}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Honeypot — hidden from real users */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          className="absolute -left-[9999px]"
        />

        <div>
          <label className="block text-sm font-medium mb-1">
            {t("manufacturer")} *
          </label>
          <input
            name="manufacturer"
            required
            placeholder={t("manufacturerPlaceholder")}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            {t("model")} *
          </label>
          <input
            name="model"
            required
            placeholder={t("modelPlaceholder")}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              {t("yearFrom")}
            </label>
            <input
              name="yearFrom"
              type="number"
              min="1990"
              max="2099"
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              {t("yearTo")}
            </label>
            <input
              name="yearTo"
              type="number"
              min="1990"
              max="2099"
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            {t("pdfFile")} *
          </label>
          <input
            name="pdf"
            type="file"
            accept=".pdf,application/pdf"
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            {t("note")}
          </label>
          <textarea
            name="note"
            rows={3}
            placeholder={t("notePlaceholder")}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={status === "submitting"}
          className="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50"
        >
          {status === "submitting" ? "..." : t("submit")}
        </button>
      </form>
    </div>
  );
}
```

**Step 4: Verify the page renders**

Run: `npm run dev`
Navigate to `http://localhost:3000/de/contribute`
Expected: Form renders with all fields.

**Step 5: Commit**

```bash
git add src/app/api/submissions/route.ts src/app/\[locale\]/contribute/page.tsx src/messages/
git commit -m "feat: add community upload page and submission API"
```

---

### Task 10: Create admin review page and API routes

**Files:**
- Create: `src/app/api/admin/submissions/route.ts` — GET list, PATCH approve/reject
- Create: `src/app/admin/review/page.tsx`
- Modify: `src/lib/queries.ts` — add `getPendingSubmissions()` and `approveSubmission()` functions
- Modify: `.env.example` — add `ADMIN_PASSWORD`

**Step 1: Add query functions to `src/lib/queries.ts`**

Add these at the end of the file:

```typescript
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
  const fs = require("fs");
  const path = require("path");
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

  // Mark submission as approved
  db.prepare("UPDATE pending_submissions SET status = 'approved' WHERE id = ?").run(id);
}

export function rejectSubmission(id: number): void {
  const db = getDb();
  const submission = db
    .prepare("SELECT pdf_path FROM pending_submissions WHERE id = ?")
    .get(id) as { pdf_path: string } | undefined;
  if (!submission) throw new Error("Submission not found");

  // Delete PDF
  const fs = require("fs");
  const path = require("path");
  const absPath = path.join(process.cwd(), "data", "pdfs", submission.pdf_path);
  if (fs.existsSync(absPath)) {
    fs.unlinkSync(absPath);
  }

  db.prepare("UPDATE pending_submissions SET status = 'rejected' WHERE id = ?").run(id);
}
```

**Step 2: Create admin API route `src/app/api/admin/submissions/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  getPendingSubmissions,
  approveSubmission,
  rejectSubmission,
} from "@/lib/queries";

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
  const [, password] = decoded.split(":");
  return password === process.env.ADMIN_PASSWORD;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": "Basic realm=\"Admin\"" },
    });
  }
  const submissions = getPendingSubmissions();
  return NextResponse.json(submissions);
}

export async function PATCH(request: NextRequest) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": "Basic realm=\"Admin\"" },
    });
  }

  const body = await request.json();
  const { id, action } = body as { id: number; action: "approve" | "reject" };

  if (!id || !action) {
    return NextResponse.json({ error: "id and action required" }, { status: 400 });
  }

  try {
    if (action === "approve") {
      approveSubmission(id);
    } else {
      rejectSubmission(id);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
```

**Step 3: Create admin review page `src/app/admin/review/page.tsx`**

This page is NOT locale-routed (lives outside `[locale]`). It uses Basic Auth via the API.

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";

interface Submission {
  id: number;
  manufacturer_name: string;
  model_name: string;
  year_from: number | null;
  year_to: number | null;
  pdf_path: string;
  submitter_note: string | null;
  submitted_at: string;
}

export default function AdminReviewPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);

  const authHeader = `Basic ${btoa(`admin:${password}`)}`;

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/submissions", {
        headers: { Authorization: authHeader },
      });
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      const data = await res.json();
      setSubmissions(data);
      setAuthenticated(true);
    } catch {
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, [authHeader]);

  async function handleAction(id: number, action: "approve" | "reject") {
    await fetch("/api/admin/submissions", {
      method: "PATCH",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, action }),
    });
    fetchSubmissions();
  }

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <h1 className="text-2xl font-bold mb-4">Admin Review</h1>
        <input
          type="password"
          placeholder="Admin password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4"
        />
        <button
          onClick={fetchSubmissions}
          className="px-6 py-2 bg-gray-900 text-white rounded-lg"
        >
          Login
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">
        Pending Submissions ({submissions.length})
      </h1>

      {loading && <p>Loading...</p>}

      {submissions.length === 0 && !loading && (
        <p className="text-gray-500">No pending submissions.</p>
      )}

      <div className="space-y-4">
        {submissions.map((s) => (
          <div key={s.id} className="border rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="font-semibold">
                  {s.manufacturer_name} {s.model_name}
                </h2>
                <p className="text-sm text-gray-500">
                  {s.year_from && s.year_to
                    ? `${s.year_from}–${s.year_to}`
                    : s.year_from || s.year_to || "No year"}
                </p>
                {s.submitter_note && (
                  <p className="text-sm mt-1">Note: {s.submitter_note}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Submitted: {s.submitted_at}
                </p>
              </div>
              <div className="flex gap-2">
                <a
                  href={`/api/pdfs/${s.pdf_path}`}
                  target="_blank"
                  className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
                >
                  Preview PDF
                </a>
                <button
                  onClick={() => handleAction(s.id, "approve")}
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleAction(s.id, "reject")}
                  className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 4: Add `ADMIN_PASSWORD` to `.env.example`**

Add this line:
```
ADMIN_PASSWORD=changeme
```

**Step 5: Verify admin page renders**

Run: `npm run dev`
Navigate to `http://localhost:3000/admin/review`
Expected: Login form renders.

**Step 6: Commit**

```bash
git add src/app/api/admin/submissions/route.ts src/app/admin/review/page.tsx src/lib/queries.ts .env.example
git commit -m "feat: add admin review page with approve/reject for community submissions"
```

---

### Task 11: Add Contribute link to Header navigation

**Files:**
- Modify: `src/components/Header.tsx:14-26` — add Contribute link
- Modify: `src/messages/en.json` — add `nav.contribute`
- Modify: `src/messages/de.json` — add `nav.contribute`
- Modify: `src/messages/fr.json` — add `nav.contribute`
- Modify: `src/messages/it.json` — add `nav.contribute`

**Step 1: Add translation key to all 4 locale files**

Add to the `nav` section in each file:

- en.json: `"contribute": "Contribute"`
- de.json: `"contribute": "Beitragen"`
- fr.json: `"contribute": "Contribuer"`
- it.json: `"contribute": "Contribuire"`

**Step 2: Add link in Header.tsx**

After the Support link and before `<LanguageSwitcher />`, add:
```tsx
<Link href="/contribute" className="text-sm hover:text-gray-600">
  {t("contribute")}
</Link>
```

**Step 3: Verify navigation**

Run: `npm run dev`
Expected: "Contribute" link appears in nav and navigates to `/de/contribute`.

**Step 4: Commit**

```bash
git add src/components/Header.tsx src/messages/
git commit -m "feat: add Contribute link to header navigation"
```

---

## Phase D: Deployment Infrastructure

### Task 12: Revise docker-compose.yml for multi-app architecture

**Files:**
- Modify: `docker-compose.yml` — remove embedded Traefik, join external `web` network, add scraper cron
- Create: `scripts/traefik/docker-compose.yml` — shared Traefik proxy

**Step 1: Rewrite `docker-compose.yml`**

Replace the entire file:

```yaml
services:
  web:
    build: .
    restart: unless-stopped
    volumes:
      - app-data:/app/data
    environment:
      - DATABASE_PATH=/app/data/rescue-info.db
      - ADMIN_PASSWORD=${ADMIN_PASSWORD:-changeme}
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.rescueinfo.rule=Host(`${DOMAIN:-localhost}`)"
      - "traefik.http.routers.rescueinfo.entrypoints=websecure"
      - "traefik.http.routers.rescueinfo.tls.certresolver=letsencrypt"
      - "traefik.http.services.rescueinfo.loadbalancer.server.port=3000"
    networks:
      - web
      - default

  scraper:
    build: .
    restart: unless-stopped
    volumes:
      - app-data:/app/data
    environment:
      - DATABASE_PATH=/app/data/rescue-info.db
    entrypoint: ["sh", "-c", "while true; do node scripts/scraper/index.js; sleep 604800; done"]

volumes:
  app-data:

networks:
  web:
    external: true
```

**Step 2: Create `scripts/traefik/docker-compose.yml`**

```yaml
services:
  traefik:
    image: traefik:v3.0
    restart: unless-stopped
    command:
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--providers.docker.network=web"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL:-admin@example.com}"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--entrypoints.web.http.redirections.entrypoint.to=websecure"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - letsencrypt:/letsencrypt
    networks:
      - web

volumes:
  letsencrypt:

networks:
  web:
    name: web
```

**Step 3: Verify docker-compose config is valid**

Run: `docker compose config --quiet`
Expected: No errors.

**Step 4: Commit**

```bash
git add docker-compose.yml scripts/traefik/docker-compose.yml
git commit -m "feat: revise Docker setup for multi-app architecture with external Traefik"
```

---

### Task 13: Create server setup script

**Files:**
- Create: `scripts/server-setup.sh`

**Step 1: Create `scripts/server-setup.sh`**

This script is run once manually on a fresh DigitalOcean droplet.

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Rescue Info — Server Setup ==="

# 1. Install Docker (if not installed via marketplace image)
if ! command -v docker &>/dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

# 2. Install Docker Compose plugin (if not installed)
if ! docker compose version &>/dev/null; then
  echo "Installing Docker Compose plugin..."
  apt-get update && apt-get install -y docker-compose-plugin
fi

# 3. Create deploy user
if ! id deploy &>/dev/null; then
  echo "Creating deploy user..."
  adduser --disabled-password --gecos "" deploy
  usermod -aG docker deploy
  mkdir -p /home/deploy/.ssh
  cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
  chown -R deploy:deploy /home/deploy/.ssh
  chmod 700 /home/deploy/.ssh
  chmod 600 /home/deploy/.ssh/authorized_keys
  echo "deploy ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/deploy
fi

# 4. Configure UFW
echo "Configuring firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 5. Create shared Docker network
docker network create web 2>/dev/null || echo "Network 'web' already exists"

# 6. Set up Traefik
echo "Setting up Traefik..."
mkdir -p /opt/traefik
cat > /opt/traefik/.env <<'ENVEOF'
ACME_EMAIL=admin@example.com
ENVEOF

echo "Copy scripts/traefik/docker-compose.yml to /opt/traefik/ then run:"
echo "  cd /opt/traefik && docker compose up -d"

# 7. Set up Rescue Info app directory
echo "Setting up Rescue Info..."
mkdir -p /opt/rescue-info

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit /opt/traefik/.env with your ACME_EMAIL"
echo "  2. Copy traefik docker-compose.yml to /opt/traefik/"
echo "  3. cd /opt/traefik && docker compose up -d"
echo "  4. Clone repo to /opt/rescue-info/"
echo "  5. Create /opt/rescue-info/.env with DOMAIN and ADMIN_PASSWORD"
echo "  6. cd /opt/rescue-info && docker compose up -d --build"
echo "  7. Add GitHub Actions deploy key to repo secrets"
```

**Step 2: Make it executable**

Run: `chmod +x scripts/server-setup.sh`

**Step 3: Commit**

```bash
git add scripts/server-setup.sh
git commit -m "feat: add server setup script for DigitalOcean droplet"
```

---

### Task 14: Create GitHub Actions deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Step 1: Create `.github/workflows/deploy.yml`**

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_KEY }}
          script: |
            cd /opt/rescue-info
            git pull origin main
            docker compose up -d --build
```

**Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat: add GitHub Actions deploy workflow"
```

---

### Task 15: Add SQLite backup cron to Docker

**Files:**
- Create: `scripts/backup-db.sh`
- Modify: `docker-compose.yml` — add backup sidecar

**Step 1: Create `scripts/backup-db.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${DATABASE_PATH:-/app/data/rescue-info.db}"
BACKUP_DIR="/app/data/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/rescue-info_$TIMESTAMP.db'"

# Keep only last 4 backups
ls -t "$BACKUP_DIR"/rescue-info_*.db | tail -n +5 | xargs -r rm

echo "Backup complete: rescue-info_$TIMESTAMP.db"
```

**Step 2: Add backup service to `docker-compose.yml`**

Add after the `scraper` service:

```yaml
  backup:
    build: .
    restart: unless-stopped
    volumes:
      - app-data:/app/data
    environment:
      - DATABASE_PATH=/app/data/rescue-info.db
    entrypoint: ["sh", "-c", "while true; do sh scripts/backup-db.sh; sleep 604800; done"]
```

**Step 3: Make backup script executable**

Run: `chmod +x scripts/backup-db.sh`

**Step 4: Commit**

```bash
git add scripts/backup-db.sh docker-compose.yml
git commit -m "feat: add weekly SQLite backup with rotation"
```

---

### Task 16: Update Dockerfile for scraper support

**Files:**
- Modify: `Dockerfile` — ensure `data/pdfs` directory and sqlite3 CLI are available

**Step 1: Update Dockerfile**

Add `sqlite3` to the runner stage and ensure the pdfs directory structure is created:

After line `RUN mkdir -p /app/data && chown nextjs:nodejs /app/data`, add:
```dockerfile
RUN apk add --no-cache sqlite
RUN mkdir -p /app/data/pdfs/pending && chown -R nextjs:nodejs /app/data
```

Also add the scraper scripts to the runner stage. After the line that copies `scripts`, ensure node_modules for tsx/cheerio are also available. Since the scraper runs in a separate container with `build: .`, the full image with node_modules is available.

The scraper entrypoint uses `node scripts/scraper/index.js`, so we need the built output. Add to the builder stage, after `RUN npm run build`:
```dockerfile
RUN npx tsx scripts/scraper/index.ts --help 2>/dev/null || true
```

Actually, the scraper container uses `build: .` which means it gets the full build. The scraper needs to run as a tsx script. Update the scraper entrypoint in docker-compose.yml to use tsx:

In `docker-compose.yml`, change the scraper entrypoint to:
```yaml
entrypoint: ["sh", "-c", "while true; do npx tsx scripts/scraper/index.ts; sleep 604800; done"]
```

**Step 2: Verify Dockerfile builds**

Run: `docker build -t rescue-info-test .`
Expected: Build completes successfully.

**Step 3: Commit**

```bash
git add Dockerfile docker-compose.yml
git commit -m "feat: update Dockerfile with sqlite3 CLI and PDF directory structure"
```

---

## Phase E: Finalize

### Task 17: Update .env.example with all new variables

**Files:**
- Modify: `.env.example`

**Step 1: Update `.env.example`**

Replace contents with:
```
DOMAIN=rescue-info.example.ch
ACME_EMAIL=your-email@example.com
ADMIN_PASSWORD=changeme
DATABASE_PATH=/app/data/rescue-info.db
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: update .env.example with all environment variables"
```

---

### Task 18: Update CLAUDE.md with Phase 2 additions

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update CLAUDE.md**

Add these sections:

Under **Commands**, add:
```
npm run scrape     # Run all scraper adapters (downloads PDFs, updates DB)
```

Under **Architecture**, add a new subsection:

```markdown
### Scraper

Plugin-based scraper in `scripts/scraper/`. Each source has an adapter in `scripts/scraper/sources/` implementing `SourceAdapter` from `scripts/scraper/types.ts`. The runner (`scripts/scraper/index.ts`) loads all adapters dynamically, downloads PDFs to `data/pdfs/{manufacturer}/`, and upserts into SQLite.

### Community Uploads

Upload page at `/[locale]/contribute` — no auth required. Submissions go to `pending_submissions` table with PDFs saved to `data/pdfs/pending/`. Admin review at `/admin/review` (Basic Auth via `ADMIN_PASSWORD` env var). Approve moves PDF to final location and inserts into `rescue_cards`.

### Deployment

Multi-app Docker architecture. Traefik runs as a shared reverse proxy in `/opt/traefik/` on the `web` Docker network. This app joins that network. GitHub Actions deploys on push to `main` via SSH.
```

Under **Docker**, update to reflect the new setup:
```
Four services: `web` (Next.js), `scraper` (weekly cron), `backup` (weekly SQLite backup), plus external Traefik from `scripts/traefik/docker-compose.yml`.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with Phase 2 scraper, uploads, and deployment info"
```

---

## Summary

| Task | Phase | Description |
|------|-------|-------------|
| 1 | A | Install cheerio |
| 2 | A | Scraper types + runner framework |
| 3 | A | ADAC index adapter |
| 4 | A | Toyota DE adapter |
| 5 | A | Skoda adapter |
| 6 | A | rettungskarten-service.de adapter |
| 7 | B | PDF serving API route |
| 8 | C | pending_submissions table |
| 9 | C | Upload API + Contribute page |
| 10 | C | Admin review page + API |
| 11 | C | Contribute link in Header |
| 12 | D | Multi-app docker-compose + Traefik |
| 13 | D | Server setup script |
| 14 | D | GitHub Actions deploy workflow |
| 15 | D | SQLite backup cron |
| 16 | D | Dockerfile updates |
| 17 | E | .env.example update |
| 18 | E | CLAUDE.md update |
