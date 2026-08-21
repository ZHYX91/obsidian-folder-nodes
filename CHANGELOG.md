# Changelog

## Unreleased

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
