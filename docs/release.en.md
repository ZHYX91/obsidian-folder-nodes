---
source_language: zh-CN
translation_of: release.zh-CN.md
translation_status: synced
---

# Folder Nodes — Release procedure

## Version and candidate

`package.json`, `manifest.json`, `versions.json`, and CHANGELOG use one version. A candidate contains only `main.js`, `manifest.json`, `styles.css`, and the versioned zip produced by one production build. Record commit, tree, file sizes, and SHA-256 after the build; later stages do not rebuild or replace the candidate.

## Release gates

Before candidacy, run `npm ci`, `npm run check`, `npm run release:check`, and the large-directory benchmark. Isolated-Vault host acceptance binds to the exact candidate. The four settings pages, homepage, Explorer/title icons, disclosure arrow, Explorer/Contents Node drag, all three Contents menus and keyboard access, ordinary-file into moves and conflict rejection, selection context menus, Visuals, static Album, both exemptions, detailed maintenance preview, read-only Health, and deletion are not claimed as host-verified in README or release notes without dated evidence. Acceptance separately confirms Folder Nodes creates no GIF, video, or audio playback controls.

## Git and GitHub

Local commit, push, tag, GitHub Release, Obsidian community submission, and production-Vault deployment are separate actions. Commits use normal Git identity and a Conventional Commit subject. Do not push, tag, publish a Release, or submit to the community directory without explicit user authorization.

Before tagging, manually run the read-only Release preflight from the current remote default-branch
HEAD with the proposed version. It requires the remote tag and same-version Release to be absent,
runs the full gate, and builds the manual-install ZIP without publishing. Only a numeric tag push
enters the write-enabled stage. A failed tag workflow is safely rerunnable: an existing Release is
accepted as a successful no-op only when it is stable, immutable, has the exact four assets, matches
the current candidate byte for byte, and every provenance record binds the same tag and commit.
Otherwise publish a higher version; never overwrite, edit, or append same-tag assets. `SHA256SUMS`
stays inside the workflow handoff, while the public Release contains the three loose assets and the
versioned ZIP.

## Production Vault

Before deployment, confirm the exact Vault, plugin ID, and Obsidian process state. Preserve existing `data.json`. Copy only the exact candidate's three runtime files, recompute hashes after deployment, and confirm enabled state. A production Vault never receives migration fixtures or automated destructive acceptance.

## Release content

Release notes list only implemented and verified behavior, migration instructions, the supported property contract, compatibility, and known limitations. The supported property contract comprises `aliases`, `icon`, `folderNodeChildrenSort`, and `folderNodeSiblingRank`. Screenshots come from an accepted Obsidian host and contain no private Vault information.
