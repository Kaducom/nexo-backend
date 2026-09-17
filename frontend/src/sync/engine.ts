import { liveQuery } from "dexie";
import type { NexoDatabase } from "../db";
import { markRemoteTransaction } from "./outbox";
import { syncedTables, validCloudRecord, type CloudRecord, type PendingChange } from "./model";

export type SyncStatus = { state: "connecting" | "synced" | "syncing" | "offline" | "error"; message?: string };
export interface SyncTransport {
  listen(onRecords: (records: CloudRecord[], server: boolean) => void, onError: (error: Error) => void): () => void;
  send(change: PendingChange, deviceId: string): Promise<{ record: CloudRecord; conflict: boolean }>;
}

async function writeRemote(database: NexoDatabase, record: CloudRecord) {
  markRemoteTransaction();
  if (record.deleted) await database.table(record.table).delete(record.id);
  else await database.table(record.table).put(record.payload!);
  await database.syncVersions.put({ key: record.key, revision: record.revision });
}

export async function receiveRecords(database: NexoDatabase, records: CloudRecord[], deviceId: string) {
  await database.transaction("rw", [...syncedTables, "syncOutbox", "syncVersions"], async () => {
    markRemoteTransaction();
    for (const record of records) {
      if (!validCloudRecord(record)) throw new Error("O servidor enviou um registro incompatível. Atualize o aplicativo.");
      const version = await database.syncVersions.get(record.key);
      const pending = await database.syncOutbox.get(record.key);
      if (record.revision < (version?.revision ?? 0)) continue;
      if (pending) {
        if (pending.changeId === record.changeId) {
          await database.syncOutbox.delete(record.key);
          await writeRemote(database, record);
        } else if (record.deviceId === deviceId && record.revision > pending.baseRevision && !pending.conflict) {
          // Acknowledgement of an earlier edit from this same local database.
          await database.syncVersions.put({ key: record.key, revision: record.revision });
          await database.syncOutbox.update(record.key, { baseRevision: record.revision });
        }
        // Foreign concurrent edits are resolved during the transactional upload.
      } else if (record.revision > (version?.revision ?? 0)) await writeRemote(database, record);
    }
  });
}

export async function acknowledge(database: NexoDatabase, sent: PendingChange, record: CloudRecord, conflict: boolean) {
  await database.transaction("rw", [...syncedTables, "syncOutbox", "syncVersions"], async () => {
    markRemoteTransaction();
    const current = await database.syncOutbox.get(sent.key);
    if (!current) return;
    const version = await database.syncVersions.get(sent.key);
    if (record.revision < (version?.revision ?? 0) || record.revision < current.baseRevision) return;
    if (conflict) { await database.syncOutbox.update(sent.key, { conflict: record }); return; }
    if (current.changeId === sent.changeId) {
      await database.syncOutbox.delete(sent.key);
      await writeRemote(database, record);
    } else {
      await database.syncVersions.put({ key: sent.key, revision: record.revision });
      await database.syncOutbox.update(sent.key, { baseRevision: record.revision });
    }
  });
}

export async function resolveConflict(database: NexoDatabase, key: string, useLocal: boolean) {
  await database.transaction("rw", [...syncedTables, "syncOutbox", "syncVersions"], async () => {
    const row = await database.syncOutbox.get(key);
    if (!row?.conflict) return;
    if (useLocal) await database.syncOutbox.put({ ...row, baseRevision: row.conflict.revision, conflict: undefined, changeId: crypto.randomUUID() });
    else { await database.syncOutbox.delete(key); await writeRemote(database, row.conflict); }
  });
}

export function startSync(database: NexoDatabase, transport: SyncTransport, deviceId: string, report: (status: SyncStatus) => void) {
  let stopped = false, sending = false, ready = false;
  let listenerFailed = false;
  let incoming = Promise.resolve();
  const update = (status: SyncStatus) => { if (!stopped) report(status); };
  const fail = (error: unknown) => update({ state: navigator.onLine ? "error" : "offline", message: (error as Error).message });
  async function flush() {
    if (stopped || sending || !ready) return;
    if (!navigator.onLine) { update({ state: "offline" }); return; }
    sending = true;
    try {
      await incoming;
      const pending = await database.syncOutbox.toArray();
      for (const change of pending) {
        if (stopped) return;
        if (change.conflict) continue;
        update({ state: "syncing" });
        const result = await transport.send(change, deviceId);
        if (stopped) return;
        await acknowledge(database, change, result.record, result.conflict);
      }
      update({ state: "synced" });
    } catch (error) { fail(error); }
    finally { sending = false; }
  }
  update({ state: navigator.onLine ? "connecting" : "offline" });
  let unsubscribe: () => void = () => {};
  function connect() {
  listenerFailed = false;
  unsubscribe = transport.listen((records, server) => {
    incoming = incoming.then(async () => {
      if (stopped) return;
      await receiveRecords(database, records, deviceId);
      if (server) ready = true;
    }).then(() => { void flush(); }).catch(fail);
  }, error => { ready = false; listenerFailed = true; fail(error); });
  }
  connect();
  const subscription = liveQuery(() => database.syncOutbox.toArray()).subscribe({ next: () => { void flush(); }, error: fail });
  const reconnect = () => {
    if (stopped) return;
    if (listenerFailed && navigator.onLine) { unsubscribe(); connect(); }
    void flush();
  };
  const offline = () => update({ state: "offline" });
  window.addEventListener("online", reconnect); window.addEventListener("offline", offline);
  const timer = window.setInterval(reconnect, 5000);
  return () => {
    stopped = true; unsubscribe(); subscription.unsubscribe(); window.clearInterval(timer);
    window.removeEventListener("online", reconnect); window.removeEventListener("offline", offline);
  };
}
