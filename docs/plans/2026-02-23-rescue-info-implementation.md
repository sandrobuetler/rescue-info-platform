# Rescue Info Platform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a web platform for fast access to vehicle rescue cards (Rettungskarten) and Swiss safety resources, with i18n support (DE/FR/IT/EN).

**Architecture:** Single Next.js 15 App Router application with API routes, SQLite database via better-sqlite3, Tailwind CSS styling, next-intl for i18n. Dockerized with a separate scraper sidecar and Traefik reverse proxy.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, SQLite (better-sqlite3), next-intl, Docker, Traefik

**Design doc:** `docs/plans/2026-02-23-rescue-info-platform-design.md`

---

## Phase 1: Project Scaffolding

### Task 1: Initialize Next.js project

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`

**Step 1: Scaffold Next.js with TypeScript and Tailwind**

```bash
cd "/Users/sandrobutler/Library/CloudStorage/SynologyDrive-NASGeiselweid/01_Dokumente/2026/Projects/Rescue Info"
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

Accept defaults. This will create the full Next.js scaffold. Since the directory has existing files (README, LICENSE, docs/), it may prompt — proceed and let it merge.

**Step 2: Verify it runs**

```bash
npm run dev
```

Expected: Dev server starts on http://localhost:3000, default Next.js page renders.

**Step 3: Clean up default content**

Replace the default `src/app/page.tsx` with a minimal placeholder:

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-4xl font-bold">Rescue Info</h1>
    </main>
  );
}
```

Remove any default CSS from `src/app/globals.css` except the Tailwind directives:

```css
@import "tailwindcss";
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: initialize Next.js 15 project with TypeScript and Tailwind"
```

---

### Task 2: Add SQLite database layer

**Files:**
- Create: `src/lib/db.ts`
- Create: `scripts/init-db.ts`
- Create: `data/.gitkeep`
- Modify: `package.json` (add scripts and dependencies)
- Modify: `.gitignore` (ignore data/*.db and data/pdfs/)

**Step 1: Install better-sqlite3**

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3 tsx
```

**Step 2: Create the database module**

Create `src/lib/db.ts`:

```typescript
import Database from "better-sqlite3";
import path from "path";

const DB_PATH =
  process.env.DATABASE_PATH ||
  path.join(process.cwd(), "data", "rescue-info.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}
```

**Step 3: Create the init script**

Create `scripts/init-db.ts`:

```typescript
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

  CREATE INDEX IF NOT EXISTS idx_models_manufacturer ON models(manufacturer_id);
  CREATE INDEX IF NOT EXISTS idx_rescue_cards_model ON rescue_cards(model_id);
`);

