# Folder Nodes

[English](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/README.md) · [简体中文](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/docs/i18n/README.zh-CN.md)

Folder Nodes turns every folder in a managed Obsidian Vault into one structural node whose canonical note has the same name: `A/A.md`.

## Screenshots

### Node contents

Browse child nodes, visual media, ordinary files, and explicit unmanaged boundaries from one sidebar.

![Folder Nodes sidebar showing child nodes, visual media, and unmanaged files](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-contents-en.png)

### File Explorer

Navigate the Root and nested Folder Nodes while keeping ordinary resources in Obsidian's familiar file tree.

![Obsidian File Explorer showing a Folder Nodes hierarchy and ordinary resources](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-explorer-en.png)

### Predictable Node creation

See exactly how selected text and uncreated links map to Node paths, note bodies, and aliases before changing naming options.

![Folder Nodes selection and naming settings explaining paths, bodies, and aliases](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-creation-en.png)

## Features

- Create, rename, move, merge, reorder, and safely trash complete Folder Nodes.
- Create a child node from selected editor text through the command palette or editor context menu, preview the exact `A/A.md`, alias, and wikilink, then write the selection into the new note and replace the source selection with that wikilink.
- In Managed scope, click an uncreated internal link to create the complete Node directly. `[[a]]` creates `a/a.md`; with aliases enabled, `[[a|b]]` also writes `b` to `aliases`.
- Navigate the global Node Tree through File Explorer: use the pinned, non-collapsible Root row; click a folder name to open its Node Note; keep disclosure arrows for ordinary nodes; hide duplicate canonical notes; and drag before, into, or after another node.
- Browse the current node through independently paged Nodes, static Album, and compact Files sections with 200-item batches. Every entry has context-menu and keyboard menu access; child nodes support before/into/after placement, while one ordinary file may move only into a node or breadcrumb folder. Multi-selection inserts or copies links; a multi-selected drag exports links without partially moving files. GIFs use still thumbnails; video and audio never receive inline playback controls.
- Resolve one Obsidian-native `icon` Text/List as ordered Vault-image, Lucide, or single-glyph candidates plus an optional `color:` accent, with local fallback, ancestor inheritance, before/after/hidden File Explorer placement, and optional note-title display outside editable title text.
- Use the root Node Note as an optional homepage, open it by command or from Node Contents, and optionally open it after Vault startup.
- Initialize or migrate only after one exact-path preview, block collisions, and keep Health strictly read-only.
- Keep incomplete structures visible as warning-marked Nodes with explicit repair actions instead of misclassifying them as Files.
- Configure two unmanaged-content groups without hiding anything: unmanaged Markdown files and unmanaged folders. Both accept exact paths and name prefixes; `.` and `_` are first-release defaults. The active Vault configuration folder, `.git`, and `.trash` are always protected; root `AGENTS.md` and `CLAUDE.md` are unmanaged Markdown paths by default.
- Use natural name order without metadata or scalable manual order with a parent mode flag and sparse ranks on child notes.
- Follow Obsidian's language automatically or override the interface with English or Simplified Chinese.
- Keep all processing local and write no permanent node ID, `_pkwf` metadata, manifest, path, parent, or complete child list.

## Requirements and compatibility

- Obsidian 1.12.7 or later.
- Version 0.4.0 is desktop-only while the File Explorer adapter and drag placement receive dated host acceptance.
- The managed model requires each managed folder to have one same-named Node Note and each managed Markdown document to be a Folder Node. Unmanaged Markdown and folder rules are explicit boundaries.

## Installation

### Community Plugins

After community-directory approval, open **Settings → Community plugins → Browse**, search for **Folder Nodes**, install it, and enable it.

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

## Settings

- **General** controls initialization state, interface language, preview-first maintenance, read-only Health, and two unified unmanaged-content rule groups for Markdown files and folders.
- **Homepage** controls whether the root Node Note is a homepage and whether it opens after startup.
- **Icons & appearance** controls inheritance, File Explorer placement, and note-title display. Icon size and alignment follow Obsidian rather than an arbitrary size setting.
- **Selection & naming** explains both Node-creation paths and controls their shared aliases switch, prefix and suffix sources, independent separators, custom text, timestamp format, and live filename preview.
- **Follow Obsidian** uses Obsidian's current interface language. Manual English or Simplified Chinese selection overrides the plugin interface without changing filenames or Markdown properties.
- Naming sources are current file, current Folder Node, nearest current heading, timestamp, and custom text. Prefixes and suffixes affect only the basename. With aliases enabled, selection creation writes the selected text, while uncreated `[[a|b]]` link creation writes the display text `b`.

## Icon property

`icon` stays compatible with Obsidian Properties: use one string or a flat list of strings, not nested YAML. The first renderable base candidate wins; a missing image continues to the next item. The first valid `color:` item accents that base, or becomes a swatch when no base resolves.

```yaml
icon:
  - "[[Assets/project.svg]]"
  - "lucide:folder-tree"
  - 文
  - "color:#7c3aed"
```

The picker loads the complete current list and supports add, remove, reorder, presets, and live File Explorer/Contents previews without dropping unknown strings. Inheritance starts only after the local list is exhausted.

## Limitations

- Structural identity is the current normalized Vault path, not a permanent ID. An external delete followed by an unrelated create is not guessed to be a rename.
- File Explorer integration is a host compatibility boundary and keeps this version desktop-only.
- Node visuals support Vault images but do not fetch remote images, recolor inline SVG, overlay badges, infer initials from node names, accept nested `icon` objects, render PDF first pages, preview HEIC/HEIF, generate video frames, animate GIFs, or provide video/audio playback.
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
