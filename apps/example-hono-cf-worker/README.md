# example-hono-cf-worker

Example Cloudflare Worker that mounts `@expo-up/server` for local/end-to-end testing.

## Setup

```bash
bun install
cp example.dev.vars .dev.vars
```

Fill `.dev.vars`:
- `GITHUB_AUTH_TOKEN`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `CODESIGNING_APP_PRIVATE_KEY`
- `CODESIGNING_APP_KEY_ID`

## Run

```bash
bun run dev
```

Server URL: `http://localhost:8787`
Base path: `/api/expo-up`

## Verify

```bash
curl http://localhost:8787/
curl http://localhost:8787/api/expo-up/projects/example-expo-app
```

Use together with `../example-expo-app` and `@expo-up/cli` for release/fetch/surf testing.
