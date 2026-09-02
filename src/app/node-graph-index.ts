import { TFile, TFolder, type App } from "obsidian";

import { normalizeNodeGraphLinksFromTargets } from "../core/node-graph-links";
import type { NodeGraphIndexRecord, NodeGraphIndexSnapshot } from "../core/node-graph-index-snapshot";
import {
  GLOBAL_NODE_GRAPH_SCOPE,
  isWithin,
  nodeGraphParentPath,
  nodeGraphTraversalRoots,
} from "../core/node-graph-scope";
import { normalizeVaultPath } from "../core/paths";
import type { NodeGraphSettings, NodeVisual } from "../core/types";

export type { NodeGraphIndexRecord, NodeGraphIndexSnapshot } from "../core/node-graph-index-snapshot";

export interface NodeGraphIndexMetrics {
  readonly fullScans: number;
  readonly partialScans: number;
  readonly visitedFolders: number;
}

interface NodeGraphIndexService {
  children(path: string): readonly { readonly childPath: string }[];
  folderForFile(file: TFile | null): TFolder | null;
  getCanonicalFile(folderPath: string): TFile | null;
  getFolder(path: string): TFolder | null;
  isCanonicalFile(file: TFile): boolean;
  isIgnoredPath?(path: string): boolean;
  isNodeVisible?(path: string): boolean;
  hiddenState?(path: string): { readonly explicit: boolean; readonly sourcePath: string | null };
  revealingHiddenNodes?(): boolean;
}

interface NodeGraphIndexVisuals {
  resolve(folder: TFolder): NodeVisual;
}

interface NodeGraphIndexReferences {
  targetsForSource(path: string): readonly string[];
}

/** Plugin-owned catalog. View changes only filter this catalog; they never traverse the Vault. */
export class NodeGraphIndex {
  private readonly records = new Map<string, NodeGraphIndexRecord>();
  private links: ReadonlyMap<string, ReadonlySet<string>> = new Map();
  private dirtyAll = true;
  private dirtyLinks = true;
  private readonly dirtyPaths = new Set<string>();
  private revision = 0;
  private fullScans = 0;
  private partialScans = 0;
  private visitedFolders = 0;

  public constructor(
    private readonly app: App,
    private readonly service: NodeGraphIndexService,
    private readonly visuals: NodeGraphIndexVisuals,
    private readonly references: NodeGraphIndexReferences,
  ) {}

  public snapshot(_settings: NodeGraphSettings): NodeGraphIndexSnapshot {
    if (this.dirtyAll) this.rebuild();
    else if (this.dirtyPaths.size > 0) this.refreshDirtyPaths();
    if (this.dirtyLinks) this.rebuildLinks();
    return { links: this.links, records: this.records, revision: this.revision };
  }

  public invalidateAll(): void {
    this.dirtyAll = true;
    this.dirtyPaths.clear();
  }

  public invalidateLinks(): void { this.dirtyLinks = true; }

  public invalidatePaths(paths: ReadonlySet<string>): void {
    if (this.dirtyAll) return;
    for (const path of paths) this.dirtyPaths.add(normalizeVaultPath(path));
  }

  /** Re-resolve visuals from cached folders without traversing child collections. */
  public invalidateVisuals(): void {
    if (this.dirtyAll) return;
    let changed = false;
    for (const [path, record] of this.records) {
      const folder = path === "" ? this.app.vault.getRoot() : this.service.getFolder(path);
      if (folder === null) continue;
      this.records.set(path, { ...record, visual: normalizeIndexVisual(path, this.visuals.resolve(folder)) });
      changed = true;
    }
    if (changed) this.revision += 1;
  }

