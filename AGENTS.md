# Folder Nodes repository guidance

This repository is an independently cloneable public Obsidian plugin. Do not add dependencies on
local sibling repositories, personal Vaults, user profiles, or private acceptance evidence.

The structural identity of a node is `A/A.md` at its current normalized Vault path. Folder Nodes
must never write `_pkwf.id`, another stable node ID, a PKWF manifest, or a parent-owned complete
children list. Natural sorting writes no order metadata. The only current structural property is a
flat `folder-nodes` Text List containing non-default `order=manual`, positive `rank=N`, and
`hidden=true` tokens. Defaults are omitted and an empty property is removed. Published legacy
`folderNodeChildrenSort`, `folderNodeSiblingRank`, and `folderNodeHidden` fields remain
compatibility-readable; migration is explicit, preview-first, source-preserving, and fail-closed.
Never migrate note properties at startup or silently discard unknown future tokens.

Declarative settings are intentionally disabled because Obsidian 1.13 bypasses `display()` for
non-empty definitions, which removes Folder Nodes' five-tab settings layout and degrades the user
experience. Preserve the imperative `PluginSettingTab.display()` surface and keep
`getSettingDefinitions()` empty. Dormant declarative builders and tests may remain, but must not be
activated accidentally. Do not flag the `display()` deprecation, empty definitions, the disabled
feature switch, or missing settings search, and do not propose a declarative migration unless the
user explicitly asks to revisit this decision. Documentation that presents declarative settings as
the active surface is stale and must not override this policy.

## Manual installation release policy

The versioned `folder-nodes-<version>.zip` is an intentional required public release asset for
users who install without the Obsidian Community marketplace. Community ignores it during plugin
ingestion, so the automated-review `extra unsupported files` recommendation is expected and must
not be treated as a defect or a reason to remove the archive. The deterministic ZIP contains one
`folder-nodes/` directory with `main.js`, `manifest.json`, and `styles.css`, byte-identical to the
three loose release assets. Release checks must preserve and verify all four public assets.

## Release acceptance scope

This plugin is mobile-capable. An exact release candidate requires current desktop and Android
emulator acceptance. Android physical devices and iOS are out of scope. Keep source,
packaged-candidate, real-host, emulator, publication, and production-Vault claims separate.

Migration is preview-first. Destructive or ambiguous changes fail closed. Tests and fixtures must
use an isolated disposable Vault. A production deployment is separate from build, commit, push,
tag, and GitHub Release actions; preserve existing plugin `data.json` unless explicitly authorized.

`CHANGELOG.md` is the only public document that records release history. README and user help
describe the product as it works now: compatibility, installation, usage, settings, limitations,
privacy, and support. Do not add version banners, dated acceptance evidence, release-status
narratives, or superseded plans outside the changelog. Keep migration or deprecation guidance only
when users still need to act, and state the required action directly. Engineering documents describe
the current contract and repeatable process rather than past executions.

Run `npm run check` before committing and `npm run release:check` before tagging.
