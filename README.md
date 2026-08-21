# Folder Nodes

[English](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/README.md) · [简体中文](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/docs/i18n/README.zh-CN.md)

Folder Nodes turns every folder in a managed Obsidian Vault into one structural node whose canonical note has the same name: `A/A.md`.

## Features

- Create, rename, move, merge, reorder, and safely trash complete Folder Nodes.
- Create a child node from selected editor text through the command palette or editor context menu, preview the exact `A/A.md`, alias, and wikilink, and configure filename prefixes, suffixes, separators, and timestamps.
- Navigate the global Node Tree through File Explorer: use the pinned, non-collapsible Root row; click a folder name to open its Node Note; keep disclosure arrows for ordinary nodes; hide duplicate canonical notes; and drag before, into, or after another node.
- Browse the current node through separate Nodes, static Album, and compact Files sections with bounded 200-item paging. Every entry has a context menu and keyboard menu access; child nodes support before/into/after placement, while ordinary files may move only into a node or breadcrumb folder. GIFs use still thumbnails; video and audio never receive inline playback controls.
- Resolve one `icon` property as an emoji, Lucide icon, Vault image, or CSS color, with optional inheritance, before/after/hidden File Explorer placement, and optional note-title display.
- Use the root Node Note as an optional homepage, open it by command or from Node Contents, and optionally open it after Vault startup.
- Initialize or migrate only after one exact-path preview, block collisions, and keep Health strictly read-only.
- Keep incomplete structures visible as warning-marked Nodes with explicit repair actions instead of misclassifying them as Files.
- Configure two unmanaged-content groups without hiding anything: unmanaged Markdown files and unmanaged folders. Both accept exact paths and name prefixes; `.` and `_` are first-release defaults. The active Vault configuration folder, `.git`, and `.trash` are always protected; root `AGENTS.md` and `CLAUDE.md` are unmanaged Markdown paths by default.
- Use natural name order without metadata or scalable manual order with a parent mode flag and sparse ranks on child notes.
- Follow Obsidian's language automatically or override the interface with English or Simplified Chinese.
- Keep all processing local and write no permanent node ID, `_pkwf` metadata, manifest, path, parent, or complete child list.

## Requirements and compatibility

- Obsidian 1.12.7 or later.
- Version 0.3.0 is desktop-only while the File Explorer adapter and drag placement receive dated host acceptance.
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
5. Open **Node contents** for child nodes, a static image/video Album, and compact ordinary files. Right-click an entry, use its More actions button, or press Shift+F10 for the same menu.
6. Drag a Folder Node before, into, or after another node to reorder or reparent it. Drag an Album or Files item into a child node, the current-node header, or a breadcrumb to move the file. The drop marker shows the resulting placement before the write.

## Settings

- **General** controls initialization state, interface language, preview-first maintenance, read-only Health, and two unified unmanaged-content rule groups for Markdown files and folders.
- **Homepage** controls whether the root Node Note is a homepage and whether it opens after startup.
- **Icons & appearance** controls inheritance, File Explorer placement, and note-title display. Icon size and alignment follow Obsidian rather than an arbitrary size setting.
- **Selection & naming** controls the aliases switch, prefix and suffix sources, independent separators, custom text, timestamp format, and live filename preview.
- **Follow Obsidian** uses Obsidian's current interface language. Manual English or Simplified Chinese selection overrides the plugin interface without changing filenames or Markdown properties.
- Naming sources are current file, current Folder Node, nearest current heading, timestamp, and custom text. Prefixes and suffixes affect only the basename; `aliases` contains only selected visible text.

## Limitations

- Structural identity is the current normalized Vault path, not a permanent ID. An external delete followed by an unrelated create is not guessed to be a rename.
- File Explorer integration is a host compatibility boundary and keeps this version desktop-only.
- Node visuals support Vault images but do not fetch remote images, recolor inline SVG, render PDF first pages, preview HEIC/HEIF, generate video frames, animate GIFs, or provide video/audio playback.
- The Contents View can move one ordinary file at a time into a displayed node or breadcrumb folder, but does not independently order files, provide multi-selection, accept cross-view drops, or become a second complete Vault tree.
- Merge fails closed on path or frontmatter conflicts instead of presenting a complex conflict-resolution UI.
- Alternate canonical names such as `README.md`, `index.md`, or `_A.md` and arbitrary property inheritance are not supported. Unmanaged folders are explicit whole-subtree boundaries, not partially managed nodes.

## Privacy and security

Folder Nodes runs locally and makes no network requests. Migration is preview-first, collisions block commits, ambiguous operations fail closed, and complete-node deletion uses Obsidian's system-trash path. Settings stay in the plugin's `data.json`; structural facts stay in the Vault. No node content, path, visual, or diagnostic is uploaded.

## Development

Use Node.js 24.18.0 and npm 11.16.0.

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
