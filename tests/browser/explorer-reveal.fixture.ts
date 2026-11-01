import type { TAbstractFile, TFolder } from "obsidian";
import { installExplorerVirtualOrder } from "../../src/adapters/explorer-virtual-order";

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
function assert(condition: boolean, message: string): void { if (!condition) throw new Error(message); }

export async function checkExplorerReveal(): Promise<unknown> {
  // Mobile Explorer structure: a clipped drawer/leaf, scrolling files, and a
  // sibling absolute toolbar. Browser layout owns every rectangle and scroll.
  const drawer = document.createElement("div");
  drawer.style.cssText = "position:fixed;top:0;left:0;width:330.1932px;height:851px";
  drawer.innerHTML = `<div class="workspace-drawer-active-tab-content" style="position:absolute;top:49.45455px;height:643.27277px;width:100%;overflow:auto">
    <div class="workspace-leaf" style="height:100%;overflow:hidden">
      <div class="workspace-leaf-content" style="height:100%;position:relative;overflow:hidden">
        <div class="nav-files-container" style="position:absolute;top:4px;bottom:0;width:100%;overflow-y:auto;overflow-anchor:none">
          <div style="height:5357px;position:relative"><div class="nav-folder"><div class="nav-folder-title" data-path="Reveal/Node 060/Level Two/Level Three/Leaf"
            style="position:absolute;top:2758.75px;height:36.79546px;left:12.45455px;right:16.72728px">Leaf</div></div></div>
        </div>
        <div class="nav-buttons-container" style="position:absolute;bottom:0;width:100%;height:56px;background:#fff">Toolbar</div>
      </div>
    </div>
  </div>`;
  document.body.append(drawer);
  const root = drawer.querySelector<HTMLElement>(".workspace-leaf-content")!;
  const scroll = root.querySelector<HTMLElement>(".nav-files-container")!;
  const target = root.querySelector<HTMLElement>(".nav-folder-title")!;
  const toolbar = root.querySelector<HTMLElement>(".nav-buttons-container")!;
  const host = { getSortedFolderItems: (_folder: TFolder) => [], sort: () => {}, tree: { infinityScroll: {} },
    revealInFolder: (_entry: TAbstractFile): void => { scroll.scrollTop = 2160; } };
  const bridge = installExplorerVirtualOrder(host, root, () => null)!;
  try {
    await frame();
    const results = [];
    for (const gap of [0.0001, 0.49, 0.51]) {
      // Reproduce the measured mobile edge discrepancy through browser layout,
      // without replacing getBoundingClientRect or the browser's scroll setters.
      toolbar.style.transform = `translateY(-${gap}px)`;
      scroll.scrollTop = 2160;
      const before = target.getBoundingClientRect();
      const bar = toolbar.getBoundingClientRect();
      const actualGap = scroll.getBoundingClientRect().bottom - bar.bottom;
      assert(before.top > bar.top && before.bottom < bar.bottom, "native reveal must leave the whole Leaf behind the toolbar");
      assert(actualGap > 0 && Math.abs(actualGap - gap) < 0.0001,
        `browser must produce the measured fractional edge gap: ${JSON.stringify({ gap, actualGap, viewport: scroll.getBoundingClientRect().toJSON(), toolbar: bar.toJSON() })}`);
      host.revealInFolder({ path: target.dataset.path! } as TAbstractFile);
      await frame();
      await frame();
      const after = target.getBoundingClientRect();
      if (gap < 0.5) {
        assert(scroll.scrollTop > 2160 && after.bottom <= bar.top + 0.5,
          `real mobile row must clear toolbar: ${JSON.stringify({ actualGap, target: after.toJSON(), toolbar: bar.toJSON(), scrollTop: scroll.scrollTop })}`);
      } else assert(scroll.scrollTop === 2160, "a toolbar separated from the viewport edge must not trim the viewport");
      results.push({ gap: actualGap, scrollTop: scroll.scrollTop, targetBottom: after.bottom, toolbarTop: bar.top });
    }
    return results;
  } finally { bridge.dispose(); drawer.remove(); }
}
