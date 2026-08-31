---
source_language: zh-CN
translation_of: release.zh-CN.md
translation_status: synced
---

# Folder Nodes — Release procedure

This document defines the repeatable Folder Nodes release process. Source, the Candidate Bundle,
product acceptance, GitHub publication, and production-Vault deployment remain separate.

## Boundaries

An ordinary tag push does not trigger publication. Commit, push, tag, workflow dispatch, GitHub
Release, and production-Vault deployment are separately authorized; passing a gate never expands
authority.

## Version and source

`manifest.json`, `package.json`, `package-lock.json`, `versions.json`, and CHANGELOG use one
canonical version and bind the exact commit/tree. A clean worktree must pass
`npm run release:check`, including the quick/large ordering guardrails and tag-identity gate.

## Candidate Bundle v3

The vendored release-core `2.0.0` and thin adapter create the sole Candidate Bundle v3 containing
`main.js`, `manifest.json`, `styles.css`, `folder-nodes-x.y.z.zip`, `SHA256SUMS`, and
`candidate-bundle.json`. It also binds the toolchain, core/config/workflow, product payload,
scenario contract, and every fixture hash; there is no receipt or envelope dual stack.

## Product acceptance

The same Bundle requires desktop and Android-emulator acceptance covering hidden nodes and
inherited descendants, session reveal, preview-first migration, selection creation, sparse
ordering, and Node Graph scopes, handles, search, 2D/3D, touch targets, and restart. Android
physical devices and iOS are out of scope.

## Standalone workflow

The generated, checked-in standalone workflow accepts only explicit `workflow_dispatch`. Its
read-only verify job performs one independent install and one complete `release:check` at the exact
commit, rebuilds the Bundle, and source-verifies it. The publish job downloads that artifact and
performs transport verification without restoring `dist`.

## Publication and verification

A passing closure does not authorize publication; separate authorization binds the same Bundle
and closure. Before the first mutation, the workflow deeply validates both records, the tag, and a
read-only preflight. The public Release contains exactly the three loose assets and versioned ZIP;
`SHA256SUMS` and `candidate-bundle.json` remain in the private Bundle. Post-verification reads back
all hosted bytes and provenance.

## Failure, rollback, and deployment

An existing same-tag Release is a zero-write no-op only when exact; any difference fails without
overwrite and fixes use a new version. Production-Vault deployment requires separate authorization
for the exact Vault and preserves `data.json`; isolated-Vault or emulator results never authorize a
production deployment.
