export const HOME_FOLDERS_STORAGE_KEY = "notylo:home-folders:v1";

export interface HomeFolder {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
}

export interface HomeFolderState {
  readonly version: 1;
  readonly folders: readonly HomeFolder[];
  readonly notebookFolders: Readonly<Record<string, string>>;
}

export const EMPTY_HOME_FOLDER_STATE: HomeFolderState = {
  version: 1,
  folders: [],
  notebookFolders: {}
};

type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "setItem">;

export function loadHomeFolders(storage: ReadStorage | undefined = browserStorage()): HomeFolderState {
  if (!storage) return EMPTY_HOME_FOLDER_STATE;
  try {
    const value = storage.getItem(HOME_FOLDERS_STORAGE_KEY);
    return value ? sanitizeHomeFolderState(JSON.parse(value)) : EMPTY_HOME_FOLDER_STATE;
  } catch {
    return EMPTY_HOME_FOLDER_STATE;
  }
}

export function saveHomeFolders(
  state: HomeFolderState,
  storage: WriteStorage | undefined = browserStorage()
): void {
  if (!storage) return;
  try {
    storage.setItem(HOME_FOLDERS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Folder organization is an enhancement. A blocked or full localStorage
    // must never prevent users from opening and editing their notebooks.
  }
}

export function createHomeFolder(
  state: HomeFolderState,
  folder: HomeFolder
): HomeFolderState {
  const name = normalizeFolderName(folder.name);
  if (!name || state.folders.some((candidate) => candidate.id === folder.id)) return state;
  return {
    ...state,
    folders: [...state.folders, { ...folder, name }]
  };
}

export function renameHomeFolder(
  state: HomeFolderState,
  folderId: string,
  name: string
): HomeFolderState {
  const normalizedName = normalizeFolderName(name);
  if (!normalizedName) return state;
  let changed = false;
  const folders = state.folders.map((folder) => {
    if (folder.id !== folderId || folder.name === normalizedName) return folder;
    changed = true;
    return { ...folder, name: normalizedName };
  });
  return changed ? { ...state, folders } : state;
}

export function deleteHomeFolder(state: HomeFolderState, folderId: string): HomeFolderState {
  if (!state.folders.some((folder) => folder.id === folderId)) return state;
  return {
    ...state,
    folders: state.folders.filter((folder) => folder.id !== folderId),
    notebookFolders: Object.fromEntries(
      Object.entries(state.notebookFolders).filter(([, candidateFolderId]) => candidateFolderId !== folderId)
    )
  };
}

export function moveNotebookToFolder(
  state: HomeFolderState,
  notebookId: string,
  folderId: string | undefined
): HomeFolderState {
  const notebookFolders = { ...state.notebookFolders };
  if (!folderId) {
    if (!(notebookId in notebookFolders)) return state;
    delete notebookFolders[notebookId];
  } else {
    if (!state.folders.some((folder) => folder.id === folderId)) return state;
    if (notebookFolders[notebookId] === folderId) return state;
    notebookFolders[notebookId] = folderId;
  }
  return { ...state, notebookFolders };
}

export function removeNotebookFromFolders(
  state: HomeFolderState,
  notebookId: string
): HomeFolderState {
  return moveNotebookToFolder(state, notebookId, undefined);
}

export function sanitizeHomeFolderState(value: unknown): HomeFolderState {
  if (!isRecord(value) || !Array.isArray(value.folders) || !isRecord(value.notebookFolders)) {
    return EMPTY_HOME_FOLDER_STATE;
  }

  const seen = new Set<string>();
  const folders: HomeFolder[] = [];
  for (const candidate of value.folders.slice(0, 200)) {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || seen.has(candidate.id)) continue;
    const name = typeof candidate.name === "string" ? normalizeFolderName(candidate.name) : "";
    if (!candidate.id || candidate.id.length > 160 || !name) continue;
    seen.add(candidate.id);
    folders.push({
      id: candidate.id,
      name,
      createdAt:
        typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt)
          ? candidate.createdAt
          : 0
    });
  }

  const notebookFolders: Record<string, string> = {};
  for (const [notebookId, folderId] of Object.entries(value.notebookFolders).slice(0, 5_000)) {
    if (
      notebookId.length > 0 &&
      notebookId.length <= 200 &&
      typeof folderId === "string" &&
      seen.has(folderId)
    ) {
      notebookFolders[notebookId] = folderId;
    }
  }
  return { version: 1, folders, notebookFolders };
}

function normalizeFolderName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 80);
}

function browserStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
