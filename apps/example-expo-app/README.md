# example-expo-app

Example Expo app for validating OTA updates from the local `expo-up` server.

## Setup

```bash
bun install
```

## Run

```bash
bun run ios
```

or

```bash
bun run android
```

## What To Test

- `Fetch update` button
- `Channel Surf` input + `SURF` button
- Update logs panel
- Update details (endpoint/channel/build)

## End-to-End Flow

1. Start worker server:

```bash
cd ../example-hono-cf-worker
bun run dev
```

2. Release an update from this app root:

```bash
bunx expo-up release --channel main --platform all
```

3. Return to app and fetch updates.

## Useful CLI Commands (from this folder)

```bash
bunx expo-up whoami
bunx expo-up history --channel main
bunx expo-up rollback --channel main --to <build-id>
```
