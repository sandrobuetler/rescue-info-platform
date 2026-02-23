# Scraper, Community Uploads & Deployment — Design Document

**Date:** 2026-02-23
**Status:** Approved

## Overview

Phase 2 of the Rescue Info Platform: automated rescue card scraping from easy-to-scrape sources, community upload with moderation, PDF caching, and multi-app DigitalOcean deployment with automated CI/CD.

## 1. Scraper Architecture

Plugin-based scraper with one adapter module per data source.

```
scripts/scraper/
  index.ts          — runner: loads all adapters, executes, downloads PDFs, updates DB
  types.ts          — shared interfaces (SourceAdapter, ScrapedCard)
  sources/
    adac-index.ts   — scrapes ADAC page for manufacturer URL directory
    toyota.ts       — scrapes Toyota DE static HTML for direct PDF links
    skoda.ts        — scrapes Skoda per-model pages for PDF UUIDs
    rettungskarten-service.ts — scrapes rettungskarten-service.de for bulk PDFs
```

### Adapter Interface

```typescript
interface SourceAdapter {
  name: string;
  scrape(): Promise<ScrapedCard[]>;
}

interface ScrapedCard {
  manufacturer: string;
  model: string;
  yearFrom: number | null;
  yearTo: number | null;
  pdfUrl: string;
  sourceUrl: string;
  sourceName: string;
}
```

### Runner Flow

1. Load all adapters from `sources/`
2. Run each adapter's `scrape()` method
3. For each result: download PDF to `data/pdfs/`, upsert into SQLite
4. Log results per source (new, updated, failed)
5. Runs weekly via Docker cron sidecar

### Dependencies

`cheerio` for HTML parsing. Native `fetch` (Node 22+) for HTTP requests. No headless browser needed for Tier 1 sources.

### Initial Sources (Tier 1)

| Source | Method | Coverage |
|--------|--------|----------|
| ADAC index | Single HTML page, parse `<ul>` list | 50+ manufacturer portal URLs |
| Toyota DE | Static HTML, direct `<a href>` PDF links | ~70 models |
| Skoda | Per-model HTML pages, UUID-based PDFs | ~15 models, all generations |
| rettungskarten-service.de | WordPress, direct PDF links | 50+ brands, legacy cards |

### Future Sources (Tier 2, not in this phase)

BMW AOS (JS-rendered), Mercedes rk.mb-qr.com (PWA), Volvo CDN, VW idhub. These require headless browser or API reverse-engineering.

## 2. PDF Caching & Serving

**Storage path:** `data/pdfs/{manufacturer}/{model}_{yearFrom}-{yearTo}.pdf`

Example: `data/pdfs/toyota/corolla-e210_2019-2025.pdf`

**Scraper download:** Fetches PDF from source, saves to `data/pdfs/`, updates `rescue_cards.pdf_path` in SQLite.

**Serving:** New API route `/api/pdfs/[...path]` reads from `data/pdfs/` and streams with `Content-Type: application/pdf` and `Content-Disposition` headers. Required because `data/` is a Docker volume outside `public/`.

**Disk budget:** ~200KB-2MB per PDF. ~2,000 cards = ~1-4GB. Well within droplet capacity.

## 3. Community Upload Feature

### Upload Page (`/[locale]/contribute`)

Form fields:
- Manufacturer (select from existing or type new)
- Model name (text)
- Year range (from/to numbers)
- PDF file upload
- Optional note
- Honeypot field for spam protection

No authentication required. Submissions go into a pending queue.

### Admin Review (`/admin/review`)

- Protected by `ADMIN_PASSWORD` environment variable (simple shared password)
- Lists pending submissions with PDF preview
- Approve: moves to `rescue_cards` table + moves PDF from `data/pdfs/pending/` to `data/pdfs/`
- Reject: deletes submission and PDF

### Database

New table:
```sql
pending_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manufacturer_name TEXT NOT NULL,
  model_name TEXT NOT NULL,
  year_from INTEGER,
  year_to INTEGER,
  pdf_path TEXT NOT NULL,
  submitter_note TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'pending'
)
```

### Nav Update

Add "Contribute" link to Header navigation.

## 4. Multi-App DigitalOcean Deployment

### Server Architecture

```
/opt/
  traefik/              ← Shared reverse proxy (independent project)
    docker-compose.yml
    acme.json
  rescue-info/          ← This app
    docker-compose.yml
    .env
  future-app/           ← Any future app joins 'web' network
    docker-compose.yml
```

Traefik runs as its own Docker Compose project on a shared Docker network `web`. Each app joins the network and declares Traefik labels. Adding a new app requires no changes to Traefik or other apps.

### Droplet Specs

- DigitalOcean Frankfurt, $12/mo (2GB RAM, 1 vCPU, 50GB SSD)
- Ubuntu 24.04 LTS (Docker marketplace image)
- UFW firewall: ports 80, 443, 22 only

### Automated Deployment (GitHub Actions)

`.github/workflows/deploy.yml`: On push to `main`, SSH into droplet, pull, rebuild.

```
on push to main →
  SSH into droplet →
  cd /opt/rescue-info && git pull && docker compose up -d --build
```

GitHub Secrets: `DEPLOY_HOST`, `DEPLOY_KEY`, `DEPLOY_USER`

### Initial Server Setup Script (`scripts/server-setup.sh`)

Run once manually on a fresh droplet:
1. Install Docker + Docker Compose
2. Create `deploy` user with SSH key auth
3. Configure UFW firewall (80, 443, 22)
4. Create `/opt/traefik/` with shared Traefik config + `web` Docker network
5. Clone repo to `/opt/rescue-info/`
6. Initialize database

### Backups

- SQLite: weekly cron copies DB to `data/backups/` with timestamp
- DO droplet snapshots ($2.40/mo) for disaster recovery

### Docker Compose Updates

- Rescue-info `docker-compose.yml`: remove embedded Traefik service, join external `web` network
- Separate `traefik/docker-compose.yml` for the shared proxy

## Open Items

- Domain name and DNS provider
- Blog URL for backlinks
- GitHub Sponsors / Open Collective account setup
- ADMIN_PASSWORD value
- SSH key for GitHub Actions deploy
