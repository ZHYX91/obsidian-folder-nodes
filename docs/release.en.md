---
source_language: zh-CN
translation_of: release.zh-CN.md
translation_status: synced
---

# Folder Nodes — Release procedure

This document defines the repeatable Folder Nodes release process. Source, the Candidate Bundle,
product acceptance, GitHub publication, and production-Vault deployment remain separate.

## Boundaries

An authorized stable version tag push triggers publication. Manual dispatch on the same tag supports verify-only or publish mode through the same workflow. Host acceptance is optional; publishing does not deploy to a Vault.

## Version and source

`manifest.json`, `package.json`, `package-lock.json`, `versions.json`, and CHANGELOG use one
canonical version and bind the exact commit/tree. A clean worktree must pass
`npm run release:check`, including the quick/large ordering guardrails and tag-identity gate.

## Candidate Bundle v3

The vendored release-core `3.0.0` and thin adapter create the sole Candidate Bundle v3 containing
`main.js`, `manifest.json`, `styles.css`, `folder-nodes-x.y.z.zip`, `SHA256SUMS`, and
`candidate-bundle.json`. It also binds the toolchain, core/config/workflow, product payload,
scenario contract, and every fixture hash; there is no receipt or envelope dual stack.

## Optional product acceptance

Use the same Bundle for desktop and Android-emulator acceptance covering the canonical
`folder-nodes` list, legacy compatibility and explicit property migration, hidden nodes and
inherited descendants, the Root-row session eye, grouped node actions, structural preview,
selection creation, sparse ordering, and Node Graph scopes, property-only subtree hiding, handles,
search, 2D/3D, touch targets, and restart. Android
physical devices and iOS are out of scope.

## Standalone workflow

Tag push and manual dispatch use the same build, publish, and post-verification jobs. The read-only build job produces and verifies the Bundle. Publication downloads that fixed artifact without rebuilding and verifies the event, tag, commit, and Bundle digest before writing. Manual verify mode performs no publication.

## Publication and verification

Actions generates SLSA build provenance for the four public assets. The publisher verifies their source, tag and workflow, creates a draft, downloads and checks all draft assets, then publishes the immutable Release. A separate job checks the hosted release. Only the three loose files and versioned ZIP are public assets; Bundle metadata stays in the CI artifact. GitHub publication and Community Directory review are separate outcomes.

## Failure, rollback, and deployment

An existing same-tag Release is a zero-write no-op only when exact; any difference fails without
overwrite and fixes use a new version. Production-Vault deployment requires separate authorization
for the exact Vault and preserves `data.json`; isolated-Vault or emulator results never authorize a
production deployment.
