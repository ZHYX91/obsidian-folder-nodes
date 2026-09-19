export function placementFeedback(container: HTMLElement, message: string | null): void {
  let status = container.querySelector<HTMLElement>(":scope > .folder-nodes-placement-feedback");
  if (message === null) { status?.remove(); return; }
  if (status === null) status = container.createDiv({ cls: "folder-nodes-placement-feedback", attr: { role: "status", "aria-live": "polite" } });
  if (status.textContent !== message) status.textContent = message;
}
