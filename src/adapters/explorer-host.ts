export const EXPLORER_HOST = Object.freeze({
  viewType: "file-explorer",
  filesContainer: ".nav-files-container",
  folderChildren: ".nav-folder-children",
  folderRow: ".nav-folder",
  folderTitle: ".nav-folder-title[data-path]",
  fileTitle: ".nav-file-title[data-path]",
  collapseControl: ".nav-folder-collapse-indicator, .tree-item-icon.collapse-icon",
  inlineTitle: ".inline-title",
});

export const EXPLORER_BRANCH_SCOPE_SELECTOR =
  `${EXPLORER_HOST.folderRow}, ${EXPLORER_HOST.filesContainer}`;

export const EXPLORER_FOLDER_CONTAINERS_SELECTOR =
  `${EXPLORER_HOST.filesContainer}, ${EXPLORER_HOST.folderChildren}`;

export const EXPLORER_DIRECT_FOLDER_TITLE_SELECTOR =
  `:scope > ${EXPLORER_HOST.folderTitle}`;

export const EXPLORER_ENTRY_TITLES_SELECTOR =
  `${EXPLORER_HOST.folderTitle}, ${EXPLORER_HOST.fileTitle}`;
