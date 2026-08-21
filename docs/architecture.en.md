---
source_language: zh-CN
translation_of: architecture.zh-CN.md
translation_status: synced
---

# Folder Nodes architecture

## Identity and persistence

A node's current identity is its normalized Vault folder path and `A/A.md` structure; no stable ID exists. Folder Nodes actively uses `aliases`, `icon`, `folderNodeChildrenSort`, and `folderNodeSiblingRank`. `aliases` and `icon` are portable content properties; the two `folderNode` fields are plugin structural properties. Managed, Migrating, and Unadopted state, homepage preferences, icon placement, naming rules, and both structural-exemption lists stay in plugin `data.json`.

## Layers

Core handles only paths, naming, template tokens, migration plans, sparse ordering, minimal frontmatter patches, and Visual declaration parsing. Adapters encapsulate Vault, Metadata Cache, File Explorer, resource URIs, and Node operations. UI/App provides localization, settings, commands, menus, modals, Visual Picker, and Contents View. The public repository does not depend on the local workspace or a personal Vault.

## Ordering engine

Natural mode uses Unicode-normalized, numeric-aware basename order and writes no property. On the first explicit manual placement, the parent Node writes `folderNodeChildrenSort: manual` and current direct Child Nodes materialize `folderNodeSiblingRank` at gaps of 1024. An available gap patches only the moved node. Exhausted gaps rebalance at most 64 neighbors before falling back to rank materialization for that parent, but no child array is ever written into the parent Note.

## Node operations

NodeService treats create, rename, move, place, merge, and trash as complete-directory operations. Move and placement reject self and descendants. Merge preflights target-path and frontmatter conflicts; target properties win, non-conflicting source properties join the target, source body is appended, resources move, and the source is removed. Templates replace only fixed tokens before creation and execute no code.

## Visual resolution

Visual Core chooses the first valid declaration candidate in order: emoji, known Lucide icon, Vault image wikilink, or CSS color. `lucide:` and `color:` are optional disambiguation prefixes. VisualService resolves Metadata Cache, Vault image resource URIs, and nearest-ancestor inheritance. Renderers consume only resolved `NodeVisual` values. Core may still return fallback for semantic decisions, but Explorer, titles, and Contents add no large folder artwork for nodes without a declared visual.

## Explorer and Contents

ExplorerAdapter encapsulates the File Explorer host boundary: it decorates only visible DOM, hides canonical notes, places or hides Node Visuals before/after names, optionally decorates Markdown inline titles, performs guarded reveal, recognizes disclosure controls through the current `.tree-item-icon.collapse-icon` and legacy indicator, and maps drag zones to before, into, and after placement. Explorer and Contents both delegate relative placement to NodeService instead of duplicating parent/index calculation.

Contents View queries only direct children and files and renders at most 200 entries per batch. Pure UI interaction helpers define the internal drag MIME, supported payload, three-part zone, and keyboard-menu gestures; the View owns only one drag session and one drop marker. Node drops call `placeNodeRelative` or `placeNode`; ordinary-file drops call the FileManager-backed `moveFile` and accept only into placement. The App layer centrally builds menu actions and triggers `file-menu` with a distinct source, allowing other plugins to extend the menu without duplicating Folder Nodes' own Node actions. Album images load from Vault resource URIs into a non-DOM `Image` and draw once to canvas, so every format including GIF remains static without reading Vault binary. Video and audio never create playback elements.

## Consistency and fail-closed behavior

Managed state coalesces same-directory events before local handling. Internal operations use suppression to avoid echoes. Exact leaf-note paths and complete ignored-folder subtrees apply consistently to scans and event reconciliation. Unique lossless missing Node Notes may be rebuilt; path collisions, cycles, changed selections, and merge property conflicts stop the operation. Initialization and migration scan before apply, while Health owns no commit action. Production deployment, source tests, packaged candidates, and host acceptance remain separate evidence.
