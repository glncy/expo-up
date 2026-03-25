# expo-up

Self-hosted Expo Updates toolkit for managing releases, rollbacks, channels, and signed manifests outside EAS Update hosting.

> Current storage provider: GitHub Repository storage only.  
> Planned future providers: AWS S3, Firebase Storage, Google Cloud Storage, Azure Blob Storage, and other storage backends.

## Packages

### `@expo-up/cli`

CLI for OTA operations and code-signing setup.

### `@expo-up/server`

Server-side implementation of Expo Updates protocol endpoints.

### `@expo-up/core`

Shared reusable logic used by CLI/server.

## Dependency Graph

- `@expo-up/core` has no workspace runtime dependency on CLI/server.
- `@expo-up/server` depends on `@expo-up/core`.
- `@expo-up/cli` depends on `@expo-up/core`.

Publish order:

1. `@expo-up/core`
2. `@expo-up/server`
3. `@expo-up/cli`

## Example Apps

- `apps/example-hono-cf-worker`: example server host using `@expo-up/server`
- `apps/example-expo-app`: example client app to fetch/surf updates

## Requirements

- Bun `>=1.3`
- Node.js `>=18`
- npm account (for publishing)
- Wrangler for Cloudflare Worker example

## Install

```bash
bun install
```

## Turborepo DX

Common workspace commands:

```bash
bun run dev
bun run build
bun run test
bun run lint
bun run check-types
bun run quality
```

Focused commands:

```bash
# example apps
bun run dev:worker
bun run dev:app

# packages only
bun run build:packages
bun run test:packages
bun run quality:packages

# cloudflare types
bun run cf-typegen
```

Filter examples:

```bash
turbo run test --filter=@expo-up/server
turbo run build --filter=example-hono-cf-worker
turbo run dev --filter=example-expo-app
```

## Command Reference

### Auth

```bash
expo-up login
expo-up logout
expo-up whoami
```

- `login`: authenticate and save local token.
- `logout`: clear saved token/config.
- `whoami`: show resolved project, channel, server URL, and auth status.

### Channel

```bash
expo-up set-channel <name>
expo-up list-channels
```

- `set-channel`: persist default channel for release/history/rollback.
- `list-channels`: query available channels from storage repo.
- Default channel is `main` when no channel is set or passed.

### Release

```bash
expo-up release --platform <ios|android|all> --channel <name>
```

- Runs `expo export`.
- Compares sorted metadata hash against latest build in channel.
- Skips upload when unchanged.
- Uploads and advances channel ref when changed.

### History

```bash
expo-up history --channel <name>
expo-up history --channel <name> --delete <ids...> --yes
```

- View release/rollback timeline.
- Interactive delete in TTY by default.
- Prints once and exits automatically in CI/non-TTY environments.
- CI-safe delete via `--delete` and `--yes`.

### Rollback

```bash
expo-up rollback --channel <name> --to <buildId>
expo-up rollback --channel <name> --embedded
```

- Roll channel to a specific build or embedded directive.

### Code Signing

```bash
expo-up codesigning:generate
expo-up codesigning:configure
```

- Generate/configure signing key and certificate artifacts for Expo Updates signing.

### Debug

```bash
expo-up --debug <command>
```

- Enables verbose logs for API calls, release diffing, and error context.

## Endpoint Reference

Default base path in examples: `/api/expo-up`

### `GET /api/expo-up/projects/:projectId`

- Validates and resolves project config.
- `200` on success, `404` if unknown.

### `GET /api/expo-up/:projectId/manifest`

Headers typically used by Expo client:

- `expo-runtime-version` (required)
- `expo-platform` (required)
- `expo-channel-name` (optional)
- `expo-current-update-id` (optional)
- `expo-protocol-version` (optional)
- `expo-expect-signature` (optional)

Behavior:

- `200` multipart manifest when update is available
- `200` rollback directive when channel resolves to embedded rollback
- `204` when already up-to-date
- `404` when no build exists for runtime/channel
- If `expo-channel-name` is not provided, server defaults to `main`.

### `GET /api/expo-up/:projectId/assets?path=...&channel=...`

- Streams JS bundle/assets referenced by manifest.
- `200` asset stream, `404` when missing.

### `GET /api/expo-up/auth/github`

- GitHub OAuth callback flow endpoint.

## Workspace Quality Checks

```bash
bun run test
bun run lint
bun run check-types
```

Package-scoped checks:

```bash
bun run --filter @expo-up/cli quality
bun run --filter @expo-up/server quality
bun run --filter @expo-up/core quality
```

## End-to-End Testing With Example Apps

### 1) Start example server

```bash
cd apps/example-hono-cf-worker
cp example.dev.vars .dev.vars
bun run dev
```

Set `.dev.vars`:

- `GITHUB_AUTH_TOKEN`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `CODESIGNING_APP_PRIVATE_KEY`
- `CODESIGNING_APP_KEY_ID`

### 2) Start example Expo app

```bash
cd apps/example-expo-app
bun install
bun run ios
```

### 3) Release and validate via CLI

From `apps/example-expo-app`:

```bash
bunx expo-up whoami
bunx expo-up release --channel main --platform all
bunx expo-up history --channel main
bunx expo-up rollback --channel main --to <build-id>
```

In app UI:

- use `Fetch update`
- use `Channel Surf`
- verify update details/logs

## Publish

```bash
bun run changeset
bun run version-packages
bun run release
```

## Release Guide

- Full release lifecycle guide: [`RELEASE_FLOW.md`](./RELEASE_FLOW.md)

## CI/CD Pipelines

### PR Pipeline

Workflow: `.github/workflows/pr-quality.yml`

On every pull request:

1. `build` runs first
2. `test`, `lint`, and `check-types` run in parallel after build passes
3. Bun + Turbo caches are restored/saved for faster subsequent runs

### Publish Pipeline

Workflow: `.github/workflows/publish.yml`

- On merge to `main` (`push` to main):
  - runs `build` first
  - runs `test`, `lint`, `check-types` in parallel
  - publishes snapshot prereleases with `next` tag via Changesets
  - snapshot versions are generated from pending changesets
- On GitHub Release marked **Pre-release**:
  - publishes snapshot prereleases with `rc` dist-tag via Changesets
- On GitHub Release marked **Release** (not prerelease):
  - publishes versioned packages as `latest` via Changesets

### Version PR Pipeline

Workflow: `.github/workflows/version-packages.yml`

- On push to `main`, Changesets action creates/updates a version PR:
  - commit message: `chore: version packages`
  - PR title: `chore: version packages`
- When that PR is merged, package.json versions/changelogs are synced in the repo.

Publish order is always:

1. `@expo-up/core`
2. `@expo-up/server`
3. `@expo-up/cli`

### Publish Auth (Trusted Publishing)

- No `NPM_TOKEN` secret required for publish jobs.
- Configure npm Trusted Publishing for this repository/workflow.
- Publish jobs require `id-token: write` permission (already configured).

## Notes

- `packages/v0-*` are legacy snapshots/reference.
- Current maintained implementation is in `packages/cli`, `packages/server`, and `packages/core`.
