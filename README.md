# Dune game on Cloudflare Workers + D1

A browser RTS (React + Vite) served by a Cloudflare Worker. Campaign saves are stored in a
Cloudflare D1 database, keyed by an anonymous player ID kept in the browser
(`localStorage` also keeps a backup copy, used if the API is unreachable).

## Layout

| Path | Purpose |
| --- | --- |
| `src/` | Game client (React, canvas renderer, engine) |
| `worker/index.ts` | Worker: `/api/*` routes, everything else served from static assets (SPA) |
| `migrations/` | D1 schema migrations |
| `wrangler.jsonc` | Worker + D1 binding (`DB` → `dune-game-db`) |
| `.github/workflows/deploy.yml` | Build, migrate D1, deploy, smoke-test |

## API

| Method | Route | Description |
| --- | --- | --- |
| GET | `/api/health` | DB connectivity + save count |
| GET | `/api/saves/:playerId` | Load save (404 if none) |
| PUT | `/api/saves/:playerId` | Create/overwrite save (`{ game, camera }`, ≤ 1.5 MB) |
| DELETE | `/api/saves/:playerId` | Delete save |

## Local development

```bash
npm ci
npm run db:migrate:local   # creates the local D1 database in .wrangler/
npm run dev                # Vite + Worker + local D1 at http://localhost:5173
```

`npm run preview` builds and runs the production bundle locally in workerd.

## Deployment

Pushing to `main` (or the `claude/brave-pascal-ynp4dy` branch) runs the GitHub Action, which
type-checks, builds, applies D1 migrations remotely and runs `wrangler deploy`.

Required repository secret: **`CLOUDFLARE_API_TOKEN`** (Settings → Secrets and variables → Actions).
The token needs these permissions on the account: *Workers Scripts: Edit* and *D1: Edit*
(the "Edit Cloudflare Workers" template plus D1 Edit works). The account ID is set in `wrangler.jsonc`.
