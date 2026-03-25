---
"@expo-up/cli": patch
---

Fix `expo-up history` so it exits cleanly in CI and non-interactive environments after printing results, while keeping the local interactive TUI behavior.
