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
    this.addCommand({
      id: "prepare-ownership-safety",
      name: "Prepare merge and content ownership fixture (disposable Vault only)",
      callback: () => this.prepareOwnershipSafety().catch((error) => new Notice(String(error))),
    });
    for (const kind of ["source", "target"]) this.addCommand({
      id: `arm-content-${kind}-replacement`,
      name: `Arm content ${kind} replacement on next drag (disposable Vault only)`,
      callback: () => this.armContentReplacement(kind),
    });
    this.addCommand({
      id: "save-ownership-safety",
      name: "Save merge and content ownership observations (disposable Vault only)",
      callback: () => this.saveOwnershipSafety().catch((error) => new Notice(String(error))),
    });
  }

  async prepareOwnershipSafety() {
    if (this.creating || this.app.vault.getAbstractFileByPath("OwnershipSafety")) {
      new Notice("OwnershipSafety already exists or is being created. Use a fresh disposable Vault.");
      return;
    }
    this.creating = true;
    const createNode = async (path, body = "", tokens = []) => {
      await this.app.vault.createFolder(path);
      const name = path.slice(path.lastIndexOf("/") + 1);
      await this.app.vault.create(`${path}/${name}.md`, (tokens.length ? `---\nfolder-nodes: ${JSON.stringify(tokens)}\n---\n` : "") + body);
    };
    try {
      await createNode("OwnershipSafety", "# Merge and content ownership\n");
      for (const name of ["WikiBody", "WikiText", "WikiList", "WikiChild", "WikiUnresolved", "WikiMoving", "WikiCompetitor", "WikiSafe"]) {
        const root = `OwnershipSafety/${name}`;
        await createNode(root);
        await createNode(`${root}/Source`);
        await createNode(`${root}/Deep`);
        await createNode(`${root}/Deep/Target`, "Target body.\n");
        await this.app.vault.create(`${root}/Reference.md`, "# Heading\nOriginal reference. ^block\n");
        await this.app.vault.create(`${root}/Deep/Reference.md`, "# Heading\nDifferent new-context reference. ^block\n");
        const link = name === "WikiSafe" ? `[[${root}/Reference#Heading|Alias]]` : name === "WikiUnresolved" ? "[[Missing]]" : name === "WikiMoving" ? `[[${root}/Source/Moving]]` : "[[Reference#Heading|Alias]]";
        const source = name === "WikiText" ? `---\nrelated: ${JSON.stringify(link)}\n---\n` : name === "WikiList" ? `---\nrelated: ${JSON.stringify([link])}\n---\n` : name === "WikiChild" ? "Source body.\n" : `${link}\n`;
        await this.app.vault.modify(this.app.vault.getAbstractFileByPath(`${root}/Source/Source.md`), source);
        if (name === "WikiChild") await this.app.vault.create(`${root}/Source/child.md`, `${link}\n`);
        if (name === "WikiMoving") await this.app.vault.create(`${root}/Source/Moving.md`, "Moving target.\n");
        if (name === "WikiCompetitor") await this.app.vault.create(`${root}/Source/Reference.md`, "Potential future best match.\n");
      }
      await createNode("OwnershipSafety/Ranks");
      await createNode("OwnershipSafety/Ranks/Source", "Source body.\n", ["order=manual"]);
      await createNode("OwnershipSafety/Ranks/Source/First", "First body.\n", ["rank=4096"]);
      await createNode("OwnershipSafety/Ranks/Source/Second", "Second body.\n", ["rank=8192"]);
      await createNode("OwnershipSafety/Ranks/Target", "Target body.\n", ["order=manual"]);
      await createNode("OwnershipSafety/Ranks/Target/Existing", "Existing body.\n", ["rank=1024"]);
      await createNode("OwnershipSafety/Ranks/Prior", "Prior placement body.\n", ["rank=1"]);
      await createNode("OwnershipSafety/Drag");
      await createNode("OwnershipSafety/Drag/Target");
      await this.app.vault.create("OwnershipSafety/Drag/document.txt", "Original drag file.\n");
      await this.app.vault.create("OwnershipSafety/Drag/clip.mp4", "Placeholder for an Album tile; never play this file.\n");
      this.ownershipObservations = [];
      new Notice("OwnershipSafety ready. Record original/new host resolutions, use product actions, then inspect actual bytes and order. Preparation assigns no verdict.");
    } finally { this.creating = false; }
  }

  armContentReplacement(kind) {
    if (this.contentReplacementArmed || !this.app.vault.getAbstractFileByPath("OwnershipSafety/Drag/Target")) {
      new Notice("Prepare a fresh ownership fixture and finish the previous race first.");
      return;
    }
    const owners = new Set([document, ...this.app.workspace.getLeavesOfType("folder-nodes-contents").map((leaf) => leaf.view.containerEl.ownerDocument)]);
    const cleanup = () => { for (const owner of owners) owner.removeEventListener("dragstart", handler); this.contentReplacementArmed = false; };
    const handler = (event) => {
      const key = event.target?.closest?.("[data-folder-nodes-focus-key]")?.dataset.folderNodesFocusKey;
      const path = key === "file:OwnershipSafety/Drag/document.txt" ? "OwnershipSafety/Drag/document.txt"
        : key === "media:OwnershipSafety/Drag/clip.mp4" ? "OwnershipSafety/Drag/clip.mp4" : null;
      if (path === null) return;
      cleanup();
      const observation = { kind, path, startedAt: new Date().toISOString(), status: "pending" };
      (this.ownershipObservations ??= []).push(observation);
      void (async () => {
        // The document bubble listener runs after the product's source handler.
        await Promise.resolve();
        const originalPath = kind === "source" ? path : "OwnershipSafety/Drag/Target";
        const original = this.app.vault.getAbstractFileByPath(originalPath);
        const movedPath = kind === "source" ? `${path}.original` : "OwnershipSafety/Drag/Target-original";
        if (!original || this.app.vault.getAbstractFileByPath(movedPath)) throw new Error("Fixture identity changed; use a fresh Vault");
        await this.app.fileManager.renameFile(original, movedPath);
        if (kind === "source") await this.app.vault.create(path, "Replacement: must not be moved by the old drag.\n");
        else {
          await this.app.vault.createFolder(originalPath);
          await this.app.vault.create(`${originalPath}/Target.md`, "Replacement target: must not receive the old drag.\n");
        }
        Object.assign(observation, { status: "replaced", originalPath, movedPath, originalObjectPreserved: this.app.vault.getAbstractFileByPath(movedPath) === original });
        new Notice(`Content ${kind} replacement complete. Drop on the original target; stale drag must refuse or cancel. Inspect files before assigning a verdict.`);
      })().catch((error) => { observation.status = "failed"; observation.error = String(error); new Notice(String(error)); });
    };
    for (const owner of owners) owner.addEventListener("dragstart", handler);
    this.contentReplacementArmed = true;
    this.register(cleanup);
    new Notice(`Content ${kind} replacement armed for document.txt or clip.mp4 in OwnershipSafety/Drag.`);
  }

  async saveOwnershipSafety() {
    const files = [];
    for (const file of this.app.vault.getFiles().filter((file) => file.path.startsWith("OwnershipSafety/"))) {
      files.push({ path: file.path, contents: await this.app.vault.read(file) });
    }
    await this.app.vault.adapter.write("_ownership-safety-observations.json", JSON.stringify({ at: new Date().toISOString(), races: this.ownershipObservations ?? [], files }, null, 2));
    new Notice("Ownership observations saved; no verdict is assigned.");
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
      const menu = event.target?.closest?.(".menu-item, .folder-nodes-actions-modal .folder-nodes-action");
      if (menu?.matches(':disabled, [aria-disabled="true"], .is-disabled')) return;
      const explicitReveal = menu && /Reveal in File Explorer|在文件列表中显示/u.test(menu.textContent ?? "");
      const source = explicitReveal ? menu : event.target?.closest?.(".view-header-breadcrumb, .nav-folder-title, .folder-nodes-explorer-root-visibility");
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
          const folderPath = target?.file?.parent?.path;
          const canonicalRow = path === null && folderPath && target?.file?.basename === target?.file?.parent?.name
            ? Array.from(view.containerEl.querySelectorAll(".nav-folder-title[data-path]"))
              .find((element) => element.dataset.path === folderPath) : null;
          const row = path === null ? canonicalRow ?? target?.selfEl : Array.from(view.containerEl.querySelectorAll(".nav-folder-title[data-path]"))
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
            canonicalFolder: canonicalRow ? folderPath : null,
            toolbars: Array.from(view.containerEl.querySelectorAll(".nav-buttons-container")).map((element) => {
              const bounds = element.getBoundingClientRect();
              return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right,
                position: owner.defaultView.getComputedStyle(element).position };
            }),
            visualViewport: owner.defaultView.visualViewport ? {
              top: owner.defaultView.visualViewport.offsetTop, height: owner.defaultView.visualViewport.height,
            } : null,
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
