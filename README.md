# Folder Nodes

[English](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/README.md) · [简体中文](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/docs/i18n/README.zh-CN.md)

Folder Nodes represents a complete structural node as a folder plus its same-named Node Note, `A/A.md`. Managed folders may also remain folder-only until you explicitly create their Node Note.

## Screenshots

### Node contents

Browse child nodes, visual media, ordinary files, and explicit unmanaged boundaries from one sidebar.

![Folder Nodes sidebar showing child nodes, visual media, and unmanaged files](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-contents-en.png)

### File Explorer

Navigate the Root and nested Folder Nodes in Obsidian's familiar file tree. Property icons use a fixed frameless slot, while a character that belongs to the file name remains plain text.

![Obsidian File Explorer distinguishing property icons from characters in node names](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-explorer-en.png)

### Icons & appearance

The settings card explains where icons come from and directly compares `icon: 想` or `icon: 📓` with the same character at the start of a file name.

### Node Note title icon

An optional title icon stays in its own aligned slot before the Node Note title. It does not become part of editable title text.

![Folder Nodes property glyph displayed in a separate slot before the Node Note title](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-title-icon-en.png)

### Predictable Node creation

See exactly how selected text and uncreated links map to Node paths, note bodies, and aliases before changing naming options.

## Features

- Create, rename, move, merge, reorder, and safely trash complete Folder Nodes.
- Keep Obsidian's native New note and New folder actions visible. A native folder is a folder-only node; a native Markdown file remains an ordinary note. File Explorer folder actions operate the whole folder, while tab actions move, delete, or merge only the Node Note. Renaming either half keeps an existing folder/Node Note pair synchronized, and explicitly labelled containing-node actions remain available from a Node Note tab.
- Create a child node from selected editor text through the command palette or editor context menu, preview the exact `A/A.md`, alias, and wikilink, then write the selection into the new note and replace the source selection with that wikilink. Inside one Markdown table cell, the generated alias separator is escaped as `\|`; cross-cell and cross-row selections stop without writing.
- In Managed scope, click an uncreated internal link to create the complete Node directly. `[[a]]` creates `a/a.md`; with aliases enabled, `[[a|b]]` also writes `b` to `aliases`.
- Navigate the global Node Tree through File Explorer: use the pinned, non-collapsible Root row; click a folder name to open its Node Note; keep disclosure arrows for ordinary nodes; hide duplicate canonical notes; and drag before, into, or after another node.
- Browse the current node through independently paged Nodes, static Album, and compact Files sections with 200-item batches. Every entry has context-menu and keyboard menu access; child nodes support before/into/after placement, while one ordinary file may move only into a node or breadcrumb folder. Multi-selection inserts or copies links; a multi-selected drag exports links without partially moving files. GIFs use still thumbnails; video and audio never receive inline playback controls.
- Resolve one Obsidian-native `icon` Text/List as ordered Vault-image, Lucide, or single-glyph candidates plus an optional `color:` value, with local fallback, ancestor inheritance, before/after/hidden File Explorer placement, and optional note-title display outside editable title text. Property icons use a fixed frameless slot; glyph weight, size, and color distinguish them from file-name characters, while emoji retain the platform color-emoji appearance.
- Use the root Node Note as an optional homepage, open it by command or from Node Contents, and optionally open it after Vault startup.
- Initialize or migrate only after one exact-path preview, block collisions, and keep Health strictly read-only.
- Keep folder-only nodes visible as neutral nodes with an explicit Create Node Note action. True conflicts—including ordinary Markdown that collides with an existing same-name Folder Node—remain warning-marked and fail closed.
- Configure two unmanaged-content groups without hiding anything: unmanaged Markdown files and unmanaged folders. Both accept exact paths and name prefixes; `.` and `_` are the default prefixes. The active Vault configuration folder, `.git`, and `.trash` are always protected; root `AGENTS.md` and `CLAUDE.md` are unmanaged Markdown paths by default.
- Use natural name order without metadata or scalable manual order with a parent mode flag and sparse ranks on child notes.
- Follow Obsidian's language automatically or override the interface with English or Simplified Chinese.
- Keep all processing local and write no permanent node ID, `_pkwf` metadata, manifest, path, parent, or complete child list.

## Requirements and compatibility

- Obsidian 1.12.7 or later.
- Desktop Obsidian only.
- A complete structural node still uses exactly one same-named Node Note. Folder-only nodes and ordinary Markdown files are valid managed-Vault content; unmanaged Markdown and folder rules remain explicit boundaries for initialization and plugin-owned structural actions.

## Installation

### Community Plugins

Open **Settings → Community plugins → Browse**, search for **Folder Nodes**, install it, and enable it. If it is not available in your catalog, use the manual installation below.

### Manual installation

Download one matching release and place `main.js`, `manifest.json`, and `styles.css` in `Vault/.obsidian/plugins/folder-nodes/`. Reload Obsidian, then enable Folder Nodes under Community plugins. Do not mix runtime files from different versions.

### Upgrade

Preserve `Vault/.obsidian/plugins/folder-nodes/data.json` when it exists. Replace only `main.js`, `manifest.json`, and `styles.css`; delete `data.json` only when you explicitly want to reset plugin preferences and adoption state.

## Usage

