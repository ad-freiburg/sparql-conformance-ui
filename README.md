# SPARQL 1.1 Compliance Website For QLever

Web UI and API for browsing, comparing and uploading SPARQL compliance test results.

## Overview

- React frontend (Vite)
- Fastify API server
- SQLite (`better-sqlite3`) with FTS5
- Upload endpoint for `.json`, `.json.gz`, and `.json.bz2`
- Public and private Docker Compose profiles

## Quick Start (public mode)

Get the hosted website + upload API running locally in a few minutes. You only need
**Docker** and **Docker Compose**.

```bash
# 1. Create your .env from the template
cp .env.example .env

# 2. Set an upload key in .env — generate a strong one with:
#    openssl rand -hex 32
#    then put it in the API_KEY line.

# 3. Start the public profile (website + read API + upload API)
docker compose --profile public up -d --build
```

Now open:

- Website: <http://localhost:8080>
- Health check: <http://localhost:8080/health>

The database starts empty. Upload a result file to see data (use the `API_KEY` you set):

```bash
curl -X POST "http://localhost:3001/api/upload" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "x-upload-source: manual" \
  -H "x-repo-full-name: manual/uploads" \
  -H "x-engine-name: qlever" \
  -H "x-engine-version: nightly-2026-03-01" \
  -F "file=@./results/qlever.json.bz2"
```

Refresh the website — the run now appears in the list.

## Other ways to run

- **Private / local viewer** — point it at a folder of result files and browse them, no
  API key or GitHub App needed. This is what `qlever-control`'s visualize command uses.
  See [SETUP.md § Private hosting](./SETUP.md).
- **Full production deploy** (subpath/subdomain, GitHub App PR comments & checks) —
  see [SETUP.md](./SETUP.md).
- **Local development without Docker** (Vite dev server + Node API + SQLite scripts) —
  see [db/README.md](./db/README.md).
- **Uploading from CI** (GitHub Actions workflow, headers, secrets) —
  see [GITHUB_WORKFLOW.md](./GITHUB_WORKFLOW.md).

## UI routes

- `/` — Search and list runs
- `/manual-engines` — Manual/private uploads view
- `/run/:id` — Single run details
- `/compare/:id1/:id2` — Compare two runs

## API endpoints used by frontend

- `GET /api/search?q=...&source=...`
- `GET /api/runs?repo=&engine=&version=&source=&limit=&offset=`
- `GET /api/runs/:id`
- `GET /api/latest-master?repo=owner/repo`
- `GET /api/github/status`

Upload / delete endpoints:

- `POST /api/upload` — available on the upload surface (public mode) or the combined
  surface (private mode). Header reference and CI usage:
  [GITHUB_WORKFLOW.md](./GITHUB_WORKFLOW.md).
- `DELETE /api/runs/:id` — removes a single run. Protected by the `x-api-key` header,
  matched against `DELETE_API_KEY` (falling back to `API_KEY` if unset):

  ```bash
  curl -X DELETE "http://localhost:3001/api/runs/123" \
    -H "x-api-key: YOUR_DELETE_API_KEY"
  ```

## Docker Compose modes

The application mode (`public`/`private`) and endpoint surface are fixed by the Docker
Compose profile you start, not set via `.env`.

| Mode      | Command                                                                              | Website                 |
|-----------|--------------------------------------------------------------------------------------|-------------------------|
| Public    | `docker compose --profile public up --build`                                         | `http://localhost:8080` |
| Private   | `LOCAL_RESULTS_DIR=./public/results docker compose --profile private up --build`     | `http://localhost:8081` |

Private mode auto-imports files from `LOCAL_RESULTS_DIR` on startup. Full details,
ports, and verification steps are in [SETUP.md](./SETUP.md).

## Configuration

Every environment variable is explained inline in [.env.example](./.env.example). For a
summary of the important ones and full deployment / GitHub App setup, see
[SETUP.md](./SETUP.md).
