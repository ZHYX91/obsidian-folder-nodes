# Changelog

## Unreleased

- Rebuilt Node Graph around progressive per-scope expansion, independent multi-branch and range controls, node-card handles, native search with state restoration, and session-only expansion that returns to a safe one-level default after restart.
- Kept structure as the permanent graph skeleton and replaced Structure/Links/Hybrid with a default-off resolved-link overlay, including compatible migration of existing workspace relation state.
- Unified 2D and 3D around one incrementally refreshed graph scene, preserving all visible structure edges, constant-DOM Canvas rendering, readable large-graph presentation, narrow/coarse-pointer controls, and unobstructed status feedback.
- Added Android support while keeping HTML5 node/file drag-and-drop desktop-only; mobile retains native folder moves plus plugin Move, Move up, and Move down actions.
- Reconciled child-owned sparse rank metadata after a folder is moved natively across parents, preventing a stale source-parent rank from disturbing a manual target order.
- Replaced the icon-versus-file-name guide's unexplained numeric examples with neutral `Project`, `A Project`, and `📓 Project` comparisons.
- Removed the initialization gate: Folder Nodes now classifies managed folders and Markdown continuously, synchronizes unambiguous complete pairs immediately, and keeps native creation non-destructive.
- Added neutral Incomplete node and gray Unmanaged states for both folder and Markdown halves, with explicit complete, convert, Set as unmanaged, and Manage again actions.
- Kept New node beside Obsidian's native New note and New folder actions so users can create a complete pair atomically or complete either native half later.
- Replaced wildcard-looking unmanaged-rule labels with plain-language name-start rules and kept exact Markdown and folder-subtree exclusions in plugin settings.
- Replaced initialization with optional preview-first bulk organization in General settings, including a cancellable responsive scan and exact create, move, skip, and conflict paths.
- Reindexed migration candidates by parent folder, eliminating the previous folder-by-Markdown quadratic scan and adding 100,000-item scan coverage.
- Added an Emoji font setting that detects a curated set of installed color fonts, previews complex sequences, applies the choice across workspace windows, and safely falls back to the system stack.

## 0.4.0

- Made the embedded stylesheet the single runtime authority in every Obsidian window, with one versioned plugin-owned constructable stylesheet that is refreshed after host CSS lifecycle changes and removed on unload.
- Removed native stylesheet readiness probing, delayed retries, all dual-path fallback logic, and the duplicated active release stylesheet.
- Closed Obsidian 1.13 cold-start races by registering the final readiness check before accessing the root Workspace document and moving root-document events, authoritative styles, and one-time workspace initialization behind that boundary.
- Replaced bordered icon badges with one frameless, fixed-size visual slot; normalized SVG, glyph, emoji, image, and color-swatch sizing; and made `color:` a foreground color for glyph/Lucide visuals or a circular fallback only after every base candidate fails.
- Center-aligned decorated File Explorer rows so SVG, image, emoji, and status-badge baselines cannot change row height.
- Aligned Folder Nodes with Obsidian's native file and folder actions: native note move/delete remains note-only, native folder actions remain subtree-wide, canonical folder/note renames stay synchronized, and explicit “containing node” actions handle whole-node operations.
- Made folder-only nodes a supported neutral state, removed automatic Node Note recreation and ordinary-Markdown conversion, and kept startup validation read-only.
- Made selection-created links safe inside Markdown table cells with `\|` aliases and fail-closed rejection for cross-cell or cross-row selections.
- Refined Settings hierarchy and icon guidance, added a visible badge distinction between property icons and filename characters, separated glyph/CJK/emoji font fallbacks, and measured title-icon alignment without changing title text.
- Corrected real-host UI regressions by shielding settings tabs from theme button overrides, strengthening property-icon badge contrast, documenting color-only and accented-icon behavior, and aligning title badges to the first title line inside padded editor hosts.
- Added direct Folder Node creation for unresolved managed Markdown links, including transactional explicit paths, modifier-click panes, and optional `[[a|b]]` display aliases.
- Added a Selection & naming explanation card and expanded the aliases switch across selection and unresolved-link creation.
- Aligned unmanaged folder and Markdown metadata in Node Contents with one shared status badge and separate Folder/MD type columns.
- Rebuilt structural operations around one serialized coordinator, FileManager-only rename/move, preflight validation, post-validation, and recoverable rollback.
- Replaced coarse event suppression with expected-event attribution at Vault event boundaries; added full managed startup repair and recursive adoption of formerly ignored subtrees.
- Scoped File Explorer observation and event handling to each Explorer leaf, including popouts, with batched decoration and complete unload cleanup/restoration.
- Moved note-title visuals outside editable title text so icons cannot enter node names, cursors, selections, or copied titles.
- Added coalesced path-targeted refreshes and an incremental reverse-reference index to remove repeated full-Vault rendering scans.
- Added real single-file drops in Contents, independent section pagination, cancellable image loading, and explicit link-only behavior for multi-selected drags.
- Hardened Windows/grapheme path sanitization, case-only canonical names, malformed-frontmatter refusal, nested settings normalization, migration TOCTOU checks, non-Markdown target collisions, and modal cancellation during writes.
- Expanded behavioral, runtime-lifecycle, architecture-contract, rollback, event-coordination, refresh-storm, and 100,000-item performance coverage.

