import { describe, expect, it } from "vitest";
import {
  CHILDREN_SORT_PROPERTY, SIBLING_RANK_PROPERTY,
} from "../../src/core/properties";

describe("Folder Nodes property contract", () => {
  it("uses the Folder Node namespace and precise distributed-order semantics", () => {
    expect(CHILDREN_SORT_PROPERTY).toBe("folderNodeChildrenSort");
    expect(SIBLING_RANK_PROPERTY).toBe("folderNodeSiblingRank");
  });
});
