# UpworkRadar

Self-hosted full-stack app that scrapes Upwork jobs daily, scores each listing for fit with Claude AI, drafts proposals for top matches, flags red flags, and emails a styled HTML digest every morning at **7:00 AM Philippine Time**. A React dashboard gives full visibility and tracking.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite + TypeScript, Tailwind v4, shadcn/ui, TanStack Query, React Router |
| Backend | Node + TypeScript + Express 5, Prisma ORM |
| Database | PostgreSQL 16 (Docker) |
| Scraper | Apify — `blackfalcondata/upwork-scraper` (primary) + `neatrat/upwork-job-scraper` (fallback), configurable |
| AI | Anthropic Claude `claude-sonnet-4-6` |
| Email | Resend |
| Scheduler | node-cron (daily 07:00 Asia/Manila) |
| Deploy | Docker Compose (+ optional Nginx reverse proxy) |

---

## Project structure

```
upwork-radar/
├── docker-compose.yml          # postgres + backend + frontend
├── .env.example
├── nginx/nginx.conf            # optional HTTPS reverse proxy
├── backend/                    # Express API, services, cron, Prisma
│   ├── prisma/schema.prisma
│   └── src/
│       ├── index.ts            # app entry + DB-retry startup
│       ├── cron/scheduler.ts
│       ├── services/           # apify, filter, ai, email, pipeline
│       ├── routes/             # jobs, settings, scraper, health
│       ├── templates/          # HTML email builder
│       ├── lib/                # prisma, env, logger, http, settings
│       └── scripts/seed-settings.ts
└── frontend/                   # Vite + React dashboard
    └── src/
        ├── pages/              # Dashboard, JobDetail, Bookmarks, Settings
        ├── components/         # JobCard, FilterBar, ProposalDrawer, ui/*
        ├── hooks/              # useJobs, useSettings, useScraper, use-theme
        └── lib/                # api client, format, utils
```

---

## Quick start (Docker)

```bash
# 1. Configure
cp .env.example .env
# Edit .env: set DB_PASSWORD, ANTHROPIC_API_KEY, APIFY_API_KEY, RESEND_API_KEY,
# FROM_EMAIL, FRONTEND_URL, and VITE_API_URL (use your VPS IP, not localhost).

# 2. Start all services (migrations run automatically on backend boot)
docker compose up -d --build

# 3. Seed the default settings row
docker compose exec backend npm run seed

# 4. Verify
curl http://localhost:3001/health
curl http://localhost:3001/api/settings
# Open the dashboard at http://YOUR_VPS_IP:5173
```

> The backend container runs `prisma migrate deploy` on every boot, so the schema
> is always applied. If you prefer to run it manually:
> `docker compose exec backend npx prisma migrate deploy`

### Useful commands

```bash
docker compose logs backend -f     # tail backend logs
docker compose restart backend     # restart after .env changes
docker compose down                # stop
docker compose down -v             # nuclear reset (destroys the DB volume)
```

---

## Environment variables

| Var | Description |
|---|---|
| `DB_USER`, `DB_PASSWORD` | Postgres credentials |
| `ANTHROPIC_API_KEY` | Claude API key (scoring + proposals) |
| `APIFY_API_KEY` | Apify token (scraper). Can also be set in the UI. |
| `RESEND_API_KEY` | Resend key (email). Can also be set in the UI. |
| `FROM_EMAIL` | Verified Resend sender, e.g. `UpworkRadar <radar@you.com>` |
| `FRONTEND_URL` | Dashboard URL used in email links |
| `VITE_API_URL` | **Build-time** API URL the browser calls (your VPS IP + `:3001/api`) |
| `NODE_ENV`, `PORT` | App config |

> **API keys in the UI:** Apify and Resend keys can also be saved on the Settings
> page. They are stored in the database (returned masked, never in plaintext) and
> take precedence over the env vars at runtime — no restart required.

---

## Local development (without Docker)

You need a running PostgreSQL and a `DATABASE_URL`.

```bash
# Backend
cd backend
npm install
export DATABASE_URL="postgresql://user:pass@localhost:5432/upworkradar"
npx prisma migrate deploy
npm run seed
npm run dev            # http://localhost:3001

# Frontend (separate terminal)
cd frontend
npm install
npm run dev            # http://localhost:5173
```

---

## How the daily pipeline works

`runFullPipeline()` (in `src/services/pipeline.service.ts`) is invoked by both the
07:00 cron job and the manual **Run Scraper** button:

1. **Scrape** — Apify actor runs with your search keywords.
2. **Filter** — budget, proposal-count, and location gates (`filter.service`).
3. **Deduplicate** — skip jobs already in the DB (by `upworkId`).
4. **Score** — Claude rates each job 1–10 with rationale, extracted requirements,
   red flags, and a draft proposal (for scores ≥ proposal threshold), in batches
   of 5 with retry/backoff.
5. **Persist** — upsert jobs (user actions like status/notes/bookmarks preserved).
6. **Email** — Resend sends the HTML digest of jobs scoring ≥ the email threshold.

Each run is recorded in `ScrapeRun` (visible via `/api/scraper/history`). Failures
are logged and recorded without crashing the process. A second run is rejected with
`409 Conflict` while one is in progress.

---

## API overview

Base URL: `http://localhost:3001/api`. All responses use `{ success, data }` or
`{ success, error }`.

- **Jobs:** `GET /jobs` (filters + pagination), `GET /jobs/:id`, `GET /jobs/stats`,
  `PATCH /jobs/:id/status|bookmark|notes`, `POST /jobs/:id/regenerate-proposal`,
  `DELETE /jobs/:id`
- **Scraper:** `POST /scraper/run`, `GET /scraper/status`, `GET /scraper/history`
- **Settings:** `GET /settings`, `PUT /settings`, `POST /settings/test-email`
- **Health:** `GET /health` → `{ status, db, uptime }`

---

## Optional: Nginx + HTTPS

`nginx/nginx.conf` contains a reverse-proxy template that terminates TLS and routes
`/` to the frontend and `/api/` to the backend. Drop your certs in `nginx/certs`,
uncomment the HTTPS server block, and run it alongside the stack.

---

*UpworkRadar v1.0*
