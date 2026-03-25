# @expo-up/cli

CLI package for managing self-hosted Expo OTA workflows.

> Current storage target is GitHub Repository storage.  
> Additional providers (AWS S3, Firebase Storage, Google Cloud Storage, Azure Blob Storage, etc.) are planned.

## Responsibilities

- Authenticate against GitHub for storage access.
- Export and release update bundles to storage.
- Inspect and manage build history.
- Roll back channels to embedded/previous builds.
- Bootstrap Expo code signing (generate/configure).

## Global Option

- `--debug`: enable verbose logs for API calls, release diffing, and error context.

## CI/CD Token Auth

For non-interactive environments, use:

- `EXPO_UP_CLI_GITHUB_TOKEN` (recommended)
- or `--token` per command
- token must have **write access** to your GitHub storage repository (contents write).

Example:

```bash
EXPO_UP_CLI_GITHUB_TOKEN=ghp_xxx expo-up release --channel main --platform all
```

## Command Reference

### `expo-up login`

Authenticate and store local token/config for subsequent commands.

Options:

- `-t, --token <token>` save token directly (skip OAuth browser flow)

### `expo-up logout`

Clear locally stored token/config session.

### `expo-up whoami`

Print resolved project context:

- projectId from Expo config
- active channel
- server URL
- auth state (masked token)

### `expo-up set-channel <name>`

Persist default channel used by release/history/rollback when `--channel` is not passed.
Default channel is `main`.

Example:

```bash
expo-up set-channel main
expo-up set-channel staging
```

### `expo-up list-channels`

List available channels from the storage repository.

Options:

- `-t, --token <token>` use GitHub token directly (CI-friendly)

### `expo-up release`

Build and upload a new OTA build for a channel/runtime.

Options:

- `--platform <ios|android|all>` default: `all`
- `--channel <name>` optional channel override
- `-t, --token <token>` use GitHub token directly (CI-friendly)
- channel defaults to `main` when no saved/override channel is provided

Behavior:

1. Runs `expo export`.
2. Reads local `dist/metadata.json`.
3. Compares sorted metadata hash against latest remote build in the channel.
4. Skips upload if no changes.
5. Uploads new build and advances channel ref if changed.

Examples:

```bash
expo-up release --platform all --channel main
expo-up release -t "$EXPO_UP_CLI_GITHUB_TOKEN" --platform all --channel main
expo-up --debug release --platform ios --channel feat/new-home
```

### `expo-up history`

Show release/rollback timeline for a channel.

Behavior:

- local TTY: interactive history view with multi-select delete shortcuts
- CI/non-TTY: prints the history once and exits automatically

Options:

- `--channel <name>` optional channel override
- `--delete <buildIds...>` non-interactive delete mode (CI friendly)
- `--yes` skip confirmation for delete mode
- `--no-interactive-delete` disable TUI selection mode
- `-t, --token <token>` use GitHub token directly (CI-friendly)
- channel defaults to `main` when no saved/override channel is provided

Examples:

```bash
expo-up history --channel main
expo-up history -t "$EXPO_UP_CLI_GITHUB_TOKEN" --channel main
CI=true expo-up history -t "$EXPO_UP_CLI_GITHUB_TOKEN" --channel main
expo-up history --channel main --delete 10 11 --yes
```

### `expo-up rollback`

Rollback channel to previous build or embedded app update.

Options:

- `--channel <name>` optional channel override
- `-b, --to <buildId>` rollback target build
- `-t, --token <token>` use GitHub token directly (CI-friendly)
- `--embedded` rollback to embedded/native update
- channel defaults to `main` when no saved/override channel is provided

Examples:

```bash
expo-up rollback --channel main --to 10
expo-up rollback -t "$EXPO_UP_CLI_GITHUB_TOKEN" --channel main -b 10
expo-up rollback --channel main --embedded
```

### `expo-up codesigning:generate`

Generate keypair/certificate and update Expo config for signed updates.

Key options:

- `--organization <name>`
- `--certificate-validity-duration-years <years>`
- `--key-id <id>` default: `main`
- `--project-root <path>`
- `--key-output-directory <path>` default: `codesigning-keys`
- `--certificate-output-directory <path>` default: `certs`
- `--force`

### `expo-up codesigning:configure`

Configure existing signing materials into Expo config.

## Local Development

```bash
bun install
bun run build
bun run test
bun run check-types
bun run lint
```

## End-to-End Test With Example Apps

1. Start server app:

```bash
cd ../../apps/example-hono-cf-worker
bun run dev
```

2. Use CLI from Expo app root:

```bash
cd ../example-expo-app
bunx expo-up whoami
bunx expo-up release --channel main --platform all
bunx expo-up history --channel main
```

3. In mobile app, press `Fetch update` and verify logs/status.

## Package

Published as `@expo-up/cli`.
