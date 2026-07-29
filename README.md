# SPARQL Conformance UI

A web application for browsing, searching, and comparing SPARQL conformance
results. It includes a React frontend, a Fastify API, SQLite storage, and an
authenticated upload service.

## How do I start?

The quickest way to view existing result files needs only Docker and Docker
Compose. It does not need configuration, an API key, or a GitHub App:

```bash
LOCAL_RESULTS_DIR=/absolute/path/to/results \
  docker compose -f docker-compose.private.yml up -d --build
```

Open <http://localhost:8081>. The UI imports `.json`, `.json.gz`, and
`.json.bz2` files from that directory.

If you use the integrated conformance CLI, the same viewer is one command:

```bash
sparql_conformance visualize --result-directory ./results
```

## Run the shared service

Use public mode when results should be uploaded and shared:

```bash
cp .env.example .env

# Set API_KEY in .env. Generate a suitable value with:
openssl rand -hex 32

docker compose up -d --build
```

Open <http://localhost:8080>. The database starts empty; see
[API and uploads](server/README.md) to add a result. Production deployment,
reverse proxies, subpaths, and GitHub integration are covered in
[Setup and hosting](SETUP.md). SQLite data is stored on the host in `./data`
by default; set `DB_DATA_DIR` to a stable absolute path in production.

## Documentation

- [Setup and hosting](SETUP.md) — public/private deployment, reverse proxies,
  subpaths, configuration, and GitHub App setup
- [API and uploads](server/README.md) — endpoints, API surfaces,
  authentication, manual uploads, and deletion
- [GitHub Actions uploads](GITHUB_WORKFLOW.md) — secrets, headers, and workflow
  examples
- [Local Node/SQLite development](db/README.md) — database setup, imports, and
  schema
- [.env.example](.env.example) — persistent configuration reference

## Development

```bash
npm install
npm run server:dev
npm run dev
```

The API listens on <http://localhost:3000> and Vite on
<http://localhost:5173>. See [db/README.md](db/README.md) for database setup
and local imports.
