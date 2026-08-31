---
source_language: zh-CN
translation_of: release.zh-CN.md
translation_status: synced
---

# Folder Nodes — Release procedure

## Version and candidate

`package.json`, `manifest.json`, `versions.json`, and CHANGELOG use one version. A candidate contains only `main.js`, `manifest.json`, `styles.css`, and the versioned zip produced by one production build. Record commit, tree, file sizes, and SHA-256 after the build; later stages do not rebuild or replace the candidate.

## Release gates

Before candidacy, run `npm ci`, `npm run check`, and `npm run release:check`. The ordinary
check includes common metadata, exact production-inventory, and vendored release-core validation;
the release gate additionally checks local tag state and runs both directory benchmarks.
Isolated-Vault host acceptance binds to the exact candidate. Desktop covers the five settings pages, homepage, Explorer/title icons, disclosure arrow, Explorer/Contents Node drag, all three Contents menus and keyboard access, ordinary-file into moves and conflict rejection, selection context menus, Visuals, static Album, both exemptions, detailed maintenance preview, read-only Health, and deletion. It also covers Node Graph progressive Global/Subtree/Local defaults, Local parent context without sibling escape, multiple branches, direct/Alt/range expansion, session-only expansion with a safe restart default, old relation-state migration, SearchComponent reveal/restore, external focus, links off by default and independently enabled, node menus, tooltips and keyboard controls, narrow-window wrapping, 2D/3D shared selection, and large-scene safety without graph-covering notices. Acceptance separately confirms Folder Nodes creates no GIF, video, or audio playback controls.

The Node Graph repository/desktop candidate handoff requires automated narrow-screen, coarse-pointer, and touch coverage but does not make a real Android run a blocking gate. If Android is not run, record it as **not covered**, never passed. A separately authorized mobile acceptance may use the current emulator to cover Node Graph scopes, handles, search, 2D/3D, touch targets, and restart together with the existing no-draggable, native-move, menu, rank, and narrow-layout scenarios. Emulator, physical-device, and iOS claims do not substitute for one another; no iOS result is implied.

## Git and GitHub

Local commit, push, tag, GitHub Release, Obsidian community submission, and production-Vault deployment are separate actions. Commits use normal Git identity and a Conventional Commit subject. Do not push, tag, publish a Release, or submit to the community directory without explicit user authorization.

Build one deterministic candidate handoff with the vendored release core. The workspace records a
separate candidate envelope, passing acceptance closure, and explicit single-candidate publication
authorization. Creating the exact numeric tag at the accepted commit remains a separate,
explicitly authorized action; pushing that tag does not publish anything.

The manual workflow defaults to read-only `verify`. The workspace dispatches `publish` only with
the exact candidate commit and candidate/envelope/closure/authorization digests plus the original
portable closure and authorization bytes. The verification job reproduces the candidate and
uploads one fixed artifact. The write-enabled job decodes and validates that evidence, checks the
core publication boundary, then runs a read-only GitHub preflight before any write. A missing
Release permits staging, attestation, and creation; an exact existing Release whose bytes and
provenance pass every check is a zero-write safe rerun; any conflict fails before those writes.
`publish-github` repeats the boundary and existing-state check. A separate post-verification job
reads back hosted bytes, asset metadata, tag identity, and provenance. Otherwise publish a higher
version; never overwrite, edit, or append same-tag assets.
`candidate.json` and `SHA256SUMS` stay inside the workflow handoff, while the public Release
contains the three loose assets and the versioned ZIP.

## Production Vault

Source, PR, and isolated-candidate completion stop before production deployment unless the user separately authorizes the exact Vault. Before deployment, confirm the exact Vault, plugin ID, and Obsidian process state. Preserve existing `data.json`. Copy only the exact candidate's three runtime files, recompute hashes after deployment, and confirm enabled state. A production Vault never receives migration fixtures or automated destructive acceptance.

## Release content

Release notes list only implemented and verified behavior, migration instructions, the supported property contract, compatibility, and known limitations. The supported property contract comprises `aliases`, `icon`, `folderNodeChildrenSort`, and `folderNodeSiblingRank`. Screenshots come from an accepted Obsidian host and contain no private Vault information.