  /** Refresh metadata-derived visuals and direct sibling order without collecting Vault subtrees. */
  public invalidateRecordMetadata(paths: ReadonlySet<string>): boolean {
    if (this.dirtyAll) return false;
    const requestedPaths = new Set([...paths].map(normalizeVaultPath));
    if (this.service.revealingHiddenNodes?.() ?? false) {
      this.invalidatePaths(requestedPaths);
      return false;
    }
    if ([...requestedPaths].some((path) => {
      const expected = !(this.service.isIgnoredPath?.(path) ?? false)
        && (this.service.isNodeVisible?.(path) ?? true);
      return expected !== this.records.has(path);
    })) {
      this.invalidatePaths(requestedPaths);
      return false;
    }
    const relevantPaths = new Set([...requestedPaths].filter((path) => this.records.has(path)));
    const missingPaths = new Set([...requestedPaths].filter((path) => !relevantPaths.has(path)));
    if (missingPaths.size > 0) {
      for (const path of this.records.keys()) {
        let ancestor: string | null = path;
        while (ancestor !== null) {
          if (missingPaths.delete(ancestor)) relevantPaths.add(ancestor);
          ancestor = nodeGraphParentPath(ancestor);
        }
        if (missingPaths.size === 0) break;
      }
    }
    if (relevantPaths.size === 0) return false;
    const recordPaths = new Set([...relevantPaths].filter((path) => this.records.has(path)));
    const changedVisualRoots = new Set<string>();
    for (const path of recordPaths) {
      const record = this.records.get(path);
      if (record === undefined) continue;
      const folder = path === "" ? this.app.vault.getRoot() : this.service.getFolder(path);
      if (folder === null) continue;
      const visual = normalizeIndexVisual(path, this.visuals.resolve(folder));
      this.records.set(path, { ...record, visual });
      if (!sameVisual(record.visual, visual)) changedVisualRoots.add(path);
    }
    for (const path of relevantPaths) {
      if (!recordPaths.has(path)) changedVisualRoots.add(path);
    }
    if (changedVisualRoots.size > 0) {
      for (const [path, record] of this.records) {
        if (recordPaths.has(path) || !pathHasAncestorInSet(path, changedVisualRoots)) continue;
        const folder = path === "" ? this.app.vault.getRoot() : this.service.getFolder(path);
        if (folder === null) continue;
        this.records.set(path, { ...record, visual: normalizeIndexVisual(path, this.visuals.resolve(folder)) });
      }
    }
    const orderParents = new Set<string>(relevantPaths);
    for (const path of relevantPaths) {
      const parentPath = nodeGraphParentPath(path);
      if (parentPath !== null) orderParents.add(parentPath);
    }
    this.restoreSiblingOrder(orderParents);
    this.restoreForestRootOrder();
    this.restoreHierarchyOrder();
    this.revision += 1;
    return true;
  }

  public metrics(): NodeGraphIndexMetrics {
    return { fullScans: this.fullScans, partialScans: this.partialScans, visitedFolders: this.visitedFolders };
  }

  private rebuild(): void {
    this.records.clear();
    const childPathsByParent = new Map<string, ReadonlySet<string>>();
    const traversalRoots = nodeGraphTraversalRoots(GLOBAL_NODE_GRAPH_SCOPE);
    for (const rootPath of traversalRoots) {
      if (!this.isReachableTraversalRoot(rootPath, childPathsByParent)) continue;
      const root = rootPath === "" ? this.app.vault.getRoot() : this.service.getFolder(rootPath);
      if (root !== null) this.collect(root);
    }
    const traversalParents = new Set(traversalRoots.flatMap((path) => {
      const parentPath = nodeGraphParentPath(path);
      return parentPath === null ? [] : [parentPath];
    }));
    this.restoreSiblingOrder(traversalParents);
    this.restoreForestRootOrder();
    this.restoreHierarchyOrder();
    this.fullScans += 1;
    this.dirtyAll = false;
    this.dirtyPaths.clear();
    this.dirtyLinks = true;
    this.revision += 1;
  }