- Made initialization explicit before automatic synchronization, with distinct uninitialized and maintenance states.
- Removed the partial built-in Node Note template feature; new nodes use blank notes or selection content.
- Added protected system folders plus two unified unmanaged-content rule groups, with exact paths and first-release `.`/`_` name-prefix defaults for both Markdown files and folders.
- Added warning-marked incomplete nodes and explicit repair or unmanaged-rule actions in Node Contents.
- Added a pinned, non-collapsible Root row to File Explorer with distinct active and missing-note states.
- Normalized Vault root paths so root breadcrumbs do not render duplicate separators.
- Fixed an Explorer icon MutationObserver feedback loop that could freeze Obsidian after assigning a Node Visual.
- Fixed File Explorer disclosure-arrow clicks for current Obsidian collapse-icon markup while retaining legacy compatibility.
- Added complete Node Contents menus through right-click, More actions, Shift+F10, and the Menu key, with third-party `file-menu` extension support.
- Added before/into/after child-node placement and ordinary-file into moves onto nodes, the current-node header, and breadcrumbs without file-order metadata.
- Added ordered `icon` Text/List declarations with local fallback, single-glyph candidates, `color:` accents, and preserved unknown entries.
- Added Visual Picker list editing, reorder controls, presets, diagnostics, and live File Explorer/Contents previews.
- Documented selection-body writes and wikilink replacement, canonical-note safety, deterministic manual ranks, and Root/Contents resolution.

## 0.3.0

- Added an optional Vault-root homepage with a command, Node Contents button, and startup preference.
- Split settings into General, Homepage, Icons & appearance, and Selection & naming pages.
- Added before/after/hidden File Explorer icon placement and optional Folder Node title icons with Obsidian-aligned sizing.
- Reworked Node Contents into Nodes, Album, and compact Files sections; fixed clipped names and removed fallback folder artwork from unstyled child nodes.
- Kept the Album static: GIFs render a still frame, videos render a type tile, and Folder Nodes provides no animation, video, or audio playback controls.
- Unified initialization and migration behind one exact-path preview and made Health strictly read-only.
- Added separate exact leaf-note and unmanaged-folder exemptions, including root `AGENTS.md` and `CLAUDE.md` defaults.

## 0.2.0

- Added editor context-menu selection creation with an exact path, alias, and wikilink preview.
- Added responsive Node Contents cards, lazy Vault image thumbnails, breadcrumbs, and bounded paging.
- Added Emoji, Lucide, Vault image, and CSS color Node Visuals with optional ancestor inheritance.
- Added before, into, and after File Explorer drag placement, complete-node merge, and template tokens.
- Added Follow Obsidian/English/Simplified Chinese UI and native-style settings, menus, modals, and notices.
- Finalized the first public ordering fields as `folderNodeChildrenSort` and `folderNodeSiblingRank`.
- Expanded bilingual product, UX, architecture, testing, release, and user documentation.

## 0.1.0

- Internal prototype; not publicly released.
