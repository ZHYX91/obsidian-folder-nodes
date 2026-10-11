import { describe, expect, it } from "vitest";
import { installExplorerDisclosureAnchor } from "../../src/adapters/explorer-disclosure-anchor";

function fixture() {
  const root = document.createElement("div");
  const scroll = root.createDiv({ cls: "nav-files-container" });
  const content = scroll.createDiv({ cls: "nav-folder mod-root" });
  const title = content.createDiv({ cls: "nav-folder-title", attr: { "data-path": "Bottom" } });
  const control = title.createDiv({ cls: "nav-folder-collapse-indicator" });
  document.body.append(root);
  let naturalHeight = 1000;
  let position = 600;
  Object.defineProperties(scroll, {
    clientHeight: { get: () => 400 },
    scrollTop: {
      get: () => Math.min(position, Math.max(0, Math.max(naturalHeight, Number.parseFloat(content.style.minHeight) || 0) - 400)),
      set: (value: number) => { position = value; },
    },
  });
  content.getBoundingClientRect = () => ({ top: -scroll.scrollTop } as DOMRect);
  const dispose = installExplorerDisclosureAnchor(root);
  return { root, scroll, content, control, collapse: () => { naturalHeight -= 81; }, dispose: () => { dispose(); root.remove(); } };
}

describe("Explorer disclosure anchoring", () => {
  it("prevents bottom clamping throughout collapse and recycles space while scrolling up", () => {
    const f = fixture();
    f.control.click();
    f.collapse();
    expect(f.scroll.scrollTop).toBe(600);
    f.scroll.scrollTop = 500;
    f.scroll.dispatchEvent(new Event("scroll"));
    expect(f.content.style.minHeight).toBe("900px");
    expect(f.scroll.scrollTop).toBe(500);
    f.scroll.scrollTop = 0;
    f.scroll.dispatchEvent(new Event("scroll"));
    expect(f.content.style.minHeight).toBe("");
    f.dispose();
  });

  it("does not change the middle viewport or handle ordinary title clicks", () => {
    const f = fixture();
    f.scroll.scrollTop = 100;
    f.content.click();
    expect(f.content.style.minHeight).toBe("");
    f.control.click();
    f.collapse();
    expect(f.scroll.scrollTop).toBe(100);
    expect(f.content.style.minHeight).toBe("500px");
    f.dispose();
  });

  it("restores original styles and removes listeners on teardown", () => {
    const f = fixture();
    f.content.style.setProperty("min-height", "42px", "important");
    f.control.click();
    f.dispose();
    expect(f.content.style.getPropertyValue("min-height")).toBe("42px");
    expect(f.content.style.getPropertyPriority("min-height")).toBe("important");
    f.control.click();
    expect(f.content.style.minHeight).toBe("42px");
  });

  it("accounts for a preceding root row and never grows the retained floor while scrolling down", () => {
    const f = fixture();
    f.content.getBoundingClientRect = () => ({ top: 40 - f.scroll.scrollTop } as DOMRect);
    f.control.click();
    expect(f.content.style.minHeight).toBe("960px");
    f.scroll.scrollTop = 620;
    f.scroll.dispatchEvent(new Event("scroll"));
    expect(f.content.style.minHeight).toBe("960px");
    f.dispose();
  });
});
