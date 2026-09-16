import {
  Bell,
  BellRing,
  Brain,
  CircleDollarSign,
  Home,
  LoaderCircle,
  LogOut,
  Search,
  Settings,
  UserRound,
  X
} from "lucide-react";

import {
  AnimatePresence,
  motion
} from "framer-motion";

import {
  useEffect,
  useRef,
  useState
} from "react";

import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate
} from "react-router-dom";

import {
  useAuth
} from "../context/AuthContext";

import {
  enableNexoNotifications,
  getNotificationPermission,
  getStoredNexoNotificationToken,
  supportsNexoNotifications
} from "../services/notificationService";

/*
 * Chave usada para lembrar que o usuário fechou o convite de
 * notificações no rodapé do menu sem ativar. Assim ele não
 * volta a aparecer neste dispositivo.
 */
const NOTIFICATION_PROMPT_DISMISSED_KEY =
  "nexo:notification-footer-dismissed";

const items = [
  {
    to: "/",
    label: "Início",
    icon: Home
  },
  {
    to: "/memorias",
    label: "Memórias",
    icon: Brain
  },
  {
    to: "/lembretes",
    label: "Lembretes",
    icon: Bell
  },
  {
    to: "/financas",
    label: "Finanças",
    icon: CircleDollarSign
  },
  {
    to: "/buscar",
    label: "Buscar",
    icon: Search
  }
];

