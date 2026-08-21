---
source_language: zh-CN
translation_of: testing-strategy.zh-CN.md
translation_status: synced
---

# Folder Nodes testing strategy

## Automated gates

`npm run check` pins Node/npm, then runs lint, formatting, bilingual-document contracts, strict TypeScript, coverage, production bundle, and release-layout checks. Core/Settings coverage thresholds are statements 80%, lines 80%, functions 75%, and branches 70%. Tests cover paths, selection naming, templates, Visual parsing, frontmatter patches, migration conflicts, leaf/folder exemptions, settings normalization, the property contract, and sparse ordering. Separate pure-UI tests lock the current and legacy Explorer disclosure selectors, before/into/after zones, internal drag-payload rejection, and Shift+F10/Menu-key recognition.

## Performance

A normal reorder plan among 10,000 direct Child Nodes must finish within two seconds and create one property patch. Local rebalance for crowded ranks is bounded to 64 nodes. Contents View creates at most 200 entries per section per batch. Album images draw once from resource URIs to canvas, and ordinary files do not read binary bodies.

## Isolated-Vault host acceptance

Only a disposable isolated Vault may validate plugin loading, all four settings pages, Follow Obsidian/English/Chinese, detailed maintenance preview, strictly read-only Health, both exemptions, homepage command/button/restart, before/after/hidden Explorer icons and title icons, canonical-note hiding, the disclosure-arrow/folder-title click boundary, Explorer and Contents before/into/after Node drag, all three Contents menus and Shift+F10/Menu keys, file drops onto a Node/header/breadcrumb, name collisions and descendant rejection, dragend/Escape cleanup, selection context preview, aliases and basename, template tokens, Visual Picker/inheritance, nodes without visuals, static Album, GIF stills, video tiles, compact audio/HEIC files, narrow sidebar, merge conflicts, and system-trash deletion. Acceptance must confirm no `<video>`, `<audio>`, or autoplay. Automated tests do not prove those host behaviors.

## Themes and accessibility

Check at least default light, default dark, and one third-party theme. Keyboard checks cover all four settings tabs, modal buttons, Contents cards/rows, More actions, context-menu keys, and breadcrumbs. Drag has equivalent menu move/reorder actions, and coarse-pointer targets are 44px. English and Chinese must not truncate critical buttons or node titles. Follow Obsidian must match Obsidian's current interface language. Images use empty decorative alt text or filename alt text. Explorer icons are checked for size, horizontal baseline, and name spacing.

## Production deployment

A production Vault requires explicit authorization for its exact path. Confirm Obsidian is stopped, preserve `data.json`, replace only `main.js`, `manifest.json`, and `styles.css`, and compute SHA-256 for candidate and deployed files. Production deployment is not acceptance; the user's manual acceptance result is recorded separately.
