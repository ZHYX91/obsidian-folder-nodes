---
source_language: zh-CN
translation_of: architecture.zh-CN.md
translation_status: synced
---

# Folder Nodes architecture

## Identity and persistence

Node identity is the current normalized Vault path and `A/A.md` structure. Only `aliases`, `icon`, `folderNodeSort`, and `folderNodeOrder` are used; `_pkwf.id` is not used.

## Layers

Pure Core owns paths, naming, migration plans, ordering, and minimal frontmatter patches. Adapters encapsulate Vault and Explorer behavior. App/UI provides commands, settings, migration, and contents view.

## Ordering

Sparse integers use a default gap of 1024. A gap allows only the moved node to change. Exhausted gaps first rebalance at most 64 nearby items, then fall back to materializing the current parent.

## Consistency

Managed state listens to Vault events. Unique and lossless missing node notes may be rebuilt; ambiguity, overwrite, and cyclic moves fail closed.
