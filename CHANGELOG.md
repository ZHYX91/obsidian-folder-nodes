# Changelog

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
