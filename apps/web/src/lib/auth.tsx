import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { api, ApiError, type Account, type AuthResponse } from "./api";

type AuthState = {
  readonly user: Account | undefined;
  readonly accessToken: string | undefined;
  readonly ready: boolean;
  readonly registrationEnabled: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  loginWithPasskey(email: string): Promise<void>;
  refreshSession(): Promise<boolean>;
  updateUser(user: Account): void;
  logout(): void;
};

type StoredSession = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user?: Account;
};

const storageKey = "notylo-auth";
const refreshIntervalMs = 10 * 60 * 1000;
const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [user, setUser] = useState<Account>();
  const [accessToken, setAccessToken] = useState<string>();
  const [ready, setReady] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);

  const store = useCallback((result: AuthResponse) => {
    const session: StoredSession = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user
    };
    sessionStorage.setItem(storageKey, JSON.stringify(session));
    setAccessToken(result.accessToken);
    setUser(result.user);
  }, []);

  const clear = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    setAccessToken(undefined);
    setUser(undefined);
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
        if (active) setRegistrationEnabled(config.registrationEnabled);
      })
      .catch(() => undefined);

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
    async (email: string, password: string) => store(await api.login(email, password)),
    [store]
  );
  const register = useCallback(
    async (email: string, password: string) => store(await api.register(email, password)),
    [store]
  );
  const loginWithPasskey = useCallback(
    async (email: string) => {
      if (!window.PublicKeyCredential)
        throw new Error("Les passkeys ne sont pas prises en charge par ce navigateur.");
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const options = await api.passkeyLoginOptions(email);
      const response = await startAuthentication({ optionsJSON: options as never });
      store(await api.passkeyLoginVerify(email, response));
    },
    [store]
  );
  const updateUser = useCallback((nextUser: Account) => {
    setUser(nextUser);
    const stored = readStoredSession();
    if (stored)
      sessionStorage.setItem(storageKey, JSON.stringify({ ...stored, user: nextUser }));
  }, []);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      ready,
      registrationEnabled,
      login,
      register,
      loginWithPasskey,
      refreshSession,
      updateUser,
      logout: clear
    }),
    [
      user,
      accessToken,
      ready,
      registrationEnabled,
      login,
      register,
      loginWithPasskey,
      refreshSession,
      updateUser,
      clear
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
    return "La passkey a été annulée ou refusée.";
  return "La connexion a échoué. Réessayez dans un instant.";
}

function readStoredSession(): StoredSession | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as
      | Partial<StoredSession>
      | null;
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
