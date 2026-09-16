import {
  deleteDoc,
  doc,
  setDoc
} from "firebase/firestore";

import {
  firebaseAuth,
  firestoreDb
} from "../firebase";

import type {
  Reminder
} from "../types";

/*
 * =========================================================
 * SINCRONIZAÇÃO DE LEMBRETES (Dexie -> Firestore)
 * =========================================================
 *
 * O NEXO guarda os lembretes localmente, no Dexie. Isso é
 * ótimo para o app (funciona offline, é rápido), mas tem
 * um limite: um `setTimeout` no navegador só dispara com o
 * NEXO aberto.
 *
 * Para avisar o usuário mesmo com o app fechado, uma Cloud
 * Function agendada (`checkDueReminders`, em functions/) roda
 * de tempos em tempos no servidor e precisa enxergar quais
 * lembretes estão pendentes.
 *
 * Por isso espelhamos aqui uma cópia MÍNIMA de cada lembrete
 * em:
 *
 * /users/{uid}/reminders/{id}
 *
 * Os dados completos continuam no Dexie — este espelho só
 * existe para viabilizar o aviso por push. Se o usuário não
 * estiver logado, a sincronização é ignorada silenciosamente
 * (o app continua funcionando 100% local).
 * =========================================================
 */

function reminderDocRef(id: number) {
  const uid = firebaseAuth.currentUser?.uid;

  if (!uid) {
    return null;
  }

  return doc(
    firestoreDb,
    "users",
    uid,
    "reminders",
    String(id)
  );
}

export async function mirrorReminderUpsert(
  reminder: Reminder
) {
  if (!reminder.id) {
    return;
  }

  const ref = reminderDocRef(reminder.id);

  if (!ref) {
    return;
  }

  try {
    await setDoc(
      ref,
      {
        title: reminder.title,

        notes: reminder.notes ?? "",

        startsAt: reminder.startsAt,

        completed: reminder.completed,

        /*
         * Sempre que o lembrete é criado ou editado (inclusive
         * reabrindo um lembrete concluído, ou mudando a data),
         * zeramos `notifiedAt`. Assim a Cloud Function volta a
         * considerá-lo pendente de aviso.
         */

        notifiedAt: null,

        updatedAt: new Date().toISOString()
      },
      {
        merge: true
      }
    );
  } catch (error) {
    console.error(
      "[NEXO SYNC] Falha ao espelhar lembrete no Firestore:",
      error
    );
  }
}

export async function mirrorReminderDelete(
  id?: number
) {
  if (!id) {
    return;
  }

  const ref = reminderDocRef(id);

  if (!ref) {
    return;
  }

  try {
    await deleteDoc(ref);
  } catch (error) {
    console.error(
      "[NEXO SYNC] Falha ao remover espelho do lembrete no Firestore:",
      error
    );
  }
}

export async function mirrorReminderDeleteMany(
  ids: number[]
) {
  await Promise.all(
    ids.map((id) => mirrorReminderDelete(id))
  );
}
