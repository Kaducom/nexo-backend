import type {
  ReactNode
} from "react";

import {
  Navigate,
  useLocation
} from "react-router-dom";

import {
  useAuth
} from "../context/AuthContext";

type ProtectedRouteProps = {
  children: ReactNode;
};

export default function ProtectedRoute({
  children
}: ProtectedRouteProps) {
  const location = useLocation();
  const {
    user,
    loading
  } = useAuth();

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

  if (!user) {
    return (
      <Navigate
        to="/login"
        state={location.pathname === "/financas/importar" ? { bankReturn: location.pathname + location.hash } : undefined}
        replace
      />
    );
  }

  return children;
}
