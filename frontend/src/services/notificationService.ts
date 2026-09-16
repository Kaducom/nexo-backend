import {
  getMessaging,
  getToken,
  isSupported,
  onMessage
} from "firebase/messaging";

import {
  doc,
  setDoc
} from "firebase/firestore";

import {
  firebaseApp,
  firebaseAuth,
  firestoreDb
} from "../firebase";

/*
 * =========================================================
 * RESULTADO DA CONFIGURAÇÃO
 * =========================================================
 */

export type NotificationSetupResult =
  | {
      success: true;
      token: string;
    }
  | {
      success: false;
      reason:
        | "unsupported"
        | "permission-denied"
        | "permission-default"
        | "missing-vapid-key"
        | "token-unavailable"
        | "registration-failed";
      error?: unknown;
    };

/*
 * =========================================================
 * STORAGE
 * =========================================================
 */

const FCM_TOKEN_STORAGE_KEY =
  "nexo_notification_fcm_token";

/*
 * =========================================================
 * CONTROLE DO LISTENER FOREGROUND
 * =========================================================
 *
 * Evita registrar vários onMessage() caso o React execute
 * novamente alguma inicialização durante desenvolvimento.
 */

let foregroundListenerStarted =
  false;

let foregroundUnsubscribe:
  (() => void) | null = null;

/*
 * =========================================================
 * VAPID
 * =========================================================
 */

function getVapidKey() {
  return import.meta.env
    .VITE_FIREBASE_VAPID_KEY as
    | string
    | undefined;
}

/*
 * =========================================================
 * SUPORTE
 * =========================================================
 */

export async function supportsNexoNotifications() {
  if (
    typeof window === "undefined"
  ) {
    return false;
  }

  if (
    typeof navigator === "undefined"
  ) {
    return false;
  }

  if (
    !("Notification" in window)
  ) {
    return false;
  }

  if (
    !("serviceWorker" in navigator)
  ) {
    return false;
  }

  return isSupported();
}

/*
 * =========================================================
 * PERMISSÃO ATUAL
 * =========================================================
 */

export function getNotificationPermission() {
  if (
    typeof window === "undefined" ||
    !("Notification" in window)
  ) {
    return "unsupported" as const;
  }

  return Notification.permission;
}

/*
 * =========================================================
 * TOKEN SALVO
 * =========================================================
 */

export function getStoredNexoNotificationToken() {
  if (
    typeof window === "undefined"
  ) {
    return null;
  }

  return localStorage.getItem(
    FCM_TOKEN_STORAGE_KEY
  );
}

/*
 * =========================================================
 * SERVICE WORKER
 * =========================================================
 */

async function getNexoServiceWorkerRegistration() {
  return navigator.serviceWorker.ready;
}

/*
 * =========================================================
 * EXIBE NOTIFICAÇÃO EM FOREGROUND
 * =========================================================
 *
 * Quando o NEXO está em primeiro plano, o Firebase entrega
 * a mensagem para onMessage().
 *
 * Nesse cenário o onBackgroundMessage() do sw.ts não é quem
 * cuida da mensagem.
 *
 * Portanto, exibimos a notificação através do próprio
 * ServiceWorkerRegistration.
 */

async function showForegroundNotification(
  title: string,
  body: string,
  url: string,
  tag: string
) {
  if (
    Notification.permission !==
    "granted"
  ) {
    return;
  }

  try {
    const registration =
      await getNexoServiceWorkerRegistration();

    await registration.showNotification(
      title,
      {
        body,

        icon:
          "/pwa-192x192.svg",

        badge:
          "/pwa-192x192.svg",

        data: {
          url
        },

        tag
      }
    );
  } catch (error) {
    console.error(
      "[NEXO] Falha ao exibir notificação em foreground:",
      error
    );
  }
}

/*
 * =========================================================
 * LISTENER DE MENSAGENS EM FOREGROUND
 * =========================================================
 *
 * Responsável pelas mensagens recebidas enquanto:
 *
 * - NEXO está aberto
 * - aba do NEXO está ativa
 * - aplicação está em primeiro plano
 *
 * Background continua sendo responsabilidade do sw.ts.
 */

export async function startNexoForegroundNotifications() {
  /*
   * Já iniciado.
   */

  if (foregroundListenerStarted) {
    return;
  }

  const supported =
    await supportsNexoNotifications();

  if (!supported) {
    console.warn(
      "[NEXO] Foreground notifications indisponíveis."
    );

    return;
  }

  /*
   * Marca antes de registrar para evitar duas chamadas
   * simultâneas criando listeners duplicados.
   */

  foregroundListenerStarted =
    true;

  try {
    const messaging =
      getMessaging(firebaseApp);

    foregroundUnsubscribe =
      onMessage(
        messaging,
        async (payload) => {
          console.log(
            "[NEXO] Mensagem FCM recebida em foreground:",
            payload
          );

          const title =
            payload.notification?.title ??
            payload.data?.title ??
            "NEXO";

          const body =
            payload.notification?.body ??
            payload.data?.body ??
            "Você tem um novo aviso.";

          const url =
            payload.data?.url ??
            "/";

          const tag =
            payload.data?.tag ??
            "nexo-notification";

          await showForegroundNotification(
            title,
            body,
            url,
            tag
          );
        }
      );

    console.log(
      "[NEXO] Listener FCM foreground iniciado."
    );
  } catch (error) {
    foregroundListenerStarted =
      false;

    foregroundUnsubscribe =
      null;

    console.error(
      "[NEXO] Falha ao iniciar listener FCM foreground:",
      error
    );
  }
}

