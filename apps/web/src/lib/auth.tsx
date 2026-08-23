import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { api, ApiError, isTauri, type Account, type AuthResponse } from "./api";
import { t } from "../i18n";

type AuthState = {
  readonly user: Account | undefined;
  readonly accessToken: string | undefined;
  readonly ready: boolean;
  readonly hasOfflineAccess: boolean;
  readonly registrationEnabled: boolean;
  readonly cloudUnavailable: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  loginWithPasskey(email?: string): Promise<void>;
  registerPasskeyWithBrowser(name: string): Promise<void>;
  continueOffline(): void;
  refreshSession(): Promise<boolean>;
  updateUser(user: Account): void;
  logout(): Promise<void>;
};

type StoredSession = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user?: Account;
};

const storageKey = "notylo-auth";
const offlineAccessKey = "notylo-offline-access";
const refreshIntervalMs = 10 * 60 * 1000;
const desktopFlowStorageKey = "notylo-desktop-passkey-flow";
const AuthContext = createContext<AuthState | undefined>(undefined);

type DesktopPasskeyFlow = {
  readonly state: string;
  readonly kind: "login" | "registration";
};
type PendingDesktopPasskeyFlow = DesktopPasskeyFlow & {
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
  readonly timeout: number;
};

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [user, setUser] = useState<Account>();
  const [accessToken, setAccessToken] = useState<string>();
  const [ready, setReady] = useState(false);
  const [hasOfflineAccess, setHasOfflineAccess] = useState(readOfflineAccess);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [cloudUnavailable, setCloudUnavailable] = useState(false);
  const desktopFlows = useRef(new Map<string, PendingDesktopPasskeyFlow>());

  const store = useCallback((result: AuthResponse) => {
    const session: StoredSession = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user
    };
    sessionStorage.setItem(storageKey, JSON.stringify(session));
    try {
      localStorage.setItem(offlineAccessKey, "1");
    } catch {
      // A privacy-restricted browser can still use the current session online.
    }
    setAccessToken(result.accessToken);
    setUser(result.user);
    setHasOfflineAccess(true);
  }, []);

  const clear = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    try {
      localStorage.removeItem(offlineAccessKey);
    } catch {
      // The current session is still cleared when persistent storage is unavailable.
    }
    setAccessToken(undefined);
    setUser(undefined);
    setHasOfflineAccess(false);
  }, []);

  const logout = useCallback(async () => {
    const currentAccessToken = accessToken;
    clear();
    if (currentAccessToken) await api.logout(currentAccessToken).catch(() => undefined);
  }, [accessToken, clear]);

  const finishDesktopPasskey = useCallback(
    async (rawUrl: string) => {
      let url: URL;
      try {
        url = new URL(rawUrl);
      } catch {
        return;
      }
      if (url.protocol !== "notylo:" || url.hostname !== "auth") return;
      const state = url.searchParams.get("state") ?? "";
      const stored = readDesktopPasskeyFlow();
      if (!stored || stored.state !== state) return;
      const pending = desktopFlows.current.get(state);
      const settle = (error?: unknown) => {
        sessionStorage.removeItem(desktopFlowStorageKey);
        if (!pending) return;
        window.clearTimeout(pending.timeout);
        desktopFlows.current.delete(state);
        if (error) pending.reject(error);
        else pending.resolve();
      };
      try {
        if (stored.kind === "login") {
          const code = url.searchParams.get("code") ?? "";
          if (!/^[A-Za-z0-9_-]{43,128}$/.test(code)) throw new Error(t("auth.loginFailed"));
          store(await api.desktopPasskeyLoginExchange(state, code));
          setCloudUnavailable(false);
        } else if (url.searchParams.get("registered") !== "1") {
          throw new Error(t("auth.passkeyCancelled"));
        }
        settle();
      } catch (error) {
        settle(error);
      }
    },
    [store]
  );

  useEffect(() => {
    if (!isTauri) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/plugin-deep-link")
      .then(async ({ getCurrent, onOpenUrl }) => {
        const current = await getCurrent();
        if (current) await Promise.all(current.map((url) => finishDesktopPasskey(url)));
        unlisten = await onOpenUrl((urls) => {
          urls.forEach((url) => void finishDesktopPasskey(url));
        });
        if (!active) unlisten();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      unlisten?.();
    };
  }, [finishDesktopPasskey]);

  const beginDesktopPasskey = useCallback(
    async (
      kind: DesktopPasskeyFlow["kind"],
      begin: (state: string) => Promise<{ url: string }>
    ): Promise<void> => {
      const state = randomDesktopState();
      const flow: DesktopPasskeyFlow = { state, kind };
      sessionStorage.setItem(desktopFlowStorageKey, JSON.stringify(flow));
      const completion = new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          desktopFlows.current.delete(state);
          sessionStorage.removeItem(desktopFlowStorageKey);
          reject(new Error(t("auth.loginFailed")));
        }, 5 * 60_000);
        desktopFlows.current.set(state, { ...flow, resolve, reject, timeout });
      });
      try {
        const { url } = await begin(state);
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(url);
      } catch (error) {
        const pending = desktopFlows.current.get(state);
        if (pending) {
          window.clearTimeout(pending.timeout);
          desktopFlows.current.delete(state);
          sessionStorage.removeItem(desktopFlowStorageKey);
          pending.reject(error);
        }
      }
      return completion;
    },
    []
  );

  const continueOffline = useCallback(() => {
    try {
      localStorage.setItem(offlineAccessKey, "1");
    } catch {
      // The current tab can still continue when persistent storage is unavailable.
    }
    setHasOfflineAccess(true);
  }, []);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    const saved = readStoredSession();
    if (!saved) return false;
    try {
      store(await api.refresh(saved.refreshToken));
      return true;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) clear();
      return false;
    }
  }, [clear, store]);

  useEffect(() => {
    let active = true;

    void api
      .authConfig()
      .then((config) => {
        if (active) {
          setRegistrationEnabled(config.registrationEnabled);
          setCloudUnavailable(false);
        }
      })
      .catch(() => {
        if (active) setCloudUnavailable(true);
      });

    const saved = readStoredSession();
    if (saved?.user) {
      setUser(saved.user);
      setAccessToken(saved.accessToken);
    }
    setReady(true);
    if (saved) void refreshSession();

    return () => {
      active = false;
    };
  }, [refreshSession]);

  useEffect(() => {
    if (!ready) return;

    const refresh = () => {
      void refreshSession();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    const interval = window.setInterval(refresh, refreshIntervalMs);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ready, refreshSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        store(await api.login(email, password));
        setCloudUnavailable(false);
      } catch (error) {
        if (isCloudUnavailable(error)) setCloudUnavailable(true);
        throw error;
      }
    },
    [store]
  );
  const register = useCallback(
    async (email: string, password: string) => {
      try {
        store(await api.register(email, password));
        setCloudUnavailable(false);
      } catch (error) {
        if (isCloudUnavailable(error)) setCloudUnavailable(true);
        throw error;
      }
    },
    [store]
  );
  const loginWithPasskey = useCallback(
    async (email?: string) => {
      if (isTauri) {
        await beginDesktopPasskey("login", (state) => api.desktopPasskeyLoginStart(state));
        return;
      }
      if (!window.PublicKeyCredential) throw new Error(t("auth.passkeysUnsupported"));
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const normalizedEmail = email?.trim().toLowerCase() || undefined;
      const options = await api.passkeyLoginOptions(normalizedEmail);
      const response = await startAuthentication({ optionsJSON: options as never });
      store(await api.passkeyLoginVerify(normalizedEmail, response));
      setCloudUnavailable(false);
    },
    [beginDesktopPasskey, store]
  );
  const registerPasskeyWithBrowser = useCallback(
    async (name: string) => {
      if (!isTauri || !accessToken) throw new Error(t("auth.passkeysUnsupported"));
      await beginDesktopPasskey("registration", (state) =>
        api.desktopPasskeyRegistrationStart(accessToken, state, name)
      );
    },
    [accessToken, beginDesktopPasskey]
  );
  const updateUser = useCallback((nextUser: Account) => {
    setUser(nextUser);
    const stored = readStoredSession();
    if (stored) sessionStorage.setItem(storageKey, JSON.stringify({ ...stored, user: nextUser }));
  }, []);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      ready,
      hasOfflineAccess,
      registrationEnabled,
      cloudUnavailable,
      login,
      register,
      loginWithPasskey,
      registerPasskeyWithBrowser,
      continueOffline,
      refreshSession,
      updateUser,
      logout
    }),
    [
      user,
      accessToken,
      ready,
      hasOfflineAccess,
      registrationEnabled,
      cloudUnavailable,
      login,
      register,
      loginWithPasskey,
      registerPasskeyWithBrowser,
      continueOffline,
      refreshSession,
      updateUser,
      logout
    ]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof DOMException && error.name === "NotAllowedError")
    return t("auth.passkeyCancelled");
  return t("auth.loginFailed");
}

