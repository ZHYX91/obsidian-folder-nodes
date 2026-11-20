import type { Workspace } from "obsidian";

export type OpenLinkArgs = Parameters<Workspace["openLinkText"]>;
type OpenLink = (...args: OpenLinkArgs) => Promise<void> | null;

/** Intercept only committed navigation, including Live Preview keyboard and modifier gestures. */
export function interceptLinkNavigation(workspace: Workspace, handle: OpenLink | null): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(workspace, "openLinkText");
  const original = workspace.openLinkText.bind(workspace);
  const wrapped: Workspace["openLinkText"] = (...args) => handle?.(...args) ?? original(...args);
  workspace.openLinkText = wrapped;
  return () => {
    handle = null;
    if (workspace.openLinkText !== wrapped) return;
    if (descriptor) Object.defineProperty(workspace, "openLinkText", descriptor);
    else Reflect.deleteProperty(workspace, "openLinkText");
  };
}

/** Optional public event. A claimed action owns cancellation, failure and navigation. */
export function claimPeriodicLink(workspace: Workspace, [linkText, sourcePath, newLeaf, viewState]: OpenLinkArgs): Promise<void> | null {
  let claimed: Promise<void> | null = null;
  workspace.trigger("chrono-notes:claim-missing-periodic-link-v1", {
    linkText, sourcePath, newLeaf, viewState,
    claim: (navigation: Promise<void>) => { claimed ??= navigation; },
  });
  return claimed;
}
