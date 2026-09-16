import {
  getApps,
  initializeApp
} from "firebase/app";

import {
  browserLocalPersistence,
  getAuth,
  setPersistence
} from "firebase/auth";

import {
  getFirestore
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDQXFWwE_xIvBRbdd-gkpSWwwOBwT4775Y",
  authDomain: "nexo-15b2c.firebaseapp.com",
  projectId: "nexo-15b2c",
  storageBucket: "nexo-15b2c.firebasestorage.app",
  messagingSenderId: "885530440027",
  appId: "1:885530440027:web:054e29a637d623b1acea7e",
  measurementId: "G-3ZBTWFFSHX"
};

export const firebaseApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp(firebaseConfig);

export const firebaseAuth =
  getAuth(firebaseApp);

/*
 * Firestore é usado apenas para o que precisa sair do
 * dispositivo: o token de notificação (FCM) e um espelho
 * mínimo dos lembretes, para que a Cloud Function agendada
 * consiga avisar o usuário mesmo com o NEXO fechado.
 *
 * Os dados completos continuam vivendo no Dexie local.
 */
export const firestoreDb =
  getFirestore(firebaseApp);

/*
 * Mantém a sessão do usuário salva no navegador.
 *
 * Isso significa que fechar o NEXO e abrir novamente
 * não exigirá um novo login toda vez.
 */
void setPersistence(
  firebaseAuth,
  browserLocalPersistence
);