console.log("Database initialized at", DB_PATH);
db.close();
```

**Step 4: Add script to package.json and update .gitignore**

Add to `package.json` scripts:
```json
"db:init": "tsx scripts/init-db.ts"
```

Add to `.gitignore`:
```
data/*.db
data/*.db-wal
data/*.db-shm
data/pdfs/
```

Create `data/.gitkeep` (empty file) so the directory is tracked.

**Step 5: Run init and verify**

```bash
npm run db:init
```

Expected: "Database initialized at .../data/rescue-info.db"

**Step 6: Commit**

```bash
git add src/lib/db.ts scripts/init-db.ts data/.gitkeep package.json package-lock.json .gitignore
git commit -m "feat: add SQLite database layer with schema init script"
```

---

### Task 3: Set up i18n with next-intl

**Files:**
- Create: `src/i18n/request.ts`
- Create: `src/i18n/routing.ts`
- Create: `src/i18n/navigation.ts`
- Create: `src/messages/de.json`
- Create: `src/messages/fr.json`
- Create: `src/messages/it.json`
- Create: `src/messages/en.json`
- Create: `src/middleware.ts`
- Create: `src/app/[locale]/layout.tsx`
- Create: `src/app/[locale]/page.tsx`
- Modify: `next.config.ts`
- Remove: `src/app/page.tsx`, `src/app/layout.tsx` (replaced by `[locale]` versions)

**Step 1: Install next-intl**

```bash
npm install next-intl
```

**Step 2: Create routing config**

Create `src/i18n/routing.ts`:

```typescript
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["de", "fr", "it", "en"],
  defaultLocale: "de",
});
```

**Step 3: Create i18n request config**

Create `src/i18n/request.ts`:

```typescript
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as typeof routing.locales[number])) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
```

**Step 4: Create navigation helpers**

Create `src/i18n/navigation.ts`:

```typescript
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
```

**Step 5: Create middleware**

Create `src/middleware.ts`:

```typescript
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: ["/", "/(de|fr|it|en)/:path*"],
};
```

**Step 6: Update next.config.ts**

```typescript
import { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);
```

**Step 7: Create message files**

Create `src/messages/en.json`:

```json
{
  "meta": {
    "title": "Rescue Info",
    "description": "Fast access to vehicle rescue cards and safety resources"
  },
  "nav": {
    "home": "Home",
    "safety": "Safety",
    "about": "About",
    "support": "Support",
    "legal": "Legal"
  },
  "home": {
    "title": "Find Your Vehicle Rescue Card",
    "subtitle": "Quick access to rescue cards (Rettungskarten) for first responders and car owners",
    "searchPlaceholder": "Search by manufacturer..."
  },
  "footer": {
    "disclaimer": "Not an official emergency service. Sources linked on each page.",
    "sourceCode": "Source code on GitHub",
    "blog": "Blog"
  }
}
```

Create `src/messages/de.json`:

```json
{
  "meta": {
    "title": "Rescue Info",
    "description": "Schneller Zugang zu Fahrzeug-Rettungskarten und Sicherheitsressourcen"
  },
  "nav": {
    "home": "Startseite",
    "safety": "Sicherheit",
    "about": "Über uns",
    "support": "Unterstützen",
    "legal": "Rechtliches"
  },
  "home": {
    "title": "Finden Sie Ihre Fahrzeug-Rettungskarte",
    "subtitle": "Schneller Zugang zu Rettungskarten für Ersthelfer und Fahrzeugbesitzer",
    "searchPlaceholder": "Nach Hersteller suchen..."
  },
  "footer": {
    "disclaimer": "Kein offizieller Rettungsdienst. Quellen auf jeder Seite verlinkt.",
    "sourceCode": "Quellcode auf GitHub",
    "blog": "Blog"
  }
}
```

Create `src/messages/fr.json`:

```json
{
  "meta": {
    "title": "Rescue Info",
    "description": "Accès rapide aux fiches de secours véhicules et ressources de sécurité"
  },
  "nav": {
    "home": "Accueil",
    "safety": "Sécurité",
    "about": "À propos",
    "support": "Soutenir",
    "legal": "Mentions légales"
  },
  "home": {
    "title": "Trouvez la fiche de secours de votre véhicule",
    "subtitle": "Accès rapide aux fiches de secours pour les premiers intervenants et propriétaires de véhicules",
    "searchPlaceholder": "Rechercher par constructeur..."
  },
  "footer": {
    "disclaimer": "Ce n'est pas un service d'urgence officiel. Sources liées sur chaque page.",
    "sourceCode": "Code source sur GitHub",
    "blog": "Blog"
  }
}
```

Create `src/messages/it.json`:

```json
{
  "meta": {
    "title": "Rescue Info",
    "description": "Accesso rapido alle schede di soccorso veicoli e risorse di sicurezza"
  },
  "nav": {
    "home": "Home",
    "safety": "Sicurezza",
    "about": "Chi siamo",
    "support": "Sostieni",
    "legal": "Note legali"
  },
  "home": {
    "title": "Trova la scheda di soccorso del tuo veicolo",
    "subtitle": "Accesso rapido alle schede di soccorso per primi soccorritori e proprietari di veicoli",
    "searchPlaceholder": "Cerca per costruttore..."
  },
  "footer": {
    "disclaimer": "Non è un servizio di emergenza ufficiale. Fonti collegate in ogni pagina.",
    "sourceCode": "Codice sorgente su GitHub",
    "blog": "Blog"
  }
}
```

**Step 8: Create locale layout**

Delete `src/app/layout.tsx` and `src/app/page.tsx`. Create `src/app/[locale]/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import "../globals.css";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as typeof routing.locales[number])) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

**Step 9: Create locale homepage**

Create `src/app/[locale]/page.tsx`:

```tsx
import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("home");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">{t("title")}</h1>
      <p className="text-lg text-gray-600 mb-8">{t("subtitle")}</p>
    </main>
  );
}
```

**Step 10: Verify**

```bash
npm run dev
```

Visit http://localhost:3000 — should redirect to /de/
Visit http://localhost:3000/en — should show English text
Visit http://localhost:3000/fr — should show French text

**Step 11: Commit**

```bash
git add -A
git commit -m "feat: add i18n setup with next-intl (DE/FR/IT/EN)"
```

---

## Phase 2: Core Layout & Navigation

### Task 4: Create shared layout components (Header, Footer, LanguageSwitcher)

**Files:**
- Create: `src/components/Header.tsx`
- Create: `src/components/Footer.tsx`
- Create: `src/components/LanguageSwitcher.tsx`
- Modify: `src/app/[locale]/layout.tsx` (add Header and Footer)

**Step 1: Create LanguageSwitcher**

Create `src/components/LanguageSwitcher.tsx`:

```tsx
"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const localeLabels: Record<string, string> = {
  de: "DE",
  fr: "FR",
  it: "IT",
  en: "EN",
};

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function onChange(nextLocale: string) {
    router.replace(pathname, { locale: nextLocale });
  }

  return (
    <div className="flex gap-2">
      {routing.locales.map((l) => (
        <button
          key={l}
          onClick={() => onChange(l)}
          className={`text-sm px-2 py-1 rounded ${
            l === locale
              ? "bg-gray-900 text-white"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          {localeLabels[l]}
        </button>
      ))}
    </div>
  );
}
```

**Step 2: Create Header**

Create `src/components/Header.tsx`:

```tsx
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "./LanguageSwitcher";

export default function Header() {
  const t = useTranslations("nav");

  return (
    <header className="border-b border-gray-200">
      <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold">
          Rescue Info
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/" className="text-sm hover:text-gray-600">
            {t("home")}
          </Link>
          <Link href="/safety" className="text-sm hover:text-gray-600">
            {t("safety")}
          </Link>
          <Link href="/about" className="text-sm hover:text-gray-600">
            {t("about")}
          </Link>
          <Link href="/support" className="text-sm hover:text-gray-600">
            {t("support")}
          </Link>
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  );
}
```

**Step 3: Create Footer**

Create `src/components/Footer.tsx`:

```tsx
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function Footer() {
  const t = useTranslations("footer");

  return (
    <footer className="border-t border-gray-200 mt-auto">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-gray-500">{t("disclaimer")}</p>
          <div className="flex gap-4 text-sm">
            <Link href="/legal" className="text-gray-500 hover:text-gray-700">
              Legal
            </Link>
            <a
              href="#"
              className="text-gray-500 hover:text-gray-700"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("blog")}
            </a>
            <a
              href="https://github.com"
              className="text-gray-500 hover:text-gray-700"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("sourceCode")}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
```

**Step 4: Update locale layout to include Header and Footer**

Modify `src/app/[locale]/layout.tsx` body content to:

```tsx
<body className="flex flex-col min-h-screen">
  <NextIntlClientProvider messages={messages}>
    <Header />
    <main className="flex-1">{children}</main>
    <Footer />
  </NextIntlClientProvider>
</body>
```

Add imports for Header and Footer at top.

**Step 5: Update homepage — remove redundant wrapper**

Update `src/app/[locale]/page.tsx`:

```tsx
import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("home");

  return (
    <div className="max-w-5xl mx-auto px-4 py-16 text-center">
      <h1 className="text-4xl font-bold mb-4">{t("title")}</h1>
      <p className="text-lg text-gray-600 mb-8">{t("subtitle")}</p>
    </div>
  );
}
```

**Step 6: Verify**

```bash
npm run dev
```

Check: header with nav links, footer with disclaimer, language switcher works across locales.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Header, Footer, and LanguageSwitcher components"
```

---

## Phase 3: Vehicle Search API & Database Queries

### Task 5: Create database query functions

**Files:**
- Create: `src/lib/queries.ts`
- Create: `scripts/seed-sample-data.ts`
- Modify: `package.json` (add seed script)

**Step 1: Create query module**

Create `src/lib/queries.ts`:

```typescript
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
```

**Step 2: Create sample seed script**

Create `scripts/seed-sample-data.ts`:

```typescript
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
```

Add to `package.json` scripts:
```json
"db:seed": "tsx scripts/seed-sample-data.ts"
```

**Step 3: Run seed and verify**

```bash
npm run db:init && npm run db:seed
```

Expected: "Database initialized..." then "Sample data seeded."

**Step 4: Commit**

```bash
git add src/lib/queries.ts scripts/seed-sample-data.ts package.json package-lock.json
git commit -m "feat: add database query functions and sample seed script"
```

---

### Task 6: Create search API route

**Files:**
- Create: `src/app/api/vehicles/search/route.ts`
- Create: `src/app/api/vehicles/manufacturers/route.ts`
- Create: `src/app/api/vehicles/models/route.ts`

**Step 1: Create manufacturer list endpoint**

Create `src/app/api/vehicles/manufacturers/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getManufacturers } from "@/lib/queries";

export async function GET() {
  const manufacturers = getManufacturers();
  return NextResponse.json(manufacturers);
}
```

**Step 2: Create models endpoint**

Create `src/app/api/vehicles/models/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getModelsByManufacturer } from "@/lib/queries";

export async function GET(request: NextRequest) {
  const manufacturerId = request.nextUrl.searchParams.get("manufacturer_id");

  if (!manufacturerId) {
    return NextResponse.json(
      { error: "manufacturer_id is required" },
      { status: 400 }
    );
  }

  const models = getModelsByManufacturer(Number(manufacturerId));
  return NextResponse.json(models);
}
```

**Step 3: Create search endpoint**

Create `src/app/api/vehicles/search/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { searchRescueCards } from "@/lib/queries";

export async function GET(request: NextRequest) {
  const make = request.nextUrl.searchParams.get("make") || undefined;
  const model = request.nextUrl.searchParams.get("model") || undefined;
  const yearStr = request.nextUrl.searchParams.get("year");
  const year = yearStr ? Number(yearStr) : undefined;

  const results = searchRescueCards({ make, model, year });
  return NextResponse.json(results);
}
```

**Step 4: Verify**

```bash
npm run dev
```

Test: `curl http://localhost:3000/api/vehicles/manufacturers`
Expected: JSON array with BMW, Toyota, Volkswagen

Test: `curl "http://localhost:3000/api/vehicles/search?make=BMW"`
Expected: JSON array with BMW rescue cards

**Step 5: Commit**

```bash
git add src/app/api/
git commit -m "feat: add vehicle search API routes"
```

---

## Phase 4: Search UI

### Task 7: Build vehicle search component

**Files:**
- Create: `src/components/VehicleSearch.tsx`
- Modify: `src/app/[locale]/page.tsx` (add search component)
- Modify: `src/messages/en.json`, `de.json`, `fr.json`, `it.json` (add search messages)

**Step 1: Add search-related translations to all message files**

Add to each locale file under `"search"` key:

For `en.json`:
```json
"search": {
  "selectManufacturer": "Select manufacturer",
  "selectModel": "Select model",
  "enterYear": "Year (optional)",
  "searchButton": "Find Rescue Card",
  "noResults": "No rescue cards found for this vehicle.",
  "loading": "Searching..."
}
```

For `de.json`:
```json
"search": {
  "selectManufacturer": "Hersteller wählen",
  "selectModel": "Modell wählen",
  "enterYear": "Jahrgang (optional)",
  "searchButton": "Rettungskarte finden",
  "noResults": "Keine Rettungskarten für dieses Fahrzeug gefunden.",
  "loading": "Suche läuft..."
}
```

For `fr.json`:
```json
"search": {
  "selectManufacturer": "Choisir le constructeur",
  "selectModel": "Choisir le modèle",
  "enterYear": "Année (optionnel)",
  "searchButton": "Trouver la fiche de secours",
  "noResults": "Aucune fiche de secours trouvée pour ce véhicule.",
  "loading": "Recherche en cours..."
}
```

For `it.json`:
```json
"search": {
  "selectManufacturer": "Seleziona costruttore",
  "selectModel": "Seleziona modello",
  "enterYear": "Anno (opzionale)",
  "searchButton": "Trova scheda di soccorso",
  "noResults": "Nessuna scheda di soccorso trovata per questo veicolo.",
  "loading": "Ricerca in corso..."
}
```

**Step 2: Create VehicleSearch component**

Create `src/components/VehicleSearch.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

interface Manufacturer {
  id: number;
  name: string;
}

interface Model {
  id: number;
  name: string;
}

export default function VehicleSearch() {
  const t = useTranslations("search");
  const router = useRouter();

  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedMake, setSelectedMake] = useState("");
  const [selectedMakeId, setSelectedMakeId] = useState<number | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [year, setYear] = useState("");

  useEffect(() => {
    fetch("/api/vehicles/manufacturers")
      .then((res) => res.json())
      .then(setManufacturers);
  }, []);

  useEffect(() => {
    if (selectedMakeId) {
      fetch(`/api/vehicles/models?manufacturer_id=${selectedMakeId}`)
        .then((res) => res.json())
        .then(setModels);
    } else {
      setModels([]);
    }
    setSelectedModel("");
  }, [selectedMakeId]);

  function handleManufacturerChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const mfr = manufacturers.find((m) => m.id === Number(e.target.value));
    setSelectedMakeId(mfr ? mfr.id : null);
    setSelectedMake(mfr ? mfr.name : "");
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMake) return;

    const params = new URLSearchParams();
    params.set("make", selectedMake);
    if (selectedModel) params.set("model", selectedModel);
    if (year) params.set("year", year);

    router.push(`/search?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSearch} className="w-full max-w-md mx-auto space-y-4">
      <select
        value={selectedMakeId ?? ""}
        onChange={handleManufacturerChange}
        className="w-full p-3 border border-gray-300 rounded-lg text-lg"
      >
        <option value="">{t("selectManufacturer")}</option>
        {manufacturers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

      <select
        value={selectedModel}
        onChange={(e) => setSelectedModel(e.target.value)}
        disabled={!selectedMakeId}
        className="w-full p-3 border border-gray-300 rounded-lg text-lg disabled:opacity-50"
      >
        <option value="">{t("selectModel")}</option>
        {models.map((m) => (
          <option key={m.id} value={m.name}>
            {m.name}
          </option>
        ))}
      </select>

      <input
        type="number"
        value={year}
        onChange={(e) => setYear(e.target.value)}
        placeholder={t("enterYear")}
        min="1990"
        max="2030"
        className="w-full p-3 border border-gray-300 rounded-lg text-lg"
      />

      <button
        type="submit"
        disabled={!selectedMake}
        className="w-full p-3 bg-red-600 text-white rounded-lg text-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {t("searchButton")}
      </button>
    </form>
  );
}
```

**Step 3: Add to homepage**

Update `src/app/[locale]/page.tsx`:

```tsx
import { useTranslations } from "next-intl";
import VehicleSearch from "@/components/VehicleSearch";

export default function Home() {
  const t = useTranslations("home");

  return (
    <div className="max-w-5xl mx-auto px-4 py-16 text-center">
      <h1 className="text-4xl font-bold mb-4">{t("title")}</h1>
      <p className="text-lg text-gray-600 mb-8">{t("subtitle")}</p>
      <VehicleSearch />
    </div>
  );
}
```

**Step 4: Verify**

```bash
npm run dev
```

Homepage should show dropdowns populated from the database. Select BMW → models load → click search.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add vehicle search component with cascading dropdowns"
```

---

### Task 8: Create search results page

**Files:**
- Create: `src/app/[locale]/search/page.tsx`

**Step 1: Create search results page**

Create `src/app/[locale]/search/page.tsx`:

```tsx
import { searchRescueCards } from "@/lib/queries";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

type Props = {
  searchParams: Promise<{ make?: string; model?: string; year?: string }>;
};

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const t = await getTranslations("search");

  const results = searchRescueCards({
    make: params.make,
    model: params.model,
    year: params.year ? Number(params.year) : undefined,
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">
        {params.make} {params.model} {params.year}
      </h1>

      {results.length === 0 ? (
        <p className="text-gray-500">{t("noResults")}</p>
      ) : (
        <div className="space-y-4">
          {results.map((card) => (
            <div
              key={card.id}
              className="border border-gray-200 rounded-lg p-4 hover:border-gray-400"
            >
              <Link
                href={`/vehicle/${encodeURIComponent(card.manufacturer_name.toLowerCase())}/${encodeURIComponent(card.model_name.toLowerCase())}/${card.year_from ?? "all"}`}
                className="block"
              >
                <h2 className="text-lg font-semibold">
                  {card.manufacturer_name} {card.model_name}
                </h2>
                <p className="text-sm text-gray-500">
                  {card.year_from}–{card.year_to} · {card.source_name}
                </p>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify**

```bash
npm run dev
```

Search for BMW on homepage → should navigate to /de/search?make=BMW → see results.

**Step 3: Commit**

```bash
git add src/app/\[locale\]/search/
git commit -m "feat: add search results page"
```

---

### Task 9: Create rescue card detail page

**Files:**
- Create: `src/app/[locale]/vehicle/[make]/[model]/[year]/page.tsx`

**Step 1: Create detail page**

Create `src/app/[locale]/vehicle/[make]/[model]/[year]/page.tsx`:

```tsx
import { getRescueCard } from "@/lib/queries";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ make: string; model: string; year: string }>;
};

export default async function VehicleDetailPage({ params }: Props) {
  const { make, model, year } = await params;
  const t = await getTranslations();

  const card = getRescueCard(
    decodeURIComponent(make),
    decodeURIComponent(model),
    year === "all" ? 0 : Number(year)
  );

  if (!card) {
    notFound();
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">
        {card.manufacturer_name} {card.model_name}
      </h1>
      <p className="text-gray-500 mb-6">
        {card.year_from}–{card.year_to}
      </p>

      <div className="bg-gray-50 rounded-lg p-6 mb-6">
        {card.pdf_path ? (
          <a
            href={`/data/pdfs/${card.pdf_path}`}
            download
            className="inline-block px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700"
          >
            Download Rescue Card (PDF)
          </a>
        ) : (
          <a
            href={card.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700"
          >
            View Rescue Card (External)
          </a>
        )}
      </div>

      <div className="text-sm text-gray-500 border-t pt-4">
        <p>
          Source:{" "}
          <a
            href={card.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-700"
          >
            {card.source_name}
          </a>
        </p>
        <p>Last updated: {card.last_updated}</p>
        <p className="mt-2 italic">
          This platform is not affiliated with {card.manufacturer_name}. Rescue
          cards are sourced from publicly available resources. Always verify with
          the official manufacturer.
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Verify**

Navigate to a vehicle from the search results. Should show detail with download/external link and disclaimer.

**Step 3: Commit**

```bash
git add src/app/\[locale\]/vehicle/
git commit -m "feat: add rescue card detail page with source attribution"
```

---

## Phase 5: Content Pages

### Task 10: Create static content pages (About, Legal, Support, Safety)

**Files:**
- Create: `src/app/[locale]/about/page.tsx`
- Create: `src/app/[locale]/legal/page.tsx`
- Create: `src/app/[locale]/support/page.tsx`
- Create: `src/app/[locale]/safety/page.tsx`
- Modify: all message JSON files (add page content keys)

**Step 1: Add content translations**

Add to each message file the following keys (showing `en.json` — translate for others):

```json
"about": {
  "title": "About Rescue Info",
  "intro": "Rescue Info is an independent, non-commercial open-source project that makes vehicle rescue cards (Rettungskarten) easily accessible for car owners and first responders in Switzerland.",
  "disclaimer": "This platform is not affiliated with any car manufacturer, rescue organization, or government body. Rescue cards are sourced from publicly available manufacturer and aggregator resources. We do not guarantee completeness or accuracy. This platform is not a substitute for professional emergency training.",
  "openSource": "This project is open-source and licensed under GPL-3.0.",
  "blogLabel": "Author's Blog"
},
"legal": {
  "title": "Legal Information",
  "impressumTitle": "Impressum",
  "impressumContent": "[Your name and contact information here]",
  "privacyTitle": "Privacy Policy",
  "privacyContent": "This website does not collect personal data. No user accounts are required. No cookies are used for tracking purposes.",
  "licenseTitle": "License",
  "licenseContent": "This project is licensed under the GNU General Public License v3.0.",
  "disclaimerTitle": "Disclaimer",
  "disclaimerContent": "The information provided on this platform is for general informational purposes only. While we strive to keep the information up to date and correct, we make no representations or warranties of any kind about the completeness, accuracy, or reliability of the information. Rescue cards are sourced from publicly available resources and may not reflect the latest updates from manufacturers."
},
"support": {
  "title": "Support This Project",
  "intro": "Rescue Info is a free, open-source project. If you find it useful, you can support its development and hosting costs.",
  "githubSponsors": "Support via GitHub Sponsors",
  "openCollective": "Support via Open Collective"
},
"safety": {
  "title": "Safety Resources",
  "intro": "Curated safety information and resources for Switzerland. Every piece of information links to its original source.",
  "emergencyNumbers": "Emergency Numbers",
  "emergencyNumbersList": "Police: 117 | Fire: 118 | Ambulance: 144 | REGA: 1414 | Toxicology: 145",
  "usefulLinks": "Useful Links",
  "sourceLabel": "Source"
}
```

Add equivalent translations to `de.json`, `fr.json`, `it.json`.

**Step 2: Create about page**

Create `src/app/[locale]/about/page.tsx`:

```tsx
import { useTranslations } from "next-intl";

export default function AboutPage() {
  const t = useTranslations("about");

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">{t("title")}</h1>
      <p className="mb-4">{t("intro")}</p>
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <p className="text-sm">{t("disclaimer")}</p>
      </div>
      <p className="mb-4">{t("openSource")}</p>
      <a
        href="#"
        target="_blank"
        rel="noopener noreferrer"
        className="text-red-600 hover:underline"
      >
        {t("blogLabel")} →
      </a>
    </div>
  );
}
```

**Step 3: Create legal page**

Create `src/app/[locale]/legal/page.tsx`:

```tsx
import { useTranslations } from "next-intl";

export default function LegalPage() {
  const t = useTranslations("legal");

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">{t("title")}</h1>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">{t("impressumTitle")}</h2>
        <p>{t("impressumContent")}</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">{t("privacyTitle")}</h2>
        <p>{t("privacyContent")}</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">{t("licenseTitle")}</h2>
        <p>{t("licenseContent")}</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">{t("disclaimerTitle")}</h2>
        <p>{t("disclaimerContent")}</p>
      </section>
    </div>
  );
}
```

**Step 4: Create support page**

Create `src/app/[locale]/support/page.tsx`:

```tsx
import { useTranslations } from "next-intl";

export default function SupportPage() {
  const t = useTranslations("support");

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">{t("title")}</h1>
      <p className="mb-6">{t("intro")}</p>
      <div className="space-y-4">
        <a
          href="#"
          className="block p-4 border border-gray-200 rounded-lg hover:border-gray-400"
        >
          {t("githubSponsors")} →
        </a>
        <a
          href="#"
          className="block p-4 border border-gray-200 rounded-lg hover:border-gray-400"
        >
          {t("openCollective")} →
        </a>
      </div>
    </div>
  );
}
```

**Step 5: Create safety hub page**

Create `src/app/[locale]/safety/page.tsx`:

```tsx
import { useTranslations } from "next-intl";

const safetyLinks = [
  { name: "TCS (Touring Club Schweiz)", url: "https://www.tcs.ch" },
  { name: "BFU (Beratungsstelle für Unfallverhütung)", url: "https://www.bfu.ch" },
  { name: "REGA (Schweizerische Rettungsflugwacht)", url: "https://www.rega.ch" },
  { name: "ADAC Rettungskarten", url: "https://www.adac.de/rund-ums-fahrzeug/unfall-schaden-panne/rettungskarte/" },
  { name: "Euro NCAP Rescue Sheets", url: "https://www.euroncap.com/en/vehicle-safety/rescue-sheets/" },
];

export default function SafetyPage() {
  const t = useTranslations("safety");

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">{t("title")}</h1>
      <p className="mb-8">{t("intro")}</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">{t("emergencyNumbers")}</h2>
        <p className="text-lg">{t("emergencyNumbersList")}</p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">{t("usefulLinks")}</h2>
        <div className="space-y-3">
          {safetyLinks.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 border border-gray-200 rounded-lg hover:border-gray-400"
            >
              <span className="font-medium">{link.name}</span>
              <span className="block text-sm text-gray-500">
                {t("sourceLabel")}: {link.url}
              </span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
```

**Step 6: Verify**

```bash
npm run dev
```

Navigate to /de/about, /de/legal, /de/support, /de/safety — all should render with translations.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: add About, Legal, Support, and Safety pages with translations"
```

---

## Phase 6: Docker & Deployment

### Task 11: Create Dockerfile and Docker Compose

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`
- Create: `scripts/scraper-cron.sh`

**Step 1: Create .dockerignore**

Create `.dockerignore`:

```
node_modules
.next
.git
data/*.db
data/pdfs/
*.md
docs/
```

**Step 2: Create Dockerfile**

Create `Dockerfile`:

```dockerfile
FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./package.json

RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

**Step 3: Update next.config.ts for standalone output**

Add to `next.config.ts`:

```typescript
const nextConfig: NextConfig = {
  output: "standalone",
};
```

**Step 4: Create docker-compose.yml**

Create `docker-compose.yml`:

```yaml
services:
  web:
    build: .
    restart: unless-stopped
    volumes:
      - app-data:/app/data
    environment:
      - DATABASE_PATH=/app/data/rescue-info.db
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.rescueinfo.rule=Host(`${DOMAIN:-localhost}`)"
      - "traefik.http.routers.rescueinfo.entrypoints=websecure"
      - "traefik.http.routers.rescueinfo.tls.certresolver=letsencrypt"
      - "traefik.http.services.rescueinfo.loadbalancer.server.port=3000"

  scraper:
    build: .
    restart: unless-stopped
    volumes:
      - app-data:/app/data
    environment:
      - DATABASE_PATH=/app/data/rescue-info.db
    entrypoint: ["sh", "-c", "while true; do node scripts/scrape.js; sleep 604800; done"]

  traefik:
    image: traefik:v3.0
    restart: unless-stopped
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
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

volumes:
  app-data:
  letsencrypt:
```

**Step 5: Create .env.example**

Create `.env.example`:

```
DOMAIN=rescue-info.example.ch
ACME_EMAIL=your-email@example.com
```

**Step 6: Verify Docker build locally**

```bash
docker build -t rescue-info .
```

Expected: Build completes successfully.

**Step 7: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore .env.example
git commit -m "feat: add Docker and Docker Compose setup with Traefik"
```

---

## Phase 7: Update CLAUDE.md

### Task 12: Update CLAUDE.md with project details

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Replace CLAUDE.md with full project context**

Update `CLAUDE.md` with all commands, architecture, and conventions established during implementation.

Key sections to include:
- Build/dev/lint commands: `npm run dev`, `npm run build`, `npm run lint`
- Database commands: `npm run db:init`, `npm run db:seed`
- Docker: `docker compose up -d --build`
- Architecture overview: Next.js App Router, `src/` layout, i18n routing, SQLite
- File structure: `src/app/[locale]/`, `src/components/`, `src/lib/`, `src/messages/`, `scripts/`
- i18n: 4 locales, `next-intl`, message files in `src/messages/`

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with full project documentation"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1: Scaffolding | Tasks 1-3 | Next.js + SQLite + i18n working |
| 2: Layout | Task 4 | Header, footer, language switcher |
| 3: Search API | Tasks 5-6 | Database queries + REST API |
| 4: Search UI | Tasks 7-9 | Vehicle search → results → detail page |
| 5: Content | Task 10 | About, Legal, Support, Safety pages |
| 6: Docker | Task 11 | Production-ready Docker Compose |
| 7: Docs | Task 12 | Updated CLAUDE.md |

**Not included in this plan (future work):**
- Scraper implementation (requires investigation of aggregator APIs)
- PDF caching and serving
- VIN lookup
- Individual safety topic pages (`/safety/[slug]`)
- Analytics
- Actual deployment to DigitalOcean
