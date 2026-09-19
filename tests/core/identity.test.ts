import { describe, expect, it } from "vitest";

import { classifyFileIdentity, classifyFolderIdentity } from "../../src/core/identity";

describe("Folder Node entry identity", () => {
  it("distinguishes complete, missing, conflict, and unmanaged folders", () => {
    expect(classifyFolderIdentity(false, false, 1)).toBe("node");
    expect(classifyFolderIdentity(false, false, 0)).toBe("incomplete");
    expect(classifyFolderIdentity(false, false, 2)).toBe("conflict");
    expect(classifyFolderIdentity(true, true, 0)).toBe("unmanaged");
    expect(classifyFolderIdentity(true, false, 0)).toBe("ordinary");
  });

  it("never assigns node identity to ordinary attachments", () => {
    expect(classifyFileIdentity({
      canonicalRole: "none",
      counterpartNodeExists: false,
      parentUnmanaged: false,
      leafExempt: false,
      markdown: false,
    })).toBe("ordinary");
  });

  it("distinguishes canonical notes, conflicting candidates, structural problems, and exempt Markdown", () => {
    expect(classifyFileIdentity({ canonicalRole: "unique", counterpartNodeExists: true, parentUnmanaged: false, leafExempt: false, markdown: true })).toBe("node-note");
    expect(classifyFileIdentity({ canonicalRole: "conflict", counterpartNodeExists: false, parentUnmanaged: false, leafExempt: false, markdown: true })).toBe("conflict");
    expect(classifyFileIdentity({ canonicalRole: "none", counterpartNodeExists: false, parentUnmanaged: false, leafExempt: false, markdown: true })).toBe("incomplete");
    expect(classifyFileIdentity({ canonicalRole: "none", counterpartNodeExists: true, parentUnmanaged: false, leafExempt: false, markdown: true })).toBe("conflict");
    expect(classifyFileIdentity({ canonicalRole: "none", counterpartNodeExists: false, parentUnmanaged: false, leafExempt: true, markdown: true })).toBe("unmanaged");
    expect(classifyFileIdentity({ canonicalRole: "none", counterpartNodeExists: false, parentUnmanaged: true, leafExempt: false, markdown: true })).toBe("ordinary");
  });
});
