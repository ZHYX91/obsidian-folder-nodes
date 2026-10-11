import { EXPLORER_HOST } from "./explorer-host";

/** Keep a disclosure click reachable when collapsing the end of a long tree. */
export function installExplorerDisclosureAnchor(root: HTMLElement): () => void {
  const owner = root.ownerDocument.defaultView;
  const abort = new (owner?.AbortController ?? AbortController)();
  let retained: { content: HTMLElement; scroll: HTMLElement; value: string; priority: string; minimum: number } | null = null;

  const restore = () => {
    if (retained === null) return;
    retained.content.style.setProperty("min-height", retained.value, retained.priority);
    retained = null;
  };
  const retain = () => {
    if (retained === null) return;
    const { content, scroll } = retained;
    if (scroll.scrollTop <= 0 || !content.isConnected) { restore(); return; }
    const styles = owner?.getComputedStyle(scroll);
    const padding = Number.parseFloat(styles?.paddingBottom ?? "0");
    const contentOffset = content.getBoundingClientRect().top - scroll.getBoundingClientRect().top - scroll.clientTop + scroll.scrollTop;
    // A floor on the existing tree preserves native animation and cannot add height
    // before collapse. Lower it as the user scrolls up, without changing scrollTop.
    const minimum = Math.min(retained.minimum, Math.max(0, scroll.scrollTop + scroll.clientHeight - contentOffset - (Number.isFinite(padding) ? padding : 0)));
    retained.minimum = minimum;
    content.style.setProperty("min-height", `${minimum}px`);
  };
  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof (owner?.Element ?? Element))) return;
    const control = target.closest(EXPLORER_HOST.collapseControl);
    const title = control?.closest<HTMLElement>(EXPLORER_HOST.folderTitle);
    const scroll = title?.closest<HTMLElement>(EXPLORER_HOST.filesContainer);
    const content = scroll?.querySelector<HTMLElement>(":scope > .nav-folder.mod-root");
    if (!title || !scroll || !content || scroll.scrollTop <= 0 || control?.closest(".folder-nodes-leaf-indicator")) return;
    if (retained?.content !== content) {
      restore();
      retained = { content, scroll, value: content.style.getPropertyValue("min-height"), priority: content.style.getPropertyPriority("min-height"), minimum: Infinity };
    }
    retained.minimum = Infinity;
    retain();
  }, { capture: true, signal: abort.signal });
  root.addEventListener("scroll", retain, { capture: true, passive: true, signal: abort.signal });
  return () => { abort.abort(); restore(); };
}
