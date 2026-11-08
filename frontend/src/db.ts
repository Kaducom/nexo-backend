import type {FinancePlan,FinanceOccurrence,FinanceHistory,FinanceSettings} from "./finance/model";
import Dexie, {
  type Table,
  type EntityTable
} from "dexie";

import { installOutbox } from "./sync/outbox";
import type { PendingChange, SyncVersion, SyncMeta } from "./sync/model";

import type {
  BankImportEntry,
  BankCategoryRule,
  FinanceTransaction,
  FinancialCommitment,
  Memory,
  Reminder
} from "./types";

export type NexoDatabase = Dexie & {
  financePlans: EntityTable<FinancePlan,"id">;
  financeOccurrences: EntityTable<FinanceOccurrence,"id">;
  financeHistory: EntityTable<FinanceHistory,"id">;
  financeSettings: EntityTable<FinanceSettings,"id">;
  syncOutbox: Table<PendingChange, string>;
  syncVersions: Table<SyncVersion, string>;
  syncMeta: Table<SyncMeta, string>;
  bankImports: EntityTable<BankImportEntry, "id">;
  bankRules: EntityTable<BankCategoryRule, "id">;
  memories: EntityTable<Memory, "id">;

  reminders: EntityTable<Reminder, "id">;

  transactions: EntityTable<
    FinanceTransaction,
    "id"
  >;

  financialCommitments: EntityTable<
    FinancialCommitment,
    "id"
  >;
};



export function createNexoDatabase(name: string, sync = false): NexoDatabase {
const db = new Dexie(name) as NexoDatabase;
/*
 * =========================================================
 * NEXO DATABASE — VERSION 1
 * =========================================================
 *
 * Estrutura original.
 */

db.version(1).stores({
  memories:
    "++id,title,*tags,createdAt,updatedAt",

  reminders:
    "++id,title,startsAt,completed,createdAt",

  transactions:
    "++id,type,category,occurredAt,createdAt"
});

/*
 * =========================================================
 * NEXO DATABASE — VERSION 2
 * =========================================================
 *
 * Adicionou:
 *
 * - Compromissos financeiros
 * - vínculo opcional entre transações e compromissos
 */

db.version(2).stores({
  memories:
    "++id,title,*tags,createdAt,updatedAt",

  reminders:
    "++id,title,startsAt,completed,createdAt",

  transactions:
    "++id,type,category,occurredAt,createdAt,financialCommitmentId",

  financialCommitments:
    "++id,status,nextPaymentAt,frequency,paymentMethod,createdAt"
});

/*
 * =========================================================
 * NEXO DATABASE — VERSION 3
 * =========================================================
 *
 * Adiciona origem aos lembretes.
 *
 * Agora um lembrete pode estar relacionado a outro
 * módulo do NEXO.
 *
 * Exemplos futuros:
 *
 * financialCommitment
 * medication
 * subscription
 * document
 * automation
 */

db.version(3).stores({
  memories:
    "++id,title,*tags,createdAt,updatedAt",

  reminders:
    "++id,title,startsAt,completed,sourceType,sourceId,createdAt",

  transactions:
    "++id,type,category,occurredAt,createdAt,financialCommitmentId",

  financialCommitments:
    "++id,status,nextPaymentAt,frequency,paymentMethod,createdAt"
});

// Additive migration: existing finances and reminders are preserved.
db.version(4).stores({
  bankImports: "++id,&externalKey,status,occurredAt,createdAt",
  bankRules: "++id,&matchKey",
});

db.version(5).stores({ syncOutbox: "key,table", syncVersions: "key", syncMeta: "key" });
// v6 is additive: old monetary values remain in reais, untouched.
db.version(6).stores({financePlans:"++id,kind,status,startDate",financeOccurrences:"++id,planId,[planId+index],state,dueDate",financeHistory:"++id,planId,occurrenceId,legacyId,transactionId,at",financeSettings:"++id"});
if (sync) installOutbox(db);
return db;
}

export let db = createNexoDatabase("NexoDB");
export function bindAccountDatabase(database: NexoDatabase) { db = database; }
