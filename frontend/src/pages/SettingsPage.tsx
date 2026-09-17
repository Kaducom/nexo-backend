import AccountSyncSettings from "../components/AccountSyncSettings";
import {
  Bell,
  BellOff,
  Check,
  ChevronLeft,
  LoaderCircle,
  MonitorSmartphone,
  ShieldCheck
} from "lucide-react";

import {
  useEffect,
  useState
} from "react";

import {
  useNavigate
} from "react-router-dom";

import {
  enableNexoNotifications,
  getNotificationPermission,
  getStoredNexoNotificationToken,
  supportsNexoNotifications
} from "../services/notificationService";

type NotificationStatus =
  | "loading"
  | "unsupported"
  | "default"
  | "granted"
  | "denied";

export default function SettingsPage() {
  const navigate = useNavigate();

  const [
    notificationStatus,
    setNotificationStatus
  ] =
    useState<NotificationStatus>(
      "loading"
    );

  const [
    isActivating,
    setIsActivating
  ] = useState(false);

  /*
   * =========================================================
   * FCM TOKEN DESTE DISPOSITIVO
   * =========================================================
   */

  const [
    notificationToken,
    setNotificationToken
  ] = useState<string | null>(
    () =>
      getStoredNexoNotificationToken()
  );

  const [
    feedback,
    setFeedback
  ] = useState("");

  /*
   * =========================================================
   * VERIFICA STATUS ATUAL
   * =========================================================
   */

  useEffect(() => {
    async function checkStatus() {
      const supported =
        await supportsNexoNotifications();

      if (!supported) {
        setNotificationStatus(
          "unsupported"
        );

        return;
      }

      const permission =
        getNotificationPermission();

      if (
        permission === "granted" ||
        permission === "denied" ||
        permission === "default"
      ) {
        setNotificationStatus(
          permission
        );

        return;
      }

      setNotificationStatus(
        "unsupported"
      );
    }

    checkStatus();
  }, []);

  /*
   * =========================================================
   * ATIVA NOTIFICAÇÕES
   * =========================================================
   */

  async function handleEnableNotifications() {
    setIsActivating(true);
    setFeedback("");

    const result =
      await enableNexoNotifications();

    if (result.success) {
      /*
       * notificationService já salva o token.
       *
       * Mantemos o token também no estado para a tela
       * reagir imediatamente sem precisar recarregar.
       */

      setNotificationToken(
        result.token
      );

      setNotificationStatus(
        "granted"
      );

      setFeedback(
        "Este dispositivo foi registrado no NEXO."
      );

      setIsActivating(false);

      return;
    }

    switch (result.reason) {
      case "permission-denied":
        setNotificationStatus(
          "denied"
        );

        setFeedback(
          "As notificações foram bloqueadas neste navegador."
        );

        break;

      case "permission-default":
        setNotificationStatus(
          "default"
        );

        setFeedback(
          "A permissão não foi concedida."
        );

        break;

      case "unsupported":
        setNotificationStatus(
          "unsupported"
        );

        setFeedback(
          "Este navegador não oferece suporte às notificações do NEXO."
        );

        break;

      case "missing-vapid-key":
        setFeedback(
          "A chave de notificações do NEXO não foi encontrada."
        );

        break;

      case "token-unavailable":
        setFeedback(
          "O Firebase não conseguiu gerar o token deste dispositivo."
        );

        break;

      case "registration-failed":
      default:
        setFeedback(
          "Não foi possível registrar este dispositivo."
        );

        break;
    }

    setIsActivating(false);
  }

  /*
   * =========================================================
   * STATUS FINAL
   * =========================================================
   */

  const notificationsActive =
    notificationStatus === "granted" &&
    Boolean(notificationToken);

  return (
    <div className="page settings-page">
      <header className="settings-header">
        <button
          type="button"
          className="settings-back-button"
          onClick={() =>
            navigate(-1)
          }
        >
          <ChevronLeft size={18} />
          Voltar
        </button>

        <div>
          <span className="eyebrow">
            NEXO
          </span>

          <h1>Configurações</h1>

          <p>
            Controle como o NEXO
            funciona neste dispositivo.
          </p>
        </div>
      </header>

      <AccountSyncSettings />
      <section className="settings-grid">
        <article className="panel settings-card">
          <div className="settings-card-header">
            <div
              className={
                notificationsActive
                  ? "settings-icon active"
                  : "settings-icon"
              }
            >
              {notificationsActive ? (
                <Bell size={21} />
              ) : (
                <BellOff size={21} />
              )}
            </div>

            <div>
              <span className="eyebrow">
                ALERTAS
              </span>

              <h2>Notificações</h2>

              <p>
                Receba lembretes e
                avisos importantes mesmo
                quando não estiver usando
                o NEXO.
              </p>
            </div>
          </div>

          <div className="settings-status-box">
            <div>
              <span>Status</span>

              {notificationStatus ===
                "loading" && (
                <strong>
                  Verificando...
                </strong>
              )}

              {notificationStatus ===
                "default" && (
                <strong>
                  Não configurado
                </strong>
              )}

              {notificationStatus ===
                "granted" && (
                <strong>
                  {notificationToken
                    ? "Ativo"
                    : "Permissão concedida"}
                </strong>
              )}

              {notificationStatus ===
                "denied" && (
                <strong>
                  Bloqueado
                </strong>
              )}

              {notificationStatus ===
                "unsupported" && (
                <strong>
                  Indisponível
                </strong>
              )}
            </div>

            <span
              className={`settings-status-dot ${
                notificationsActive
                  ? "active"
                  : ""
              }`}
            />
          </div>

          {!notificationsActive &&
            notificationStatus !==
              "unsupported" && (
              <button
                type="button"
                className="primary-button settings-primary-button"
                onClick={
                  handleEnableNotifications
                }
                disabled={isActivating}
              >
                {isActivating ? (
                  <>
                    <LoaderCircle
                      size={17}
                      className="settings-spinner"
                    />

                    Registrando...
                  </>
                ) : (
                  <>
                    <Bell size={17} />
                    Ativar notificações
                  </>
                )}
              </button>
            )}

          {notificationsActive && (
            <div className="settings-success">
              <Check size={17} />

              <div>
                <strong>
                  Notificações ativas
                </strong>

                <span>
                  Este dispositivo está
                  registrado no NEXO.
                </span>
              </div>
            </div>
          )}

          {feedback && (
            <p className="settings-feedback" role="status">
              {feedback}
            </p>
          )}
        </article>

        <article className="panel settings-card settings-device-card">
          <div className="settings-card-header">
            <div className="settings-icon">
              <MonitorSmartphone
                size={21}
              />
            </div>

            <div>
              <span className="eyebrow">
                DISPOSITIVO
              </span>

              <h2>Este dispositivo</h2>

              <p>
                No futuro você poderá
                controlar em quais
                dispositivos o NEXO deve
                enviar cada aviso.
              </p>
            </div>
          </div>

          <div className="settings-device-info">
            <ShieldCheck size={17} />

            <div>
              <strong>
                Dados locais protegidos
              </strong>

              <span>
                O NEXO continua usando
                sua arquitetura
                offline-first.
              </span>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}