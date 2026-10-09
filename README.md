# Folder Nodes

[English](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/README.md) · [简体中文](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/docs/i18n/README.zh-CN.md)

Folder Nodes lets you organize Obsidian folders as navigable nodes. A complete node is a folder plus one same-named Markdown note, such as `A/A.md`. If only one side exists, Folder Nodes shows it as **Incomplete** instead of silently creating or moving anything.

## Screenshots

### Node contents

Browse child nodes, images and videos, ordinary files, and unmanaged boundaries from one sidebar.

![Folder Nodes sidebar showing child nodes, visual media, and unmanaged files](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-contents-en.png)

[Album photo credits](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/docs/assets/PHOTO-CREDITS.md).

### File Explorer

Use Obsidian's File Explorer as the global node tree. Folder Nodes adds a pinned Root row, node status labels, optional icons, and manual sibling ordering without replacing Obsidian's normal file and folder actions.

![Obsidian File Explorer showing the Root eye and Folder Nodes status badges](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-explorer-en.png)

### Node Graph

Explore the hierarchy in Global, Subtree, or Local scope, expand branches when needed, and switch between 2D and 3D views.

![Folder Nodes Graph showing an expanded Projects subtree](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-graph-en.png)

### Icons & appearance

Use Vault images, Lucide icons, text, emoji, or a color fallback. The settings page previews how a property icon differs from the same character in a file name.

![Folder Nodes Icons and appearance settings](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-settings-icons-en.png)

### Predictable Node creation

Preview how selected text and uncreated links become node names, paths, note bodies, and aliases.

![Folder Nodes Selection and naming settings](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-creation-en.png)

## Features

- **Folder-based nodes.** Create, rename, move, merge, reorder, and delete complete Folder Nodes while keeping Obsidian's native New note and New folder actions available.
- **Clear incomplete states.** A folder without its same-named note, or a Markdown note without its matching folder, stays visible as **Incomplete** until you complete it or mark it unmanaged.
- **File Explorer integration.** Click a complete node's folder name to open its Node Note. The Root eye temporarily reveals nodes hidden by Folder Nodes for the current session. Name mode leaves Obsidian's native sibling order alone; Manual mode uses explicit Folder Nodes ranks.
- **Node Contents sidebar.** Browse child nodes, a static media album, and ordinary files in separate paged sections. GIFs use still thumbnails; video and audio never receive inline playback controls.
- **Node Graph.** Structure is always the hierarchy. An optional **Show links** switch overlays resolved links between Node Notes without changing the structural layout.
- **Create from selected text.** Choose **Create Folder Node from selection** to create a child node, write the selected text into the new note, and replace the selection with a link. Table-cell selections are handled safely; cross-cell selections are rejected before writing.
- **Create from uncreated links.** In managed scope, clicking an unresolved `[[a]]` creates `a/a.md`. With aliases enabled, `[[a|b]]` also writes `b` to `aliases`.
- **Node icons.** Read one Obsidian `icon` Text/List as ordered image, Lucide, glyph, emoji, or `color:` candidates, with optional ancestor inheritance.
- **Hidden subtrees.** A node can store `hidden=true`. Folder Nodes then hides that subtree only in File Explorer, Node Contents, and Folder Nodes Graph; Obsidian Search, Quick Switcher, backlinks, native Graph, links, and direct file access still work.
- **Unmanaged boundaries.** Exact paths and name-start rules let you exclude Markdown files or whole folder subtrees from Folder Nodes management without hiding them.
- **Preview-first maintenance.** Bulk organization and legacy-property migration show what will change before writing. Conflicts or ambiguous input stop the operation instead of guessing.
- **Local-only operation.** Folder Nodes does not upload Vault content or make network requests.

## Requirements and compatibility

- Obsidian **1.12.7 or later**.
- Desktop Obsidian and Android Obsidian are supported. Android uses menus and native folder moves instead of HTML5 drag-and-drop.
- Android physical devices and iOS are not part of the project's shared host-acceptance matrix.
- A complete node uses exactly one same-named Node Note. Unmanaged rules define boundaries where Folder Nodes does not perform structural actions.

## Installation

### Community Plugins

Open **Settings → Community plugins → Browse**, search for **Folder Nodes**, install it, and enable it. If it is not available in your catalog, use manual installation.

### Manual installation

Download the versioned `folder-nodes-<version>.zip` from the release and extract its `folder-nodes` directory into `Vault/.obsidian/plugins/`. You can also install the three loose files below.

Download one matching release and place these three files in `Vault/.obsidian/plugins/folder-nodes/`:

- `main.js`
- `manifest.json`
- `styles.css`

Reload Obsidian and enable Folder Nodes. Do not mix runtime files from different releases.

### Upgrade

Keep `Vault/.obsidian/plugins/folder-nodes/data.json` when it exists. Replace only the three runtime files above unless you intentionally want to reset plugin preferences and unmanaged rules.

## Usage

### Getting started

1. Back up your Vault and open **Settings → Folder Nodes → General** and **Management**.
2. In File Explorer, a complete node consists of a folder and a same-named Markdown note, for example `A/` plus `A/A.md`. An orange **Incomplete** item is missing one side. Complete the ones you want managed, or mark them **Unmanaged**; the plugin will not silently create or move missing files.
3. Use **New node**, the node context menu, or the command palette to create a complete node. **Unmanaged** items remain available in Obsidian, but Folder Nodes does not perform structural node operations there; it does not hide or delete those files.

### More actions and safeguards

