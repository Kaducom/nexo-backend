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
 * Firestore sincroniza os dados completos em users/{uid}/data.
 * Dexie mantém uma cópia offline separada por conta e a fila de envio.
 * O espelho de lembretes e o token FCM continuam atendendo ao agendador.
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
