# Folder Nodes repository guidance

This repository is an independently cloneable public Obsidian plugin. Do not add dependencies on
local sibling repositories, personal Vaults, user profiles, or private acceptance evidence.

The structural identity of a node is `A/A.md` at its current normalized Vault path. Folder Nodes
must never write `_pkwf.id`, another stable node ID, a PKWF manifest, or a parent-owned complete
children list. Natural sorting writes no order metadata. Manual sorting uses child-owned sparse
`folderNodeSiblingRank` keys and the parent-only `folderNodeChildrenSort: manual` mode flag. These
are the first public field names; do not add compatibility reads for unpublished prototypes.

Migration is preview-first. Destructive or ambiguous changes fail closed. Tests and fixtures must
use an isolated disposable Vault. A production deployment is separate from build, commit, push,
tag, and GitHub Release actions; preserve existing plugin `data.json` unless explicitly authorized.

`CHANGELOG.md` is the only public document that records release history. README and user help
describe the product as it works now: compatibility, installation, usage, settings, limitations,
privacy, and support. Do not add version banners, dated acceptance evidence, release-status
narratives, or superseded plans outside the changelog. Keep migration or deprecation guidance only
when users still need to act, and state the required action directly. Engineering documents describe
the current contract and repeatable process rather than past executions.

Run `npm run check` before committing and `npm run release:check` before tagging. Release assets are
exactly `main.js`, `manifest.json`, `styles.css`, and the versioned archive produced from them.
