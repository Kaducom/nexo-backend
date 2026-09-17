import { stableId } from "../sync/model";
import { db } from "../db";

import {
  mirrorReminderDeleteMany,
  mirrorReminderUpsert
} from "./reminderSync";

import type {
  FinancialCommitment,
  FinancialCommitmentFrequency
} from "../types";

/*
 * =========================================================
 * NEXO — FINANCIAL COMMITMENTS SERVICE
 * =========================================================
 *
 * Responsável pelas regras de negócio dos compromissos
 * financeiros.
 *
 * Este serviço pode ser utilizado futuramente por:
 *
 * - FinancePage
 * - HomePage
 * - RemindersPage
 * - IA do NEXO
 * - comandos de voz
 * - Alexa
 * - notificações push
 */

/*
 * =========================================================
 * DATAS
 * =========================================================
 */

function addDays(date: Date, days: number) {
  const result = new Date(date);

  result.setDate(result.getDate() + days);

  return result;
}

function addMonth(date: Date) {
  const result = new Date(date);

  const originalDay = result.getDate();

  result.setDate(1);

  result.setMonth(
    result.getMonth() + 1
  );

  const lastDayOfTargetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0
  ).getDate();

  result.setDate(
    Math.min(
      originalDay,
      lastDayOfTargetMonth
    )
  );

  return result;
}

/*
 * Calcula a próxima ocorrência.
 */

export function calculateNextPaymentDate(
  currentDate: string,
  frequency: FinancialCommitmentFrequency,
  intervalDays?: number
) {
  const current = new Date(currentDate);

  switch (frequency) {
    case "weekly":
      return addDays(
        current,
        7
      ).toISOString();

    case "biweekly":
      return addDays(
        current,
        15
      ).toISOString();

    case "monthly":
      return addMonth(
        current
      ).toISOString();

    case "custom":
      return addDays(
        current,
        Math.max(
          1,
          intervalDays ?? 1
        )
      ).toISOString();

    default:
      return current.toISOString();
  }
}

/*
 * =========================================================
 * DATA DO LEMBRETE
 * =========================================================
 *
 * Exemplo:
 *
 * pagamento:
 * 20/08 às 12:00
 *
 * reminderMinutesBefore:
 * 1440
 *
 * resultado:
 * 19/08 às 12:00
 */

export function calculateReminderDate(
  paymentDate: string,
  minutesBefore: number
) {
  const date = new Date(paymentDate);

  date.setMinutes(
    date.getMinutes() - minutesBefore
  );

  return date.toISOString();
}

/*
 * =========================================================
 * SINCRONIZAR LEMBRETE
 * =========================================================
 *
 * Garante que exista apenas UM lembrete ativo relacionado
 * ao próximo pagamento do compromisso.
 */

export async function syncFinancialCommitmentReminder(
  commitment: FinancialCommitment
) {
  if (!commitment.id) {
    return;
  }

  /*
   * Procura lembretes ligados ao compromisso.
   */

  const linkedReminders =
    await db.reminders
      .where("sourceId")
      .equals(commitment.id)
      .filter(
        (reminder) =>
          reminder.sourceType ===
          "financialCommitment"
      )
      .toArray();

  /*
   * Se o compromisso não estiver mais ativo
   * ou não possuir aviso configurado,
   * removemos lembretes automáticos pendentes.
   */

  if (
    commitment.status !== "active" ||
    commitment.reminderMinutesBefore === null
  ) {
    const idsToDelete = linkedReminders
      .filter(
        (reminder) =>
          !reminder.completed &&
          reminder.id !== undefined
      )
      .map(
        (reminder) =>
          reminder.id as number
      );

    if (idsToDelete.length) {
      await db.reminders.bulkDelete(
        idsToDelete
      );

      void mirrorReminderDeleteMany(
        idsToDelete
      );
    }

    return;
  }

  const startsAt =
    calculateReminderDate(
      commitment.nextPaymentAt,
      commitment.reminderMinutesBefore
    );

  const now =
    new Date().toISOString();

  /*
   * Procuramos um lembrete ainda pendente.
   */

  const existing =
    linkedReminders.find(
      (reminder) =>
        !reminder.completed
    );

  /*
   * Se já existir, apenas atualizamos.
   *
   * Assim não criamos lembretes duplicados.
   */

  if (existing?.id) {
    await db.reminders.update(
      existing.id,
      {
        title: commitment.title,

        notes:
          `Compromisso financeiro · ${commitment.category}`,

        startsAt,

        completed: false,

        sourceType:
          "financialCommitment",

        sourceId:
          commitment.id
      }
    );

    const updated =
      await db.reminders.get(existing.id);

    if (updated) {
      void mirrorReminderUpsert(updated);
    }

    return;
  }

  /*
   * Caso contrário, cria um novo.
   */

  await db.reminders.add({
    title: commitment.title,

    notes:
      `Compromisso financeiro · ${commitment.category}`,

    startsAt,

    completed: false,

    sourceType:
      "financialCommitment",

    sourceId:
      commitment.id,

    createdAt: now
  });

  const linkedReminder =
    await db.reminders
      .where("sourceId")
      .equals(commitment.id)
      .filter(
        (reminder) =>
          reminder.sourceType ===
            "financialCommitment" &&
          !reminder.completed
      )
      .first();

  if (linkedReminder) {
    void mirrorReminderUpsert(linkedReminder);
  }
}

/*
 * =========================================================
 * CRIAR COMPROMISSO
 * =========================================================
 *
 * Esta função passa a ser a forma oficial de criar
 * compromissos financeiros.
 *
 * A interface não deverá adicionar diretamente na tabela.
 */

