---
source_language: zh-CN
translation_of: product-requirements.zh-CN.md
translation_status: synced
---

# Folder Nodes product requirements

## Product model

Every managed folder in a managed Vault is a Folder Node with exactly one same-named Node Note: `A/A.md`. Root is also a node with its Node Note at the Vault root. Every managed Markdown document belongs in its own same-named folder; ordinary non-Markdown files may belong directly to a node. Folder Nodes writes no permanent ID, `_pkwf`, path, parent, name, node type, or complete child list.

## Sort properties

Natural name order writes no sort property. Manual order uses `folderNodeChildrenSort: manual` on the parent Node Note and a sparse positive `folderNodeSiblingRank` on each direct Child Node Note. A normal reorder writes only the moved node; local rebalance is bounded to 64 nodes. Missing or duplicate ranks use normalized basename and path as deterministic tie-breakers. Rename retains an existing rank, and a new child in manual mode appends by default.

## Node operations

Users can create, rename, move, merge, safely delete, and reorder complete nodes. Explorer and Contents child-node drag placement mean before, into, or after: same-parent placement reorders, and cross-parent placement reparents and reorders. Every structural write must be serialized, rename/move must use Obsidian FileManager, and multi-step writes must preflight and roll back on failure. Conflicts, cyclic moves, and ambiguous merges fail closed. Deleting only a canonical Node Note never means deleting its subtree: the plugin-owned file action refuses it, and Managed reconciliation safely rebuilds a uniquely missing, conflict-free Node Note. Root cannot be renamed, moved, or deleted; complete-node deletion requires an explicit node-delete action. Folder Nodes creates blank Node Notes; content templating belongs to dedicated template plugins.

## Selection creation

Editor commands and context menus create Child Nodes from selected text. Creation previews the final `A/A.md`, alias, and wikilink. On confirmation, the selected text becomes the new Node Note body and the original selection is replaced by the previewed wikilink; a changed selection stops the write. In this flow, aliases use only selected visible text; prefixes, suffixes, independent separators, and timestamps affect only the basename. Sources are current file, current node, nearest current heading, timestamp, and custom text.

In Managed scope, clicking an unresolved internal Markdown link creates the complete Node directly instead of first creating a leaf note. `[[a]]` creates a blank `a/a.md`; explicit Vault paths create every missing complete ancestor Node transactionally. When the shared aliases setting is enabled, `[[a|b]]` writes the explicit display text `b` to the new Node Note's `aliases`; without display text or with the setting disabled, it writes no alias. Ignored folders, exempt leaf-note paths, unsafe or non-Markdown targets, and links outside Markdown views remain under Obsidian's native behavior. Existing post-create reconciliation remains the fallback for external and third-party creation. Conflicts fail closed.

## Homepage and unmanaged boundaries

The Root Node Note is at the Vault root and uses the Vault name with illegal filename characters sanitized as its basename. Users may make it a homepage, open it by command or from Contents View, and optionally open it after Vault layout restoration. Contents resolves the current node from the active file's owning folder and falls back to Root when no file is active. File Explorer always exposes Root as a pinned, non-collapsible row distinct from ordinary nodes. General contains two unmanaged rule groups: Markdown files and folders. Both accept exact Vault-relative paths and name prefixes, with `.` and `_` as first-release prefix defaults. Unmanaged rules stop initialization, migration, and structural repair but do not hide content. The active Vault configuration folder, `.git`, and `.trash` are always protected; root `AGENTS.md` and `CLAUDE.md` are unmanaged Markdown paths by default.

## Node Visual and Contents View

`icon` is the only Node Visual property. It uses Obsidian-Properties-compatible Text or a flat Text List and never a nested object. Base candidates are Vault image wikilinks, known Lucide icons, or one visible extended grapheme (letter, symbol, or emoji). The first actually renderable base wins; a missing image continues to later local candidates. The first valid `color:` item is an accent: it colors Lucide/glyph bases, while emoji, raster images, and SVG preserve their pixels and use the accent only for surrounding background and border. Color alone renders a swatch. Unknown entries and extra colors are preserved; the first color wins. Nearest-ancestor inheritance begins only after the whole local declaration is exhausted and never combines a local color with an ancestor base. File Explorer icons may appear before or after the name or remain hidden, and may also appear beside—but outside—the editable Node Note title; size and alignment follow Obsidian. File Explorer is the only global Node Tree and starts with the pinned Root row. The sidebar browses only direct contents through independently paged Nodes, static Album, and compact Files sections. All three entry types expose context-menu, More actions, and Shift+F10 access. Nodes reorder or reparent through before/into/after placement. One ordinary Album/Files item may move only into a node, the current node, or a breadcrumb folder and writes no file-order metadata. Content multi-selection inserts or copies wikilinks; dragging multiple selected items exports links and never performs a partial file move. Child nodes without a valid visual have no large fallback artwork. GIFs use a still frame, videos use a type tile, and audio stays in Files. The plugin provides no inline animation, video, or audio playback in the sidebar.

## Adoption and safety

The uninitialized state explicitly says that automatic synchronization is unavailable. Initialization and migration share one read-only scan that lists every create, move, skip, and block path before confirmation; apply revalidates that preview, validates the final structure, and rolls back any failed step. Failure to persist the initial `migrating` state restores the previous in-memory state and prevents every structural write. Plugin unload aborts an active startup repair or confirmed migration, rolls back its completed steps, and prevents later forward writes. Contents shows folders missing Node Notes and non-exempt Markdown missing same-named folders as warning-marked nodes with explicit repair or unmanaged-rule actions. Health reuses the summary but is strictly read-only and has no write button. Conflicts block commit. Managed state repairs the complete managed scope at startup, uses serialized Vault events, recursively adopts a formerly ignored subtree moved into managed scope, and respects both unmanaged-content rule groups; unique lossless issues may be repaired. Complete-node deletion uses system trash. The plugin makes no network requests.

## v1 boundary

v1 excludes remote image fetching, inline SVG recoloring, badge overlays, automatic initials from node names, nested `icon` objects, PDF first-page thumbnails, HEIC/HEIF preview, video frame extraction, inline animation/video/audio playback, ordinary-file independent ordering, transactional multi-file moves or cross-view internal drops in Contents View, a second complete directory tree, alternate Node Note naming, complex merge-conflict UI, and arbitrary property inheritance.
