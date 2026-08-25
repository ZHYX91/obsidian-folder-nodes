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

Selected editor text exposes Create Folder Node from selection in both the context menu and command palette. The confirmation modal shows the parent node, final Node Note path, alias, and wikilink together. On confirmation, selected text becomes the new Node Note body and the previewed wikilink replaces the source selection. If the selection changes before confirmation, creation stops. The aliases switch does not change the basename, and filename affixes do not change the alias.

The Selection & naming page begins with a compact explanation card showing `[[a]]` → `a/a.md` and `[[a|b]]` → `a/a.md`, followed by the shared aliases switch. In Managed scope, normal or modified clicks on an unresolved internal Markdown link create and open the complete Node in the corresponding pane. When aliases are enabled, only the explicit display text `b` becomes an alias; the target `a` remains the Node name and the new body is blank. Existing links are never mutated merely by clicking them. Exempt or unsupported targets keep native Obsidian behavior, while a managed conflict produces a notice and no partial Node.

## Explorer Node Tree

File Explorer starts with a pinned Root row that has no disclosure control, cannot collapse or drag, opens the Root Node Note on click or keyboard activation, and uses a distinct Root badge and active state. Clicking an ordinary folder title opens its Node Note; the disclosure arrow only expands or collapses. Canonical Node Note rows are hidden. Each File Explorer leaf works independently, including popout windows; the plugin must not observe the whole `document.body`. Dragging must show a before line, into highlight, or after line, and the Vault is not changed before drop. Node context menus reuse create, Contents, Visual, rename, move, merge, reorder, and trash actions. Disabling the plugin must remove Root, owned buttons/icons/classes/listeners and restore Explorer order and owned draggable attributes.

## Node Contents View

The sidebar header contains breadcrumbs, optional current-node visual, title, Home, Edit visual, and New child node. Nodes display artwork only for a valid or inherited visual; nodes without one use compact text cards and no large fallback folder. Album uses dense 4:3 thumbnails: ordinary images have no badge, GIFs have a `GIF` badge and are converted to a still frame, and videos use only a static type tile. HEIC/HEIF, audio, and other resources stay in the compact Files list. Unmanaged folder and Markdown rows use the same neutral Unmanaged badge in a shared status column, with Folder or MD in a separate aligned type column. The plugin renders no `<video>` or `<audio>` controls and never autoplays; Open only navigates to Obsidian's file view. Sections collapse and at most 200 items render per batch.

Node, Album, and Files entries open the same Obsidian Menu from right-click, a More actions button visible on hover/focus, and Shift+F10 or the Menu key. Healthy Node menus contain only Folder Nodes-owned actions: open, open in a new tab, browse contents, reveal in File Explorer, create child, Visual, rename, move, merge, reorder, and trash. Problem Node menus likewise contain only repair, navigation, and exemption actions. Node menus do not relay `file-menu`; third-party bulk folder actions remain available from File Explorer. Ordinary-file menus contain open, open in a new tab, reveal in File Explorer, copy link, rename, move, and trash; supported images may also become the current Node visual. Ordinary files, Album entries, and unmanaged folders still accept actions injected by other plugins through `file-menu`; unmanaged folders themselves expose only browse contents and reveal in File Explorer. Trash uses warning styling and remains the final Folder Nodes-owned Node action, and every failed write produces a fail-closed Notice.

The top 25% of a Node card is a before line, the middle 50% is an into highlight, and the bottom 25% is an after line, matching Explorer semantics. Ordinary Files and Album entries have only into placement and no before/after or ordering metadata. They may drop onto a child Node, the current-node header, or a breadcrumb, then move through Obsidian FileManager after drop. A node cannot enter itself or a descendant, and file-name collisions block writes. Escape, dragend, leaving a target, and failure clear visual state. Nothing changes before drop. Menu move/reorder actions are complete keyboard equivalents. Selection mode may select multiple Album/Files entries to insert or copy links. A single dragged entry can move inside this Contents View; dragging multiple selected entries exports their links only and cannot become a partial multi-file move. Cross-view internal drops are not accepted.

## Visual Picker

The Picker loads and preserves the current complete `icon` Text/List instead of opening on a blank input. Users add, remove, and move Vault image wikilinks, `lucide:` candidates, single glyphs/emoji, and `color:` modifiers, or append stable presets. Explorer and Contents previews update with input. Confirmation removes the property for zero entries, writes Text for one, and a flat Text List for multiple. Unknown strings remain unchanged; non-string or nested shapes refuse editing with a notice instead of being silently overwritten. A missing image previews the next local candidate, the first valid color wins, and inherited visual appears only after the local declaration is fully exhausted. File Explorer icons may appear before or after the name or remain hidden; note-title display is a separate switch, but its icon must be a non-editable sibling outside editable `.inline-title` text and selection. Icons use Obsidian sizing, baseline, and spacing rather than an arbitrary size slider.

## Migration and Health

Before adoption, Settings and Contents prominently say Not initialized and explain that automatic rename synchronization and structural maintenance are unavailable; the primary action is Start initialization. The preview expands exact source/target leaf-note moves, missing Node Notes, exact-path and name-prefix unmanaged rules, and blocking conflicts; its final action is Confirm initialization. After adoption, the entry becomes Structure maintenance / Check structure. Health uses the same summary but is strictly read-only and shows only a close button. Progress begins only after explicit confirmation, and failure displays a safe-stop notice. The Contents Nodes section includes healthy nodes, folders missing Node Notes, and managed Markdown missing same-named folders; problem entries use warning marks and explicit repair or unmanaged-rule menus.

## Unmanaged content

General shows exactly two groups: Unmanaged Markdown files and Unmanaged folders. Each group combines exact paths and name prefixes in one list, labels each row by rule type, and offers Add path and Add name prefix actions together. `.` and `_` are the first-release defaults for both groups. The active Vault configuration directory, `.git`, and `.trash` are system-protected. Unmanaged rules stop structural management only; they do not hide files or folders.
