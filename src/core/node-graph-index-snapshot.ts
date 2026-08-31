import type { NodeVisual } from "./types";

export interface NodeGraphIndexRecord {
  readonly hiddenExplicit?: boolean;
  readonly hiddenSourcePath?: string | null;
  readonly label: string;
  readonly notePath: string | null;
  readonly parentPath: string | null;
  readonly path: string;
  readonly visual: NodeVisual;
}

export interface NodeGraphIndexSnapshot {
  readonly links: ReadonlyMap<string, ReadonlySet<string>>;
  readonly records: ReadonlyMap<string, NodeGraphIndexRecord>;
  readonly revision: number;
}
