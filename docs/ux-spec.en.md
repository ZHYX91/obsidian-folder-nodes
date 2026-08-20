---
source_language: zh-CN
translation_of: ux-spec.zh-CN.md
translation_status: synced
---

# Folder Nodes UX specification

## Settings

Settings has General and Selection & naming tabs, using native Obsidian controls, theme variables, keyboard focus, and 44-pixel touch targets.

## Creation and selection

Creation previews the final name. Aliases use only selected text; prefixes, suffixes, and separators affect only folder and file basenames.

## Migration and health

Migration is a separate preview flow, not a third settings tab. Health summarizes leaf Markdown, missing node notes, and blocking conflicts.

## Large directories

The contents view reveals up to 200 items per batch. A regular move patches only the moved node; local rebalance windows contain at most 64 nodes.
