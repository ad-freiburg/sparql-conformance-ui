# Setup and Hosting

This guide covers running and deploying the site. For a bare-minimum "just get it up"
walkthrough, see the [Quick Start in the README](./README.md#quick-start-public-mode)
first — this document goes deeper.

## Which mode do you want?

| You want to…                                                        | Use            | Jump to                              |
|---------------------------------------------------------------------|----------------|--------------------------------------|
| Deploy the public website + upload API (optionally with GitHub App) | **Public mode**  | [§2 Public deployment](#2-public-deployment) |
| Browse a local folder of result files, no keys, no CI               | **Private mode** | [§3 Private hosting](#3-private-hosting)     |

Public mode uses the default `docker-compose.yml`. Private mode and its endpoint surface
use `docker-compose.private.yml`, keeping the deployments mutually exclusive without
using `.env`.

- **Public mode** runs three services:
  - `web` on port `8080` (React app + proxied read API at `/api/*`)
  - `api-public` (read-only API, internal)
  - `uploader` on port `3001` (upload-only API)
- **Private mode** runs two services:
  - `web-private` on port `8081`
  - `api-private` (combined read + upload API). Used by `qlever-control` for the
    visualize command.

---

## 1) Prerequisites

- Docker + Docker Compose
- Optional: GitHub App credentials — only for PR comments / check runs in public mode
  (see [§4](#4-github-app-setup-public-mode))

---

## 2) Public deployment

### 2.1 Minimal `.env`

```bash
cp .env.example .env
```

Then set just the upload key — everything else has working defaults:

```env
# Required for uploader auth. Any strong random string — generate one with:
#   openssl rand -hex 32
API_KEY=replace-with-strong-random-key
```

Persistent variables are explained inline in [.env.example](.env.example). The
[full reference](#5-environment-variable-reference), including private-mode launch
inputs, is at the end of this document.

### 2.2 Start

Compose automatically selects the default `docker-compose.yml`:

```bash
docker compose up -d --build
```

### 2.3 Endpoints

- Website: `http://localhost:8080`
- Uploader API: `http://localhost:3001/api/upload`
- Health: `http://localhost:8080/health`

You can change host ports via `.env`:

```env
PUBLIC_WEB_PORT=8080
PUBLIC_UPLOAD_PORT=3001
```

The database starts empty. To load data, upload a result file (see
[GITHUB_WORKFLOW.md](./GITHUB_WORKFLOW.md) for CI and manual upload examples).

### 2.4 Database persistence

The public SQLite database is bind-mounted from the host rather than stored in a
Docker-managed volume. It defaults to `./data/conformance.db`, so container
replacement, Compose project-name changes, and Docker volume pruning do not remove
it. Both `api-public` and `uploader` mount the same directory.

For production, set `DB_DATA_DIR` in `.env` to a stable absolute host path outside
the Git checkout:

```env
DB_DATA_DIR=/srv/sparql-conformance-ui/data
```

Create the directory before the first start and ensure Docker can write to it. Keep
it on a local filesystem: SQLite WAL mode depends on filesystem locking and is not
safe on NFS or similar network filesystems.

If upgrading an installation that already has data in the old `db_data` named
volume, copy it before starting the new configuration. First capture the volume
name while the old service still exists, then stop the services so SQLite has no
open writers:

```bash
OLD_DB_VOLUME="$(
  docker inspect --format \
    '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' \
    "$(docker compose ps -q api-public)"
)"
docker compose down
mkdir -p ./data
docker run --rm \
  -v "${OLD_DB_VOLUME}:/from:ro" \
  -v "$(pwd)/data:/to" \
  alpine sh -c 'cp -a /from/. /to/'
docker compose up -d --build
```

Verify the runs are present before removing the old Docker volume. Copy the whole
directory—not only `conformance.db`—so any SQLite WAL sidecar files are included.

### 2.5 Optional: subpath / subdomain deployment

The site's mount point is resolved at **request time** from the `X-Forwarded-Prefix`
header your reverse proxy sends — no rebuild needed to change it. The nginx container
reads that header, injects it into `index.html`'s `<base href>`, and the SPA router
basename / API base URL derive from that automatically:

- Root or dedicated subdomain (e.g. `https://sparql.example.com/`): don't set the
  header at all (defaults to `/`).
- Subpath (e.g. `https://qlever.dev/sparql-conformance-ui-v2/`): the app's own nginx
  has no idea it's mounted under a subpath — it serves everything from its own root
  (`/assets/...`, `/api/...`, etc.). Your external reverse proxy must therefore do
  **two** things for requests under that subpath:
  1. **Strip the prefix** before forwarding, e.g. for a request to
     `/sparql-conformance-ui-v2/foo` forward `/foo` to this app. This is what
     routes requests — without it, static assets 404 (the app resolves them from
     its own root).
  2. **Add the header** so the app can render correct links/asset URLs back to the
     browser:
     ```
     X-Forwarded-Prefix: /sparql-conformance-ui-v2
     ```
     The header only controls generated URLs; it does **not** route requests, so it
     is not a substitute for step 1 — you need both.

  Only the outermost proxy in a chain should set this header. This is the same model
  Grafana/Prometheus use for `sub_path` deployments.

  A complete, annotated example for your outer reverse proxy is in
  [`docker/nginx/external-proxy.example.conf`](./docker/nginx/external-proxy.example.conf) —
  it shows subpath hosting for both the site (`/example/`) and the uploader (`/upload/`).

CORS needs no configuration (the website talks to the API same-origin). Set `WEBSITE_URL`
only if you use the GitHub App and want correct PR-comment links — that value is
deploy-time config, unrelated to how the site itself is served.

**Troubleshooting:** if the page loads blank or assets 404 behind a proxy, check that the
proxy actually sends `X-Forwarded-Prefix` and that it matches the proxy's external path
exactly (leading/trailing slashes are tolerated, the value itself is not).

---

## 3) Private hosting

For local/private analysis with mounted result files. No API key or GitHub App required.

### 3.1 Start

```bash
LOCAL_RESULTS_DIR=/absolute/path/to/results \
  docker compose -f docker-compose.private.yml up -d --build
```

Provide `LOCAL_RESULTS_DIR` directly in the command rather than storing it in `.env`.
Private mode rebuilds its container-local SQLite database from this directory on
every start, so it does not require a persistent database directory.
The private Compose file contains only `web-private` and `api-private`, so public services
are never started by this command.

### 3.2 Endpoints

- Private website: `http://localhost:8081`
- API (proxied): `http://localhost:8081/api/*`

To use a different private web host port, provide it directly in the start command:

```bash
LOCAL_RESULTS_DIR=/absolute/path/to/results PRIVATE_WEB_PORT=8082 \
  docker compose -f docker-compose.private.yml up -d --build
```

### 3.3 Auto-import behavior

On startup, private mode recursively imports `.json`, `.json.gz`, and `.json.bz2` files
from `LOCAL_RESULTS_DIR` into SQLite. Recommended folder layout (improves inferred
`engine_name` / `engine_version`):

```text
<LOCAL_RESULTS_DIR>/<engine_name>/<engine_version>/<file>.json(.gz|.bz2)
```

GitHub App integration is disabled in private mode.

---

## 4) GitHub App Setup (Public mode)

Optional. Configure this only if you want automatic PR comments and check runs.

### 4.1 Create App

1. GitHub → Settings → Developer settings → GitHub Apps → New GitHub App
2. Set app name and homepage URL.
3. Install the app on the target repository/org.

### 4.2 Required repository permissions

- **Checks**: Read & write
- **Pull requests**: Read
- **Issues**: Read & write (PR comments are issue comments)
- **Metadata**: Read-only (default)
- **Contents**: Read-only (used when querying default branch commit)

### 4.3 Collect credentials

You need three values from the app:

- **`GITHUB_APP_ID`** — on the app's **General** page (Settings → Developer settings →
  GitHub Apps → *your app*), the **App ID** field. A small number, e.g. `123456`.

- **`GITHUB_APP_PRIVATE_KEY`** — on the same **General** page, under **Private keys**,
  click *Generate a private key*. This downloads a `.pem` file. Paste its full contents
  into the variable (plain PEM text works). If you need it on one line, base64-encode it
  and paste that instead:

  ```bash
  base64 -w0 your-github-app-private-key.pem
  ```

- **`GITHUB_INSTALLATION_ID`** — open the app's installation settings; the ID is the
  number at the end of the URL:

  - Personal account: `https://github.com/settings/installations/<INSTALLATION_ID>`
  - Organization: `https://github.com/organizations/<ORG>/settings/installations/<INSTALLATION_ID>`

  e.g. `987654321`.

### 4.4 Configure environment

Set in `.env`:

- Required for integration: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_INSTALLATION_ID`
- For links in comments/checks: `WEBSITE_URL`

Optionally customize the check/comment display names (defaults shown):

```env
CHECK_NAME=SPARQL 1.1 Conformance Check
CHECK_TITLE=SPARQL Test Suite
CHECK_RUNNING_TITLE=Running SPARQL Test Suite
COMMENT_AUTHOR=conformance-test[bot]
```

Then restart the public services:

```bash
docker compose up -d --build
```

### 4.5 Verify

Query `GET /api/github/status` via the website domain, e.g.
`https://conformance.example.com/api/github/status`.

Expected:

- `configured: true`
- `authenticated: true`

If `configured` is `false`, at least one required GitHub App variable is missing.

---

## 5) Environment variable reference

The most important variables are summarized below. Persistent configuration is documented
inline in [.env.example](.env.example); private-mode launch inputs are documented in
[section 3](#3-private-hosting) and should be provided directly in the start command.

| Variable                 | Mode    | Required | Purpose |
|--------------------------|---------|----------|---------|
| `API_KEY`                | public  | yes      | Shared secret the uploader checks (`x-api-key`). Generate with `openssl rand -hex 32`. |
| `DELETE_API_KEY`         | public  | no       | Separate key authorizing `DELETE /api/runs/:id`. Keep distinct from `API_KEY` so the CI-shared upload key cannot delete runs. Falls back to `API_KEY` if unset. |
| `WEBSITE_URL`            | public  | no       | Full public URL, used only for GitHub PR-comment links. Does not affect how the site is served — see section 2.5. |
| `DB_DATA_DIR`            | public  | no       | Host directory for SQLite data (default `./data`). Use a stable absolute path in production. |
| `LOCAL_RESULTS_DIR`      | private | yes      | Launch-time shell input for the absolute host path to the results folder to auto-import. |
| `LOG_LEVEL`              | both    | no       | Log verbosity: `fatal`, `error`, `warn`, `info` (default), `debug`, `trace`. |
| `PUBLIC_WEB_PORT` / `PUBLIC_UPLOAD_PORT` | public | no | Host ports (defaults `8080` / `3001`). |
| `PRIVATE_WEB_PORT`       | private | no       | Launch-time shell input for the private web host port (default `8081`). |

Notes:

- `GITHUB_APP_PRIVATE_KEY` can be plain PEM text **or** base64-encoded PEM.

---

## 6) Operations

### Check running services

```bash
# public
docker compose ps

# private
docker compose -f docker-compose.private.yml ps
```

### View logs

```bash
# public
docker compose logs -f web api-public uploader

# private
docker compose -f docker-compose.private.yml logs -f web-private api-private
```

### Stop services

```bash
# public
docker compose down

# private
docker compose -f docker-compose.private.yml down
```

---

## 7) Troubleshooting

### "Endpoint is not available in the current API surface mode"

You are calling an endpoint disabled for that service (`read` vs `upload` API surface).

### Upload returns 401

`x-api-key` does not match `API_KEY` for the uploader.

### GitHub status not authenticated

Check all GitHub App envs and ensure the app is installed on the target repo/org.

For CI upload issues (missing headers, wrong URL), see
[GITHUB_WORKFLOW.md](./GITHUB_WORKFLOW.md).
