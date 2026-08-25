import { App, getIconIds, TFile, TFolder } from "obsidian";

import type { NodeVisual } from "../core/types";
import { editableVisualCandidates, fallbackVisual, parseVisualDeclaration, resolveVisualDeclaration } from "../core/visual";
import { ICON_PROPERTY } from "../core/properties";

interface VisualNodeService {
  getCanonicalFile(folderPath: string): TFile | null;
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
      const note = this.nodes.getCanonicalFile(candidate.path);
      const raw: unknown = note === null ? null : this.app.metadataCache.getFileCache(note)?.frontmatter?.[ICON_PROPERTY];
      const parsed = resolveVisualDeclaration(raw, {
        iconIds: this.iconIds,
        isColor: (value) => CSS.supports("color", value),
        resolveImage: (linkPath) => this.resolveImage(linkPath, note?.path ?? ""),
      });
      if (parsed !== null) {
        return { ...parsed, inheritedFrom: candidate === folder ? null : candidate.path };
      }
      if (!this.inherits()) break;
      candidate = candidate.parent;
    }
    return fallbackVisual();
  }

  public candidates(folder: TFolder): string[] {
    const note = this.nodes.getCanonicalFile(folder.path);
    if (note === null) throw new Error(`Missing node note: ${folder.path}`);
    const raw: unknown = this.app.metadataCache.getFileCache(note)?.frontmatter?.[ICON_PROPERTY];
    const candidates = editableVisualCandidates(raw);
    if (candidates === null) throw new Error(`Unsupported icon property shape: ${note.path}`);
    return candidates;
  }

  public preview(folder: TFolder, values: readonly string[]): NodeVisual {
    const note = this.nodes.getCanonicalFile(folder.path);
    const parsed = resolveVisualDeclaration(values, {
      iconIds: this.iconIds,
      isColor: (value) => CSS.supports("color", value),
      resolveImage: (linkPath) => this.resolveImage(linkPath, note?.path ?? ""),
    });
    if (parsed !== null) return { ...parsed, inheritedFrom: null };
    if (!this.inherits()) return fallbackVisual();

    let candidate = folder.parent;
    while (candidate !== null) {
      const ancestorNote = this.nodes.getCanonicalFile(candidate.path);
      const raw: unknown = ancestorNote === null ? null : this.app.metadataCache.getFileCache(ancestorNote)?.frontmatter?.[ICON_PROPERTY];
      const inherited = resolveVisualDeclaration(raw, {
        iconIds: this.iconIds,
        isColor: (value) => CSS.supports("color", value),
        resolveImage: (linkPath) => this.resolveImage(linkPath, ancestorNote?.path ?? ""),
      });
      if (inherited !== null) return { ...inherited, inheritedFrom: candidate.path };
      candidate = candidate.parent;
    }
    return fallbackVisual();
  }

  public diagnostics(values: readonly string[]): { extraColorCount: number; unknownCount: number } {
    const declaration = parseVisualDeclaration(values, {
      iconIds: this.iconIds,
      isColor: (value) => CSS.supports("color", value),
    });
    return { extraColorCount: declaration.extraColors.length, unknownCount: declaration.unknown.length };
  }

  public async set(folder: TFolder, values: readonly string[]): Promise<void> {
    const note = this.nodes.getCanonicalFile(folder.path);
    if (note === null) throw new Error(`Missing node note: ${folder.path}`);
    const candidates = values.map((value) => value.trim()).filter((value) => value !== "");
    const declaration = parseVisualDeclaration(candidates, {
      iconIds: this.iconIds,
      isColor: (value) => CSS.supports("color", value),
    });
    if (declaration.unknown.length > 0) throw new Error(`Unsupported icon value: ${declaration.unknown[0] ?? "unknown"}`);
    await this.app.fileManager.processFrontMatter(note, (frontmatter: Record<string, unknown>) => {
      if (candidates.length === 0) delete frontmatter[ICON_PROPERTY];
      else frontmatter[ICON_PROPERTY] = candidates.length === 1 ? candidates[0] : candidates;
    });
  }

  private resolveImage(linkPath: string, sourcePath: string): string | null {
    const file = this.app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
    return file === null ? null : this.app.vault.getResourcePath(file);
  }
}
