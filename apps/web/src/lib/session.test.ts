import "fake-indexeddb/auto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createNotebook, type NotebookDocument } from "@notylo/document-model";
import { getDatabase, NotebookRepository } from "@notylo/persistence";
import { useDocumentSession } from "./session";

type Session = ReturnType<typeof useDocumentSession>;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("document session persistence", () => {
  beforeEach(async () => {
    await getDatabase().delete();
    await getDatabase().open();
  });

  it("flushes a debounced edit when the editor unmounts", async () => {
    const repository = new NotebookRepository("session-unmount");
    const initial = createNotebook({ title: "Initial", mode: "book" });
    const mounted = mountSession(initial, repository);

    act(() => {
      mounted.session.replace((current) => withTitle(current, "Last edit"));
    });
    mounted.unmount();

    expect(await waitForTitle(repository, initial.notebook.id, "Last edit")).toBe(true);
  });

  it("cancels a stale pending save when a remote document is adopted", async () => {
    const repository = new NotebookRepository("session-adopt");
    const initial = createNotebook({ title: "Initial", mode: "book" });
    const mounted = mountSession(initial, repository);
    const remote = withTitle(initial, "Remote version", initial.notebook.updatedAt + 2);

    act(() => {
      mounted.session.replace((current) =>
        withTitle(current, "Stale local version", current.notebook.updatedAt + 1)
      );
      mounted.session.adopt(remote);
    });

    expect(await waitForTitle(repository, initial.notebook.id, "Remote version")).toBe(true);
    await delay(320);
    expect((await repository.load(initial.notebook.id))?.notebook.title).toBe("Remote version");
    mounted.unmount();
  });
});

function mountSession(initial: NotebookDocument, repository: NotebookRepository): {
  readonly session: Session;
  readonly unmount: () => void;
} {
  const container = document.createElement("div");
  const root: Root = createRoot(container);
  let session: Session | undefined;

  function Harness() {
    session = useDocumentSession(initial, repository);
    return null;
  }

  act(() => {
    root.render(createElement(Harness));
  });
  if (!session) throw new Error("Session test harness did not render.");

  return {
    get session() {
      if (!session) throw new Error("Session test harness is unavailable.");
      return session;
    },
    unmount: () => {
      act(() => root.unmount());
    }
  };
}

function withTitle(document: NotebookDocument, title: string, updatedAt = Date.now()): NotebookDocument {
  return {
    ...document,
    notebook: {
      ...document.notebook,
      title,
      updatedAt
    }
  };
}

async function waitForTitle(
  repository: NotebookRepository,
  notebookId: string,
  expected: string
): Promise<boolean> {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    if ((await repository.load(notebookId))?.notebook.title === expected) return true;
    await delay(10);
  }
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
