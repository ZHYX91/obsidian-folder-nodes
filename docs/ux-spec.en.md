---
source_language: zh-CN
translation_of: ux-spec.zh-CN.md
translation_status: synced
---

# Folder Nodes UX specification

## Obsidian consistency

The interface uses native Obsidian Setting, Menu, Modal, Notice, theme variables, icons, and keyboard focus. Desktop targets are at least 36px and coarse-pointer targets are 44px. Settings use four pages: General, Homepage, Icons & appearance, and Selection & naming. Declarative settings and fallback tabs use the same labels. The language dropdown contains `Follow Obsidian`, `简体中文`, and `English`; Follow Obsidian uses Obsidian's current interface language.

## Homepage

When enabled, the Root Node Note is the only homepage. The command palette and Home button in the Node Contents header open that note. Open homepage on startup runs after Obsidian restores the Vault layout. A disabled homepage or missing Root Note produces an explicit notice and never creates a file silently.

## Selection creation

Selected editor text exposes Create Folder Node from selection in both the context menu and command palette. The confirmation modal shows the parent node, final Node Note path, alias, and wikilink together. If the selection changes before confirmation, creation stops. The aliases switch does not change the basename, and filename affixes do not change the alias.

## Explorer Node Tree

Clicking a folder title opens its Node Note; the disclosure arrow only expands or collapses. Canonical Node Note rows are hidden. Dragging must show a before line, into highlight, or after line, and the Vault is not changed before drop. Node context menus reuse create, Contents, Visual, rename, move, merge, reorder, and trash actions.

## Node Contents View

The sidebar header contains breadcrumbs, optional current-node visual, title, Home, Edit visual, and New child node. Nodes display artwork only for a valid or inherited visual; nodes without one use compact text cards and no large fallback folder. Album uses dense 4:3 thumbnails: ordinary images have no badge, GIFs have a `GIF` badge and are converted to a still frame, and videos use only a static type tile. HEIC/HEIF, audio, and other resources stay in the compact Files list. The plugin renders no `<video>` or `<audio>` controls, never autoplays, and exposes no playback action. Sections collapse and at most 200 items render per batch.

## Visual Picker

Users may enter an emoji, Lucide name, CSS color, or Vault image wikilink and may choose stable presets. An empty value removes the current `icon`. When inheritance is enabled, the nearest ancestor visual is used and its source remains available in the DOM. File Explorer icons may appear before or after the name or remain hidden; inline note-title display is a separate switch. Icons use Obsidian sizing, baseline, and spacing rather than an arbitrary size slider.

## Migration and Health

Initialize & maintain combines empty-Vault adoption and existing-Vault migration. It expands exact source/target leaf-note moves, missing Node Notes, leaf-note exemptions, folder exemptions, and blocking conflicts. With zero file changes an unadopted Vault may still Start managing. Conflicts block apply. Health uses the same summary but is strictly read-only and shows only a close button. Progress begins only after explicit apply, and failure displays a safe-stop notice.

## Structural exemptions

General shows separate Allowed leaf notes and Unmanaged folders lists. The first stores exact `.md` paths and the second applies to complete subtrees. Add, remove, and preview show Vault-relative paths explicitly. Exemption stops structural management only; it does not hide a file or folder.
