export const syncedTables = ["memories", "reminders", "transactions", "financialCommitments", "bankImports", "bankRules"] as const;
export type SyncedTable = typeof syncedTables[number];
export type RecordData = { id: number; [key: string]: unknown };
export type CloudRecord = {
  key: string;
  table: SyncedTable;
  id: number;
  revision: number;
  changeId: string;
  deviceId: string;
  deleted: boolean;
  payload: RecordData | null;
};
export type PendingChange = Omit<CloudRecord, "revision" | "deviceId"> & {
  baseRevision: number;
  conflict?: CloudRecord;
};
export type SyncVersion = { key: string; revision: number };
export type SyncMeta = { key: string; value: unknown };

export function randomId(): number {
  const values = crypto.getRandomValues(new Uint32Array(2));
  return ((values[0] & 0x1fffff) * 4294967296 + values[1]) || 1;
}

// Stable 53-bit identifiers keep bank imports/rules consistent on all devices.
export function stableId(text: string): number {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    h1 = Math.imul(h1 ^ text.charCodeAt(i), 2654435761);
    h2 = Math.imul(h2 ^ text.charCodeAt(i), 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)) || 1;
}

export function newRecordId(table: SyncedTable, value: Record<string, unknown>): number {
  if (table === "bankImports") return stableId(`bankImports:${value.externalKey}`);
  if (table === "bankRules") return stableId(`bankRules:${value.matchKey}`);
  if (table === "transactions" && value.importEntryId) return stableId(`bankTransaction:${value.importEntryId}`);
  if (table === "reminders" && value.sourceType === "financialCommitment" && value.sourceId) return stableId(`commitmentReminder:${value.sourceId}`);
  return randomId();
}

export function validCloudRecord(value: unknown): value is CloudRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as CloudRecord;
  return syncedTables.includes(r.table) && Number.isSafeInteger(r.id) && r.id > 0 && r.key === `${r.table}_${r.id}`
    && Number.isInteger(r.revision) && r.revision > 0 && typeof r.changeId === "string" && typeof r.deviceId === "string"
    && typeof r.deleted === "boolean" && (r.deleted ? r.payload === null : !!r.payload && r.payload.id === r.id);
}