  private refreshDirtyPaths(): void {
    const configuredTraversalRoots = nodeGraphTraversalRoots(GLOBAL_NODE_GRAPH_SCOPE);
    const roots = minimalRoots([...this.dirtyPaths].flatMap((path) => this.folderPathsForRefresh(path)))
      .filter((rootPath) => configuredTraversalRoots.some((traversalRoot) =>
        isWithin(rootPath, traversalRoot) || isWithin(traversalRoot, rootPath)));
    this.dirtyPaths.clear();
    if (roots.length === 0) {
      return;
    }
    const previousOrder = [...this.records.keys()];
    const rootSet = new Set(roots);
    const affectedParents = new Set<string>();
    for (const rootPath of roots) {
      const parentPath = nodeGraphParentPath(rootPath);
      if (parentPath !== null) affectedParents.add(parentPath);
    }
    for (const path of [...this.records.keys()]) {
      if (pathHasAncestorInSet(path, rootSet)) this.records.delete(path);
    }
    const childPathsByParent = new Map<string, ReadonlySet<string>>();
    const traversalRoots = nodeGraphTraversalRoots(GLOBAL_NODE_GRAPH_SCOPE)
      .filter((rootPath) => this.isReachableTraversalRoot(rootPath, childPathsByParent));
    const collectRoots = minimalRoots(roots.flatMap((rootPath) => {
      const nestedTraversalRoots = traversalRoots.filter((traversalRoot) => isWithin(traversalRoot, rootPath));
      if (nestedTraversalRoots.length > 0) return nestedTraversalRoots;
      return this.isReachablePartialRoot(rootPath, childPathsByParent) ? [rootPath] : [];
    }));
    for (const rootPath of collectRoots) {
      const parentPath = nodeGraphParentPath(rootPath);
      if (parentPath !== null) affectedParents.add(parentPath);
      const folder = rootPath === "" ? this.app.vault.getRoot() : this.service.getFolder(rootPath);
      if (folder !== null) this.collect(folder);
    }
    this.restoreKnownRecordSlots(previousOrder);
    this.restoreSiblingOrder(affectedParents);
    this.restoreForestRootOrder();
    this.restoreHierarchyOrder();
    this.partialScans += 1;
    this.dirtyLinks = true;
    this.revision += 1;
  }

  /** Preserve stable slots for records that survived or were rebuilt, then append genuinely new records. */
  private restoreKnownRecordSlots(previousOrder: readonly string[]): void {
    const current = new Map(this.records);
    this.records.clear();
    for (const path of previousOrder) {
      const record = current.get(path);
      if (record === undefined) continue;
      this.records.set(path, record);
      current.delete(path);
    }
    for (const [path, record] of current) this.records.set(path, record);
  }

  /** Order disconnected/promoted roots by the same managed hierarchy used by a full scan. */
  private restoreForestRootOrder(): void {
    const entries = [...this.records];
    const forestRoots = entries.filter(([, record]) =>
      record.parentPath === null || !this.records.has(record.parentPath));
    if (forestRoots.length < 2) return;
    const childRanks = new Map<string, ReadonlyMap<string, number>>();
    const keys = new Map(forestRoots.map(([path]) => [path, this.forestOrderKey(path, childRanks)]));
    forestRoots.sort(([left], [right]) => compareForestOrder(
      keys.get(left) ?? [],
      keys.get(right) ?? [],
    ));
    const forestPaths = new Set(forestRoots.map(([path]) => path));
    let replacementIndex = 0;
    this.records.clear();
    for (const entry of entries) {
      if (!forestPaths.has(entry[0])) {
        this.records.set(entry[0], entry[1]);
        continue;
      }
      const replacement = forestRoots[replacementIndex];
      replacementIndex += 1;
      if (replacement !== undefined) this.records.set(replacement[0], replacement[1]);
    }
  }

  /** Make incremental record iteration identical to a full depth-first build without walking the Vault. */
  private restoreHierarchyOrder(): void {
    if (this.records.size < 2) return;
    const entries = [...this.records];
    const records = new Map(entries);
    const children = new Map<string, string[]>();
    const roots: string[] = [];
    for (const [path, record] of entries) {
      if (record.parentPath === null || !records.has(record.parentPath)) {
        roots.push(path);
        continue;
      }
      const siblings = children.get(record.parentPath) ?? [];
      siblings.push(path);
      children.set(record.parentPath, siblings);
    }
    const ordered: Array<readonly [string, NodeGraphIndexRecord]> = [];
    const visited = new Set<string>();
    const visit = (path: string): void => {
      if (visited.has(path)) return;
      visited.add(path);
      const record = records.get(path);
      if (record === undefined) return;
      ordered.push([path, record]);
      for (const childPath of children.get(path) ?? []) visit(childPath);
    };
    for (const root of roots) visit(root);
    for (const [path] of entries) visit(path);
    this.records.clear();
    for (const [path, record] of ordered) this.records.set(path, record);
  }

