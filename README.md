# Folder Nodes

[简体中文](docs/i18n/README.zh-CN.md) · [Product requirements](docs/product-requirements.en.md) · [UX](docs/ux-spec.en.md) · [Architecture](docs/architecture.en.md) · [Testing](docs/testing-strategy.en.md) · [Release](docs/release.en.md)

Folder Nodes makes every managed Vault folder a node whose canonical note has the same name: `A/A.md`.

## Screenshots

Screenshots will be added after the first public release candidate is verified in Obsidian.

## Features

- Create, rename, move, reorder, and safely trash complete folder nodes.
- Create a node from selected text with exact `aliases` and configurable file-name prefix, suffix, separators, and timestamp.
- Preview-first migration from leaf Markdown into `A/A.md` nodes.
- Natural sorting with no metadata, or scalable sparse manual order stored on child notes.
- Native-styled File Explorer integration and a direct-contents side view.
- No permanent node IDs and no `_pkwf` metadata.

## Requirements and compatibility

Obsidian 1.12.7 or later on desktop. Version 0.1.0 is desktop-only while the Explorer adapter is verified.

## Installation

For development, run `npm ci` and `npm run build`. Copy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` into `.obsidian/plugins/folder-nodes/`.

## Usage

Open settings, review the migration preview, and explicitly commit it. Empty or already structured Vaults may use Initialize. Commands and folder context menus provide node actions.

## Settings

General contains adoption, template, and icon inheritance. Selection & naming contains alias, prefix, suffix, separator, and timestamp controls.

## Limitations

Folder Nodes identifies nodes by current path, not by stable ID. External delete-and-create is not treated as rename. Explorer integration is a compatibility boundary.

## Privacy and security

The plugin works locally and makes no network requests. Migration blocks collisions and never overwrites an existing target.

## Development

Use Node 24.18.0 and npm 11.16.0. Run `npm run check` before committing. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Support

Use GitHub Issues with Obsidian version, plugin version, and reproduction steps. See [SECURITY.md](SECURITY.md) for private vulnerability reports and [CHANGELOG.md](CHANGELOG.md) for changes.

## License

MIT. See [LICENSE](LICENSE).