1. Use **Create Folder Node from selection** to turn selected text into a child node. In managed scope, selecting an unresolved `[[a]]` or `[[a|b]]` link can also create a complete Folder Node.
2. Open **Node contents** to browse the current node's children, media, and files. Right-click, More, or Shift+F10/Menu opens the same actions.
3. Open **Node Graph** to browse the hierarchy: Global covers the Vault, Subtree anchors one node, and Local adds its parent. Expand branches, search, switch between 2D/3D, or enable **Show links** to overlay references.
4. On desktop, dropping a node into another changes its parent. Exact before/after ordering requires the parent's **Manual** child order. On Android, use native folder movement or **Move / Move up / Move down**.
5. Native Obsidian commands act on the selected file or folder. Commands explicitly labelled **containing node** act on the whole Folder Node, including its managed folder and note.
6. **Batch organize** and **Migrate Folder Nodes properties** always preview the paths before confirmation; **Health check** is read-only. Cancel if the proposed scope differs from your intention.

## Settings

- **General** — interface language, hidden-marker behavior, and optional Root homepage.
- **Management** — unmanaged Markdown/folder rules, bulk organization, property migration, and read-only Health.
- **Icons & appearance** — icon inheritance, File Explorer placement, note-title display, and emoji font selection.
- **Selection & naming** — aliases plus optional prefix/suffix naming sources and timestamp formats.
- **Node Graph** — enablement, default dimension, 2D direction, and large-graph thresholds.

**Follow Obsidian** uses Simplified Chinese for Chinese Obsidian locales and English for other locales. Choosing English or Simplified Chinese manually overrides that fallback without changing filenames or Markdown properties.

## Folder Nodes property

Folder Nodes stores structural options in one flat Obsidian Text List named `folder-nodes`. Defaults are omitted, and the property is removed when no tokens remain.

```yaml
folder-nodes:
  - order=manual
  - rank=1024
  - hidden=true
```

- `order=manual` enables manual child ordering for that parent.
- `rank=N` stores a child's sparse manual-order rank.
- `hidden=true` hides that node and its managed descendants from Folder Nodes' three projections.

Published legacy fields `folderNodeChildrenSort`, `folderNodeSiblingRank`, and `folderNodeHidden` remain readable. Use **Management → Migrate Folder Nodes properties** to preview the exact notes that would change. Update Folder Nodes on every device first, then confirm the migration. Startup never migrates note properties automatically.

## Icon property

The `icon` property accepts one string or a flat list of strings:

```yaml
icon:
  - "[[Assets/project.svg]]"
  - "lucide:folder-tree"
  - 文
  - "color:#7c3aed"
```

Folder Nodes tries base candidates in order. A missing image falls through to the next candidate. The first valid `color:` value colors a text/Lucide icon; for emoji and images it is used only as a fallback swatch if no base candidate can be displayed.

The picker loads the current list, supports add/remove/reorder/presets, and previews File Explorer and Node Contents. Unknown or multi-grapheme values cannot be saved through the picker. Inheritance begins only after the current node has no usable local candidate.

## Limitations

- Structural identity is the current normalized Vault path, not a permanent node ID.
- Alternate canonical note names such as `README.md`, `index.md`, or `_A.md` are not supported.
- Merge stops on path or frontmatter conflicts rather than offering a complex conflict-resolution UI.
- Android has no HTML5 drag handles or drop targets.
- Node visuals do not fetch remote images, recolor arbitrary inline SVG, generate PDF/video thumbnails, preview HEIC/HEIF, or provide inline video/audio playback.
- Node Contents is not a second complete Vault tree and does not transactionally move multiple ordinary files.
- Very large graphs switch to Canvas rendering. Structure remains complete; only the optional link overlay is bounded.

## Privacy and security

Folder Nodes runs locally and makes no network requests. It reads Vault paths, metadata, and note text only for documented features such as structure checks, migration previews, link indexing, and Node Graph.

User actions can create, edit, move, rename, merge, or trash notes and folders. Multi-step structural operations are serialized, conflicts stop before unsafe writes, and preview-first maintenance rechecks targets before commit. Complete-node deletion uses Obsidian's system trash.

The plugin writes generated Markdown links to the system clipboard only after an explicit copy action and **never reads the clipboard**. Preferences and unmanaged rules stay in plugin `data.json`; structural tokens stay in Node Notes.

For security reports, use the repository's [security policy](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/SECURITY.md).

## Development

Use Node.js **24.19.0** and npm **11.17.0**.

```bash
npm ci
npm run check
npm run release:check
```

Project documents:

- [Product requirements](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/docs/product-requirements.en.md)
- [UX specification](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/docs/ux-spec.en.md)
- [Architecture](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/docs/architecture.en.md)
- [Testing strategy](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/docs/testing-strategy.en.md)
- [Changelog](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/CHANGELOG.md)
- [Contributing](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/CONTRIBUTING.md)

## Support

- [Q&A](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/q-a) for usage and configuration questions.
- [Ideas](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/ideas) for feature and workflow proposals.
- [Show and tell](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/show-and-tell) for tips and examples.
- [GitHub Issues](https://github.com/ZHYX91/obsidian-folder-nodes/issues/new/choose) for reproducible bugs and concrete feature requests.

When filing a public issue, include the Folder Nodes version, Obsidian version, operating system, a synthetic folder structure, and exact reproduction steps. Remove private Vault paths and note content.

## License

[MIT](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/LICENSE) © ZhengYX