function readStoredSession(): StoredSession | undefined {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(storageKey) ?? "null"
    ) as Partial<StoredSession> | null;
    if (typeof value?.accessToken !== "string" || typeof value.refreshToken !== "string")
      return undefined;

    const account =
      value.user &&
      typeof value.user.id === "string" &&
      typeof value.user.email === "string" &&
      typeof value.user.displayName === "string"
        ? value.user
        : undefined;

    return {
      accessToken: value.accessToken,
      refreshToken: value.refreshToken,
      ...(account ? { user: account } : {})
    };
  } catch {
    sessionStorage.removeItem(storageKey);
    return undefined;
  }
}

function randomDesktopState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function readDesktopPasskeyFlow(): DesktopPasskeyFlow | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(desktopFlowStorageKey) ?? "null") as Partial<DesktopPasskeyFlow> | null;
    return value && typeof value.state === "string" && (value.kind === "login" || value.kind === "registration")
      ? { state: value.state, kind: value.kind }
      : undefined;
  } catch {
    return undefined;
  }
}

export function isCloudUnavailable(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 0 ||
      error.status >= 500 ||
      (error.status === 403 && error.message.toLowerCase().includes("intersite")))
  );
}

function readOfflineAccess(): boolean {
  try {
    return localStorage.getItem(offlineAccessKey) === "1";
  } catch {
    return false;
  }
}
