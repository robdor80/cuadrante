import { createContext, PropsWithChildren, useContext, useMemo } from 'react';

export interface AppSession {
  uid: string;
  email: string;
  name: string;
}

interface AuthContextValue {
  session: AppSession | null;
  isAuthReady: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  isAuthReady: true,
});

export function AuthProvider({ children }: PropsWithChildren) {
  // Parte 1: no activamos login real ni listeners.
  const value = useMemo<AuthContextValue>(
    () => ({
      session: null,
      isAuthReady: true,
    }),
    [],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