/*
 * =========================================================
 * PARA LISTENER FOREGROUND
 * =========================================================
 *
 * Não precisamos usar isso agora, mas deixamos o serviço
 * preparado para logout/troca de usuário no futuro.
 */

export function stopNexoForegroundNotifications() {
  if (foregroundUnsubscribe) {
    foregroundUnsubscribe();
  }

  foregroundUnsubscribe =
    null;

  foregroundListenerStarted =
    false;

  console.log(
    "[NEXO] Listener FCM foreground encerrado."
  );
}

/*
 * =========================================================
 * ATIVAÇÃO DO FCM
 * =========================================================
 */

export async function enableNexoNotifications():
  Promise<NotificationSetupResult> {
  try {
    const supported =
      await supportsNexoNotifications();

    if (!supported) {
      return {
        success: false,
        reason: "unsupported"
      };
    }

    /*
     * -------------------------------------------------------
     * VAPID
     * -------------------------------------------------------
     */

    const vapidKey =
      getVapidKey();

    if (!vapidKey) {
      console.error(
        "[NEXO] VITE_FIREBASE_VAPID_KEY não encontrada."
      );

      return {
        success: false,
        reason: "missing-vapid-key"
      };
    }

    /*
     * -------------------------------------------------------
     * PERMISSÃO
     * -------------------------------------------------------
     */

    let permission =
      Notification.permission;

    if (
      permission === "default"
    ) {
      permission =
        await Notification.requestPermission();
    }

    if (
      permission === "denied"
    ) {
      return {
        success: false,
        reason: "permission-denied"
      };
    }

    if (
      permission !== "granted"
    ) {
      return {
        success: false,
        reason: "permission-default"
      };
    }

    /*
     * -------------------------------------------------------
     * SERVICE WORKER
     * -------------------------------------------------------
     */

    const serviceWorkerRegistration =
      await getNexoServiceWorkerRegistration();

    /*
     * -------------------------------------------------------
     * FIREBASE MESSAGING
     * -------------------------------------------------------
     */

    const messaging =
      getMessaging(firebaseApp);

    /*
     * -------------------------------------------------------
     * FCM REGISTRATION TOKEN
     * -------------------------------------------------------
     */

    const token =
      await getToken(
        messaging,
        {
          vapidKey,
          serviceWorkerRegistration
        }
      );

    if (!token) {
      console.error(
        "[NEXO] Firebase não retornou um FCM token."
      );

      return {
        success: false,
        reason: "token-unavailable"
      };
    }

    /*
     * -------------------------------------------------------
     * SALVA LOCALMENTE
     * -------------------------------------------------------
     */

    localStorage.setItem(
      FCM_TOKEN_STORAGE_KEY,
      token
    );

    /*
     * -------------------------------------------------------
     * SALVA NO FIRESTORE
     * -------------------------------------------------------
     *
     * A Cloud Function agendada usa este token para avisar
     * o usuário mesmo com o NEXO fechado. Se o usuário não
     * estiver logado (não deveria acontecer, pois as rotas
     * são protegidas), simplesmente pulamos este passo.
     */

    const uid = firebaseAuth.currentUser?.uid;

    if (uid) {
      try {
        await setDoc(
          doc(firestoreDb, "users", uid),
          {
            fcmToken: token,
            fcmTokenUpdatedAt: new Date().toISOString()
          },
          { merge: true }
        );
      } catch (firestoreError) {
        console.error(
          "[NEXO] Falha ao salvar o token FCM no Firestore:",
          firestoreError
        );
      }
    }

    /*
     * Não imprimimos mais o token inteiro no console.
     */

    console.log(
      "[NEXO] FCM Registration Token obtido.",
      {
        tokenLength:
          token.length
      }
    );

    /*
     * -------------------------------------------------------
     * FOREGROUND
     * -------------------------------------------------------
     *
     * Se o usuário acabou de ativar notificações,
     * já garantimos que o listener esteja funcionando.
     */

    await startNexoForegroundNotifications();

    console.log(
      "[NEXO] Notificações registradas com sucesso."
    );

    return {
      success: true,
      token
    };
  } catch (error) {
    console.error(
      "[NEXO] Erro ao ativar notificações:",
      error
    );

    return {
      success: false,
      reason: "registration-failed",
      error
    };
  }
}