export async function createFinancialCommitment(
  data: Omit<
    FinancialCommitment,
    "id" | "createdAt" | "updatedAt"
  >
) {
  const now =
    new Date().toISOString();

let commitmentId = 0;

await db.transaction(
  "rw",
  db.financialCommitments,
  db.reminders,
  async () => {
    const createdId =
      await db.financialCommitments.add({
        ...data,

        createdAt: now,

        updatedAt: now
      });

    if (createdId === undefined) {
      throw new Error(
        "Não foi possível obter o ID do compromisso financeiro criado."
      );
    }

    commitmentId = createdId;

    const commitment =
      await db.financialCommitments.get(
        commitmentId
      );

    if (commitment) {
      await syncFinancialCommitmentReminder(
        commitment
      );
    }
  }
);

return commitmentId;
}

/*
 * =========================================================
 * MARCAR COMO PAGO
 * =========================================================
 */

export async function markFinancialCommitmentAsPaid(
  commitment: FinancialCommitment
) {
  if (!commitment.id) {
    throw new Error(
      "Compromisso financeiro sem ID."
    );
  }

  if (commitment.status !== "active") {
    return;
  }

  const now =
    new Date().toISOString();

  const nextCompletedPayments =
    commitment.completedPayments + 1;

  const finished =
    commitment.totalPayments !== null &&
    nextCompletedPayments >=
      commitment.totalPayments;

  const nextPaymentAt =
    finished
      ? commitment.nextPaymentAt
      : calculateNextPaymentDate(
          commitment.nextPaymentAt,
          commitment.frequency,
          commitment.intervalDays
        );

  await db.transaction(
    "rw",
    db.transactions,
    db.financialCommitments,
    db.reminders,
    async () => {
      /*
       * Registra o pagamento como uma saída REAL.
       */

      await db.transactions.add({
        id: stableId(`commitmentPayment:${commitment.id}:${nextCompletedPayments}`),
        description:
          commitment.title,

        amount:
          commitment.amount,

        type:
          "expense",

        category:
          commitment.category,

        occurredAt:
          now,

        createdAt:
          now,

        financialCommitmentId:
          commitment.id
      });

      /*
       * Atualiza o compromisso.
       */

      await db.financialCommitments.update(
        commitment.id!,
        {
          completedPayments:
            nextCompletedPayments,

          nextPaymentAt,

          status:
            finished
              ? "completed"
              : "active",

          updatedAt:
            now
        }
      );

      /*
       * Busca a versão atualizada.
       */

      const updatedCommitment =
        await db.financialCommitments.get(
          commitment.id!
        );

      if (updatedCommitment) {
        /*
         * Sincroniza o lembrete.
         *
         * Se terminou:
         * remove o lembrete pendente.
         *
         * Se continua:
         * move o lembrete para a próxima ocorrência.
         */

        await syncFinancialCommitmentReminder(
          updatedCommitment
        );
      }
    }
  );
}

/*
 * =========================================================
 * PAUSAR
 * =========================================================
 */

export async function pauseFinancialCommitment(
  id: number
) {
  await db.transaction(
    "rw",
    db.financialCommitments,
    db.reminders,
    async () => {
      await db.financialCommitments.update(
        id,
        {
          status: "paused",

          updatedAt:
            new Date().toISOString()
        }
      );

      const commitment =
        await db.financialCommitments.get(id);

      if (commitment) {
        await syncFinancialCommitmentReminder(
          commitment
        );
      }
    }
  );
}

/*
 * =========================================================
 * REATIVAR
 * =========================================================
 */

export async function resumeFinancialCommitment(
  id: number
) {
  await db.transaction(
    "rw",
    db.financialCommitments,
    db.reminders,
    async () => {
      await db.financialCommitments.update(
        id,
        {
          status: "active",

          updatedAt:
            new Date().toISOString()
        }
      );

      const commitment =
        await db.financialCommitments.get(id);

      if (commitment) {
        await syncFinancialCommitmentReminder(
          commitment
        );
      }
    }
  );
}

/*
 * =========================================================
 * CANCELAR
 * =========================================================
 */

export async function cancelFinancialCommitment(
  id: number
) {
  await db.transaction(
    "rw",
    db.financialCommitments,
    db.reminders,
    async () => {
      await db.financialCommitments.update(
        id,
        {
          status: "cancelled",

          updatedAt:
            new Date().toISOString()
        }
      );

      const commitment =
        await db.financialCommitments.get(id);

      if (commitment) {
        await syncFinancialCommitmentReminder(
          commitment
        );
      }
    }
  );
}

/*
 * =========================================================
 * EXCLUIR
 * =========================================================
 *
 * Excluir um compromisso NÃO exclui movimentações que já
 * foram pagas.
 *
 * Apenas os lembretes automáticos relacionados são
 * removidos.
 */

export async function deleteFinancialCommitment(
  id: number
) {
  await db.transaction(
    "rw",
    db.financialCommitments,
    db.reminders,
    async () => {
      const linkedReminders =
        await db.reminders
          .where("sourceId")
          .equals(id)
          .filter(
            (reminder) =>
              reminder.sourceType ===
              "financialCommitment"
          )
          .toArray();

      const reminderIds =
        linkedReminders
          .filter(
            (reminder) =>
              reminder.id !== undefined
          )
          .map(
            (reminder) =>
              reminder.id as number
          );

      if (reminderIds.length) {
        await db.reminders.bulkDelete(
          reminderIds
        );

        void mirrorReminderDeleteMany(
          reminderIds
        );
      }

      await db.financialCommitments.delete(
        id
      );
    }
  );
}