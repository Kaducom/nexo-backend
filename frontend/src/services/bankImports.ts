import { db } from "../db";
import type { BankCandidate, BankImportEntry } from "../types";
import { bankCategories, needsReview, normalizeMerchant } from "./bankParser";

export const ruleKey = (row: BankCandidate) => JSON.stringify([row.account, row.type, normalizeMerchant(row.description)]);
const bankDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const duplicateKey = (row: Pick<BankCandidate, "occurredAt" | "amount" | "type">) => JSON.stringify([bankDay.format(new Date(row.occurredAt)), row.type, row.amount]);

async function postEntry(row: BankImportEntry, category: string) {
  if (!row.id || row.status !== "pending") throw new Error("Esta movimentação já foi tratada.");
  const transactionId = await db.transactions.add({
    description: row.description, amount: row.amount, type: row.type, category,
    occurredAt: row.occurredAt, createdAt: new Date().toISOString(), importEntryId: row.id,
  });
  await db.bankImports.update(row.id, { status: "posted", category, transactionId });
}

export async function ingestBankRows(rows: BankCandidate[]) {
  if (!rows.length || rows.length > 5000) throw new Error("Selecione entre 1 e 5.000 movimentações.");
  return db.transaction("rw", db.bankImports, db.bankRules, db.transactions, async () => {
    const counts = { pending: 0, posted: 0, duplicates: 0 };
    const [existing, transactions, rules] = await Promise.all([db.bankImports.toArray(), db.transactions.toArray(), db.bankRules.toArray()]);
    const byKey = new Map(existing.map(row => [row.externalKey, row]));
    const rulesByKey = new Map(rules.map(rule => [rule.matchKey, rule]));
    const possibleDuplicates = new Map([...transactions, ...existing.filter(row => row.status !== "ignored")].map(row => [duplicateKey(row), row.description]));
    for (const input of rows) {
      if (!Number.isFinite(input.amount) || input.amount <= 0 || !input.description.trim() || !Number.isFinite(Date.parse(input.occurredAt))) throw new Error("Movimentação inválida.");
      const duplicate = byKey.get(input.externalKey);
      if (duplicate) {
        if (duplicate.amount !== input.amount || duplicate.type !== input.type || duplicate.description !== input.description || duplicate.occurredAt !== input.occurredAt) throw new Error("Um identificador já importado veio com dados diferentes. Confira o arquivo; nada deste lote foi salvo.");
        counts.duplicates++; continue;
      }
      // Approximate matches are reviewed, never silently discarded. This also
      // catches an OFX/CSV overlapping an Apple Pay or manually entered expense.
      const possible = possibleDuplicates.get(duplicateKey(input));
      const duplicateWarning = possible ? `Já existe uma movimentação de mesmo valor e data: “${possible}”. Confira se é a mesma compra.` : undefined;
      const row: BankImportEntry = {
        source: input.source, account: input.account, externalKey: input.externalKey,
        description: input.description, amount: input.amount, type: input.type, occurredAt: input.occurredAt,
        reviewReason: needsReview(input.description, input.type), status: "pending", createdAt: new Date().toISOString(), duplicateWarning,
      };
      row.id = await db.bankImports.add(row);
      const rule = rulesByKey.get(ruleKey(input));
      if (rule && bankCategories.includes(rule.category) && !row.reviewReason && !duplicateWarning) {
        await postEntry(row, rule.category); row.status = "posted"; counts.posted++;
      } else counts.pending++;
      existing.push(row); byKey.set(input.externalKey, row);
      possibleDuplicates.set(duplicateKey(input), input.description);
    }
    return counts;
  });
}

export async function classifyBankEntry(id: number, category: string, remember: boolean, confirmedSeparate: boolean) {
  if (!bankCategories.includes(category)) throw new Error("Escolha uma categoria válida.");
  await db.transaction("rw", db.bankImports, db.bankRules, db.transactions, async () => {
    const row = await db.bankImports.get(id);
    if (!row || row.status !== "pending") throw new Error("Esta movimentação já foi tratada.");
    if (row.duplicateWarning && !confirmedSeparate) throw new Error("Confirme que esta é uma movimentação diferente ou descarte a duplicata.");
    await postEntry(row, category);
    if (remember && !row.reviewReason) {
      const matchKey = ruleKey(row);
      const current = await db.bankRules.where("matchKey").equals(matchKey).first();
      await db.bankRules.put({ ...current, matchKey, description: row.description, category, createdAt: new Date().toISOString() });
    }
  });
}

export async function ignoreBankEntry(id: number) {
  await db.transaction("rw", db.bankImports, async () => {
    const row = await db.bankImports.get(id);
    if (row?.status === "pending") await db.bankImports.update(id, { status: "ignored" });
  });
}

export async function reopenBankEntry(id: number) {
  await db.transaction("rw", db.bankImports, db.transactions, async () => {
    const row = await db.bankImports.get(id);
    if (!row || row.status === "pending") return;
    if (row.transactionId) {
      const transaction = await db.transactions.get(row.transactionId);
      if (transaction?.importEntryId === row.id) await db.transactions.delete(row.transactionId);
    }
    await db.bankImports.update(id, { status: "pending", transactionId: undefined, category: undefined });
  });
}

const tokenKey = (uid: string) => `nexo-shortcut-key:${uid}`;
export function getShortcutKey(uid: string) {
  try { return localStorage.getItem(tokenKey(uid)); } catch { return null; }
}
export function createShortcutKey(uid: string) {
  const key = crypto.randomUUID() + crypto.randomUUID();
  localStorage.setItem(tokenKey(uid), key); return key;
}
export function revokeShortcutKey(uid: string) { localStorage.removeItem(tokenKey(uid)); }
export function authorizeShortcut(uid: string, key: string) {
  if (!key || key !== getShortcutKey(uid)) throw new Error("Atalho não autorizado neste navegador. Abra a configuração no mesmo Safari usado pelo Atalho e copie uma nova chave.");
}
