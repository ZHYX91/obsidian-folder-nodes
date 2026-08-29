# Node Graph

Node Graph visualizes Folder Nodes without modifying Obsidian's native Graph View.

## Relationship modes

- **Structure** renders Folder Node parent/child edges.
- **Links** renders resolved links between canonical Node Notes. Obsidian Metadata Cache is the source of truth, so wikilinks and Markdown links share the same resolved-link semantics.
- **Hybrid** renders both. Structure edges are solid; link edges are accent-colored and dashed. When both relationships connect the same pair, the link edge is offset so both remain visible.

Only complete managed Folder Nodes are graph entities. Duplicate and reciprocal links collapse to one graph relation. Self-links, unresolved links, and links to non-canonical or non-Folder-Node content are omitted.

## Dimensions

2D is the default. 3D uses the same graph model and relationship filter: structural depth maps to the Z axis while nodes at the same depth are deterministically distributed over X/Y. The layout is stable and does not use a random force simulation.

In 3D, drag empty space to rotate, Shift-drag or middle-drag to pan, use the wheel to zoom, and use Fit to restore the default camera. Node selection, external focus, icons, Enter, and double-click keep the same semantics in both dimensions.

## Refresh and data flow

Node Graph consumes the plugin's existing NodeService structure and `MetadataCache.resolvedLinks`. It refreshes through the existing coalescing RefreshScheduler extension hook, including Vault structural events and Metadata Cache `changed` / `resolved` events. It does not parse every Markdown file or maintain a second Vault-wide link index.
