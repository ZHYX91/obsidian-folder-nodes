---
source_language: zh-CN
translation_of: release.zh-CN.md
translation_status: synced
---

# Folder Nodes release procedure

## Version and candidate

`package.json`, `manifest.json`, `versions.json`, and CHANGELOG use one version. A candidate contains only `main.js`, `manifest.json`, `styles.css`, and the versioned zip produced by one production build. Record commit, tree, file sizes, and SHA-256 after the build; later stages do not rebuild or replace the candidate.

## Release gates

Before candidacy, run `npm ci`, `npm run check`, `npm run release:check`, and the large-directory benchmark. Isolated-Vault host acceptance binds to the exact candidate. The four settings pages, homepage, Explorer/title icons, drag placement, selection context menus, Visuals, static Album, both exemptions, detailed maintenance preview, read-only Health, and deletion are not claimed as host-verified in README or release notes without dated evidence. Acceptance separately confirms Folder Nodes creates no GIF, video, or audio playback controls.

## Git and GitHub

Local commit, push, tag, GitHub Release, Obsidian community submission, and production-Vault deployment are separate actions. Commits use normal Git identity and a Conventional Commit subject. Do not push, tag, publish a Release, or submit to the community directory without explicit user authorization.

## Production Vault

Before deployment, confirm the exact Vault, plugin ID, and Obsidian process state. Preserve existing `data.json`. Copy only the exact candidate's three runtime files, recompute hashes after deployment, and confirm enabled state. A production Vault never receives migration fixtures or automated destructive acceptance.

## Release content

Release notes list only implemented and verified behavior, migration instructions, the property contract, compatibility, and known limitations. `aliases`, `icon`, `folderNodeChildrenSort`, and `folderNodeSiblingRank` are the first public contract; unpublished prototypes receive no compatibility claim. Screenshots come from an accepted Obsidian host and contain no private Vault information.
