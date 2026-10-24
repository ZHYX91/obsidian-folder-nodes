import type { TFile, TFolder } from "obsidian";
import { FolderNodesError } from "../core/folder-nodes-error";

export interface FileChangeReceipt {
  readonly after: string;
  readonly before: string;
  readonly file: TFile;
  readonly path: string;
}

interface CreatedNodeReceipt {
  readonly folder: TFolder;
  readonly folderPath: string;
  readonly notePath: string;
  readonly initialContent: string;
  readonly finalContent: string;
  readonly orderReceipts: readonly FileChangeReceipt[];
}

interface RecoveryPorts {
  assertFile(file: TFile, path: string): void;
  assertFolder(folder: TFolder, path: string): void;
  canonicalFile(path: string): TFile | null;
  currentEntry(path: string): unknown;
  readCurrentSource(file: TFile): Promise<string>;
  restoreFileChange(receipt: FileChangeReceipt): Promise<void>;
  trashFile(file: TFile, path: string, initialContent: string): Promise<void>;
  trashFolder(folder: TFolder, path: string): Promise<void>;
}

/** Creation receipts own only exact changes, never later user edits or replacement objects. */
export class CreatedNodeRecovery {
  private readonly receipts = new WeakMap<TFile, CreatedNodeReceipt>();

  public constructor(private readonly ports: RecoveryPorts) {}

  public set(note: TFile, receipt: CreatedNodeReceipt): void {
    this.receipts.set(note, receipt);
  }

  public async rollback(note: TFile): Promise<void> {
    const receipt = this.receipts.get(note);
    if (receipt === undefined) throw new Error("Cannot safely roll back a node without its creation receipt");
    const { folder, folderPath, notePath, initialContent, finalContent, orderReceipts } = receipt;
    const assertOwned = (): void => {
      this.ports.assertFolder(folder, folderPath);
      this.ports.assertFile(note, notePath);
      if (note.parent !== folder || this.ports.canonicalFile(folderPath) !== note
        || folder.children.length !== 1 || folder.children[0] !== note) {
        throw new Error(`Cannot safely roll back changed created folder: ${folderPath}`);
      }
    };
    try {
      assertOwned();
      if (await this.ports.readCurrentSource(note) !== finalContent) {
        throw new Error(`Cannot safely roll back concurrently modified created file: ${notePath}`);
      }
      for (const orderReceipt of [...orderReceipts].reverse()) {
        this.ports.assertFile(orderReceipt.file, orderReceipt.path);
        if (await this.ports.readCurrentSource(orderReceipt.file) !== orderReceipt.after) {
          throw new Error(`Cannot safely roll back concurrently modified file: ${orderReceipt.path}`);
        }
      }
      assertOwned();
      for (const orderReceipt of [...orderReceipts].reverse()) {
        await this.ports.restoreFileChange(orderReceipt);
      }
      assertOwned();
      await this.ports.trashFile(note, notePath, initialContent);
      await this.ports.trashFolder(folder, folderPath);
      this.receipts.delete(note);
    } catch (cause) {
      // Report only artifacts that still exist, including a creation moved by the user.
      const paths = [note, folder].filter((entry) => this.ports.currentEntry(entry.path) === entry)
        .map((entry) => entry.path);
      if (paths.length === 0) throw cause;
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new FolderNodesError("created_node_retained", { paths: paths.join(", ") },
        `Created artifacts retained at ${paths.join(", ")}: ${reason}`, { cause });
    }
  }
}
