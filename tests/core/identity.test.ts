import { describe, expect, it } from "vitest";

import { classifyFileIdentity, classifyFolderIdentity } from "../../src/core/identity";

describe("Folder Node entry identity", () => {
  it("distinguishes complete, missing, and unmanaged folders", () => {
    expect(classifyFolderIdentity(false, false, true)).toBe("node");
    expect(classifyFolderIdentity(false, false, false)).toBe("incomplete");
    expect(classifyFolderIdentity(true, true, false)).toBe("unmanaged");
    expect(classifyFolderIdentity(true, false, false)).toBe("ordinary");
  });

  it("never assigns node identity to ordinary attachments", () => {
    expect(classifyFileIdentity({
      canonicalNodeNote: false,
      counterpartNodeExists: false,
      parentUnmanaged: false,
      leafExempt: false,
      markdown: false,
    })).toBe("ordinary");
  });

  it("distinguishes canonical notes, structural problems, and exempt Markdown", () => {
    expect(classifyFileIdentity({ canonicalNodeNote: true, counterpartNodeExists: true, parentUnmanaged: false, leafExempt: false, markdown: true })).toBe("node-note");
    expect(classifyFileIdentity({ canonicalNodeNote: false, counterpartNodeExists: false, parentUnmanaged: false, leafExempt: false, markdown: true })).toBe("incomplete");
    expect(classifyFileIdentity({ canonicalNodeNote: false, counterpartNodeExists: true, parentUnmanaged: false, leafExempt: false, markdown: true })).toBe("conflict");
    expect(classifyFileIdentity({ canonicalNodeNote: false, counterpartNodeExists: false, parentUnmanaged: false, leafExempt: true, markdown: true })).toBe("unmanaged");
    expect(classifyFileIdentity({ canonicalNodeNote: false, counterpartNodeExists: false, parentUnmanaged: true, leafExempt: false, markdown: true })).toBe("ordinary");
  });
});
