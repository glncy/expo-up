# Release Flow (PR -> next -> rc -> latest)

This repo uses **Changesets + GitHub Actions + npm dist-tags**.
The repo follows the standard **persistent prerelease mode** pattern for `next` and `rc`.

## Dist-tag naming

- `next`: snapshot builds from `main` (continuous integration releases)
- `rc`: snapshot builds for a GitHub **pre-release**
- `latest`: stable production release

These are standard and good names in npm ecosystems.

## End-to-end flow

### 1) Pull Request (quality gate)

Workflow: `.github/workflows/pr-quality.yml`

On every PR:
1. Build runs first.
2. Test, lint, and type-check run in parallel after build passes.
3. Turbo + Bun caches are used for speed.

If a PR changes publishable packages, add a changeset:

```bash
bun run changeset
```

Commit the generated file under `.changeset/`.

### 2) Merge to `main` (publish `next` prereleases)

Workflow: `.github/workflows/publish.yml` (`push` on `main`)

1. Build runs first.
2. Test, lint, and type-check run in parallel.
3. If checks pass, versions are generated and published:

```bash
bun run release:next
```

Result: npm gets prerelease installs like:

```bash
npm i @expo-up/cli@next @expo-up/server@next @expo-up/core@next
```

Note:
- `next` publish runs only when:
  - pending `.changeset/*.md` files exist
  - prerelease mode is active with tag `next`
- This prevents no-op attempts to republish already published versions.

### 3) Version PR (prepare stable versions)

Workflow: `.github/workflows/version-packages.yml`

On pushes to `main`, Changesets opens/updates:
- PR title: `chore: version packages`
- commit: `chore: version packages`

That PR contains:
- version bumps in changed packages
- changelog updates
- dependency bumps between internal packages (for example, if `core` changed)

Important:
- This PR is for the **stable/latest** release path.
- You usually **do not merge it immediately** if you are still validating on `next`/`rc`.
- Merge this PR only when you are ready to ship stable `latest`.
- During prerelease mode (`next` or `rc`), this workflow is skipped.

### 4) RC release (GitHub pre-release)

Workflow: `.github/workflows/publish.yml` (`release.published` + prerelease=true)

Publishing command:

```bash
bun run release:rc
```

Result: npm rc installs:

```bash
npm i @expo-up/cli@rc @expo-up/server@rc @expo-up/core@rc
```

Note:
- `rc` publish runs only when:
  - pending `.changeset/*.md` files exist
  - prerelease mode is active with tag `rc`

### 5) Latest release (GitHub release)

Workflow: `.github/workflows/publish.yml` (`release.published` + prerelease=false)

Publishing command:

```bash
bun run release
```

Result: stable versions are published to `latest`.

Prerequisite for stable:
- Merge the `chore: version packages` PR first, then publish stable release.
- Stable publish is intentionally triggered manually by creating a GitHub Release/tag (recommended human gate).

## How package selection works

Changesets decides what to version/publish from committed changesets:

- only `cli` changed -> `@expo-up/cli` publishes
- only `server` changed -> `@expo-up/server` publishes
- `core` changed -> `@expo-up/core` publishes, and dependent packages are bumped according to Changesets/internal dependency rules

This keeps versions synchronized without manually selecting packages in CI.

## Practical team workflow

1. Enter `next` prerelease mode once:
```bash
bun run pre:enter:next
git add .changeset/pre.json
git commit -m "chore: enter next prerelease mode"
git push
```
2. Open PR with code changes.
3. Add a changeset (`bun run changeset`) for any publishable package change.
4. Merge PR to `main` -> publishes `-next.0`, `-next.1`, `-next.2`, etc.
5. When moving to RC, switch prerelease tag:
```bash
bun run pre:enter:rc
git add .changeset/pre.json
git commit -m "chore: switch to rc prerelease mode"
git push
```
6. Create GitHub **pre-release** to publish/install `rc`.
7. When ready for stable:
```bash
bun run pre:exit
git add .changeset/pre.json
git commit -m "chore: exit prerelease mode"
git push
```
8. Merge `chore: version packages` PR.
9. Manually create GitHub **release** (tag) to publish `latest`.

## Publish authentication

- Uses npm Trusted Publishing (OIDC), not long-lived npm tokens.
- Ensure npm trusted publisher is configured for this repo/workflow.
- Publish jobs use GitHub Actions `id-token: write` permission.

## Optional naming alternatives

If you ever want different channel semantics:
- `next` -> `beta`
- `rc` -> `preview`

Current setup intentionally keeps `next` + `rc` + `latest`.
