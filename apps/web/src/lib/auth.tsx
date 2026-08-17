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
  updateUser(user: Account): void;
  logout(): void;
};

const storageKey = "notylo-auth";
const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [user, setUser] = useState<Account>();
  const [accessToken, setAccessToken] = useState<string>();
  const [ready, setReady] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);

  const store = useCallback((result: AuthResponse) => {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ accessToken: result.accessToken, refreshToken: result.refreshToken })
    );
    setAccessToken(result.accessToken);
    setUser(result.user);
  }, []);
  const clear = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    setAccessToken(undefined);
    setUser(undefined);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const config = await api.authConfig().catch(() => ({ registrationEnabled: false }));
      if (!active) return;
      setRegistrationEnabled(config.registrationEnabled);
      const saved = readStoredTokens();
      if (!saved) {
        setReady(true);
        return;
      }
      try {
        const result = await api.refresh(saved.refreshToken);
        if (!active) return;
        store(result);
      } catch {
        if (active) clear();
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [clear, store]);

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
  const updateUser = useCallback((nextUser: Account) => setUser(nextUser), []);
  const value = useMemo(
    () => ({
      user,
      accessToken,
      ready,
      registrationEnabled,
      login,
      register,
      loginWithPasskey,
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
  return error instanceof ApiError
    ? error.message
    : "La connexion a échoué. Réessayez dans un instant.";
}

function readStoredTokens(): { accessToken: string; refreshToken: string } | undefined {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(storageKey) ?? "null"
    ) as Partial<AuthResponse> | null;
    if (typeof value?.accessToken === "string" && typeof value.refreshToken === "string")
      return { accessToken: value.accessToken, refreshToken: value.refreshToken };
  } catch {
    sessionStorage.removeItem(storageKey);
  }
  return undefined;
}