1. Back up the Vault and open **Settings → Folder Nodes → General**.
2. Open **Initialize Folder Nodes**, review every exact create, move, skip, and conflict path, then confirm initialization. Automatic rename synchronization and structural maintenance start only after initialization.
3. Use File Explorer, the ribbon, node context menus, or the command palette to create and navigate nodes.
4. Select editor text and choose **Create Folder Node from selection** from the editor context menu or command palette. Confirm the name, alias, and wikilink preview before creation.
5. In Managed scope, click an uncreated `[[a]]` or `[[a|b]]` link to create and open its complete Folder Node directly.
6. Open **Node contents** for child nodes, a static image/video Album, and compact ordinary files. Right-click an entry, use its More actions button, or press Shift+F10 for the same menu.
7. Drag a Folder Node before, into, or after another node to reorder or reparent it. Drag an Album or Files item into a child node, the current-node header, or a breadcrumb to move the file. The drop marker shows the resulting placement before the write.
8. Use Obsidian's native file/folder actions when you mean the selected file or folder. From a Node Note tab, choose **Move/Delete/Merge containing node** only when the whole folder subtree is intended.

## Settings

- **General** controls initialization state, interface language, preview-first maintenance, read-only Health, and two unified unmanaged-content rule groups for Markdown files and folders.
- **Homepage** controls whether the root Node Note is a homepage and whether it opens after startup.
- **Icons & appearance** controls inheritance, File Explorer placement, and note-title display. Its comparison card shows the difference between a property icon and the same character in a file name. Icon size and alignment follow Obsidian rather than an arbitrary size setting.
- **Selection & naming** explains both Node-creation paths and controls their shared aliases switch, prefix and suffix sources, independent separators, custom text, timestamp format, and live filename preview.
- **Follow Obsidian** uses Obsidian's current interface language. Manual English or Simplified Chinese selection overrides the plugin interface without changing filenames or Markdown properties.
- Naming sources are current file, current Folder Node, nearest current heading, timestamp, and custom text. Prefixes and suffixes affect only the basename. With aliases enabled, selection creation writes the selected text, while uncreated `[[a|b]]` link creation writes the display text `b`.

## Icon property

`icon` stays compatible with Obsidian Properties: use one string or a flat list of strings, not nested YAML. The first renderable base candidate wins; a missing image continues to the next item. With a glyph or Lucide icon, the first valid `color:` item colors the foreground. Emoji and images keep their native pixels and receive no added dot, background, or border; for them, `color:` is used only when every base candidate fails, becoming a centered solid circular swatch.

```yaml
icon:
  - "[[Assets/project.svg]]"
  - "lucide:folder-tree"
  - 文
  - "color:#7c3aed"
```

The picker loads the complete current list and supports add, remove, reorder, presets, and live File Explorer/Contents previews. Unknown or multi-grapheme values are shown as invalid and cannot be saved; a single letter, CJK character, symbol, or emoji remains valid. Inheritance starts only after the local list is exhausted.

Advanced CSS snippets may override `--folder-nodes-glyph-font` and `--folder-nodes-emoji-font`. There is deliberately no font picker in ordinary settings.

## Limitations

- Structural identity is the current normalized Vault path, not a permanent ID. An external delete followed by an unrelated create is not guessed to be a rename.
- Mobile Obsidian is not supported because Folder Nodes integrates with desktop File Explorer behavior.
- Node visuals support Vault images and a lightweight semantic icon slot, but do not fetch remote images, recolor inline SVG, infer initials from node names, accept nested `icon` objects, render PDF first pages, preview HEIC/HEIF, generate video frames, animate GIFs, or provide video/audio playback.
- The Contents View can move one ordinary file at a time into a displayed node or breadcrumb folder and can select multiple files for link insertion/copying, but it does not independently order files, transactionally move multiple files, accept cross-view internal drops, or become a second complete Vault tree.
- Merge fails closed on path or frontmatter conflicts instead of presenting a complex conflict-resolution UI.
- Alternate canonical names such as `README.md`, `index.md`, or `_A.md` and arbitrary property inheritance are not supported. Unmanaged folders are explicit whole-subtree boundaries, not partially managed nodes.

## Privacy and security

Folder Nodes runs locally and makes no network requests. Migration is preview-first and revalidated before commit; structural writes are serialized, collisions block commits, and ambiguous operations fail closed. Rollback actions stay bound to the original Vault objects and refuse changed or replaced entries instead of touching a new occupant at the same path. Complete-node deletion uses Obsidian's system-trash path. Settings stay in the plugin's `data.json`; structural facts stay in the Vault. No node content, path, visual, or diagnostic is uploaded.

## Development

Use Node.js 24.19.0 and npm 11.17.0.

```bash
npm ci
npm run check
npm run release:check
```

Stable project documents:

- [Product requirements](docs/product-requirements.en.md)
- [UX specification](docs/ux-spec.en.md)
- [Architecture](docs/architecture.en.md)
- [Testing strategy](docs/testing-strategy.en.md)
- [Release procedure](docs/release.en.md)
- [Changelog](CHANGELOG.md)
- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Support

Use [GitHub Issues](https://github.com/ZHYX91/obsidian-folder-nodes/issues) for reproducible bugs and concrete feature requests. Include the Folder Nodes version, Obsidian version, operating system, synthetic folder structure, and exact action. Remove private Vault paths and note content before posting. Report vulnerabilities privately through the [security policy](SECURITY.md).

## License

[MIT](LICENSE) © ZhengYX
