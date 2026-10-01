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

With the graph scoped to the Viewport subtree and the default large-graph threshold of 500,
expanding Wide changes the visible graph from 3 to 501 nodes. Collapsing it changes back. This
exercises DOM and Canvas transitions without changing settings or editing the product runtime.

Desktop checks cover wheel modifiers, dragging, keyboard shortcuts, and controls. Android checks
cover native scrolling in DOM 2D, toolbar targets, Canvas 2D pinch/pan, and DOM/Canvas 3D pinch/pan.
DOM 2D does not implement a custom two-finger zoom gesture. A two-finger input trace must retain
both pointer identities, their coordinates, timing, and final releases; pointer delivery in the
host must also be confirmed before treating a gesture as native touch evidence.
