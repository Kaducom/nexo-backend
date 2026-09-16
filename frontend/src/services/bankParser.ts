import type { BankCandidate } from "../types";

export const bankCategories = ["Alimentação", "Combustível", "Casa", "Compras", "Lazer", "Salário", "Transferência", "Assinaturas", "Contas", "Outros"];
export const normalizeMerchant = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function parseMoney(input: string): number {
  let value = input.trim().replace(/^R\$\s*/, "").replace(/\s/g, "");
  if (value.includes(",")) {
    if (!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(value)) throw new Error("Valor monetário inválido.");
    value = value.replace(/\./g, "").replace(",", ".");
  } else if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(value)) throw new Error("Valor monetário inválido.");
  const amount = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(amount) || Math.abs(amount) > 999999999.99 || amount === 0) throw new Error("O valor deve ser diferente de zero e estar dentro do limite.");
  return amount;
}

export function parseBankDate(input: string): string {
  const value = input.trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(value)
    ?? /^(\d{4})(\d{2})(\d{2})(?:\d{6}(?:\.\d+)?(?:\[[^\]]+\])?)?$/.exec(value)
    ?? (br ? [br[0], br[3], br[2], br[1]] : null);
  if (!match) throw new Error("Data inválida. Use AAAA-MM-DD.");
  const [year, month, day] = match.slice(1, 4).map(Number);
  const date = new Date(year, month - 1, day, 12);
  if (year < 1900 || year > 2200 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw new Error("Data inexistente.");
  if (/^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isFinite(Date.parse(value))) throw new Error("Horário inválido.");
  // Bank statement calendar dates stay stable if the device changes time zone.
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T15:00:00.000Z`;
}

export function needsReview(description: string, type: BankCandidate["type"]): string | undefined {
  if (type === "income") return "Confira se é receita, transferência ou estorno antes de lançar.";
  if (/\b(fatura|pagamento recebido|estorno|reembolso|transferencia|pix|saldo|rendimento)\b/.test(normalizeMerchant(description))) return "Confira transferências, pagamentos de fatura e ajustes para não contar o mesmo dinheiro duas vezes.";
}

function candidate(source: BankCandidate["source"], account: BankCandidate["account"], externalKey: string, description: string, signedAmount: number, date: string, cardCsv = false): BankCandidate {
  const clean = description.trim();
  if (!clean || clean.length > 500 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(clean)) throw new Error("Descrição ausente ou inválida.");
  const type = (cardCsv ? signedAmount > 0 : signedAmount < 0) ? "expense" : "income";
  return { source, account, externalKey, description: clean, amount: Math.abs(signedAmount), type, occurredAt: parseBankDate(date), reviewReason: needsReview(clean, type) };
}

function decodeEntities(text: string): string {
  return text.replace(/&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi, (full, code, named) => {
    if (code) {
      const n = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : full;
    }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[named.toLowerCase()];
  });
}

function tag(block: string, name: string): string {
  return decodeEntities(new RegExp(`<${name}\\s*>\\s*([^<]*)`, "i").exec(block)?.[1]?.trim() ?? "");
}

export type ParsedBankFile = { rows: BankCandidate[]; errors: string[]; account: BankCandidate["account"]; format: "ofx" | "csv" };

export function parseOfx(text: string): ParsedBankFile {
  if (!/<OFX[\s>]/i.test(text)) throw new Error("Este arquivo não contém um extrato OFX.");
  const statements = [...text.matchAll(/<(STMTRS|CCSTMTRS)\s*>([\s\S]*?)<\/\1\s*>/gi)];
  if (statements.length !== 1) throw new Error("Importe um extrato de uma única conta ou cartão por vez.");
  const block = statements[0][2];
  if (tag(block, "CURDEF").toUpperCase() !== "BRL") throw new Error("Somente extratos em reais (BRL) são aceitos.");
  const account = statements[0][1].toUpperCase() === "CCSTMTRS" ? "card" : "account";
  const accountId = tag(block, "ACCTID");
  if (!accountId) throw new Error("O OFX não informa a identificação da conta.");
  const scope = JSON.stringify([account, tag(block, "BANKID"), accountId]);
  const rows: BankCandidate[] = [];
  const errors: string[] = [];
  const blocks = [...block.matchAll(/<STMTTRN\s*>([\s\S]*?)(?:<\/STMTTRN\s*>|(?=<STMTTRN\s*>|<\/BANKTRANLIST\s*>))/gi)];
  if (!blocks.length) throw new Error("Nenhuma movimentação encontrada no OFX.");
  if (blocks.length !== (block.match(/<STMTTRN\s*>/gi) ?? []).length) throw new Error("OFX incompleto: há movimentações sem fechamento.");
  for (const [index, entry] of blocks.entries()) {
    try {
      const item = entry[1];
      const id = tag(item, "FITID");
      if (!id || id.length > 200) throw new Error("Identificador FITID ausente ou inválido.");
      rows.push(candidate("ofx", account, JSON.stringify(["ofx", scope, id]), tag(item, "MEMO") || tag(item, "NAME"), parseMoney(tag(item, "TRNAMT")), tag(item, "DTPOSTED")));
    } catch (error) { errors.push(`Movimentação ${index + 1}: ${(error as Error).message}`); }
  }
  return { rows, errors, account, format: "ofx" };
}

// RFC 4180-style tokenizer: quoted delimiters/newlines and escaped quotes.
function csvRecords(text: string, separator: string): string[][] {
  const records: string[][] = []; let record: string[] = []; let field = ""; let quoted = false; let closed = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += char;
    } else if (char === '"') {
      if (field || closed) throw new Error("CSV com aspas em posição inválida.");
      quoted = true;
    } else if (char === separator) { record.push(field); field = ""; closed = false; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      record.push(field); if (record.some(v => v.trim())) records.push(record); record = []; field = ""; closed = false;
    } else { if (closed && char.trim()) throw new Error("CSV inválido após aspas."); if (!closed) field += char; }
  }
  if (quoted) throw new Error("CSV contém aspas sem fechamento.");
  record.push(field); if (record.some(v => v.trim())) records.push(record);
  return records;
}

export function parseCsv(text: string, account: BankCandidate["account"]): ParsedBankFile {
  const firstLine = text.split(/\r?\n/)[0];
  const separator = firstLine.includes(";") ? ";" : ",";
  const [header, ...records] = csvRecords(text.replace(/^\uFEFF/, ""), separator);
  if (!header || !records.length) throw new Error("CSV vazio ou sem movimentações.");
  const headings = header.map(normalizeMerchant);
  const column = (...names: string[]) => headings.findIndex(h => names.includes(h));
  const date = column("data", "date"); const description = column("descricao", "description", "title"); const amount = column("valor", "amount"); const id = column("identificador", "id");
  const currency = column("moeda", "currency");
  if ([date, description, amount].includes(-1)) throw new Error("Colunas esperadas: Data, Valor, Descrição (conta) ou date, title, amount (cartão).");
  const rows: BankCandidate[] = []; const errors: string[] = []; const occurrences = new Map<string, number>();
  records.forEach((record, index) => {
    try {
      if (record.length !== header.length) throw new Error("Quantidade de colunas diferente do cabeçalho.");
      if (currency >= 0 && record[currency].trim().toUpperCase() !== "BRL") throw new Error("Somente valores em BRL são aceitos.");
      const row = candidate("csv", account, "", record[description], parseMoney(record[amount]), record[date], account === "card");
      const base = JSON.stringify([account, row.occurredAt, row.type, row.amount, normalizeMerchant(row.description)]);
      const occurrence = (occurrences.get(base) ?? 0) + 1; occurrences.set(base, occurrence);
      row.externalKey = id >= 0 && record[id].trim() ? JSON.stringify(["csv", account, record[id].trim()]) : JSON.stringify(["csv", base, occurrence]);
      rows.push(row);
    } catch (error) { errors.push(`Linha de dados ${index + 1}: ${(error as Error).message}`); }
  });
  return { rows, errors, account, format: "csv" };
}

export async function readBankFile(file: File, account: BankCandidate["account"]): Promise<ParsedBankFile> {
  if (file.size > 5 * 1024 * 1024) throw new Error("O arquivo deve ter até 5 MB.");
  if (!/\.(ofx|csv)$/i.test(file.name)) throw new Error("Escolha um arquivo OFX ou CSV. PDF não é aceito.");
  const buffer = await file.arrayBuffer(); let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
  catch { text = new TextDecoder("windows-1252").decode(buffer); }
  const result = /\.ofx$/i.test(file.name) ? parseOfx(text) : parseCsv(text, account);
  if (result.rows.length > 5000) throw new Error("Importe no máximo 5.000 movimentações por arquivo.");
  return result;
}

export function parseShortcut(hash: string): { token: string; candidate: BankCandidate } {
  if (hash.length > 8000) throw new Error("Dados do Atalho excedem o tamanho permitido.");
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const raw = JSON.parse(params.get("payload") ?? "null");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("O Atalho deve enviar um dicionário JSON.");
  if (raw.currency !== "BRL") throw new Error("O Atalho deve informar currency = BRL. Moedas estrangeiras não são convertidas.");
  if (typeof raw.id !== "string" || !/^[\w-]{8,100}$/.test(raw.id)) throw new Error("Inclua um UUID em id para evitar duplicidades.");
  if (typeof raw.merchant !== "string" || typeof raw.date !== "string" || !["number", "string"].includes(typeof raw.amount)) throw new Error("Informe estabelecimento, data e valor no Atalho.");
  const amount = parseMoney(String(raw.amount));
  if (amount <= 0) throw new Error("O Atalho aceita somente compras com valor positivo.");
  const row = candidate("shortcut", "card", `shortcut:${raw.id}`, raw.merchant, -amount, raw.date);
  return { token: params.get("key") ?? "", candidate: row };
}
