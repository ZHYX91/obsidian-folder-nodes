---
source_language: zh-CN
translation_of: product-requirements.zh-CN.md
translation_status: synced
---

# Folder Nodes product requirements

## Product model

Every managed folder in a managed Vault is a Folder Node with exactly one same-named Node Note: `A/A.md`. Root is also a node with its Node Note at the Vault root. Every non-exempt Markdown document belongs in its own same-named folder; ordinary non-Markdown files may belong directly to a node. Folder Nodes writes no permanent ID, `_pkwf`, path, parent, name, node type, or complete child list.

## Sort properties

Natural name order writes no sort property. Manual order uses `folderNodeChildrenSort: manual` on the parent Node Note and a sparse positive `folderNodeSiblingRank` on each direct Child Node Note. A normal reorder writes only the moved node; local rebalance is bounded to 64 nodes.

## Node operations

Users can create, rename, move, merge, safely delete, and reorder complete nodes. Explorer drag placement means before, into, or after: same-parent placement reorders, and cross-parent placement reparents and reorders. Conflicts, cyclic moves, and ambiguous merges fail closed. Default templates support `{{name}}`, `{{path}}`, `{{parent}}`, and `{{date}}`.

## Selection creation

Editor commands and context menus create Child Nodes from selected text. Creation previews the final `A/A.md`, alias, and wikilink. Aliases use only selected visible text; prefixes, suffixes, independent separators, and timestamps affect only the basename. Sources are current file, current node, nearest current heading, timestamp, and custom text.

## Homepage and structural exemptions

Users may make the Root Node Note a homepage, open it by command or from Contents View, and optionally open it after Vault layout restoration. A leaf-note exemption is an exact Vault-relative Markdown path. A folder exemption applies to the complete subtree and stops initialization, migration, and structural repair. Exemption does not mean hidden. Root `AGENTS.md` and `CLAUDE.md` are leaf-note exemptions by default.

## Node Visual and Contents View

`icon` is the only Node Visual property. Text and List values select the first valid emoji, Lucide icon, Vault image, or CSS color and may inherit from the nearest ancestor. File Explorer icons may appear before or after the name or remain hidden, and may also appear in a Node Note title; size and alignment follow Obsidian. File Explorer is the only global Node Tree. The sidebar browses only direct contents through Nodes, a static Album, and compact Files. Child nodes without a valid visual have no large fallback artwork. GIFs use a still frame, videos use a type tile, and audio stays in Files. The plugin provides no animation, video, or audio playback.

## Adoption and safety

Initialization and migration share one read-only scan that lists every create, move, skip, and block path before explicit apply. Health reuses the summary but is strictly read-only and has no write button. Conflicts block commit. Managed state uses stable, coalesced Vault events and respects both exemption types; unique lossless issues may be repaired. Complete-node deletion uses system trash. The plugin makes no network requests.

## v1 boundary

v1 excludes remote image fetching, inline SVG recoloring, PDF first-page thumbnails, HEIC/HEIF preview, video frame extraction, animation/video/audio playback, ordinary-file drag or independent ordering in Contents View, a second complete directory tree, alternate Node Note naming, complex merge-conflict UI, and arbitrary property inheritance.
