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
```

## Architecture

**Stack:** Next.js (App Router, SSR) + TypeScript + Tailwind CSS v4 + SQLite (better-sqlite3) + next-intl

**Single Next.js app** with API routes for vehicle search. SQLite stores the vehicle/rescue card catalog. Designed to run in Docker with a Traefik reverse proxy and a scraper sidecar container.

### Key Directories

- `src/app/[locale]/` — All pages use locale-based routing (de/fr/it/en)
- `src/app/api/vehicles/` — REST API: `/manufacturers`, `/models`, `/search`
- `src/components/` — Shared components (Header, Footer, LanguageSwitcher, VehicleSearch)
- `src/lib/` — `db.ts` (SQLite singleton), `queries.ts` (query functions)
- `src/i18n/` — `routing.ts`, `request.ts`, `navigation.ts`
- `src/messages/` — Translation JSON files (en.json, de.json, fr.json, it.json)
- `scripts/` — `init-db.ts`, `seed-sample-data.ts`
- `data/` — SQLite DB + cached PDFs (gitignored except .gitkeep)

### i18n

Uses `next-intl` with middleware-based locale routing. Default locale is `de`. All UI strings live in `src/messages/{locale}.json`. Navigation helpers are in `src/i18n/navigation.ts` — use `Link` from there instead of `next/link`.

### Database Schema

Three tables: `manufacturers` → `models` → `rescue_cards`. Foreign keys enforced, WAL mode enabled. The `rescue_cards` table tracks `source_url` and `source_name` for transparent attribution.

### Docker

```bash
docker compose up -d --build   # Start all services
```

Three services: `web` (Next.js), `scraper` (weekly cron), `traefik` (reverse proxy + SSL). Shared `app-data` volume for SQLite DB and PDFs. Config via `.env` (see `.env.example`).

## Design Decisions

- **Search is the hero element** — homepage leads with vehicle search, no filler
- **Source attribution on every page** — rescue cards and safety info always link to original source
- **Mobile-first** — first responders use phones at accident scenes
- **Disclaimers required** — not affiliated with manufacturers, not a substitute for emergency training
- Blog and support links use placeholder `#` URLs (TBD)
