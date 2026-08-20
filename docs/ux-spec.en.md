---
source_language: zh-CN
translation_of: ux-spec.zh-CN.md
translation_status: synced
---

# Folder Nodes UX specification

## Obsidian consistency

The interface uses native Obsidian Setting, Menu, Modal, Notice, theme variables, icons, and keyboard focus. Desktop targets are at least 36px and coarse-pointer targets are 44px. Settings use General and Selection & naming groups. The language dropdown contains `Auto`, `简体中文`, and `English`; Auto follows Obsidian.

## Selection creation

Selected editor text exposes Create Folder Node from selection in both the context menu and command palette. The confirmation modal shows the parent node, final Node Note path, alias, and wikilink together. If the selection changes before confirmation, creation stops. The aliases switch does not change the basename, and filename affixes do not change the alias.

## Explorer Node Tree

Clicking a folder title opens its Node Note; the disclosure arrow only expands or collapses. Canonical Node Note rows are hidden. Dragging must show a before line, into highlight, or after line, and the Vault is not changed before drop. Node context menus reuse create, Contents, Visual, rename, move, merge, reorder, and trash actions.

## Node Contents View

The sidebar header contains breadcrumbs, current-node visual, title, and New child node. Nodes use visual cards. Files use image thumbnail cards or PDF, Audio, Video, and generic typed cards. Sections collapse, wide sidebars use a grid, and narrow sidebars switch automatically to a compact layout. At most 200 items render per batch and images load lazily.

## Visual Picker

Users may enter an emoji, Lucide name, CSS color, or Vault image wikilink and may choose stable presets. An empty value removes the current `icon`. Invalid declarations use a fallback. When inheritance is enabled, the nearest ancestor visual is used and its source remains available in the DOM for a tooltip.

## Migration and Health

Migration and Health use one read-only summary model: leaf Markdown, missing Node Notes, and blocking conflicts. Submit is disabled for zero changes and blocked by any conflict. Progress begins only after explicit commit, and failure displays a safe-stop notice.
