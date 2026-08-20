# Folder Nodes repository guidance

This repository is an independently cloneable public Obsidian plugin. Do not add dependencies on
local sibling repositories, personal Vaults, user profiles, or private acceptance evidence.

The structural identity of a node is `A/A.md` at its current normalized Vault path. Folder Nodes
must never write `_pkwf.id`, another stable node ID, a PKWF manifest, or a parent-owned complete
children list. Natural sorting writes no order metadata. Manual sorting uses child-owned sparse
`folderNodeOrder` keys and the parent-only `folderNodeSort: manual` mode flag.

Migration is preview-first. Destructive or ambiguous changes fail closed. Tests and fixtures must
use an isolated disposable Vault. A production deployment is separate from build, commit, push,
tag, and GitHub Release actions; preserve existing plugin `data.json` unless explicitly authorized.

Run `npm run check` before committing and `npm run release:check` before tagging. Release assets are
exactly `main.js`, `manifest.json`, `styles.css`, and the versioned archive produced from them.
