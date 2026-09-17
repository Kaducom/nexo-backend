import { createNexoDatabase, type NexoDatabase } from "../db";
import { syncedTables, newRecordId, randomId, stableId, type RecordData } from "./model";

export async function openAccountDatabase(uid: string, prefix = "NexoAccount:") {
  if (!uid) throw new Error("Entre em uma conta para abrir os dados.");
  const database = createNexoDatabase(prefix + uid, true);
  await database.open();
  await database.transaction("rw", database.syncMeta, async () => {
    if (!await database.syncMeta.get("deviceId")) await database.syncMeta.put({ key: "deviceId", value: crypto.randomUUID() });
  });
  return database;
}

export async function legacyCount(uid: string, account: NexoDatabase, legacyName = "NexoDB") {
  if (await account.syncMeta.get("legacyImported") || await account.syncMeta.get("legacySkipped")) return 0;
  const legacy = createNexoDatabase(legacyName);
  try {
    const owner = (await legacy.syncMeta.get("owner"))?.value;
    if (owner && owner !== uid) return 0;
    return (await Promise.all(syncedTables.map(table => legacy.table(table).count()))).reduce((sum, n) => sum + n, 0);
  } finally { legacy.close(); }
}

// The old database remains an untouched backup. Its ownership claim and ID map
// are durable before copying; retries after a crash reuse exactly the same IDs.
export async function importLegacy(uid: string, account: NexoDatabase, legacyName = "NexoDB") {
  const legacy = createNexoDatabase(legacyName);
  try {
    const bundle = await legacy.transaction("rw", [...syncedTables, "syncMeta"], async () => {
      const owner = (await legacy.syncMeta.get("owner"))?.value;
      if (owner && owner !== uid) throw new Error("Os dados antigos já foram vinculados a outra conta.");
      const rows = Object.fromEntries(await Promise.all(syncedTables.map(async table => [table, await legacy.table(table).toArray()]))) as Record<string, RecordData[]>;
      const mapping = (await legacy.syncMeta.get("idMapping"))?.value as Record<string, number> | undefined;
      const ids: Record<string, number> = mapping ?? {};
      for (const table of syncedTables) for (const row of rows[table]) {
        ids[`${table}_${row.id}`] ??= table === "bankImports" || table === "bankRules" ? newRecordId(table, row) : randomId();
      }
      for (const row of rows.reminders) if (row.sourceType === "financialCommitment" && row.sourceId) {
        ids[`reminders_${row.id}`] = stableId(`commitmentReminder:${ids[`financialCommitments_${row.sourceId}`] ?? row.sourceId}`);
      }
      for (const row of rows.transactions) if (row.importEntryId) {
        ids[`transactions_${row.id}`] = stableId(`bankTransaction:${ids[`bankImports_${row.importEntryId}`] ?? row.importEntryId}`);
      }
      await legacy.syncMeta.bulkPut([{ key: "owner", value: uid }, { key: "idMapping", value: ids }]);
      return { rows, ids };
    });
    await account.transaction("rw", [...syncedTables, "syncMeta"], async () => {
      if (await account.syncMeta.get("legacyImported")) return;
      for (const table of syncedTables) for (const original of bundle.rows[table]) {
        const row: RecordData = { ...original, id: bundle.ids[`${table}_${original.id}`] };
        const references = { financialCommitmentId: "financialCommitments", importEntryId: "bankImports", transactionId: "transactions", sourceId: "financialCommitments" };
        for (const [field, target] of Object.entries(references)) if (row[field] && (field !== "sourceId" || row.sourceType === "financialCommitment")) {
          row[field] = bundle.ids[`${target}_${row[field]}`] ?? row[field];
        }
        if (table === "reminders") row.legacyReminderId = original.id;
        // A device may have downloaded the same bank import before migration.
        // Preserve its data rather than overwriting it with an older local copy.
        if (!await account.table(table).get(row.id)) await account.table(table).add(row);
      }
      await account.syncMeta.put({ key: "legacyImported", value: true });
    });
  } finally { legacy.close(); }
}
