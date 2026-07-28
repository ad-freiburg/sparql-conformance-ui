# API and uploads

The Fastify server stores conformance runs in SQLite and can expose one of
three endpoint surfaces:

- `read`: health, search, run details, comparisons, and GitHub status
- `upload`: authenticated upload and delete endpoints
- `all`: combined surface used by private mode

The public Compose deployment runs separate `read` and `upload` services. The
private Compose deployment uses the combined surface.

## Public endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Service health |
| `GET` | `/api/search?q=...` | Full-text search |
| `GET` | `/api/runs` | Filtered, paginated run list |
| `GET` | `/api/runs/:id` | One run and its test results |
| `GET` | `/api/latest-master?repo=owner/repo` | Latest default-branch run |
| `GET` | `/api/github/status` | GitHub App configuration status |
| `POST` | `/api/upload` | Store a result file |
| `DELETE` | `/api/runs/:id` | Delete one stored run |

In the default public deployment, read requests go through the website at
`http://localhost:8080`. Upload and delete requests go to
`http://localhost:3001`.

## Upload a result

Uploads accept `.json`, `.json.gz`, and `.json.bz2` files. Public mode requires
the `x-api-key` and `x-repo-full-name` headers:

```bash
curl -f -X POST "http://localhost:3001/api/upload" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "x-upload-source: manual" \
  -H "x-repo-full-name: manual/uploads" \
  -H "x-engine-name: qlever" \
  -H "x-engine-version: local" \
  -F "file=@./results/qlever.json.bz2"
```

Use `x-upload-source: ci` for CI uploads. CI uploads also require
`x-workflow-run-id`; the complete header reference and workflow examples are
in [GitHub Workflow Integration](../GITHUB_WORKFLOW.md).

## Delete a run

`DELETE /api/runs/:id` uses `DELETE_API_KEY`. If that variable is empty, it
falls back to `API_KEY`.

```bash
curl -f -X DELETE "http://localhost:3001/api/runs/123" \
  -H "x-api-key: YOUR_DELETE_API_KEY"
```

Use a separate delete key in shared deployments so a key distributed to CI can
upload results without being able to remove them.

## Configuration

The server reads its persistent settings from environment variables. Start
with [`.env.example`](../.env.example); deployment-specific guidance is in
[Setup and Hosting](../SETUP.md).

The most important variables are:

| Variable | Purpose |
|---|---|
| `API_KEY` | Authenticates uploads |
| `DELETE_API_KEY` | Authenticates deletion; falls back to `API_KEY` |
| `DB_PATH` | SQLite database path |
| `API_SURFACE` | `read`, `upload`, or `all` |
| `LOG_LEVEL` | Fastify log level |
| `WEBSITE_URL` | Public base URL used in GitHub comments and checks |

GitHub App credentials are optional. When configured, CI uploads can create or
update PR comments and check runs. See
[Setup and Hosting](../SETUP.md#4-github-app-setup-public-mode).
