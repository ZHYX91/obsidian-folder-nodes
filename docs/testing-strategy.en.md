---
source_language: zh-CN
translation_of: testing-strategy.zh-CN.md
translation_status: synced
---

# Folder Nodes testing strategy

## Automated gates

`npm run check` pins Node/npm, then runs lint, formatting, bilingual-document contracts, strict TypeScript, coverage, production bundle, and release-layout checks. Core/Settings coverage thresholds are statements 80%, lines 80%, functions 75%, and branches 70%. Tests cover paths, selection naming, templates, Visual parsing, frontmatter patches, migration conflicts, the property contract, and sparse ordering.

## Performance

A normal reorder plan among 10,000 direct Child Nodes must finish within two seconds and create one property patch. Local rebalance for crowded ranks is bounded to 64 nodes. Contents View creates at most 200 Node cards and 200 file cards per batch and does not read binary bodies.

## Isolated-Vault host acceptance

Only a disposable isolated Vault may validate plugin loading, both settings groups, Auto/English/Chinese, migration preview, initialization, Explorer opening, canonical-note hiding, before/into/after drag, selection context preview, aliases and basename, template tokens, Visual Picker/inheritance, Node cards, image gallery, narrow sidebar, merge conflicts, Health, and system-trash deletion. Automated tests do not prove those host behaviors.

## Themes and accessibility

Check at least default light, default dark, and one third-party theme. Keyboard checks cover settings tabs, modal buttons, Contents cards, and breadcrumbs; coarse-pointer targets are 44px. English and Chinese must not truncate critical buttons. Auto must match Obsidian's current language. Images use empty decorative alt text or filename alt text.

## Production deployment

A production Vault requires explicit authorization for its exact path. Confirm Obsidian is stopped, preserve `data.json`, replace only `main.js`, `manifest.json`, and `styles.css`, and compute SHA-256 for candidate and deployed files. Production deployment is not acceptance; the user's manual acceptance result is recorded separately.
