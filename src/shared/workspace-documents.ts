export function workspaceDocumentWindow(document: Document): Document["defaultView"] {
  const view = document.defaultView;
  return view?.closed ? null : view;
}

export function liveWorkspaceDocuments(documents: Iterable<Document>): Set<Document> {
  return new Set(Array.from(documents).filter((document) => workspaceDocumentWindow(document) !== null));
}
