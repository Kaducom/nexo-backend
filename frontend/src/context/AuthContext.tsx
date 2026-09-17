import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User
} from "firebase/auth";

import {
  firebaseAuth
} from "../firebase";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext =
  createContext<AuthContextValue | null>(
    null
  );

type AuthProviderProps = {
  children: ReactNode;
};

const googleProvider =
  new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account"
});

export function AuthProvider({
  children
}: AuthProviderProps) {
  const [user, setUser] =
    useState<User | null>(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    let activeUid: string | null = null;
    const unsubscribe =
      onAuthStateChanged(
        firebaseAuth,
        (firebaseUser) => {
          if (activeUid && firebaseUser?.uid !== activeUid) {
            setLoading(true);
            window.location.reload();
            return;
          }
          activeUid = firebaseUser?.uid ?? null;
          setUser(firebaseUser);
          setLoading(false);
        },
        (error) => {
          console.error(
            "[NEXO AUTH] Erro ao restaurar sessão:",
            error
          );

          setUser(null);
          setLoading(false);
        }
      );

    return unsubscribe;
  }, []);

  async function loginWithGoogle() {
    try {
      await signInWithPopup(
        firebaseAuth,
        googleProvider
      );
    } catch (error) {
      console.error(
        "[NEXO AUTH] Falha no login Google:",
        error
      );

      throw error;
    }
  }

  async function logout() {
    try {
      await signOut(
        firebaseAuth
      );
    } catch (error) {
      console.error(
        "[NEXO AUTH] Falha no logout:",
        error
      );

      throw error;
    }
  }

  const value =
    useMemo<AuthContextValue>(
      () => ({
        user,
        loading,
        loginWithGoogle,
        logout
      }),
      [
        user,
        loading
      ]
    );

  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context =
    useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth deve ser usado dentro de AuthProvider."
    );
  }

  return context;
}