---
source_language: zh-CN
translation_of: testing-strategy.zh-CN.md
translation_status: synced
---

# Folder Nodes testing strategy

## Automated tests

Unit tests cover paths, selection naming, minimal frontmatter patches, migration conflicts, and sparse ordering. Coverage gates are 80% statements, 80% lines, 75% functions, and 70% branches.

## Performance tests

A regular reorder among 10,000 direct children must create one property patch and finish planning within two seconds.

## Host acceptance

Only an isolated Vault validates plugin loading, two-tab settings, node creation, selection aliases, migration preview, Explorer opening, contents view, and trash deletion.

## Production deployment

Production Vault deployment is not an acceptance substitute. Verify the three runtime hashes before and after deployment, preserve existing data.json, and record enablement separately.
