import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("settings tab compatibility contract", () => {
  it("provides the themed guide and emoji preview styles", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/ui/styles.css"), "utf8");

    expect(styles).toContain(".folder-nodes-settings-guide");
    expect(styles).toContain(
      "border: 1px solid var(--background-modifier-border)",
    );
    expect(styles).toContain("background: var(--background-secondary)");
    expect(styles).toContain("--folder-nodes-glyph-font: var(--font-interface)");
    expect(styles).toContain('"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"');
    expect(styles).toContain(".folder-nodes-emoji-font-preview-sample");
    expect(styles).toContain(".folder-nodes-settings-icon-demo-slot");
    expect(styles).not.toContain(".folder-nodes-settings-icon-demo-badge");
  });

  it("styles tab controls for fine and coarse pointers", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/ui/styles.css"), "utf8");

    expect(styles).toContain("container-type: inline-size");
    expect(styles).toContain("margin-block-start: var(--size-4-5)");
    expect(styles).toContain(".folder-nodes-settings .folder-nodes-tabs > button.folder-nodes-tab");
    expect(styles).toContain("appearance: none !important");
    expect(styles).toContain("min-block-size: 34px");
    expect(styles).toContain("background: transparent !important");
    expect(styles).toContain("font-weight: var(--font-semibold) !important");
    expect(styles).toContain("min-block-size: 44px");
    expect(styles).not.toMatch(/\n\s+height: 34px/);
  });

  it("keeps root, property visuals, names, and statuses in distinct visual slots", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/ui/styles.css"), "utf8");

    expect(styles).toContain("display: grid !important");
    expect(styles).toContain("grid-template-columns: 22px minmax(0, 1fr) max-content !important");
    expect(styles).toContain("inline-size: calc(100% - 12px)");
    expect(styles).toContain("flex: 0 0 auto");
    expect(styles).toContain("justify-self: end");
    expect(styles).not.toContain(".folder-nodes-explorer-root.tree-item-self.nav-file-title");
    expect(styles).toContain("max-inline-size: 100%");
    expect(styles).toContain("flex: 0 0 22px");
    expect(styles).toContain(".folder-nodes-explorer-icon > svg { display: block; width: 16px; height: 16px; }");
    expect(styles).toContain(".folder-nodes-explorer-icon img { display: block; width: 18px; height: 18px; border-radius: 4px; }");
    expect(styles).toContain(".folder-nodes-explorer-icon .folder-nodes-visual-emoji { font-size: 16px; }");
    expect(styles).toContain(
      ".nav-folder-title.folder-nodes-missing-note,\n.nav-file-title.folder-nodes-missing-folder-note { align-items: center; }",
    );
    expect(styles).toContain("margin-inline-start: auto");
    expect(styles).toContain(".folder-nodes-status-badge.is-hidden");
    expect(styles).toContain("background: color-mix(in srgb, var(--interactive-accent) 10%, var(--background-primary))");
    expect(styles).toContain(".folder-nodes-status-badge.is-unmanaged");
    expect(styles).toContain(".folder-nodes-status-badge.is-incomplete");
    expect(styles).toContain("background: color-mix(in srgb, var(--color-orange) 10%, var(--background-primary))");
    expect(styles).toContain(".folder-nodes-status-badge.is-conflict");
    expect(styles).toContain("color: var(--text-error)");
    expect(styles).not.toContain(".folder-nodes-visual.has-accent:is(.is-emoji, .is-image)");
    expect(styles).toContain(".folder-nodes-visual.has-accent .folder-nodes-visual-glyph");
    expect(styles).toContain(".folder-nodes-visual-color { flex: 0 0 auto; width: 12px; height: 12px; border-radius: 50%; }");
    expect(styles).not.toContain("--folder-nodes-icon-badge-");
    expect(styles).not.toContain("border: 1px solid var(--folder-nodes-icon-badge-border)");
  });
});
