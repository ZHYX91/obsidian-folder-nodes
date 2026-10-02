export class DocumentEventRegistry {
  private readonly controllers = new Map<Document, AbortController>();

  public constructor(private readonly listener: (event: MouseEvent) => void) {}

  public add(document: Document): void {
    if (this.controllers.has(document)) return;
    const Abort = document.defaultView?.AbortController ?? AbortController;
    const controller = new Abort();
    document.addEventListener("click", this.listener, { capture: true, signal: controller.signal });
    document.addEventListener("auxclick", this.listener, { capture: true, signal: controller.signal });
    this.controllers.set(document, controller);
  }

  public reconcile(documents: Iterable<Document>): void {
    const live = new Set(documents);
    for (const document of live) this.add(document);
    for (const [document, controller] of [...this.controllers]) {
      if (live.has(document)) continue;
      controller.abort();
      this.controllers.delete(document);
    }
  }

  public clear(): void {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
  }
}
