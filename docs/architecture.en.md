---
source_language: zh-CN
translation_of: architecture.zh-CN.md
translation_status: synced
---

# Folder Nodes architecture

## Identity and persistence

A node's current identity is its normalized Vault folder path and `A/A.md` structure; no stable ID exists. Folder Nodes actively uses `aliases`, `icon`, `folderNodeChildrenSort`, and `folderNodeSiblingRank`. `aliases` and `icon` are portable content properties; the two `folderNode` fields are plugin structural properties. Managed, Migrating, and Unadopted state and interface settings stay in plugin `data.json`.

## Layers

Core handles only paths, naming, template tokens, migration plans, sparse ordering, minimal frontmatter patches, and Visual declaration parsing. Adapters encapsulate Vault, Metadata Cache, File Explorer, resource URIs, and Node operations. UI/App provides localization, settings, commands, menus, modals, Visual Picker, and Contents View. The public repository does not depend on the local workspace or a personal Vault.

## Ordering engine

Natural mode uses Unicode-normalized, numeric-aware basename order and writes no property. On the first explicit manual placement, the parent Node writes `folderNodeChildrenSort: manual` and current direct Child Nodes materialize `folderNodeSiblingRank` at gaps of 1024. An available gap patches only the moved node. Exhausted gaps rebalance at most 64 neighbors before falling back to rank materialization for that parent, but no child array is ever written into the parent Note.

## Node operations

NodeService treats create, rename, move, place, merge, and trash as complete-directory operations. Move and placement reject self and descendants. Merge preflights target-path and frontmatter conflicts; target properties win, non-conflicting source properties join the target, source body is appended, resources move, and the source is removed. Templates replace only fixed tokens before creation and execute no code.

## Visual resolution

Visual Core chooses the first valid declaration candidate in order: emoji, known Lucide icon, Vault image wikilink, or CSS color. `lucide:` and `color:` are optional disambiguation prefixes. VisualService resolves Metadata Cache, Vault image resource URIs, and nearest-ancestor inheritance. Renderers consume only resolved `NodeVisual` values and use a folder fallback for invalid declarations.

## Explorer and Contents

ExplorerAdapter decorates only visible File Explorer DOM, hides canonical notes, renders Node Visuals, distinguishes folder-title clicks from disclosure arrows, and maps drag zones to before, into, and after placement. Contents View queries only the current node's direct children and files. It renders at most 200 cards per batch, uses only resource URIs and lazy loading for images, and lets container CSS choose wide or narrow layout.

## Consistency and fail-closed behavior

Managed state coalesces same-directory events before local handling. Internal operations use suppression to avoid echoes. Unique lossless missing Node Notes may be rebuilt; path collisions, cycles, changed selections, and merge property conflicts stop the operation. Migration scans before commit. Production deployment, source tests, packaged candidates, and host acceptance remain separate evidence.
