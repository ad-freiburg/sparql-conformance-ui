# GitHub Workflow Integration

## Overview

`POST /api/upload` will:

1. Accept `.json`, `.json.gz`, or `.json.bz2`
2. Decompress and parse JSON
3. Calculate statistics (`total`, `passed`, `failed`, `intended`, `skipped`)
4. Store compressed JSON in SQLite
5. Trigger GitHub App checks/comments if configured

## Use the correct upload URL

In Docker public mode, upload is served by the separate `uploader` service.

- Website/read API: `http://localhost:8080`
- Upload API: `http://localhost:3001/api/upload`

For CI secrets, store the **upload endpoint** URL, not the website URL.

## Required repository secrets

- `CONFORMANCE_API_KEY`
- `CONFORMANCE_UPLOAD_URL` (for example `https://upload.example.com/api/upload`)

## Header requirements

### Required in public mode

- `x-api-key`
- `x-repo-full-name`

### Required for CI classification

- `x-upload-source: ci`
- `x-workflow-run-id` (required when `x-upload-source=ci`)

### Recommended for traceability

- `x-commit-sha`
- `x-run-title`
- `x-pr-number`
- `x-ref-name`
- `x-head-ref`
- `x-ref-kind`
- `x-artifact-url`
- `x-engine-name`
- `x-engine-version`

## Recommended workflow step

```yaml
   - name: Upload conformance results
        if: always()
        env:
          API_KEY: ${{ secrets.CONFORMANCE_API_KEY }}
          UPLOAD_URL: ${{ secrets.CONFORMANCE_UPLOAD_URL }}
          RUN_TITLE: ${{ github.event.pull_request.title || github.event.head_commit.message || github.sha }}
          PR_NUMBER: ${{ github.event.pull_request.number || '' }}
          HEAD_REF: ${{ github.head_ref || '' }}
        run: |
          response=$(curl -L -sS -w "\n%{http_code}" \
            -H "x-api-key: $API_KEY" \
            -H "x-upload-source: ci" \
            -H "x-repo-full-name: ${{ github.repository }}" \
            -H "x-run-title: $RUN_TITLE" \
            -H "x-commit-sha: ${{ github.sha }}" \
            -H "x-pr-number: $PR_NUMBER" \
            -H "x-ref-name: ${{ github.ref_name }}" \
            -H "x-head-ref: $HEAD_REF" \
            -H "x-ref-kind: ${{ github.ref_type }}" \
            -H "x-workflow-run-id: ${{ github.run_id }}" \
            -H "x-artifact-url: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}" \
            -H "x-engine-name: qlever" \
            -H "x-engine-version: nightly-${{ github.run_number }}" \
            -F "file=@selected.json.bz2" \
            "$UPLOAD_URL")
      
          http_code=$(echo "$response" | tail -n1)
          body=$(echo "$response" | sed '$d')

          echo "HTTP Status: $http_code"
          echo "$body" | jq '.' || echo "$body"

          if [ "$http_code" -ne 200 ]; then
            echo "Upload failed"
            exit 1
          fi
```

## Minimal example

```yaml
- name: Upload results
  if: always()
  run: |
    curl -f \
      -H "x-api-key: ${{ secrets.CONFORMANCE_API_KEY }}" \
      -H "x-upload-source: ci" \
      -H "x-repo-full-name: ${{ github.repository }}" \
      -H "x-workflow-run-id: ${{ github.run_id }}" \
      -F "file=@results.json" \
      "${{ secrets.CONFORMANCE_UPLOAD_URL }}"
```

## Context to header mapping

| GitHub context | Header |
|---|---|
| `${{ github.repository }}` | `x-repo-full-name` |
| `${{ github.sha }}` | `x-commit-sha` |
| `${{ github.event.pull_request.number }}` | `x-pr-number` |
| `${{ github.ref_name }}` | `x-ref-name` |
| `${{ github.head_ref }}` | `x-head-ref` |
| `${{ github.ref_type }}` | `x-ref-kind` |
| `${{ github.run_id }}` | `x-workflow-run-id` |

## Current success response (example)

```json
{
  "success": true,
  "message": "Test results uploaded successfully",
  "data": {
    "id": 123,
    "repo_full_name": "owner/repo",
    "run_title": "Fix parser edge case",
    "commit_sha": "abc123def456",
    "engine_name": "qlever",
    "engine_version": "nightly-2026-03-04",
    "upload_source": "ci",
    "pr_number": 42,
    "storage": {
      "original_size_kb": 5120,
      "compressed_size_kb": 244,
      "compression_ratio": "95.2%"
    },
    "statistics": {
      "total": 603,
      "passed": 148,
      "failed": 404,
      "intended": 0,
      "skipped": 0
    },
    "github_app_enabled": true
  }
}
```

## Troubleshooting

### 401 Unauthorized

- Secret key does not match server `API_KEY`

### 400 Invalid source or missing workflow run id

- If `x-upload-source=ci`, then `x-workflow-run-id` is mandatory

### 400 Missing repository header

- `x-repo-full-name` is required in public mode

### Upload succeeds but no GitHub comments/checks

- GitHub App is not fully configured on server
- Verify with `GET /api/github/status`
- See [SETUP.md](SETUP.md) for GitHub App env setup
