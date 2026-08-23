import { describe, expect, it } from "vitest";
import {
  EMPTY_HOME_FOLDER_STATE,
  HOME_FOLDERS_STORAGE_KEY,
  createHomeFolder,
  deleteHomeFolder,
  loadHomeFolders,
  moveNotebookToFolder,
  renameHomeFolder,
  sanitizeHomeFolderState,
  saveHomeFolders
} from "./homeFolders";

describe("home folder organization", () => {
  it("creates, renames and deletes a folder without touching notebook data", () => {
    const created = createHomeFolder(EMPTY_HOME_FOLDER_STATE, {
      id: "folder-maths",
      name: "  Maths   S1  ",
      createdAt: 10
    });
    expect(created.folders[0]?.name).toBe("Maths S1");

    const assigned = moveNotebookToFolder(created, "notebook-1", "folder-maths");
    expect(assigned.notebookFolders).toEqual({ "notebook-1": "folder-maths" });

    const renamed = renameHomeFolder(assigned, "folder-maths", "Algèbre");
    expect(renamed.folders[0]?.name).toBe("Algèbre");

    const deleted = deleteHomeFolder(renamed, "folder-maths");
    expect(deleted).toEqual(EMPTY_HOME_FOLDER_STATE);
  });

  it("moves a notebook back to the library root", () => {
    const folderState = createHomeFolder(EMPTY_HOME_FOLDER_STATE, {
      id: "folder-1",
      name: "Cours",
      createdAt: 1
    });
    const assigned = moveNotebookToFolder(folderState, "notebook-1", "folder-1");
    expect(moveNotebookToFolder(assigned, "notebook-1", undefined).notebookFolders).toEqual({});
  });

  it("rejects corrupt folders and orphan assignments while loading", () => {
    expect(
      sanitizeHomeFolderState({
        version: 45,
        folders: [
          { id: "folder-1", name: "  Cours  ", createdAt: 2 },
          { id: "folder-1", name: "Duplicate", createdAt: 3 },
          { id: "", name: "Broken", createdAt: 4 }
        ],
        notebookFolders: {
          "notebook-1": "folder-1",
          "notebook-2": "missing-folder"
        }
      })
    ).toEqual({
      version: 1,
      folders: [{ id: "folder-1", name: "Cours", createdAt: 2 }],
      notebookFolders: { "notebook-1": "folder-1" }
    });
  });

  it("persists as a small independent localStorage document", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const state = createHomeFolder(EMPTY_HOME_FOLDER_STATE, {
      id: "folder-1",
      name: "Projets",
      createdAt: 5
    });

    saveHomeFolders(state, storage);

    expect(values.has(HOME_FOLDERS_STORAGE_KEY)).toBe(true);
    expect(loadHomeFolders(storage)).toEqual(state);
  });
});
