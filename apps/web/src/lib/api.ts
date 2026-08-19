const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 15_000;

export type Account = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
};
export type Passkey = {
  readonly id: string;
  readonly label: string;
  readonly deviceType: string;
  readonly backedUp: boolean;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
};
export type AuthResponse = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: Account;
};
export type CloudDocumentResponse = {
  readonly document: unknown;
  readonly revision: number;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly payload?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  const abortFromCaller = () => controller.abort();
  if (init.signal) {
    if (init.signal.aborted) controller.abort();
    else init.signal.addEventListener("abort", abortFromCaller, { once: true });
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal
    });
  } catch {
    throw new ApiError(
      0,
      "Le service cloud est indisponible. Vos cahiers locaux restent accessibles."
    );
  } finally {
    window.clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }

  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok)
    throw new ApiError(
      response.status,
      payload.error ?? "Une erreur est survenue.",
      payload
    );
  return payload;
}

async function requestBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  if (init.signal) {
    if (init.signal.aborted) controller.abort();
    else init.signal.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(
        response.status,
        payload.error ?? "Impossible de récupérer une pièce jointe cloud.",
        payload
      );
    }
    return await response.blob();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      0,
      "Le stockage cloud est indisponible. La copie locale reste accessible."
    );
  } finally {
    window.clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export const api = {
  health: () =>
    request<{
      status: "ok" | "degraded";
      service: string;
      database: "ready" | "unavailable";
      now: string;
    }>("/health"),
  authConfig: () => request<{ registrationEnabled: boolean }>("/auth/config"),
  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    }),
  register: (email: string, password: string) =>
    request<AuthResponse>("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    }),
  refresh: (refreshToken: string) =>
    request<AuthResponse>("/auth/refresh", { method: "POST", headers: bearer(refreshToken) }),
  me: (accessToken: string) =>
    request<{ user: Account }>("/auth/me", { headers: bearer(accessToken) }),
  updateProfile: (accessToken: string, displayName: string) =>
    request<{ user: Account }>("/auth/me", {
      method: "PUT",
      headers: { ...bearer(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ displayName })
    }),
  changePassword: (accessToken: string, currentPassword: string, newPassword: string) =>
    request<void>("/auth/me/password", {
      method: "PUT",
      headers: { ...bearer(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword })
    }),
  passkeyLoginOptions: (email: string) =>
    request<Record<string, unknown>>("/auth/passkeys/login/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    }),
  passkeyLoginVerify: (email: string, response: unknown) =>
    request<AuthResponse>("/auth/passkeys/login/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, response })
    }),
  passkeyRegistrationOptions: (accessToken: string, name: string) =>
    request<Record<string, unknown>>("/auth/passkeys/registration/options", {
      method: "POST",
      headers: { ...bearer(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    }),
  passkeyRegistrationVerify: (accessToken: string, response: unknown) =>
    request<void>("/auth/passkeys/registration/verify", {
      method: "POST",
      headers: { ...bearer(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ response })
    }),
  passkeys: (accessToken: string) =>
    request<{ passkeys: readonly Passkey[] }>("/auth/passkeys", {
      headers: bearer(accessToken)
    }),
  renamePasskey: (accessToken: string, id: string, name: string) =>
    request<void>(`/auth/passkeys/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { ...bearer(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    }),
  deletePasskey: (accessToken: string, id: string) =>
    request<void>(`/auth/passkeys/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: bearer(accessToken)
    }),
  deleteAccount: (accessToken: string, password: string, confirmation: string) =>
    request<void>("/auth/account/delete", {
      method: "POST",
      headers: { ...bearer(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ password, confirmation })
    })
};

export const cloudApi = {
  create: (token: string, document: unknown) =>
    request<CloudDocumentResponse>("/cloud/notebooks", {
      method: "POST",
      headers: { ...bearer(token), "Content-Type": "application/json" },
      body: JSON.stringify({ document })
    }),
  list: (token: string) =>
    request<{
      notebooks: readonly {
        id: string;
        title: string;
        mode: "book" | "whiteboard";
        updatedAt: number;
        revision: number;
      }[];
      deletedNotebooks?: readonly { id: string; deletedAt: number }[];
    }>("/cloud/notebooks", { headers: bearer(token) }),
  load: (token: string, id: string) =>
    request<CloudDocumentResponse>(`/cloud/notebooks/${encodeURIComponent(id)}`, {
      headers: bearer(token)
    }),
  save: (
    token: string,
    id: string,
    document: unknown,
    baseRevision: number,
    force = false
  ) =>
    request<CloudDocumentResponse>(`/cloud/notebooks/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { ...bearer(token), "Content-Type": "application/json" },
      body: JSON.stringify({ document, baseRevision, force })
    }),
  deleteNotebook: (
    token: string,
    id: string,
    deletedAt: number,
    baseRevision: number,
    force = false
  ) =>
    request<void>(`/cloud/notebooks/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { ...bearer(token), "Content-Type": "application/json" },
      body: JSON.stringify({ deletedAt, baseRevision, force })
    }),
  uploadAsset: (token: string, notebookId: string, assetId: string, blob: Blob) =>
    request<void>(
      `/cloud/notebooks/${encodeURIComponent(notebookId)}/assets/${encodeURIComponent(assetId)}`,
      {
        method: "PUT",
        headers: { ...bearer(token), "Content-Type": "application/octet-stream" },
        body: blob
      },
      120_000
    ),
  downloadAsset: (token: string, notebookId: string, assetId: string) =>
    requestBlob(
      `/cloud/notebooks/${encodeURIComponent(notebookId)}/assets/${encodeURIComponent(assetId)}`,
      { headers: bearer(token) }
    )
};

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