  private forestOrderKey(
    path: string,
    childRanks: Map<string, ReadonlyMap<string, number>>,
  ): readonly (readonly [number, string])[] {
    const chain: string[] = [];
    let current = normalizeVaultPath(path);
    while (current !== "") {
      chain.push(current);
      current = nodeGraphParentPath(current) ?? "";
    }
    chain.reverse();
    const key: Array<readonly [number, string]> = [];
    let parentPath = "";
    for (const childPath of chain) {
      let ranks = childRanks.get(parentPath);
      if (ranks === undefined) {
        ranks = new Map(this.service.children(parentPath).map(({ childPath: rawPath }, index) =>
          [normalizeVaultPath(rawPath), index]));
        childRanks.set(parentPath, ranks);
      }
      key.push([ranks.get(childPath) ?? Number.MAX_SAFE_INTEGER, childPath]);
      parentPath = childPath;
    }
    return key;
  }

  /** Reinserted records land at the Map tail; restore only the affected sibling slots. */
  private restoreSiblingOrder(parentPaths: ReadonlySet<string>): void {
    const entries = [...this.records];
    const siblingsByParent = new Map<string, Array<readonly [string, NodeGraphIndexRecord]>>();
    for (const entry of entries) {
      const parentPath = entry[1].parentPath;
      if (parentPath === null || !parentPaths.has(parentPath)) continue;
      const siblings = siblingsByParent.get(parentPath) ?? [];
      siblings.push(entry);
      siblingsByParent.set(parentPath, siblings);
    }
    const orderedByParent = new Map<string, Array<readonly [string, NodeGraphIndexRecord]>>();
    for (const parentPath of parentPaths) {
      const siblings = siblingsByParent.get(parentPath) ?? [];
      if (siblings.length < 2) continue;
      const siblingsByPath = new Map(siblings);
      const ordered: Array<readonly [string, NodeGraphIndexRecord]> = [];
      const seen = new Set<string>();
      for (const { childPath } of this.service.children(parentPath)) {
        const path = normalizeVaultPath(childPath);
        const record = siblingsByPath.get(path);
        if (record === undefined || seen.has(path)) continue;
        ordered.push([path, record]);
        seen.add(path);
      }
      for (const [path, record] of siblings) {
        if (seen.has(path)) continue;
        ordered.push([path, record]);
      }
      orderedByParent.set(parentPath, ordered);
    }
    if (orderedByParent.size === 0) return;
    const replacementIndexes = new Map<string, number>();
    this.records.clear();
    for (const [path, record] of entries) {
      const parentPath = record.parentPath;
      if (parentPath === null) {
        this.records.set(path, record);
        continue;
      }
      const ordered = orderedByParent.get(parentPath);
      if (ordered === undefined) {
        this.records.set(path, record);
        continue;
      }
      const replacementIndex = replacementIndexes.get(parentPath) ?? 0;
      replacementIndexes.set(parentPath, replacementIndex + 1);
      const replacement = ordered[replacementIndex];
      if (replacement !== undefined) this.records.set(replacement[0], replacement[1]);
    }
  }

  private isReachablePartialRoot(
    rootPath: string,
    childPathsByParent: Map<string, ReadonlySet<string>>,
  ): boolean {
    if (rootPath === "") return true;
    const parentPath = nodeGraphParentPath(rootPath);
    if (parentPath === null) return false;
    return this.childPaths(parentPath, childPathsByParent).has(rootPath);
  }

  private isReachableTraversalRoot(
    rootPath: string,
    childPathsByParent: Map<string, ReadonlySet<string>>,
  ): boolean {
    const normalized = normalizeVaultPath(rootPath);
    if (normalized === "") return true;
    let parentPath = "";
    for (const segment of normalized.split("/")) {
      const path = parentPath === "" ? segment : `${parentPath}/${segment}`;
      if (!this.childPaths(parentPath, childPathsByParent).has(path)) return false;
      parentPath = path;
    }
    return true;
  }

  private childPaths(
    parentPath: string,
    childPathsByParent: Map<string, ReadonlySet<string>>,
  ): ReadonlySet<string> {
    let childPaths = childPathsByParent.get(parentPath);
    if (childPaths === undefined) {
      childPaths = new Set(this.service.children(parentPath).map(({ childPath }) => normalizeVaultPath(childPath)));
      childPathsByParent.set(parentPath, childPaths);
    }
    return childPaths;
  }

