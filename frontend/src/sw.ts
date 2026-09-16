/// <reference lib="webworker" />

import { clientsClaim } from "workbox-core";

import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute
} from "workbox-precaching";

import {
  NavigationRoute,
  registerRoute
} from "workbox-routing";

import {
  initializeApp
} from "firebase/app";

import {
  getMessaging,
  onBackgroundMessage
} from "firebase/messaging/sw";

declare let self: ServiceWorkerGlobalScope;

//
// =========================================================
// NEXO SERVICE WORKER
// =========================================================
//
// Service Worker central do NEXO.
//
// Responsabilidades:
//
// - cache da PWA
// - funcionamento offline
// - atualização automática
// - React Router / SPA
// - Firebase Cloud Messaging
// - notificações em background
// - abertura do NEXO através das notificações
//

self.skipWaiting();

clientsClaim();

//
// =========================================================
// FIREBASE
// =========================================================
//
// O Service Worker possui sua própria instância Firebase.
//
// Isso é necessário porque ele continua existindo mesmo
// quando a interface React não está aberta.
//

const firebaseConfig = {
  apiKey: "AIzaSyDQXFWwE_xIvBRbdd-gkpSWwwOBwT4775Y",
  authDomain: "nexo-15b2c.firebaseapp.com",
  projectId: "nexo-15b2c",
  storageBucket: "nexo-15b2c.firebasestorage.app",
  messagingSenderId: "885530440027",
  appId: "1:885530440027:web:054e29a637d623b1acea7e",
  measurementId: "G-3ZBTWFFSHX"
};

const firebaseApp =
  initializeApp(firebaseConfig);

const messaging =
  getMessaging(firebaseApp);

//
// =========================================================
// PRECACHE
// =========================================================
//
// O vite-plugin-pwa substitui self.__WB_MANIFEST
// durante o npm run build.
//

precacheAndRoute(
  self.__WB_MANIFEST
);

cleanupOutdatedCaches();

//
// =========================================================
// REACT ROUTER / SPA
// =========================================================
//
// Permite abrir diretamente:
//
// /lembretes
// /financas
// /configuracoes
//
// e qualquer outra rota React.
//

const navigationHandler =
  createHandlerBoundToURL(
    "index.html"
  );

const navigationRoute =
  new NavigationRoute(
    navigationHandler,
    {
      denylist: [
        /^\/api\//
      ]
    }
  );

registerRoute(
  navigationRoute
);

//
// =========================================================
// FIREBASE CLOUD MESSAGING
// =========================================================
//
// Recebe mensagens quando:
//
// - NEXO está em segundo plano
// - outra aba está aberta
// - PWA não está em foco
// - navegador mantém o Service Worker ativo
//

onBackgroundMessage(
  messaging,
  (payload) => {
    console.log(
      "[NEXO SW] Push recebido:",
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

    const notificationOptions: NotificationOptions = {
      body,

      icon:
        "/pwa-192x192.svg",

      badge:
        "/pwa-192x192.svg",

      data: {
        url
      },

      tag:
        payload.data?.tag ??
        "nexo-notification"
    };

    self.registration.showNotification(
      title,
      notificationOptions
    );
  }
);

//
// =========================================================
// CLIQUE NA NOTIFICAÇÃO
// =========================================================
//
// Quando o usuário tocar na notificação:
//
// 1. fecha a notificação
// 2. procura uma janela do NEXO aberta
// 3. se encontrar, leva ela para a rota correta
// 4. se não encontrar, abre uma nova janela
//

self.addEventListener(
  "notificationclick",
  (event) => {
    event.notification.close();

    const targetUrl =
      event.notification.data?.url ??
      "/";

    event.waitUntil(
      (async () => {
        const windowClients =
          await self.clients.matchAll({
            type: "window",
            includeUncontrolled: true
          });

        //
        // NEXO já está aberto.
        //

        for (
          const client
          of windowClients
        ) {
          if (
            "focus" in client
          ) {
            await client.navigate(
              targetUrl
            );

            return client.focus();
          }
        }

        //
        // NEXO está fechado.
        //

        return self.clients.openWindow(
          targetUrl
        );
      })()
    );
  }
);

//
// =========================================================
// CICLO DE VIDA
// =========================================================
//

self.addEventListener(
  "install",
  () => {
    console.log(
      "[NEXO SW] Service Worker instalado."
    );
  }
);

self.addEventListener(
  "activate",
  () => {
    console.log(
      "[NEXO SW] Service Worker ativo."
    );
  }
);