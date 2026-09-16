import {
  useState
} from "react";

import {
  Brain,
  LoaderCircle
} from "lucide-react";

import {
  Navigate,
  useLocation
} from "react-router-dom";

import {
  useAuth
} from "../context/AuthContext";

export default function LoginPage() {
  const location = useLocation();
  const bankReturn = location.state?.bankReturn;
  const destination = typeof bankReturn === "string" && (bankReturn === "/financas/importar" || bankReturn.startsWith("/financas/importar#")) ? bankReturn : "/";
  const {
    user,
    loading,
    loginWithGoogle
  } = useAuth();

  const [
    loggingIn,
    setLoggingIn
  ] = useState(false);

  const [
    error,
    setError
  ] = useState<string | null>(
    null
  );

  if (loading) {
    return (
      <div className="nexo-auth-loading">
        <div className="nexo-auth-loading-mark">
          N
        </div>

        <span>
          Inicializando NEXO...
        </span>
      </div>
    );
  }

  if (user) {
    return (
      <Navigate
        to={destination}
        replace
      />
    );
  }

  async function handleGoogleLogin() {
    try {
      setLoggingIn(true);
      setError(null);

      await loginWithGoogle();
    } catch {
      setError(
        "Não foi possível entrar com o Google. Tente novamente."
      );
    } finally {
      setLoggingIn(false);
    }
  }

  return (
    <main className="nexo-auth">
      <section className="nexo-auth-card" aria-labelledby="login-title">
        <div className="nexo-auth-mark"><Brain size={29} strokeWidth={1.8} /></div>
        <span className="nexo-auth-brand">NEXO</span>
        <h1 id="login-title">Seu segundo cérebro.</h1>
        <p className="nexo-auth-description">
          Suas memórias, compromissos e finanças organizados em um só lugar.
        </p>
        <button type="button" className="nexo-auth-google" disabled={loggingIn} onClick={handleGoogleLogin}>
          {loggingIn ? (
            <><LoaderCircle size={19} className="nexo-spin" />Entrando...</>
          ) : (
            <><span className="nexo-google-mark" aria-hidden="true">G</span>Continuar com Google</>
          )}
        </button>
        {error && <p className="nexo-auth-error" role="alert">{error}</p>}
        <p className="nexo-auth-footer">Acesso privado ao NEXO</p>
      </section>
    </main>
  );
}
