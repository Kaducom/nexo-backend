import Dexie, { type DBCoreTransaction } from "dexie";
import { newRecordId, syncedTables, type PendingChange, type SyncedTable, type SyncVersion } from "./model";

const remoteTransactions = new WeakSet<DBCoreTransaction>();
export function markRemoteTransaction() {
  const transaction = Dexie.currentTransaction;
  if (!transaction) throw new Error("A sincronização exige uma transação local.");
  remoteTransactions.add(transaction.idbtrans);
}

// Every local write and its upload intent commit together, including bulk/clear
// operations. Server writes carry a per-transaction flag and never echo back.
export function installOutbox(database: Dexie) {
  database.use({ stack: "dbcore", name: "nexo-account-outbox", level: 10,
    create(core) {
      return { ...core,
        transaction(stores, mode, options) {
          const names = mode === "readwrite" && stores.some(name => syncedTables.includes(name as SyncedTable))
            ? [...new Set([...stores, "syncOutbox", "syncVersions"])] : stores;
          return core.transaction(names, mode, options);
        },
        table(name) {
          const table = core.table(name);
          if (!syncedTables.includes(name as SyncedTable)) return table;
          return { ...table, async mutate(request) {
            if (remoteTransactions.has(request.trans)) return table.mutate(request);
            let req = request;
            if (req.type === "add" || req.type === "put") {
              req = { ...req, values: req.values.map(value => ({ ...value, id: value.id ?? newRecordId(name as SyncedTable, value) })) };
            }
            let keys: number[] = [];
            if (req.type === "delete") keys = req.keys;
            else if (req.type === "deleteRange") {
              keys = (await table.query({ trans: req.trans, values: false, query: { index: table.schema.primaryKey, range: req.range } })).result;
            }
            const result = await table.mutate(req);
            const deleted = req.type === "delete" || req.type === "deleteRange";
            if (!deleted) keys = result.results ?? [];
            const rows = deleted ? [] : await table.getMany({ trans: req.trans, keys });
            const outbox = core.table("syncOutbox"), versions = core.table("syncVersions");
            const writes: PendingChange[] = [];
            for (let index = 0; index < keys.length; index++) {
              if (result.failures[index] || !keys[index] || (!deleted && !rows[index])) continue;
              const id = keys[index], key = `${name}_${id}`;
              const pending = await outbox.get({ trans: req.trans, key }) as PendingChange | undefined;
              const version = await versions.get({ trans: req.trans, key }) as SyncVersion | undefined;
              writes.push({ key, table: name as SyncedTable, id, changeId: crypto.randomUUID(), deleted,
                payload: deleted ? null : rows[index], baseRevision: pending?.baseRevision ?? version?.revision ?? 0,
                ...(pending?.conflict ? { conflict: pending.conflict } : {}),
              });
            }
            if (writes.length) {
              const queued = await outbox.mutate({ type: "put", trans: req.trans, values: writes });
              if (queued.numFailures) throw new Error("Não foi possível salvar a fila de sincronização.");
            }
            return result;
          } };
        },
      };
    },
  });
}
