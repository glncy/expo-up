# @expo-up/core

Shared domain primitives and utilities consumed by both `@expo-up/cli` and `@expo-up/server`.

`@expo-up/core` exists to keep protocol defaults and parsing logic centralized so client/server behavior stays consistent.

## Responsibilities

- Define shared constants (`main`, `__INIT__`, embedded rollback marker, default base path).
- Parse and validate project descriptors (`owner` + `repo`).
- Resolve rollback chains safely (depth guard + cycle detection).
- Parse Expo Updates URL into `serverUrl` + `projectId`.
- Validate safe asset paths for runtime build roots.
- Provide shared TS types used across packages.

## Exports

From `src/index.ts`:
- `constants`
- `project`
- `rollback`
- `types`
- `url`

### Constants

From `constants.ts`:
- `DEFAULT_CHANNEL = "main"`
- `INIT_CHANNEL = "__INIT__"`
- `EMBEDDED_ROLLBACK_TARGET = "EMBEDDED"`

These values are used by CLI defaults and server route/path behavior.

### Project Parsing

From `project.ts`:
- `parseProjectDescriptor(value)`

Behavior:
- Requires an object with non-empty string `owner` and `repo`.
- Throws descriptive errors on invalid payloads.

Used by CLI when reading `/projects/:projectId` responses.

### Rollback Resolution

From `rollback.ts`:
- `resolveRollbackTarget({ latestBuildId, loadRollbackTarget, maxDepth? })`

Behavior:
- Traverses rollback pointer chain (`build -> build -> ...`).
- Supports terminal `EMBEDDED` target.
- Detects cycles and throws.
- Enforces `maxDepth` (default 25).

Useful for any storage implementation that models rollbacks via pointer files.

### URL Utilities

From `url.ts`:
- `parseExpoUpUpdatesUrl(rawUpdatesUrl, basePath?)`
- `isSafeAssetPath(pathValue, runtimeBasePath)`

`parseExpoUpUpdatesUrl`:
- Extracts `{ serverUrl, projectId }` from Expo `updates.url`.
- Returns empty strings on invalid/unexpected URL shape.

`isSafeAssetPath`:
- Blocks path traversal (`..`).
- Normalizes slashes.
- Ensures path is under runtime base path prefix.

### Types

From `types.ts`:
- `ProjectDescriptor`
- `ParsedExpoUpUrl`

## How Other Packages Use Core

- `@expo-up/cli`
  - uses constants (`DEFAULT_CHANNEL`, `INIT_CHANNEL`)
  - parses project response payload with `parseProjectDescriptor`
- `@expo-up/server`
  - can reuse rollback and URL/path primitives for route handling and validations

## Usage Examples

```ts
import {
  DEFAULT_CHANNEL,
  parseProjectDescriptor,
  parseExpoUpUpdatesUrl,
  resolveRollbackTarget,
} from "@expo-up/core";

const channel = DEFAULT_CHANNEL; // "main"

const project = parseProjectDescriptor({ owner: "glncy", repo: "storage" });

const parsed = parseExpoUpUpdatesUrl(
  "http://localhost:8787/api/expo-up/example-expo-app/manifest",
);
// parsed => { serverUrl: "http://localhost:8787/api/expo-up", projectId: "example-expo-app" }

const rollback = await resolveRollbackTarget({
  latestBuildId: 10,
  loadRollbackTarget: async (buildId) => {
    if (buildId === 10) return "8";
    if (buildId === 8) return "EMBEDDED";
    return null;
  },
});
// rollback => { buildId: 8, target: "EMBEDDED", isEmbedded: true }
```

## Local Development

```bash
bun install
bun run build
bun run test
bun run check-types
bun run lint
```

Workspace-scoped:

```bash
bun run --filter @expo-up/core test
bun run --filter @expo-up/core check-types
```

## Package

Published as `@expo-up/core`.
