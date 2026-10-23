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
        .then(() => new Notice(this.explorerTrace?.length && this.explorerTrace.every((item) => item.status === "complete")
          ? "Explorer frame observations saved; no verdict is assigned."
          : "Explorer evidence is incomplete or empty. Saved for diagnosis; do not claim a pass."))
        .catch((error) => new Notice(String(error))),
    });
    this.addCommand({
      id: "create-reveal-fixture",
      name: "Create deep Explorer reveal fixture (disposable Vault only)",
      callback: () => this.createRevealFixture().catch((error) => new Notice(String(error))),
    });
    this.addCommand({
      id: "create-disclosure-fixture",
      name: "Prepare long-list disclosure diagnosis (disposable Vault only)",
      callback: () => this.createRevealFixture(true).catch((error) => new Notice(String(error))),
    });
    this.addCommand({
      id: "create-viewport-fixture",
      name: "Create 501-node viewport fixture (disposable Vault only)",
      callback: () => this.createFixture().catch((error) => new Notice(String(error))),
    });
    this.addCommand({
      id: "prepare-merge-safety",
      name: "Prepare merge safety fixture (disposable Vault only)",
      callback: () => this.prepareMergeSafety().catch((error) => new Notice(String(error))),
    });
    for (const kind of ["editor", "unload"]) this.addCommand({
      id: `arm-merge-${kind}-race`,
      name: `Arm merge ${kind} race (disposable Vault only)`,
      callback: () => this.armMergeRace(kind),
    });
    this.addCommand({
      id: "save-merge-safety",
      name: "Save merge safety observations (disposable Vault only)",
      callback: () => this.saveMergeSafety().catch((error) => new Notice(String(error))),
    });
  }

  async prepareMergeSafety() {
    if (this.creating || this.app.vault.getAbstractFileByPath("MergeSafety")) {
      new Notice("MergeSafety already exists or is being created. Use a fresh disposable Vault.");
      return;
    }
    this.creating = true;
    try {
      await this.app.vault.createFolder("MergeSafety");
      await this.app.vault.create("MergeSafety/MergeSafety.md", "# Merge safety\n");
      for (const name of ["Inline", "Definition", "Nested", "Safe", "EditorRace", "UnloadRace"]) {
        const root = `MergeSafety/${name}`;
        for (const folder of [root, `${root}/Source`, `${root}/Source/Sub`, `${root}/Deep`, `${root}/Deep/Target`]) {
          await this.app.vault.createFolder(folder);
          const basename = folder.slice(folder.lastIndexOf("/") + 1);
          await this.app.vault.create(`${folder}/${basename}.md`, `# ${basename}\n`);
        }
        await this.app.vault.create(`${root}/Reference.md`, "Original reference.\n");
        await this.app.vault.create(`${root}/Deep/Reference.md`, "Different reference: must never replace the original target.\n");
        const body = name === "Inline" ? "[ref](../Reference.md)\n" : name === "Definition"
          ? "[ref]\n\n[ref]:\n  ../Reference.md\n" : "Source body. See [asset](asset.bin).\n";
        await this.app.vault.modify(this.app.vault.getAbstractFileByPath(`${root}/Source/Source.md`), body);
        await this.app.vault.create(`${root}/Source/asset.bin`, "attachment\n");
        await this.app.vault.create(`${root}/Source/Sub/Child.md`, name === "Nested" ? "[ref](../../Reference.md)\n" : "Child body.\n");
      }
      this.mergeRaces = [];
      new Notice("MergeSafety ready: Inline, Definition and Nested must refuse; Safe may merge; arm each race before its product action.");
    } finally { this.creating = false; }
  }

  armMergeRace(kind) {
    const root = `MergeSafety/${kind === "editor" ? "EditorRace" : "UnloadRace"}`;
    if (this.mergeRaceArmed || !this.app.vault.getAbstractFileByPath(`${root}/Source/Source.md`)) {
      new Notice("Prepare a fresh merge fixture and finish the previous race first.");
      return;
    }
    const vault = this.app.vault;
    const original = vault.read;
    const wrapper = async (file) => {
      const contents = await original.call(vault, file);
      if (file.path === `${root}/Deep/Target/Sub/Child.md`) {
        if (vault.read === wrapper) vault.read = original;
        this.mergeRaceArmed = false;
        const observation = { kind, path: file.path, at: new Date().toISOString(), triggered: true };
        this.mergeRaces.push(observation);
        if (kind === "editor") {
          const note = vault.getAbstractFileByPath(`${root}/Source/Source.md`);
          const sourceContents = await original.call(vault, note);
          const leaf = this.app.workspace.getLeaf(true);
          await leaf.openFile(note, { state: { mode: "source" } });
          leaf.view.editor.setValue(sourceContents + "\nUnsaved merge-race user edit.\n");
          observation.editorPath = leaf.view.file?.path;
        } else {
          await this.app.plugins.disablePlugin("folder-nodes");
          observation.pluginLoadedAfter = Boolean(this.app.plugins.plugins["folder-nodes"]);
        }
      }
      return contents;
    };
    vault.read = wrapper;
    this.mergeRaceArmed = true;
    this.register(() => { if (vault.read === wrapper) vault.read = original; });
    new Notice(`Merge ${kind} race armed. Use the product Merge node action on ${root}/Source.`);
  }

  async saveMergeSafety() {
    const files = [];
    for (const file of this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith("MergeSafety/"))) {
      files.push({ path: file.path, contents: await this.app.vault.read(file) });
    }
    await this.app.vault.adapter.write("_merge-safety-observations.json", JSON.stringify({
      at: new Date().toISOString(), pluginLoaded: Boolean(this.app.plugins.plugins["folder-nodes"]),
      races: this.mergeRaces ?? [], files,
    }, null, 2));
    new Notice("Merge observations saved; inspect actual files and UI before assigning a verdict.");
  }

  recordExplorerTrace() {
    if (this.explorerTrace) return;
    this.explorerTrace = [];
    const documents = new Set([document, ...this.app.workspace.getLeavesOfType("file-explorer").map((leaf) => leaf.view.containerEl.ownerDocument)]);
    for (const owner of documents) this.registerDomEvent(owner, "click", (event) => {
      const source = event.target?.closest?.(".view-header-breadcrumb, .nav-folder-title, .folder-nodes-explorer-root-visibility");
      if (!source) return;
      const path = source.matches(".nav-folder-title") ? source.dataset.path : null;
      const surface = source.closest('.workspace-leaf-content[data-type="file-explorer"]');
      const observation = { clicked: source.textContent, path, startedAt: new Date().toISOString(),
        targetSource: path === null ? "host-focus" : "clicked-row", status: "recording", frames: [] };
      this.explorerTrace.push(observation);
      const start = owner.defaultView.performance.now();
      const sample = () => {
        const elapsedMs = owner.defaultView.performance.now() - start;
        for (const leaf of this.app.workspace.getLeavesOfType("file-explorer")) {
          const view = leaf.view;
          if (view.containerEl.ownerDocument !== owner) continue;
          if (surface && view.containerEl !== surface && !view.containerEl.contains(surface)) continue;
          const scroll = view.containerEl.querySelector(".nav-files-container");
          const target = path === null ? view.tree?.focusedItem : null;
          const row = path === null ? target?.selfEl : Array.from(view.containerEl.querySelectorAll(".nav-folder-title[data-path]"))
            .find((element) => element.dataset.path === path);
          if (!scroll || !row) {
            observation.frames.push({ elapsedMs, path, missing: true });
            continue;
          }
          const rect = row.getBoundingClientRect();
          const viewport = scroll.getBoundingClientRect();
          const bottomSlack = Math.max(0, scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop);
          observation.frames.push({ elapsedMs, path: path ?? target.file?.path, top: rect.top, bottom: rect.bottom,
            viewportTop: viewport.top, viewportBottom: viewport.bottom, scrollTop: scroll.scrollTop,
            scrollHeight: scroll.scrollHeight, clientHeight: scroll.clientHeight, bottomSlack,
            awayFromLimits: scroll.clientHeight > 0 && scroll.scrollTop >= scroll.clientHeight && bottomSlack >= scroll.clientHeight,
            visible: rect.height > 0 && rect.bottom > viewport.top && rect.top < viewport.bottom,
            pluginEnabled: Boolean(this.app.plugins.plugins["folder-nodes"]) });
        }
        if (elapsedMs < 750) {
          frame = owner.defaultView.requestAnimationFrame(sample);
        } else {
          const valid = observation.frames.filter((item) => !item.missing && item.visible);
          observation.status = valid.length >= 3 && valid.length === observation.frames.length ? "complete" : "incomplete";
          observation.middleViewportEligible = path !== null && observation.status === "complete" && valid.every((item) => item.awayFromLimits);
          observation.topRange = valid.length ? Math.max(...valid.map((item) => item.top)) - Math.min(...valid.map((item) => item.top)) : null;
          observation.finalDelta = valid.length ? valid.at(-1).top - valid[0].top : null;
        }
      };
      let frame = null;
      this.register(() => { if (frame !== null) owner.defaultView.cancelAnimationFrame(frame); });
      // Capture the clicked row before the host click handler changes layout.
      sample();
    }, { capture: true });
    new Notice("Explorer frame observation enabled. Save observations after the product interactions.");
  }

  async createRevealFixture(disclosure = false) {
    const root = disclosure ? "Disclosure" : "Reveal";
    if (this.creating || this.app.vault.getAbstractFileByPath(root)) {
      new Notice(`${root} already exists or is being created. Use a fresh disposable Vault.`);
      return;
    }
    this.creating = true;
    try {
      const nodes = [root, ...Array.from({ length: 120 }, (_, index) => `${root}/Node ${String(index + 1).padStart(3, "0")}`),
        `${root}/Node 060/Level Two`, `${root}/Node 060/Level Two/Level Three`, `${root}/Node 060/Level Two/Level Three/Leaf`];
      if (disclosure) nodes.push(`${root}/Node 060/Wide`, ...Array.from({ length: 498 }, (_, index) =>
        `${root}/Node 060/Wide/Child ${String(index + 1).padStart(3, "0")}`));
      for (const folder of nodes) {
        await this.app.vault.createFolder(folder);
        const name = folder.slice(folder.lastIndexOf("/") + 1);
        const number = /^Node (\d+)$/u.exec(name)?.[1];
        const property = folder === root ? "order=manual" : number ? `rank=${(121 - Number(number)) * 1024}` : null;
        const yaml = property ? `---\nfolder-nodes:\n  - ${property}\n---\n` : "";
        await this.app.vault.create(`${folder}/${name}.md`, `${yaml}# ${name}\n\nExplorer reveal acceptance fixture.\n`);
      }
      if (disclosure) this.recordExplorerTrace();
      new Notice(disclosure
        ? "Disclosure fixture ready: 120 siblings and 498 children under Node 060/Wide. Scroll Node 060 to the middle before testing; save the trace afterward."
        : "Reveal ready: 120 reverse-ranked siblings and a five-level target path.");
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
