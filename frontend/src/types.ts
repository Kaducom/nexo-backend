export type Memory = {
  id?: number;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

/*
 * =========================================================
 * LEMBRETES
 * =========================================================
 */

export type ReminderSourceType =
  | "manual"
  | "financialCommitment";

export type Reminder = {
  id?: number;

  title: string;
  notes: string;

  startsAt: string;

  completed: boolean;

  /*
   * Origem do lembrete.
   *
   * manual:
   * criado diretamente pelo usuário.
   *
   * financialCommitment:
   * criado automaticamente por um compromisso financeiro.
   */
  sourceType?: ReminderSourceType;

  /*
   * ID da entidade que originou o lembrete.
   *
   * Exemplo:
   *
   * sourceType = "financialCommitment"
   * sourceId = 4
   */
  sourceId?: number;

  createdAt: string;
};

/*
 * =========================================================
 * FINANÇAS
 * =========================================================
 */

export type TransactionType =
  | "income"
  | "expense";

export type FinanceTransaction = {
  id?: number;

  description: string;

  amount: number;

  type: TransactionType;

  category: string;

  occurredAt: string;

  createdAt: string;

  /*
   * Caso a movimentação tenha sido gerada por
   * um compromisso financeiro.
   */
  financialCommitmentId?: number;
  importEntryId?: number;
};

export type BankCandidate = {
  source: "ofx" | "csv" | "shortcut";
  account: "account" | "card";
  externalKey: string;
  description: string;
  amount: number;
  type: TransactionType;
  occurredAt: string;
  reviewReason?: string;
};

export type BankImportEntry = BankCandidate & {
  id?: number;
  status: "pending" | "posted" | "ignored";
  createdAt: string;
  transactionId?: number;
  category?: string;
  duplicateWarning?: string;
};

export type BankCategoryRule = {
  id?: number;
  matchKey: string;
  description: string;
  category: string;
  createdAt: string;
};

/*
 * =========================================================
 * COMPROMISSOS FINANCEIROS
 * =========================================================
 */

export type FinancialCommitmentFrequency =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "custom";

export type FinancialCommitmentStatus =
  | "active"
  | "completed"
  | "paused"
  | "cancelled";

export type FinancialCommitmentPaymentMethod =
  | "pix"
  | "boleto"
  | "transfer"
  | "cash"
  | "card"
  | "other";

export type FinancialCommitment = {
  id?: number;

  title: string;

  amount: number;

  category: string;

  paymentMethod: FinancialCommitmentPaymentMethod;

  frequency: FinancialCommitmentFrequency;

  /*
   * Usado quando frequency === "custom".
   *
   * Exemplo:
   * a cada 20 dias.
   */
  intervalDays?: number;

  /*
   * null = recorrência sem fim definido.
   *
   * Exemplo:
   * assinatura mensal.
   */
  totalPayments: number | null;

  /*
   * Quantos pagamentos já foram realizados.
   */
  completedPayments: number;

  /*
   * Data do próximo pagamento.
   */
  nextPaymentAt: string;

  /*
   * Quantos minutos antes o NEXO deve avisar.
   *
   * null = sem lembrete.
   */
  reminderMinutesBefore: number | null;

  status: FinancialCommitmentStatus;

  notes: string;

  createdAt: string;

  updatedAt: string;
};