export default function AppLayout() {
  const navigate =
    useNavigate();

  const location =
    useLocation();

  const {
    user,
    logout
  } = useAuth();

  const [
    mobileProfileOpen,
    setMobileProfileOpen
  ] = useState(false);

  const [
    showNotificationPrompt,
    setShowNotificationPrompt
  ] = useState(false);

  const [
    isEnablingNotifications,
    setIsEnablingNotifications
  ] = useState(false);

  const [
    notificationPromptError,
    setNotificationPromptError
  ] = useState("");

  /*
   * =========================================================
   * CONVITE DE NOTIFICAÇÕES NO RODAPÉ DO MENU
   * =========================================================
   *
   * Aparece só quando faz sentido: navegador suporta, o
   * usuário nunca ativou (nem tem token salvo), a permissão
   * ainda não foi decidida e ele não fechou o convite antes
   * neste dispositivo. Uma vez ativado (ou fechado), some
   * para sempre.
   */

  useEffect(() => {
    async function checkNotificationPrompt() {
      const dismissed =
        localStorage.getItem(
          NOTIFICATION_PROMPT_DISMISSED_KEY
        );

      if (dismissed) {
        return;
      }

      const supported =
        await supportsNexoNotifications();

      if (!supported) {
        return;
      }

      const alreadyEnabled = Boolean(
        getStoredNexoNotificationToken()
      );

      if (alreadyEnabled) {
        return;
      }

      const permission =
        getNotificationPermission();

      if (permission === "default") {
        setShowNotificationPrompt(true);
      }
    }

    checkNotificationPrompt();
  }, []);

  async function handleEnableNotificationsFromMenu() {
    setIsEnablingNotifications(true);
    setNotificationPromptError("");

    const result =
      await enableNexoNotifications();

    setIsEnablingNotifications(false);

    if (result.success) {
      setShowNotificationPrompt(false);

      return;
    }

    if (result.reason === "permission-denied") {
      /*
       * O navegador já decidiu por "nunca perguntar de
       * novo" — não adianta insistir no rodapé.
       */

      setShowNotificationPrompt(false);

      return;
    }

    setNotificationPromptError(
      "Não foi possível ativar agora. Tente de novo em Configurações."
    );
  }

  function handleDismissNotificationPrompt() {
    localStorage.setItem(
      NOTIFICATION_PROMPT_DISMISSED_KEY,
      "1"
    );

    setShowNotificationPrompt(false);
  }

  const mobileProfileRef =
    useRef<HTMLDivElement | null>(null);

  const displayName =
    user?.displayName ??
    "Usuário NEXO";

  const email =
    user?.email ??
    "Conta Google";

  const photoURL =
    user?.photoURL;

  const initial =
    displayName
      .trim()
      .charAt(0)
      .toUpperCase() || "N";

  /*
   * =========================================================
   * FECHA MENU AO TROCAR DE ROTA
   * =========================================================
   */

  useEffect(() => {
    setMobileProfileOpen(false);
  }, [location.pathname]);

  /*
   * =========================================================
   * FECHA MENU CLICANDO FORA
   * =========================================================
   */

  useEffect(() => {
    function handlePointerDown(
      event: PointerEvent
    ) {
      if (
        mobileProfileRef.current &&
        !mobileProfileRef.current.contains(
          event.target as Node
        )
      ) {
        setMobileProfileOpen(false);
      }
    }

    document.addEventListener(
      "pointerdown",
      handlePointerDown
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDown
      );
    };
  }, []);

  async function handleLogout() {
    try {
      setMobileProfileOpen(false);

      await logout();
    } catch (error) {
      console.error(
        "[NEXO] Falha ao sair:",
        error
      );
    }
  }

  function renderAvatar() {
    if (photoURL) {
      return (
        <img
          src={photoURL}
          alt={displayName}
          referrerPolicy="no-referrer"
        />
      );
    }

    return initial;
  }

  return (
    <div className="app-shell">
      <a className="nexo-skip-link" href="#nexo-content">Pular para o conteúdo</a>
      {/*
       * =====================================================
       * SIDEBAR DESKTOP
       * =====================================================
       */}

      <aside className="sidebar nexo-sidebar">
        <div className="brand nexo-brand">
          <div className="brand-mark nexo-brand-mark">
            <Brain
              size={21}
              strokeWidth={2.2}
            />
          </div>

          <div>
            <strong>NEXO</strong>

            <span>
              Seu segundo cérebro
            </span>
          </div>
        </div>

        <nav className="desktop-nav" aria-label="Navegação principal">
          <span className="nexo-nav-label">ESPAÇO PESSOAL</span>
          {items.map(
            ({
              to,
              label,
              icon: Icon
            }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({
                  isActive
                }) =>
                  `nav-item ${
                    isActive
                      ? "active"
                      : ""
                  }`
                }
              >
                {({
                  isActive
                }) => (
                  <>
                    <div className="nav-icon">
                      <Icon
                        size={18}
                        strokeWidth={
                          isActive
                            ? 2.3
                            : 1.9
                        }
                      />
                    </div>

                    <span>
                      {label}
                    </span>

                    {isActive && (
                      <motion.div
                        layoutId="sidebar-active-indicator"
                        className="nav-active-indicator"
                        transition={{
                          type: "spring",
                          stiffness: 420,
                          damping: 34
                        }}
                      />
                    )}
                  </>
                )}
              </NavLink>
            )
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-status">
            <span className="status-dot" />

            <div>
              <strong>
                Offline-first
              </strong>

              <span>
                Dados salvos localmente
              </span>
            </div>
          </div>

          <AnimatePresence>
            {showNotificationPrompt && (
              <motion.div
                className="nexo-notification-prompt"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
              >
                <button
                  type="button"
                  className="nexo-notification-prompt-dismiss"
                  aria-label="Fechar convite de notificações"
                  onClick={
                    handleDismissNotificationPrompt
                  }
                >
                  <X size={13} />
                </button>

                <div className="nexo-notification-prompt-icon">
                  <BellRing size={17} />
                </div>

                <div className="nexo-notification-prompt-copy">
                  <strong>Ative os avisos</strong>

                  <span>
                    Saiba de lembretes e
                    compromissos mesmo com
                    o NEXO fechado.
                  </span>
                </div>

                <button
                  type="button"
                  className="nexo-notification-prompt-button"
                  onClick={
                    handleEnableNotificationsFromMenu
                  }
                  disabled={
                    isEnablingNotifications
                  }
                >
                  {isEnablingNotifications ? (
                    <LoaderCircle
                      size={14}
                      className="settings-spinner"
                    />
                  ) : (
                    "Ativar"
                  )}
                </button>

                {notificationPromptError && (
                  <span className="nexo-notification-prompt-error">
                    {notificationPromptError}
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="sidebar-profile">
            <div className="profile-avatar">
              {renderAvatar()}
            </div>

            <div className="profile-info">
              <strong>
                {displayName}
              </strong>

              <span title={email}>
                Conta Google
              </span>
            </div>

            <button
              type="button"
              className="profile-settings"
              aria-label="Configurações"
              title="Configurações"
              onClick={() =>
                navigate(
                  "/configuracoes"
                )
              }
            >
              <Settings size={17} />
            </button>

            <button
              type="button"
              className="profile-settings"
              aria-label="Sair do NEXO"
              title="Sair"
              onClick={
                handleLogout
              }
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      {/*
       * =====================================================
       * HEADER MOBILE
       * =====================================================
       */}

      <header className="nexo-mobile-header">
        <button
          type="button"
          className="nexo-mobile-brand"
          onClick={() =>
            navigate("/")
          }
          aria-label="Ir para o início"
        >
          <span className="nexo-mobile-brand-mark">
            <Brain
              size={19}
              strokeWidth={2.2}
            />
          </span>

          <span className="nexo-mobile-brand-copy">
            <strong>NEXO</strong>
            <small>
              Segundo cérebro
            </small>
          </span>
        </button>

        <div
          className="nexo-mobile-profile-wrapper"
          ref={mobileProfileRef}
          onKeyDown={(event) => {
            if (event.key === "Escape" && mobileProfileOpen) {
              setMobileProfileOpen(false);
              mobileProfileRef.current?.querySelector<HTMLButtonElement>(".nexo-mobile-avatar")?.focus();
            }
          }}
        >
          <button
            type="button"
            className={`nexo-mobile-avatar ${
              mobileProfileOpen
                ? "active"
                : ""
            }`}
            aria-label="Abrir menu da conta"
            aria-controls="nexo-account-menu"
            aria-expanded={mobileProfileOpen}
            onClick={() =>
              setMobileProfileOpen(
                (current) =>
                  !current
              )
            }
          >
            {mobileProfileOpen ? (
              <X size={18} />
            ) : (
              renderAvatar()
            )}
          </button>

          <AnimatePresence>
            {mobileProfileOpen && (
              <motion.div
                className="nexo-mobile-profile-menu"
                id="nexo-account-menu"
                initial={{
                  opacity: 0,
                  y: -8,
                  scale: 0.97
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1
                }}
                exit={{
                  opacity: 0,
                  y: -6,
                  scale: 0.98
                }}
                transition={{
                  duration: 0.16
                }}
              >
                <div className="nexo-mobile-account">
                  <div className="nexo-mobile-account-avatar">
                    {renderAvatar()}
                  </div>

                  <div>
                    <strong>
                      {displayName}
                    </strong>

                    <span>
                      {email}
                    </span>
                  </div>
                </div>

                <div className="nexo-mobile-account-status">
                  <span className="status-dot" />

                  <div>
                    <strong>
                      Offline-first
                    </strong>

                    <span>
                      Dados protegidos localmente
                    </span>
                  </div>
                </div>

                {showNotificationPrompt && (
                  <div className="nexo-notification-prompt nexo-notification-prompt-mobile">
                    <button
                      type="button"
                      className="nexo-notification-prompt-dismiss"
                      aria-label="Fechar convite de notificações"
                      onClick={
                        handleDismissNotificationPrompt
                      }
                    >
                      <X size={13} />
                    </button>

                    <div className="nexo-notification-prompt-icon">
                      <BellRing size={17} />
                    </div>

                    <div className="nexo-notification-prompt-copy">
                      <strong>Ative os avisos</strong>

                      <span>
                        Saiba de lembretes
                        mesmo com o app
                        fechado.
                      </span>
                    </div>

                    <button
                      type="button"
                      className="nexo-notification-prompt-button"
                      onClick={
                        handleEnableNotificationsFromMenu
                      }
                      disabled={
                        isEnablingNotifications
                      }
                    >
                      {isEnablingNotifications ? (
                        <LoaderCircle
                          size={14}
                          className="settings-spinner"
                        />
                      ) : (
                        "Ativar"
                      )}
                    </button>
                  </div>
                )}

                <div className="nexo-mobile-menu-actions">
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        "/configuracoes"
                      )
                    }
                  >
                    <Settings size={17} />

                    <span>
                      Configurações
                    </span>
                  </button>

                  <button
                    type="button"
                    className="danger"
                    onClick={
                      handleLogout
                    }
                  >
                    <LogOut size={17} />

                    <span>
                      Sair do NEXO
                    </span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/*
       * =====================================================
       * CONTEÚDO
       * =====================================================
       */}

      <main className="content" id="nexo-content" tabIndex={-1}>
        <Outlet />
      </main>

      {/*
       * =====================================================
       * NAVEGAÇÃO MOBILE
       * =====================================================
       */}

      <nav className="mobile-nav" aria-label="Navegação mobile">
        {items.map(
          ({
            to,
            label,
            icon: Icon
          }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({
                isActive
              }) =>
                `mobile-nav-item ${
                  isActive
                    ? "active"
                    : ""
                }`
              }
            >
              {({
                isActive
              }) => (
                <>
                  <span className="mobile-nav-icon">
                    <Icon
                      size={20}
                      strokeWidth={
                        isActive
                          ? 2.35
                          : 1.9
                      }
                    />
                  </span>

                  <span>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          )
        )}
      </nav>
    </div>
  );
}