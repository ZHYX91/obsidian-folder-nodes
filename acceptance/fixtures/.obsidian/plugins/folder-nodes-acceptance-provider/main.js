const { Notice, Plugin } = require("obsidian");

module.exports = class FolderNodesAcceptanceProvider extends Plugin {
  onload() {
    this.addCommand({
      id: "record-explorer-trace",
      name: "Record Explorer navigation frames (disposable Vault only)",
      callback: () => this.recordExplorerTrace(),
    });
    this.addCommand({
      id: "save-explorer-trace",
      name: "Save Explorer navigation frames (disposable Vault only)",
      callback: () => this.app.vault.adapter.write("_explorer-reveal-trace.json", JSON.stringify(this.explorerTrace ?? [], null, 2))
        .then(() => new Notice("Explorer frame observations saved; no verdict is assigned."))
        .catch((error) => new Notice(String(error))),
    });
    this.addCommand({
      id: "create-reveal-fixture",
      name: "Create deep Explorer reveal fixture (disposable Vault only)",
      callback: () => this.createRevealFixture().catch((error) => new Notice(String(error))),
    });
    this.addCommand({
      id: "create-viewport-fixture",
      name: "Create 501-node viewport fixture (disposable Vault only)",
      callback: () => this.createFixture().catch((error) => new Notice(String(error))),
    });
  }

  recordExplorerTrace() {
    if (this.explorerTrace) return;
    this.explorerTrace = [];
    const documents = new Set([document, ...this.app.workspace.getLeavesOfType("file-explorer").map((leaf) => leaf.view.containerEl.ownerDocument)]);
    for (const owner of documents) this.registerDomEvent(owner, "click", (event) => {
      const source = event.target?.closest?.(".view-header-breadcrumb, .nav-folder-title, .folder-nodes-explorer-root-visibility");
      if (!source) return;
      const observation = { clicked: source.textContent, startedAt: new Date().toISOString(), frames: [] };
      this.explorerTrace.push(observation);
      const start = owner.defaultView.performance.now();
      const sample = () => {
        const elapsedMs = owner.defaultView.performance.now() - start;
        for (const leaf of this.app.workspace.getLeavesOfType("file-explorer")) {
          const view = leaf.view;
          if (view.containerEl.ownerDocument !== owner) continue;
          const scroll = view.containerEl.querySelector(".nav-files-container");
          const target = view.tree?.focusedItem;
          const row = target?.selfEl;
          if (!scroll || !row) continue;
          const rect = row.getBoundingClientRect();
          const viewport = scroll.getBoundingClientRect();
          observation.frames.push({ elapsedMs, path: target.file?.path, top: rect.top, bottom: rect.bottom,
            viewportTop: viewport.top, viewportBottom: viewport.bottom, scrollTop: scroll.scrollTop,
            visible: rect.height > 0 && rect.bottom > viewport.top && rect.top < viewport.bottom,
            pluginEnabled: Boolean(this.app.plugins.plugins["folder-nodes"]) });
        }
        if (elapsedMs < 550) owner.defaultView.requestAnimationFrame(sample);
      };
      owner.defaultView.requestAnimationFrame(sample);
    }, { capture: true });
    new Notice("Explorer frame observation enabled. Save observations after the product interactions.");
  }

  async createRevealFixture() {
    if (this.creating || this.app.vault.getAbstractFileByPath("Reveal")) {
      new Notice("Reveal already exists or is being created. Use a fresh disposable Vault.");
      return;
    }
    this.creating = true;
    try {
      const nodes = ["Reveal", ...Array.from({ length: 120 }, (_, index) => `Reveal/Node ${String(index + 1).padStart(3, "0")}`),
        "Reveal/Node 060/Level Two", "Reveal/Node 060/Level Two/Level Three", "Reveal/Node 060/Level Two/Level Three/Leaf"];
      for (const folder of nodes) {
        await this.app.vault.createFolder(folder);
        const name = folder.slice(folder.lastIndexOf("/") + 1);
        const number = /^Node (\d+)$/u.exec(name)?.[1];
        const property = folder === "Reveal" ? "order=manual" : number ? `rank=${(121 - Number(number)) * 1024}` : null;
        const yaml = property ? `---\nfolder-nodes:\n  - ${property}\n---\n` : "";
        await this.app.vault.create(`${folder}/${name}.md`, `${yaml}# ${name}\n\nExplorer reveal acceptance fixture.\n`);
      }
      new Notice("Reveal ready: 120 reverse-ranked siblings and a five-level target path.");
    } finally {
      this.creating = false;
    }
  }

  async createFixture() {
    if (this.creating || this.app.vault.getAbstractFileByPath("Viewport")) {
      new Notice("Viewport already exists or is being created. Use a fresh disposable Vault.");
      return;
    }
    this.creating = true;
    try {
      const nodes = ["Viewport", "Viewport/Wide", "Viewport/Spare",
        ...Array.from({ length: 498 }, (_, index) => `Viewport/Wide/Node ${String(index + 1).padStart(3, "0")}`)];
      for (const folder of nodes) {
        await this.app.vault.createFolder(folder);
        const name = folder.slice(folder.lastIndexOf("/") + 1);
        await this.app.vault.create(`${folder}/${name}.md`, `# ${name}\n\nViewport acceptance fixture.\n`);
      }
      new Notice("Viewport ready: 3 nodes with Wide collapsed, 501 with Wide expanded.");
    } finally {
      this.creating = false;
    }
  }
};
