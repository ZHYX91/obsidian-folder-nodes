---
source_language: zh-CN
translation_of: product-requirements.zh-CN.md
translation_status: synced
---

# Folder Nodes product requirements

## Product model

Every folder in a managed Vault is a Folder Node with exactly one same-named Node Note: `A/A.md`. Root is also a node with its Node Note at the Vault root. Every Markdown document belongs in its own same-named folder; ordinary non-Markdown files may belong directly to a node. Folder Nodes writes no permanent ID, `_pkwf`, path, parent, name, node type, or complete child list.

## Sort properties

Natural name order writes no sort property. Manual order uses `folderNodeChildrenSort: manual` on the parent Node Note and a sparse positive `folderNodeSiblingRank` on each direct Child Node Note. A normal reorder writes only the moved node; local rebalance is bounded to 64 nodes.

## Node operations

Users can create, rename, move, merge, safely delete, and reorder complete nodes. Explorer drag placement means before, into, or after: same-parent placement reorders, and cross-parent placement reparents and reorders. Conflicts, cyclic moves, and ambiguous merges fail closed. Default templates support `{{name}}`, `{{path}}`, `{{parent}}`, and `{{date}}`.

## Selection creation

Editor commands and context menus create Child Nodes from selected text. Creation previews the final `A/A.md`, alias, and wikilink. Aliases use only selected visible text; prefixes, suffixes, independent separators, and timestamps affect only the basename. Sources are current file, current node, nearest current heading, timestamp, and custom text.

## Node Visual and Contents View

`icon` is the only Node Visual property. Text and List values select the first valid emoji, Lucide icon, Vault image, or CSS color and may inherit from the nearest ancestor. File Explorer is the only global Node Tree. The sidebar browses only the current node's direct contents with breadcrumbs, current-node visual, Child Node cards, ordinary file cards, lazy image thumbnails, and a responsive grid; it does not duplicate the global tree.

## Adoption and safety

First adoption of an existing Vault starts with a read-only scan, shows a migration plan, and requires explicit commit. Conflicts block commit. Managed state uses stable, coalesced Vault events to maintain structure; unique lossless issues may be repaired, while ambiguity is reported through Health. Complete-node deletion uses system trash. The plugin makes no network requests.

## v1 boundary

v1 excludes remote image fetching, inline SVG recoloring, PDF first-page thumbnails, video poster generation, a built-in audio player, ordinary-file drag or independent ordering in Contents View, a second complete directory tree, alternate Node Note naming, partially managed subtrees, complex merge-conflict UI, and arbitrary property inheritance.
