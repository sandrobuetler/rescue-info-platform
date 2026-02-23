# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Rescue Info Platform** — a web app providing fast access to vehicle rescue cards (Rettungskarten) and curated Swiss safety resources. Primary users: car owners and first responders at accident scenes.

- License: GPL-3.0
- Languages: DE (default), FR, IT, EN

## Commands

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build (standalone output for Docker)
npm run lint         # ESLint
npm run db:init      # Initialize SQLite database schema
npm run db:seed      # Seed sample vehicle data (BMW, VW, Toyota)
npm run scrape       # Run all scraper adapters (downloads PDFs, updates DB)
```

## Architecture

**Stack:** Next.js (App Router, SSR) + TypeScript + Tailwind CSS v4 + SQLite (better-sqlite3) + next-intl

**Single Next.js app** with API routes for vehicle search. SQLite stores the vehicle/rescue card catalog. Designed to run in Docker with a Traefik reverse proxy and a scraper sidecar container.

### Key Directories

- `src/app/[locale]/` — All pages use locale-based routing (de/fr/it/en)
- `src/app/api/vehicles/` — REST API: `/manufacturers`, `/models`, `/search`
- `src/app/api/pdfs/` — PDF serving from `data/pdfs/` with traversal protection
- `src/app/api/submissions/` — Community upload endpoint (POST)
- `src/app/api/admin/` — Admin review API (Basic Auth via ADMIN_PASSWORD)
- `src/app/admin/review/` — Admin moderation page (outside locale routing)
- `src/components/` — Shared components (Header, Footer, LanguageSwitcher, VehicleSearch)
- `src/lib/` — `db.ts` (SQLite singleton), `queries.ts` (query functions)
- `src/i18n/` — `routing.ts`, `request.ts`, `navigation.ts`
- `src/messages/` — Translation JSON files (en.json, de.json, fr.json, it.json)
- `scripts/scraper/` — Scraper framework: `types.ts`, `index.ts`, `sources/` (adapters)
- `scripts/traefik/` — Shared Traefik reverse proxy config
- `scripts/` — `init-db.ts`, `seed-sample-data.ts`, `backup-db.sh`, `server-setup.sh`
- `data/` — SQLite DB + cached PDFs (gitignored except .gitkeep)

### i18n

Uses `next-intl` with middleware-based locale routing. Default locale is `de`. All UI strings live in `src/messages/{locale}.json`. Navigation helpers are in `src/i18n/navigation.ts` — use `Link` from there instead of `next/link`.

### Database Schema

Four tables: `manufacturers` → `models` → `rescue_cards` + `pending_submissions`. Foreign keys enforced, WAL mode enabled. The `rescue_cards` table tracks `source_url` and `source_name` for transparent attribution. `pending_submissions` holds community uploads awaiting admin review.

### Docker

```bash
docker compose up -d --build   # Start all services
```

Three services in `docker-compose.yml`: `web` (Next.js), `scraper` (weekly cron), `backup` (weekly SQLite backup). Traefik runs separately from `scripts/traefik/docker-compose.yml` on a shared `web` Docker network. Shared `app-data` volume for SQLite DB and PDFs. Config via `.env` (see `.env.example`).

### Scraper

Plugin-based scraper in `scripts/scraper/`. Each source has an adapter in `scripts/scraper/sources/` implementing `SourceAdapter` from `scripts/scraper/types.ts`. The runner (`scripts/scraper/index.ts`) loads all adapters dynamically, downloads PDFs to `data/pdfs/{manufacturer}/`, and upserts into SQLite. Current adapters: ADAC index, Toyota DE, Skoda, rettungskarten-service.de.

### Community Uploads

Upload page at `/[locale]/contribute` — no auth required. Submissions go to `pending_submissions` table with PDFs saved to `data/pdfs/pending/`. Admin review at `/admin/review` (Basic Auth via `ADMIN_PASSWORD` env var). Approve moves PDF to final location and inserts into `rescue_cards`.

### Deployment

Multi-app Docker architecture. Traefik runs as a shared reverse proxy on the `web` Docker network. Each app joins that network via labels. GitHub Actions deploys on push to `main` via SSH (`appleboy/ssh-action`). Server setup: `scripts/server-setup.sh` for fresh DigitalOcean droplets.

## Design Decisions

- **Search is the hero element** — homepage leads with vehicle search, no filler
- **Source attribution on every page** — rescue cards and safety info always link to original source
- **Mobile-first** — first responders use phones at accident scenes
- **Disclaimers required** — not affiliated with manufacturers, not a substitute for emergency training
- Blog and support links use placeholder `#` URLs (TBD)
