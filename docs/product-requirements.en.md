---
source_language: zh-CN
translation_of: product-requirements.zh-CN.md
translation_status: synced
---

# Folder Nodes product requirements

## Product goal

Every folder in a managed Vault is a Folder Node with exactly one same-named note, `A/A.md`; Folder Nodes does not create permanent node IDs.

## Core rules

Natural order writes no sorting property. Manual order uses `folderNodeSort: manual` on the parent and a sparse `folderNodeOrder` on each child. A complete child list must not be stored on the parent.

## User capabilities

Users can create, rename, move, safely delete, and reorder nodes. Selected text can create a node with configurable file-name prefixes, suffixes, separators, timestamps, and an aliases switch.

## Safety boundary

First adoption starts with a read-only scan and preview. Conflicts block commit. Deletion prefers the system trash. External complete `A/A.md` nodes receive no injected ID.
