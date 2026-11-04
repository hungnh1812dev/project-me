---
name: release-tag
description: Tag a release of this repo in two sittings - review the changes since the previous v* tag, pick the repo and app version bumps, write the CHANGELOG.md entry and the release commit on develop, then on main create the v<x.y.z> and <app>@<x.y.z> tags and push them after the user's yes. Use when the user says "tag a release", "release-tag" or "cut a release".
---

# Release Tag

Decision record: `docs/adr/0016-tag-driven-release-ci.md` (decision 8). Change log format: `docs/global/FLOW.md` "Versions and change log" rule 2.

All version and tag work goes through `scripts/release.sh`. Never edit a version or create a tag by hand, never read `.env*`, never push without the user's yes. Stop at the first refusal of the script and show its message.

## Which sitting

Run `git rev-parse --abbrev-ref HEAD`, then:

- **On `develop`**: sitting 1, steps 1-5.
- **On `main`**: if the root `package.json` version is newer than the latest `v*` tag (`git tag -l 'v[0-9]*' --sort=-v:refname | head -n 1`), `CHANGELOG.md` has a `## <root version>` heading and the tag `v<root version>` does not exist, go straight to step 6. Otherwise say there is nothing to tag and stop.
- **Any other branch**: say the release runs on `develop` (sitting 1) or `main` (sitting 2), and stop.

## Sitting 1 (develop)

1. **Changes.** Run `scripts/release.sh changes`. Show, per app (`cms-api`, `cms-admin`, `web`, `e2e`): current version, whether build inputs changed (`is_image_affected`) or only checks (`is_affected`), and its commits (subject lines). Show `repo_commits` apart. When `previous_tag` is empty, say this is the first release: every commit is listed and the tag run publishes all deployed apps.
2. **Repo bump.** Ask major, minor or patch. Recommend from the commit prefixes: `!` or `BREAKING CHANGE` major, `feat` minor, else patch.
3. **App bumps.** For each app ask major, minor, patch or none, recommending from that app's commits (`none` when it has none). When the user picks `none` for an app with `is_image_affected`, warn that its changes will not be published and ask once more.
4. **Submit.** Show the planned versions (old -> new for the repo and each app, unchanged marked "kept") and ask to submit.
5. **Changelog and release commit.**
   - Draft the full `CHANGELOG.md` entry: repo version and date, the versions table of apps and packages, New features, Changes, Bug fixes and DevOps patches (links to this release's `patch-*.md` files), built from the `## Unreleased` items plus the commits. Show it in full and ask to write it.
   - On yes: run `scripts/release.sh bump --repo <level> [--app <app>=<level>]...` (apps left at none are not passed), then write the entry under the new heading and move the `## Unreleased` items into it.
   - Run `.claude/bin/module-index --check` and `pnpm format:check`.
   - Propose the release commit with the `commit-convention` skill (`chore(root): release <x.y.z>`), asking the user before committing. Tell the user it reaches `main` through the normal develop -> staging -> main pull requests, then to run this skill again on `main`.

## Sitting 2 (main)

6. **Tags.**
   - Run `scripts/release.sh tag`. It fetches `origin/main`, requires `HEAD` to equal it, a clean tree, the `CHANGELOG.md` heading and a passing `release-apps.sh`, then creates annotated `v<x.y.z>` and one `<app>@<x.y.z>` per bumped app (every app on the first release). It never pushes.
   - Show the tags created. Ask before pushing.
   - On yes: push the repo tag alone and wait for the user to see the release run start, then push the app tags. Use the two commands the script printed.
