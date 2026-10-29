# Product acceptance

Use these fixtures only in a disposable Vault. `product-scenarios.json` declares the steps and
expected behavior for desktop and Android emulator checks. A pass covers the selected scenarios
and the exact installed candidate, not every host or input method.

The optional Folder Nodes Acceptance Provider stays idle until one of its explicit fixture commands
is invoked. **Create deep Explorer reveal fixture** creates `Reveal/` with 120 reverse-ranked
siblings and a five-level target path for reveal/order/viewport checks. **Create 501-node viewport
fixture** creates `Viewport/` for large-graph checks. Each command refuses to replace its target
folder; if generation is interrupted, start with a fresh disposable Vault. The provider is a fixture
and is excluded from release assets.

**Prepare merge safety fixture** creates independent unsafe-link, safe-attachment, and final-read
race cases under `MergeSafety/`. The two **Arm merge ... race** commands only arrange a deterministic
editor-open or plugin-unload condition; invoke the actual merge through Folder Nodes. **Save merge
safety observations** records note contents and triggered conditions without issuing a verdict.
Use a fresh Vault when repeating this scenario.

**Prepare merge and content ownership fixture** creates `OwnershipSafety/` on demand. Its WikiLink
cases distinguish original/new source-context targets, unresolved and relocated targets, potential
best-match competitors, transferred properties, and a stationary explicit target. Record actual
host resolutions before assigning a result. The Ranks case merges First and Second after Existing
and checks persisted order after metadata refresh and reload. The two **Arm content ... replacement
on next drag** commands replace only fixture objects after the product binds a drag. They never
invoke the product move. Repeat ordinary-file and Album races in fresh Vaults; a refresh cancellation
is safe but does not prove that a drop reached the service. **Save merge and content ownership
observations** records fixture files and replacement events without assigning a verdict. The
`clip.mp4` file is an inert Album-tile placeholder, not a playable media sample.

The disposable fixture disables Obsidian's automatic internal-link updates. Keep that host option
off for the successful merge and final-read races so native rename processing does not rewrite
the source first. Separately, allowing native link updates can change a checked note during a
merge; the snapshot guard must then refuse and compensate the owned moves rather than append a
stale body. Record that refusal separately from a successful merge or a triggered final-read race.

With the graph scoped to the Viewport subtree and the default large-graph threshold of 500,
expanding Wide changes the visible graph from 3 to 501 nodes. Collapsing it changes back. This
exercises DOM and Canvas transitions without changing settings or editing the product runtime.

Desktop checks cover wheel modifiers, dragging, keyboard shortcuts, and controls. Android checks
cover native scrolling in DOM 2D, toolbar targets, Canvas 2D pinch/pan, and DOM/Canvas 3D pinch/pan.
DOM 2D does not implement a custom two-finger zoom gesture. A two-finger input trace must retain
both pointer identities, their coordinates, timing, and final releases; pointer delivery in the
host must also be confirmed before treating a gesture as native touch evidence.
