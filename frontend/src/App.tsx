import {
  useEffect
} from "react";

import {
  Navigate,
  Route,
  Routes
} from "react-router-dom";

import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";

import {
  AuthProvider
} from "./context/AuthContext";

import FinancePage from "./pages/FinancePage";
import BankImportsPage from "./pages/BankImportsPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import MemoriesPage from "./pages/MemoriesPage";
import RemindersPage from "./pages/RemindersPage";
import SearchPage from "./pages/SearchPage";
import SettingsPage from "./pages/SettingsPage";

import {
  startNexoForegroundNotifications,
  stopNexoForegroundNotifications
} from "./services/notificationService";

function NexoApplication() {
  /*
   * =========================================================
   * NOTIFICAÇÕES EM FOREGROUND
   * =========================================================
   */

  useEffect(() => {
    void startNexoForegroundNotifications();

    return () => {
      stopNexoForegroundNotifications();
    };
  }, []);

  return (
    <Routes>
      <Route
        path="/login"
        element={<LoginPage />}
      />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route
          path="/"
          element={<HomePage />}
        />

        <Route
          path="/memorias"
          element={<MemoriesPage />}
        />

        <Route
          path="/lembretes"
          element={<RemindersPage />}
        />

        <Route
          path="/financas"
          element={<FinancePage />}
        />
        <Route path="/financas/importar" element={<BankImportsPage />} />

        <Route
          path="/buscar"
          element={<SearchPage />}
        />

        <Route
          path="/configuracoes"
          element={<SettingsPage />}
        />
      </Route>

      <Route
        path="*"
        element={
          <Navigate
            to="/"
            replace
          />
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NexoApplication />
    </AuthProvider>
  );
}
