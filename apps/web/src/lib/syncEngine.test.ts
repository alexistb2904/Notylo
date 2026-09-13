import type { NotebookDocument } from "@notylo/document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cloud = vi.hoisted(() => ({
  uploadDocument: vi.fn(),
  pullCloudDocument: vi.fn(),
  resolveConflict: vi.fn(),
  syncConflictFromError: vi.fn()
}));

vi.mock("./cloud", () => cloud);

import { createCloudSyncEngine, type SyncConflict } from "./syncEngine";

const document = { notebook: { id: "notebook-1" } } as unknown as NotebookDocument;
const conflict = { kind: "deleted", title: "Notebook", local: document } as unknown as SyncConflict;

describe("createCloudSyncEngine", () => {
  beforeEach(() => vi.clearAllMocks());

  it("binds authentication context once for push and pull", async () => {
    const engine = createCloudSyncEngine("access-token", "user-1");

    await engine.push(document);
    await engine.pull(document);

    expect(cloud.uploadDocument).toHaveBeenCalledWith("access-token", document, "user-1");
    expect(cloud.pullCloudDocument).toHaveBeenCalledWith("access-token", "user-1", document);
  });

  it("delegates conflict detection and resolution without changing semantics", async () => {
    const engine = createCloudSyncEngine("access-token", "user-1");
    const error = new Error("conflict");

    engine.conflictFromError(error, document);
    await engine.resolveConflict(conflict, "cloud");

    expect(cloud.syncConflictFromError).toHaveBeenCalledWith(error, document);
    expect(cloud.resolveConflict).toHaveBeenCalledWith("access-token", conflict, "cloud", "user-1");
  });
});
