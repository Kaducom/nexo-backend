import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { firebaseAuth, firestoreDb } from "../firebase";
import { validCloudRecord, type CloudRecord } from "./model";
import type { SyncTransport } from "./engine";

export function firestoreTransport(uid: string): SyncTransport {
  const records = collection(firestoreDb, "users", uid, "data");
  return {
    listen(next, error) {
      return onSnapshot(records, { includeMetadataChanges: true }, snapshot => {
        // Ignore optimistic SDK echoes. IndexedDB already contains local edits.
        if (snapshot.metadata.hasPendingWrites) return;
        const values = snapshot.docChanges().filter(change => change.type !== "removed").map(change => ({ ...change.doc.data(), key: change.doc.id }) as CloudRecord);
        next(values, !snapshot.metadata.fromCache);
      }, error);
    },
    async send(change, deviceId) {
      if (firebaseAuth.currentUser?.uid !== uid) throw new Error("A conta mudou. Entre novamente para sincronizar.");
      const reference = doc(records, change.key);
      return runTransaction(firestoreDb, async transaction => {
        const snapshot = await transaction.get(reference);
        const previous = snapshot.exists() ? { ...snapshot.data(), key: snapshot.id } as CloudRecord : undefined;
        if (previous && !validCloudRecord(previous)) throw new Error("Registro remoto incompatível. Atualize o NEXO.");
        if (previous?.changeId === change.changeId) return { record: previous, conflict: false };
        if (previous && previous.revision !== change.baseRevision) return { record: previous, conflict: true };
        if (!previous && change.baseRevision !== 0) throw new Error("O registro remoto foi removido fora do NEXO. Os dados locais foram preservados.");
        const payload = change.deleted ? null : JSON.parse(JSON.stringify(change.payload));
        const record: CloudRecord = { key: change.key, table: change.table, id: change.id, revision: (previous?.revision ?? 0) + 1, changeId: change.changeId, deviceId, deleted: change.deleted, payload };
        const legacyId = payload?.legacyReminderId;
        const legacyRef = change.table === "reminders" && Number.isSafeInteger(legacyId) ? doc(firestoreDb, "users", uid, "reminders", String(legacyId)) : null;
        const legacySnapshot = legacyRef ? await transaction.get(legacyRef) : null;
        const legacyMatches = legacySnapshot?.exists() && legacySnapshot.data().title === payload?.title && legacySnapshot.data().startsAt === payload?.startsAt;
        transaction.set(reference, { ...record, updatedAt: serverTimestamp() });
        if (change.table === "reminders") {
          const mirror = doc(firestoreDb, "users", uid, "reminders", String(change.id));
          if (change.deleted) transaction.delete(mirror);
          else transaction.set(mirror, {
            title: payload.title, notes: payload.notes ?? "", startsAt: payload.startsAt, completed: payload.completed,
            notifiedAt: legacyMatches && previous === undefined ? legacySnapshot!.data()!.notifiedAt ?? null : null,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          if (legacyRef && legacyMatches) transaction.delete(legacyRef);
        }
        return { record, conflict: false };
      });
    },
  };
}
