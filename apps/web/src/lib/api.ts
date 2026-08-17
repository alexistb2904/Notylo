const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

export type Account = { readonly id: string; readonly email: string; readonly displayName: string };
export type Passkey = { readonly id: string; readonly label: string; readonly deviceType: string; readonly backedUp: boolean; readonly createdAt: string; readonly lastUsedAt: string | null };
export type AuthResponse = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: Account;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...init.headers }
    });
  } catch {
    throw new ApiError(0, "Le service de comptes est indisponible. Vos cahiers locaux restent accessibles.");
  }
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new ApiError(response.status, payload.error ?? "Une erreur est survenue.");
  return payload;
}

export const api = {
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
  me: (accessToken: string) => request<{ user: Account }>("/auth/me", { headers: bearer(accessToken) }),
  updateProfile: (accessToken: string, displayName: string) => request<{ user: Account }>("/auth/me", { method: "PUT", headers: { ...bearer(accessToken), "Content-Type": "application/json" }, body: JSON.stringify({ displayName }) }),
  changePassword: (accessToken: string, currentPassword: string, newPassword: string) => request<void>("/auth/me/password", { method: "PUT", headers: { ...bearer(accessToken), "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) }),
  passkeyLoginOptions: (email: string) => request<Record<string, unknown>>("/auth/passkeys/login/options", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }),
  passkeyLoginVerify: (email: string, response: unknown) => request<AuthResponse>("/auth/passkeys/login/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, response }) }),
  passkeyRegistrationOptions: (accessToken: string, name: string) => request<Record<string, unknown>>("/auth/passkeys/registration/options", { method: "POST", headers: { ...bearer(accessToken), "Content-Type": "application/json" }, body: JSON.stringify({ name }) }),
  passkeyRegistrationVerify: (accessToken: string, response: unknown) => request<void>("/auth/passkeys/registration/verify", { method: "POST", headers: { ...bearer(accessToken), "Content-Type": "application/json" }, body: JSON.stringify({ response }) }),
  passkeys: (accessToken: string) => request<{ passkeys: readonly Passkey[] }>("/auth/passkeys", { headers: bearer(accessToken) }),
  renamePasskey: (accessToken: string, id: string, name: string) => request<void>(`/auth/passkeys/${encodeURIComponent(id)}`, { method: "PUT", headers: { ...bearer(accessToken), "Content-Type": "application/json" }, body: JSON.stringify({ name }) }),
  deletePasskey: (accessToken: string, id: string) => request<void>(`/auth/passkeys/${encodeURIComponent(id)}`, { method: "DELETE", headers: bearer(accessToken) }),
  deleteAccount: (accessToken: string, password: string, confirmation: string) => request<void>("/auth/account/delete", { method: "POST", headers: { ...bearer(accessToken), "Content-Type": "application/json" }, body: JSON.stringify({ password, confirmation }) })
};

export const cloudApi = {
  list: (token: string) => request<{ notebooks: readonly { id: string; title: string; mode: "book" | "whiteboard"; updatedAt: number }[] }>("/cloud/notebooks", { headers: bearer(token) }),
  load: (token: string, id: string) => request<{ document: unknown }>(`/cloud/notebooks/${encodeURIComponent(id)}`, { headers: bearer(token) }),
  save: (token: string, id: string, document: unknown, force = false) => request<{ document: unknown }>(`/cloud/notebooks/${encodeURIComponent(id)}`, { method: "PUT", headers: { ...bearer(token), "Content-Type": "application/json" }, body: JSON.stringify({ document, force }) }),
  uploadAsset: (token: string, notebookId: string, assetId: string, blob: Blob) => request<void>(`/cloud/notebooks/${encodeURIComponent(notebookId)}/assets/${encodeURIComponent(assetId)}`, { method: "PUT", headers: { ...bearer(token), "Content-Type": "application/octet-stream" }, body: blob }),
  downloadAsset: async (token: string, notebookId: string, assetId: string) => {
    const response = await fetch(`${API_URL}/cloud/notebooks/${encodeURIComponent(notebookId)}/assets/${encodeURIComponent(assetId)}`, { headers: bearer(token) });
    if (!response.ok) throw new ApiError(response.status, "Impossible de récupérer une pièce jointe cloud.");
    return response.blob();
  }
};

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}
