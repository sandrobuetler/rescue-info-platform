# Rescue Info Platform — Design Document

**Date:** 2026-02-23
**Status:** Approved

## Overview

A web platform providing fast access to vehicle rescue cards (Rettungskarten) and curated safety resources for Switzerland. Primary users: car owners looking up their rescue card, and first responders needing immediate access at accident scenes.

## Tech Stack

- **Framework:** Next.js 15 (App Router) with SSR
- **Styling:** Tailwind CSS
- **Database:** SQLite via `better-sqlite3`
- **i18n:** `next-intl` — DE, FR, IT, EN
- **Deployment:** DigitalOcean droplet (Frankfurt), Docker Compose
- **License:** GPL-3.0

## Architecture

Single Next.js application handling both frontend and API routes. SQLite database stores vehicle catalog. Scraper runs as a separate Docker container on a weekly cron schedule. Traefik reverse proxy handles SSL and routing (supports multiple apps on the same server).

```
Docker Compose:
  web       → Next.js app (port 3000)
  scraper   → Node.js cron script (weekly)
  proxy     → Traefik (ports 80/443, Let's Encrypt SSL)

Shared volume:
  data/rescue-info.db   → SQLite database
  data/pdfs/            → Cached rescue card PDFs
```

## Data Model

```sql
manufacturers (id, name, logo_url)
models (id, manufacturer_id, name)
rescue_cards (id, model_id, year_from, year_to, pdf_path, source_url, source_name, last_updated)
```

- `pdf_path`: local cached PDF on disk
- `source_url`: original manufacturer/aggregator URL (always displayed for transparency)
- `source_name`: e.g. "ADAC", "Euro NCAP", "BMW AG"

## Scraper

Standalone Node.js script (`scripts/scrape.ts`). Runs weekly via cron in a Docker sidecar container.

Pipeline per source:
1. Fetch vehicle list from aggregator/manufacturer
2. Compare with existing DB entries
3. Download new/updated PDFs to `data/pdfs/`
4. Update SQLite
5. Log results, flag failures

Initial sources: ADAC Rettungskarten database, Euro NCAP, direct manufacturer links.

## Page Structure

| Route | Purpose |
|-------|---------|
| `/[locale]/` | Homepage — prominent search bar, brief explainer |
| `/[locale]/search` | Vehicle selector (make → model → year) |
| `/[locale]/vehicle/[make]/[model]/[year]` | Rescue card detail — PDF viewer/download |
| `/[locale]/safety` | Safety resources hub with source-attributed info |
| `/[locale]/safety/[slug]` | Individual safety topic page |
| `/[locale]/about` | About, disclaimer, blog backlink |
| `/[locale]/support` | GitHub Sponsors / Open Collective |
| `/[locale]/legal` | Impressum, privacy policy, disclaimers |

## Search API

`/api/vehicles/search` — query params: `make`, `model`, `year`, optionally `vin`. Returns matching rescue cards with download links.

## User Flows

**Car owner:** Homepage → search (make/model/year) → download rescue card PDF. 3 clicks to PDF.

**First responder:** Same flow, optimized for mobile speed. Search is the hero element — no filler.

## i18n

Middleware-based locale routing (`/de/`, `/fr/`, `/it/`, `/en/`). UI and content pages translated via `next-intl`. Vehicle data and rescue card PDFs are language-neutral (or per-language when manufacturers provide variants).

## Legal & Disclaimers

- Not affiliated with manufacturers or emergency services
- Rescue cards sourced from public resources; no guarantee of completeness
- Not a substitute for professional emergency training
- Short disclaimer on every rescue card page; full text on legal page
- Impressum required under Swiss law (operator name/contact)
- Privacy policy (minimal — no user accounts)
- GPL-3.0 notice with link to repo

## Support & Attribution

- Support page with GitHub Sponsors / Open Collective links
- Blog backlink in footer and about page (URL TBD)
- Every safety info page shows source attribution prominently
- Footer: language switcher, legal links, blog, GitHub source link

## Deployment

- DigitalOcean droplet (Frankfurt region)
- Docker Compose with Traefik reverse proxy
- Domain TBD
- Deploy: push to main → SSH pull + `docker compose up -d --build`
- Multi-app capable: Traefik routes multiple domains to different containers

## Open Items

- Domain name
- Blog URL for backlinks
- Specific aggregator API access (ADAC, Euro NCAP — may need investigation)
- GitHub Sponsors vs Open Collective (or both)
