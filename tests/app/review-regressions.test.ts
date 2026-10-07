import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string { return readFileSync(resolve(process.cwd(), path), "utf8"); }

describe("review regression contracts", () => {
  it("centers both repair-row variants without changing ordinary file rows", () => {
    const styles = source("src/ui/styles.css");
    expect(styles).toContain(
      ".nav-folder-title.folder-nodes-node,\n.nav-folder-title.folder-nodes-missing-note,\n.nav-file-title.folder-nodes-missing-folder-note { align-items: center; }",
    );
    expect(styles).not.toMatch(/\n\.nav-file-title\s*\{[^}]*align-items:\s*center/gu);
  });

  it("disables property migration cancellation while its write is submitting", () => {
    const modal = source("src/ui/property-migration-modal.ts");
    expect(modal).toContain("if (this.submitting) return;");
    expect(modal).toContain("cancelButton?.setDisabled(true);");
    expect(modal).toContain("cancelButton?.setDisabled(false);");
    expect(modal).not.toContain("if (this.controller !== null) this.controller.abort");
  });
});
