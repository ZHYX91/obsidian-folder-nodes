import { describe, expect, it } from "vitest";
import {
  CURRENT_SETTINGS_SCHEMA_VERSION,
  createSettingsSnapshot,
  DEFAULT_SETTINGS,
  loadSettingsData,
  normalizeSettings,
} from "../../src/shared/settings";

describe("settings", () => {
  it("applies hidden markers by default and preserves an explicit off switch", () => {
    expect(DEFAULT_SETTINGS.hiddenNodesEnabled).toBe(true);
    expect(normalizeSettings({}).hiddenNodesEnabled).toBe(true);
    expect(normalizeSettings({ hiddenNodesEnabled: false }).hiddenNodesEnabled).toBe(false);
    expect(createSettingsSnapshot(normalizeSettings({ hiddenNodesEnabled: false })).hiddenNodesEnabled).toBe(false);
  });
  it("merges nested naming defaults", () => {
    const settings = normalizeSettings({ prefix: { enabled: true } });
    expect(settings.prefix.enabled).toBe(true);
    expect(settings.prefix.separator).toBe("_");
    expect(settings.suffix).toEqual(DEFAULT_SETTINGS.suffix);
  });
  it("rejects malformed nested naming values", () => {
    const settings = normalizeSettings({
      prefix: { enabled: "yes", source: "broken", separator: 42, customText: null },
      suffix: "broken",
    });
    expect(settings.prefix).toEqual(DEFAULT_SETTINGS.prefix);
    expect(settings.suffix).toEqual(DEFAULT_SETTINGS.suffix);
  });
  it("defaults unknown language values to follow Obsidian", () => {
    expect(normalizeSettings({ language: "unknown" }).language).toBe("auto");
    expect(normalizeSettings({ language: "zh-CN" }).language).toBe("zh-CN");
  });
  it("normalizes icon placement and exact exemption paths", () => {
    const settings = normalizeSettings({
      explorerIconPosition: "after",
      leafNoteExemptions: ["/AGENTS.md", "AGENTS.md", 1],
      ignoredFolders: ["\\Generated\\Cache\\"],
    });
    expect(settings.explorerIconPosition).toBe("after");
    expect(settings.leafNoteExemptions).toEqual(["AGENTS.md"]);
    expect(settings.ignoredFolders).toEqual(["Generated/Cache"]);
    expect(normalizeSettings({ explorerIconPosition: "unknown" }).explorerIconPosition).toBe("before");
  });
  it("keeps only curated Emoji font preferences", () => {
    expect(normalizeSettings({ emojiFont: "Twemoji Mozilla" }).emojiFont).toBe("Twemoji Mozilla");
    expect(normalizeSettings({ emojiFont: "Comic Sans MS" }).emojiFont).toBe("system");
  });
  it("uses the first-release unmanaged prefix defaults", () => {
    const settings = normalizeSettings({});
    expect(settings.leafNotePrefixes).toEqual([".", "_"]);
    expect(settings.ignoredFolderPrefixes).toEqual([".", "_"]);
  });
  it("normalizes explicitly configured prefix rules", () => {
    const settings = normalizeSettings({
      leafNotePrefixes: ["_", "_", "bad/path", 1],
      ignoredFolderPrefixes: [".", " _ "],
    });
    expect(settings.leafNotePrefixes).toEqual(["_"]);
    expect(settings.ignoredFolderPrefixes).toEqual([".", "_"]);
  });
  it("normalizes Node Graph defaults and performance bounds while dropping obsolete rules", () => {
    const settings = normalizeSettings({
      nodeGraph: {
        enabled: false,
        defaultDimension: "3d",
        defaultRelationMode: "hybrid",
        layoutDirection: "top-to-bottom",
        includedSubtrees: ["/Work/", "Work"],
        excludedNodes: ["Work/Private"],
        excludedSubtrees: ["Work/Archive"],
        localDepth: 99,
        showBoundaryNodes: true,
        largeGraphThreshold: 1,
        overviewEdgeLimit: 1_000_000,
      },
    });
    expect(settings.nodeGraph).toEqual({
      enabled: false,
      defaultDimension: "3d",
      layoutDirection: "top-to-bottom",
      largeGraphThreshold: 50,
      overviewEdgeLimit: 100_000,
    });
    expect(settings.nodeGraph).not.toHaveProperty("defaultRelationMode");
    expect(settings.nodeGraph).not.toHaveProperty("localDepth");
    expect(settings.nodeGraph).not.toHaveProperty("showBoundaryNodes");
    expect(normalizeSettings({ nodeGraph: "broken" }).nodeGraph).toEqual(DEFAULT_SETTINGS.nodeGraph);
    expect(normalizeSettings({ nodeGraph: { layoutDirection: "broken" } }).nodeGraph.layoutDirection).toBe("left-to-right");
  });

  it("migrates unversioned settings once into the current schema", () => {
    const legacy = {
      homepageEnabled: true,
      ignoredFolders: ["/Generated/"],
      prefix: { enabled: true },
    };
    const before = structuredClone(legacy);

    const loaded = loadSettingsData(legacy);

    expect(loaded.compatibility).toEqual({
      status: "compatible",
      currentSchemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
      storedSchemaVersion: 0,
    });
    expect(loaded.migration).toEqual(createSettingsSnapshot(loaded.settings));
    expect(legacy).toEqual(before);
    const reloaded = loadSettingsData(loaded.migration);
    expect(reloaded.settings).toEqual(loaded.settings);
    expect(reloaded.migration).toBeNull();
  });

  it("fails closed for future settings without losing their unknown fields", () => {
    const future = {
      schemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION + 1,
      language: "zh-CN",
      nodeGraph: { enabled: false },
      futureFeature: { mode: "lossless", paths: ["A", "B"] },
    };
    const before = structuredClone(future);

    const loaded = loadSettingsData(future);

    expect(loaded.compatibility).toEqual({
      status: "incompatible",
      currentSchemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
      storedSchemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION + 1,
      reason: "future-schema",
    });
    expect(loaded.migration).toBeNull();
    expect(future).toEqual(before);
    expect(future.futureFeature).toEqual({ mode: "lossless", paths: ["A", "B"] });
  });

  it("treats malformed explicit schema values as incompatible", () => {
    expect(loadSettingsData({ schemaVersion: "2", futureField: true }).compatibility).toMatchObject({
      status: "incompatible",
      storedSchemaVersion: null,
      reason: "invalid-schema",
    });
  });

  it("normalizes purely and returns independent deep copies", () => {
    const source = Object.freeze({
      ignoredFolders: Object.freeze(["/Generated/"]),
      nodeGraph: Object.freeze({
        includedSubtrees: Object.freeze(["/Work/"]),
      }),
      prefix: Object.freeze({ enabled: true }),
    });
    const before = structuredClone(source);
    const first = normalizeSettings(source);
    const second = normalizeSettings(source);

    expect(first).toEqual(second);
    expect(source).toEqual(before);
    first.ignoredFolders.push("Other");
    first.prefix.customText = "changed";
    expect(second.ignoredFolders).toEqual(["Generated"]);
    expect(second.nodeGraph).toEqual(DEFAULT_SETTINGS.nodeGraph);
    expect(second.prefix.customText).toBe("");
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SETTINGS.nodeGraph)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SETTINGS.ignoredFolders)).toBe(true);
  });

  it("reports deprecated graph rules while migrating schema 1 settings without touching notes", () => {
    const loaded = loadSettingsData({
      schemaVersion: 1,
      nodeGraph: { includedSubtrees: ["Work"], excludedNodes: ["Private"], excludedSubtrees: ["Archive"] },
    });
    expect(loaded.discardedNodeGraphRuleCount).toBe(3);
    expect(loaded.compatibility).toMatchObject({ status: "compatible", storedSchemaVersion: 1, currentSchemaVersion: 2 });
    expect(loaded.migration?.nodeGraph).toEqual(DEFAULT_SETTINGS.nodeGraph);
  });
});
