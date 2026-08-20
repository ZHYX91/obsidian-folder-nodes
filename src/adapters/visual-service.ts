import { App, getIconIds, TFile, TFolder } from "obsidian";

import type { NodeVisual } from "../core/types";
import { fallbackVisual, firstValidVisual } from "../core/visual";
import { ICON_PROPERTY } from "../core/properties";

interface VisualNodeService {
  getNote(path: string): TFile | null;
  notePathForFolder(path: string): string;
}

export class VisualService {
  private readonly iconIds = new Set<string>(getIconIds());

  public constructor(
    private readonly app: App,
    private readonly nodes: VisualNodeService,
    private readonly inherits: () => boolean,
  ) {}

  public resolve(folder: TFolder): NodeVisual {
    let candidate: TFolder | null = folder;
    while (candidate !== null) {
      const note = this.nodes.getNote(this.nodes.notePathForFolder(candidate.path));
      const raw: unknown = note === null ? null : this.app.metadataCache.getFileCache(note)?.frontmatter?.[ICON_PROPERTY];
      const parsed = firstValidVisual(raw, {
        iconIds: this.iconIds,
        isColor: (value) => CSS.supports("color", value),
      });
      if (parsed !== null) {
        const value = parsed.kind === "image" ? this.resolveImage(parsed.value, note?.path ?? "") : parsed.value;
        if (value !== null) return { ...parsed, value, inheritedFrom: candidate === folder ? null : candidate.path };
      }
      if (!this.inherits()) break;
      candidate = candidate.parent;
    }
    return fallbackVisual();
  }

  public async set(folder: TFolder, value: string): Promise<void> {
    const note = this.nodes.getNote(this.nodes.notePathForFolder(folder.path));
    if (note === null) throw new Error(`Missing node note: ${folder.path}`);
    await this.app.fileManager.processFrontMatter(note, (frontmatter: Record<string, unknown>) => {
      if (value.trim() === "") delete frontmatter[ICON_PROPERTY];
      else frontmatter[ICON_PROPERTY] = value.trim();
    });
  }

  private resolveImage(linkPath: string, sourcePath: string): string | null {
    const file = this.app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
    return file === null ? null : this.app.vault.getResourcePath(file);
  }
}
