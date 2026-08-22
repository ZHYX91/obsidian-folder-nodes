import { describe, expect, it } from "vitest";

import { classifyFileIdentity, classifyFolderIdentity } from "../../src/core/identity";

describe("Folder Node entry identity", () => {
  it("distinguishes complete, missing, and unmanaged folders", () => {
    expect(classifyFolderIdentity(false, true)).toBe("node");
    expect(classifyFolderIdentity(false, false)).toBe("missing-note");
    expect(classifyFolderIdentity(true, true)).toBe("ordinary");
    expect(classifyFolderIdentity(true, false)).toBe("ordinary");
  });

  it("never assigns node identity to ordinary attachments", () => {
    expect(classifyFileIdentity({
      canonicalNodeNote: false,
      counterpartNodeExists: false,
      ignored: false,
      leafExempt: false,
      markdown: false,
    })).toBe("ordinary");
  });

  it("distinguishes canonical notes, structural problems, and exempt Markdown", () => {
    expect(classifyFileIdentity({ canonicalNodeNote: true, counterpartNodeExists: true, ignored: false, leafExempt: false, markdown: true })).toBe("node-note");
    expect(classifyFileIdentity({ canonicalNodeNote: false, counterpartNodeExists: false, ignored: false, leafExempt: false, markdown: true })).toBe("missing-folder");
    expect(classifyFileIdentity({ canonicalNodeNote: false, counterpartNodeExists: true, ignored: false, leafExempt: false, markdown: true })).toBe("conflict");
    expect(classifyFileIdentity({ canonicalNodeNote: false, counterpartNodeExists: false, ignored: false, leafExempt: true, markdown: true })).toBe("ordinary");
  });
});