  private collect(root: TFolder): void {
    const pending = [root];
    while (pending.length > 0) {
      const folder = pending.pop();
      if (folder === undefined) break;
      this.visitedFolders += 1;
      const path = normalizeVaultPath(folder.path);
      if (!(this.service.isNodeVisible?.(path) ?? true)) continue;
      const note = this.service.getCanonicalFile(path);
      const resolvedVisual = this.visuals.resolve(folder);
      const hiddenState = (this.service.revealingHiddenNodes?.() ?? false)
        ? this.service.hiddenState?.(path) ?? { explicit: false, sourcePath: null }
        : { explicit: false, sourcePath: null };
      this.records.set(path, {
        hiddenExplicit: hiddenState.explicit,
        hiddenSourcePath: hiddenState.sourcePath,
        label: path === "" ? this.app.vault.getName() : folder.name,
        notePath: note?.path ?? null,
        parentPath: nodeGraphParentPath(path),
        path,
        visual: normalizeIndexVisual(path, resolvedVisual),
      });
      const children = this.service.children(path);
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const childPath = children[index]?.childPath;
        if (childPath === undefined) continue;
        const child = this.service.getFolder(childPath);
        if (child !== null) pending.push(child);
      }
    }
  }

  private rebuildLinks(): void {
    const sources = [...this.records.values()].flatMap(({ path, notePath }) => notePath === null
      ? []
      : [{ nodeId: path, notePath }]);
    const notePathToNodeId = new Map(sources.map(({ nodeId, notePath }) => [notePath, nodeId]));
    this.links = normalizeNodeGraphLinksFromTargets(
      sources,
      (source) => this.references.targetsForSource(source.notePath),
      notePathToNodeId,
    );
    this.dirtyLinks = false;
    this.revision += 1;
  }

  private folderPathsForRefresh(path: string): string[] {
    const folder = path === "" ? this.app.vault.getRoot() : this.service.getFolder(path);
    if (folder !== null) return [normalizeVaultPath(folder.path)];
    const entry = this.app.vault.getAbstractFileByPath(path);
    if (entry instanceof TFile) {
      if (!this.service.isCanonicalFile(entry)) return [];
      const owner = this.service.folderForFile(entry);
      return owner === null ? [] : [normalizeVaultPath(owner.path)];
    }
    const slash = path.lastIndexOf("/");
    return path.toLocaleLowerCase().endsWith(".md") ? [slash < 0 ? "" : path.slice(0, slash)] : [path];
  }
}

function normalizeIndexVisual(path: string, visual: NodeVisual): NodeVisual {
  return visual.kind === "fallback"
    ? { ...visual, value: path === "" ? "home" : "folder" }
    : visual;
}

function sameVisual(left: NodeVisual, right: NodeVisual): boolean {
  return left.accent === right.accent
    && left.inheritedFrom === right.inheritedFrom
    && left.kind === right.kind
    && left.value === right.value;
}

function compareForestOrder(
  left: readonly (readonly [number, string])[],
  right: readonly (readonly [number, string])[],
): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (leftPart === undefined || rightPart === undefined) continue;
    const rank = leftPart[0] - rightPart[0];
    if (rank !== 0) return rank;
    const path = leftPart[1].localeCompare(rightPart[1], "en");
    if (path !== 0) return path;
  }
  return left.length - right.length;
}

function minimalRoots(paths: readonly string[]): string[] {
  const roots: string[] = [];
  const rootSet = new Set<string>();
  for (const path of [...new Set(paths.map(normalizeVaultPath))].sort((left, right) => left.length - right.length || left.localeCompare(right, "en"))) {
    if (pathHasAncestorInSet(path, rootSet)) continue;
    roots.push(path);
    rootSet.add(path);
  }
  return roots;
}

function pathHasAncestorInSet(path: string, candidates: ReadonlySet<string>): boolean {
  let current: string | null = normalizeVaultPath(path);
  while (current !== null) {
    if (candidates.has(current)) return true;
    current = nodeGraphParentPath(current);
  }
  return false;
}
