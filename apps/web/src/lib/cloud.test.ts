import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNotebook } from "@notylo/document-model";
import { getDatabase, NotebookRepository } from "@notylo/persistence";
import { ApiError, cloudApi } from "./api";
import type * as ApiModule from "./api";
import { pullCloudDocument, uploadDocument } from "./cloud";

vi.mock("./api", async () => {
  const actual = await vi.importActual<ApiModule>("./api");
  return {
    ...actual,
    cloudApi: {
      ...actual.cloudApi,
      create: vi.fn(),
      list: vi.fn(),
      load: vi.fn(),
      save: vi.fn(),
      deleteNotebook: vi.fn(),
      uploadAsset: vi.fn(),
      downloadAsset: vi.fn()
    }
  };
});

const repository = new NotebookRepository();
const mockedCloudApi = vi.mocked(cloudApi);
const accountId = "account-1";

describe("cloud synchronization", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await getDatabase().delete();
    await getDatabase().open();
  });

  it("keeps the local copy when the server reports a remote deletion", async () => {
    const document = createNotebook({ title: "Deleted elsewhere", mode: "book" });
    await repository.save(document);
    mockedCloudApi.save.mockRejectedValue(
      new ApiError(410, "Ce cahier a été supprimé dans le cloud.", { deletedAt: Date.now() })
    );

    await expect(uploadDocument("token", document, accountId)).rejects.toMatchObject({ status: 410 });

    expect(await repository.load(document.notebook.id)).toBeDefined();
  });

  it("uses the last confirmed server revision on every subsequent write", async () => {
    const document = createNotebook({ title: "Revision", mode: "book" });
    await repository.save(document);
    mockedCloudApi.save.mockResolvedValue({ document, revision: 1 });

    await uploadDocument("token", document, accountId);

    const changed = {
      ...document,
      notebook: { ...document.notebook, title: "Revision 2", updatedAt: document.notebook.updatedAt + 1 }
    };
    await repository.save(changed);
    mockedCloudApi.save.mockResolvedValue({ document: changed, revision: 2 });
    await uploadDocument("token", changed, accountId);

    expect(mockedCloudApi.save).toHaveBeenLastCalledWith(
      "token",
      document.notebook.id,
      changed,
      1,
      false
    );
  });

  it("adopts a newer remote revision when this device has no local edit", async () => {
    const document = createNotebook({ title: "Shared", mode: "book" });
    await repository.save(document);
    mockedCloudApi.save.mockResolvedValue({ document, revision: 1 });
    await uploadDocument("token", document, accountId);

    const remote = {
      ...document,
      notebook: { ...document.notebook, title: "Changed on device B", updatedAt: document.notebook.updatedAt + 1 }
    };
    mockedCloudApi.load.mockResolvedValue({ document: remote, revision: 2 });

    const result = await pullCloudDocument("token", accountId, document);

    expect(result).toEqual({ kind: "updated", document: remote });
    expect((await repository.load(document.notebook.id))?.notebook.title).toBe("Changed on device B");
  });
});
