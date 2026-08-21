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

Users can create, rename, move, merge, safely delete, and reorder complete nodes. Explorer and Contents child-node drag placement mean before, into, or after: same-parent placement reorders, and cross-parent placement reparents and reorders. Conflicts, cyclic moves, and ambiguous merges fail closed. Folder Nodes creates blank Node Notes; content templating belongs to dedicated template plugins.

## Selection creation

Editor commands and context menus create Child Nodes from selected text. Creation previews the final `A/A.md`, alias, and wikilink. Aliases use only selected visible text; prefixes, suffixes, independent separators, and timestamps affect only the basename. Sources are current file, current node, nearest current heading, timestamp, and custom text.

## Homepage and structural exemptions

Users may make the Root Node Note a homepage, open it by command or from Contents View, and optionally open it after Vault layout restoration. Leaf-note exemptions may use exact Vault-relative Markdown paths or file-name prefixes; folder exemptions may use exact subtrees or name prefixes on any path segment. Exemptions stop initialization, migration, and structural repair but do not hide content. the active Vault configuration folder, `.git`, and `.trash` are always protected; root `AGENTS.md` and `CLAUDE.md` are leaf-note exemptions by default.

## Node Visual and Contents View

`icon` is the only Node Visual property. Text and List values select the first valid emoji, Lucide icon, Vault image, or CSS color and may inherit from the nearest ancestor. File Explorer icons may appear before or after the name or remain hidden, and may also appear in a Node Note title; size and alignment follow Obsidian. File Explorer is the only global Node Tree. The sidebar browses only direct contents through Nodes, a static Album, and compact Files. All three entry types expose context-menu, More actions, and Shift+F10 access. Nodes reorder or reparent through before/into/after placement. One ordinary Album/Files item may move only into a node, the current node, or a breadcrumb folder and writes no file-order metadata. Child nodes without a valid visual have no large fallback artwork. GIFs use a still frame, videos use a type tile, and audio stays in Files. The plugin provides no inline animation, video, or audio playback in the sidebar.

## Adoption and safety

The uninitialized state explicitly says that automatic synchronization is unavailable. Initialization and migration share one read-only scan that lists every create, move, skip, and block path before confirmation. Contents shows folders missing Node Notes and non-exempt Markdown missing same-named folders as warning-marked nodes with explicit repair or exemption actions. Health reuses the summary but is strictly read-only and has no write button. Conflicts block commit. Managed state uses stable, coalesced Vault events and respects both exemption types; unique lossless issues may be repaired. Complete-node deletion uses system trash. The plugin makes no network requests.

## v1 boundary

v1 excludes remote image fetching, inline SVG recoloring, PDF first-page thumbnails, HEIC/HEIF preview, video frame extraction, inline animation/video/audio playback, ordinary-file independent ordering, multi-selection, or cross-view drag in Contents View, a second complete directory tree, alternate Node Note naming, complex merge-conflict UI, and arbitrary property inheritance.
