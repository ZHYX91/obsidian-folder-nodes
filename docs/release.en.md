---
source_language: zh-CN
translation_of: release.zh-CN.md
translation_status: synced
---

# Folder Nodes release contract

## Version and gates

Manifest, package, lockfile, versions, and the tag without a `v` prefix must agree. Use Node 24.18.0 and npm 11.16.0 and pass `npm run release:check`.

## Assets

Public runtime files are exactly `main.js`, `manifest.json`, and `styles.css`; the archive is `folder-nodes-<version>.zip`.

## CI and publication

CI builds once and uploads a fixed candidate. Publication downloads by artifact ID and digest, validates SHA256, creates attestations, then publishes the verified tag and checks immutable assets.

## Action boundaries

Local commit, push, tag, GitHub Release, community submission, and production Vault deployment are separate actions and do not imply one another.
