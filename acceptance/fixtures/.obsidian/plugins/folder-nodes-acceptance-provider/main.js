const { Notice, Plugin } = require("obsidian");

module.exports = class FolderNodesAcceptanceProvider extends Plugin {
  onload() {
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
