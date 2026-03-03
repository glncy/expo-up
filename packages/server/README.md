# @expo-up/server

Server package implementing Expo Updates protocol endpoints with pluggable storage and observability.

> For now, production-ready storage in this repo is GitHub Repository storage (`ExpoUpGithubStorageProvider`).  
> Planned future providers include AWS S3, Firebase Storage, Google Cloud Storage, Azure Blob Storage, and others.

## Responsibilities

- Expose auth, project, manifest, and asset routes.
- Resolve latest/effective build for runtime + channel.
- Return multipart manifest responses for Expo clients.
- Support rollback-to-embedded directives.
- Attach code signatures when configured.
- Provide structured request lifecycle logs.

## Main Exports

- `createExpoUpServer(options)`
- `configureExpoUp(context, vars)`
- `ExpoUpGithubStorageProvider`
- types: `ServerOptions`, `ExpoUpContextVariables`, logger/error reporter types

## Core Configuration

```ts
import { Hono } from "hono";
import {
  configureExpoUp,
  createExpoUpServer,
  ExpoUpGithubStorageProvider,
} from "@expo-up/server";

const EXPO_UP_BASE_PATH = "/api/expo-up";

const app = new Hono();

app.use(`${EXPO_UP_BASE_PATH}/*`, async (c, next) => {
  configureExpoUp(c, {
    storage: new ExpoUpGithubStorageProvider(c.env.GITHUB_AUTH_TOKEN),
    certificate: {
      privateKey: c.env.CODESIGNING_APP_PRIVATE_KEY,
      keyId: c.env.CODESIGNING_APP_KEY_ID,
    },
  });
  await next();
});

app.route(
  EXPO_UP_BASE_PATH,
  createExpoUpServer({
    basePath: EXPO_UP_BASE_PATH,
    projects: {
      "example-expo-app": {
        owner: "your-org",
        repo: "your-updates-storage-repo",
      },
    },
  }),
);
```

## Endpoint Reference

Assuming base path `/api/expo-up`.

### `GET /api/expo-up/projects/:projectId`

Purpose:
- validate and resolve project mapping.

Success response:
- `200` with project descriptor payload.

Failure:
- `404` unknown project.

### `GET /api/expo-up/:projectId/manifest`

Purpose:
- return latest update manifest or rollback directive for runtime/channel/platform.

Important request headers:
- `expo-runtime-version` required
- `expo-platform` required (`ios` or `android`)
- `expo-channel-name` optional (defaults to `main`)
- `expo-current-update-id` optional (enables 204 if already current)
- `expo-protocol-version` optional
- `expo-expect-signature` optional (client expects signed parts)

Responses:
- `200` multipart response with manifest part and extensions part
- `200` multipart rollback directive when effective build resolves to embedded rollback
- `204` when client already has latest update id for same channel/runtime/protocol
- `404` when no builds found for channel/runtime
- `500` on storage or parsing/signing failures

When signing is configured:
- `expo-signature` is attached to the manifest part (or rollback part)
- signature includes `sig` and `keyid`

### `GET /api/expo-up/:projectId/assets?path=...&channel=...`

Purpose:
- stream JS bundle/asset blobs referenced by manifest URLs.

Query params:
- `path` required
- `channel` optional (defaults to `main`)

Responses:
- `200` blob stream
- `404` asset not found

### `GET /api/expo-up/auth/github`

Purpose:
- OAuth callback/flow endpoint for GitHub auth integration.

## Logging & Error Reporting

You can pass:
- `logger` with `debug/info/warn/error`
- `errorReporter.captureException(error, context)`

If no logger is provided, server uses console logger.

Log events include:
- request received/completed
- manifest request details
- manifest served/up-to-date/no-builds
- unhandled errors

## Local Development

```bash
bun install
bun run build
bun run test
bun run check-types
bun run lint
```

## End-to-End Test With Example Apps

1. Configure worker env and run:

```bash
cd ../../apps/example-hono-cf-worker
cp example.dev.vars .dev.vars
bun run dev
```

2. Start example Expo app:

```bash
cd ../example-expo-app
bun run ios
```

3. Trigger update checks and channel surf from app UI.
4. Verify server logs for manifest status, channel, build ID, update ID.

## Package

Published as `@expo-up/server`.
