---
source_language: zh-CN
translation_of: testing-strategy.zh-CN.md
translation_status: synced
---

# Folder Nodes testing strategy

## Automated gates

`npm run check` pins Node/npm, then runs lint, formatting, bilingual-document contracts, strict TypeScript, coverage, production bundle, and release-layout checks. Core, Settings, and critical structural adapters use thresholds of statements 80%, lines 80%, functions 75%, and branches 70%. Tests cover paths plus Windows reserved names and grapheme-safe truncation, selection naming, unresolved-link target and display-alias planning, Visuals, malformed frontmatter boundaries, non-Markdown migration collisions, exact-path/name-prefix unmanaged rules, protected system folders, deep settings normalization, the property contract, sparse ordering, and incremental reverse references. NodeService uses an in-memory Vault/FileManager behavior fixture covering serialized creates, transactional explicit-path Node creation and rollback, link-safe rename/move, relative placement, Root protection, startup repair, external-event reconciliation, ignored-subtree moves, migration TOCTOU and post-commit validation, merge conflicts, rollbacks, and lifecycle abort after an in-flight write. Adoption-state tests inject the first persistence failure and prove migration never starts. VaultOperationCoordinator tests lock serialization after failure, recursive event attribution, and TTL. UI/runtime tests lock Explorer-surface start/stop cleanup, note-title icons outside editable title text, disclosure selectors, before/into/after zones, drag payload, Shift+F10/Menu keys, and the settings explanation cards; source architecture contracts prohibit a global body observer, `vault.rename`, and Contents-wide `resolvedLinks` scans.

Regressions additionally inject a concurrent closed-file edit, an unsaved open editor, a same-path TFile replacement, and a same-path folder replacement during rollback. Settings-save tests delay and fail earlier persistence calls to prove snapshot isolation, ordering, and recovery of the queued latest state.

## Performance

The quick gate covers 10,000 and the large gate 100,000 direct Child Nodes; a normal reorder plan must finish within two seconds and create one property patch. Local rebalance for crowded ranks is bounded to 64 nodes. The reverse-reference benchmark builds quick 20,000/large 100,000-source indexes and applies 1,000 incremental removals; RefreshScheduler tests combine 10,000 requests into one batch. Contents View paginates Nodes, Album, and Files independently at 200 entries per batch. Album images draw once from resource URIs to canvas, and ordinary files do not read binary bodies.

## Isolated-Vault host acceptance

Only a disposable isolated Vault may validate plugin loading, all four settings pages, Follow Obsidian/English/Chinese, initialization-state messaging, detailed maintenance preview, strictly read-only Health, two unified unmanaged-content groups and their `.`/`_` defaults, homepage command/button/restart, the pinned non-collapsible Root row, before/after/hidden Explorer icons and title icons, title icons staying out of node-name text/cursor/copy, independent main-window and popout Explorers, complete DOM/listener/order restoration on disable, canonical-note hiding and safe rebuilding after note-only deletion, full startup repair, the disclosure-arrow/folder-title click boundary, Explorer and Contents before/into/after Node drag, all three Contents menus and Shift+F10/Menu keys, single-file drops onto a Node/header/breadcrumb, multi-selected link drags causing no partial moves, name collisions and descendant rejection, dragend/Escape cleanup, selection context preview/body write/source-wikilink replacement, aliases and basename, the naming explanation card, `[[a]]` and `[[a|b]]` direct creation with aliases both enabled and disabled, explicit paths and missing ancestors, modifier-click panes, popout documents, conflict rollback, ignored/exempt fallthrough, post-create reconciliation fallback, problem-node classification/repair, Visual Picker complete-list loading/add/remove/reorder/presets/two previews/inheritance/missing-image fallback/color accent/unknown preservation, nodes without visuals, static Album, GIF stills, video tiles, compact audio/HEIC files, independent pagination, narrow sidebar, merge conflicts, and system-trash deletion. Acceptance must confirm no `<video>`, `<audio>`, or autoplay. Automated tests do not prove those host behaviors.

## Themes and accessibility

Check at least default light, default dark, and one third-party theme. Keyboard checks cover all four settings tabs, modal buttons, Contents cards/rows, More actions, context-menu keys, and breadcrumbs. Drag has equivalent menu move/reorder actions, and coarse-pointer targets are 44px. English and Chinese must not truncate critical buttons or node titles. Follow Obsidian must match Obsidian's current interface language. Images use empty decorative alt text or filename alt text. The Root row is checked for one idempotent insertion, no disclosure control, keyboard activation, active state, and missing-note styling. Explorer icons are checked for size, horizontal baseline, and name spacing.

## Production deployment

A production Vault requires explicit authorization for its exact path. Confirm Obsidian is stopped, preserve `data.json`, replace only `main.js`, `manifest.json`, and `styles.css`, and compute SHA-256 for candidate and deployed files. Production deployment is not acceptance; the user's manual acceptance result is recorded separately.
