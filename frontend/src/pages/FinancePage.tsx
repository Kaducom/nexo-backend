import {
  FormEvent,
  useMemo,
  useRef,
  useState
} from "react";

import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer
} from "recharts";

import {
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Fuel,
  Home as HomeIcon,
  Pause,
  Play,
  Plus,
  Popcorn,
  Receipt,
  Repeat2,
  ShoppingBag,
  Trash2,
  UtensilsCrossed,
  WalletCards,
  Zap
} from "lucide-react";

import PageHeader from "../components/PageHeader";

import { db } from "../db";

import {
  cancelFinancialCommitment,
  createFinancialCommitment,
  deleteFinancialCommitment,
  markFinancialCommitmentAsPaid,
  pauseFinancialCommitment,
  resumeFinancialCommitment
} from "../services/financialCommitments";

import type {
  FinancialCommitmentFrequency,
  FinancialCommitmentPaymentMethod,
  TransactionType
} from "../types";

import {
  formatDateTime,
  formatMoney
} from "../utils";

/*
 * =========================================================
 * CONFIGURAÇÕES
 * =========================================================
 */

const categories = [
  "Alimentação",
  "Combustível",
  "Casa",
  "Compras",
  "Lazer",
  "Salário",
  "Transferência",
  "Assinaturas",
  "Contas",
  "Outros"
];

/*
 * Subconjunto usado no registro rápido de gasto do dia —
 * só as categorias que fazem sentido para um gasto do
 * cotidiano (fora salário/transferência).
 */
const quickExpenseCategories = [
  { name: "Alimentação", icon: UtensilsCrossed },
  { name: "Combustível", icon: Fuel },
  { name: "Casa", icon: HomeIcon },
  { name: "Compras", icon: ShoppingBag },
  { name: "Lazer", icon: Popcorn },
  { name: "Contas", icon: Receipt },
  { name: "Outros", icon: Zap }
];

const consumptionChartColors = [
  "var(--nexo-primary)",
  "var(--nexo-surface-3)"
];

const frequencyLabels: Record<
  FinancialCommitmentFrequency,
  string
> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  custom: "Personalizado"
};

const paymentMethodLabels: Record<
  FinancialCommitmentPaymentMethod,
  string
> = {
  pix: "Pix",
  boleto: "Boleto",
  transfer: "Transferência",
  cash: "Dinheiro",
  card: "Cartão",
  other: "Outro"
};

const reminderOptions = [
  {
    label: "Sem aviso",
    value: ""
  },
  {
    label: "No horário",
    value: "0"
  },
  {
    label: "1 hora antes",
    value: "60"
  },
  {
    label: "2 horas antes",
    value: "120"
  },
  {
    label: "1 dia antes",
    value: "1440"
  },
  {
    label: "2 dias antes",
    value: "2880"
  },
  {
    label: "1 semana antes",
    value: "10080"
  }
];

/*
 * =========================================================
 * HELPERS
 * =========================================================
 */

function todayValue() {
  const date = new Date();

  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function dateToIsoAtNoon(value: string) {
  return new Date(
    `${value}T12:00:00`
  ).toISOString();
}

/*
 * =========================================================
 * PAGE
 * =========================================================
 */

export default function FinancePage() {
  const bankPendingCount = useLiveQuery(() => db.bankImports.where("status").equals("pending").count(), [], 0);
  /*
   * =======================================================
   * DATABASE
   * =======================================================
   */

  const transactions =
    useLiveQuery(
      () =>
        db.transactions
          .orderBy("occurredAt")
          .reverse()
          .toArray(),
      []
    ) ?? [];

  const commitments =
    useLiveQuery(
      () =>
        db.financialCommitments
          .orderBy("nextPaymentAt")
          .toArray(),
      []
    ) ?? [];

  /*
   * =======================================================
   * NAVEGAÇÃO INTERNA
   * =======================================================
   */

  const [activeTab, setActiveTab] =
    useState<
      "transactions" | "commitments"
    >("transactions");

  /*
   * =======================================================
   * NOVA MOVIMENTAÇÃO
   * =======================================================
   */

  const [type, setType] =
    useState<TransactionType>("expense");

  const [
    description,
    setDescription
  ] = useState("");

  const [amount, setAmount] =
    useState("");

  const [category, setCategory] =
    useState("Outros");

  const [
    occurredAt,
    setOccurredAt
  ] = useState(todayValue());

  /*
   * =======================================================
   * REGISTRO RÁPIDO DE GASTO DO DIA
   * =======================================================
   *
   * Um atalho para o caso mais comum: um gasto do dia a
   * dia. Toca na categoria, digita o valor, pronto — sem
   * abrir o formulário completo.
   */

  const [
    quickAmount,
    setQuickAmount
  ] = useState("");

  const [
    quickCategory,
    setQuickCategory
  ] = useState<string | null>(null);

  const [quickSaved, setQuickSaved] =
    useState(false);

  const quickAmountInputRef =
    useRef<HTMLInputElement | null>(null);

  async function submitQuickExpense(
    categoryName: string,
    rawAmount: string
  ) {
    const parsedAmount = Number(
      rawAmount.replace(",", ".")
    );

    if (!parsedAmount || parsedAmount <= 0) {
      quickAmountInputRef.current?.focus();

      return;
    }

    await db.transactions.add({
      description: categoryName,
      amount: parsedAmount,
      type: "expense",
      category: categoryName,
      occurredAt: dateToIsoAtNoon(todayValue()),
      createdAt: new Date().toISOString()
    });

    setQuickAmount("");
    setQuickCategory(null);
    setQuickSaved(true);

    window.setTimeout(() => {
      setQuickSaved(false);
    }, 1500);
  }

  function handleQuickCategoryClick(
    categoryName: string
  ) {
    setQuickCategory(categoryName);

    if (quickAmount.trim()) {
      void submitQuickExpense(
        categoryName,
        quickAmount
      );

      return;
    }

    quickAmountInputRef.current?.focus();
  }

  function handleQuickFormSubmit(
    event: FormEvent
  ) {
    event.preventDefault();

    if (!quickCategory) {
      return;
    }

    void submitQuickExpense(
      quickCategory,
      quickAmount
    );
  }

  /*
   * =======================================================
   * NOVO COMPROMISSO
   * =======================================================
   */

  const [
    commitmentTitle,
    setCommitmentTitle
  ] = useState("");

  const [
    commitmentAmount,
    setCommitmentAmount
  ] = useState("");

  const [
    commitmentCategory,
    setCommitmentCategory
  ] = useState("Outros");

  const [
    paymentMethod,
    setPaymentMethod
  ] =
    useState<FinancialCommitmentPaymentMethod>(
      "pix"
    );

  const [
    frequency,
    setFrequency
  ] =
    useState<FinancialCommitmentFrequency>(
      "monthly"
    );

  const [
    intervalDays,
    setIntervalDays
  ] = useState("15");

  const [
    firstPaymentDate,
    setFirstPaymentDate
  ] = useState(todayValue());

  const [
    hasPaymentLimit,
    setHasPaymentLimit
  ] = useState(true);

  const [
    totalPayments,
    setTotalPayments
  ] = useState("5");

  const [
    reminderMinutes,
    setReminderMinutes
  ] = useState("1440");

  const [
    commitmentNotes,
    setCommitmentNotes
  ] = useState("");

  /*
   * =======================================================
   * MOVIMENTAÇÃO MANUAL
   * =======================================================
   */

  async function handleSubmitTransaction(
    event: FormEvent
  ) {
    event.preventDefault();

    const parsedAmount = Number(
      amount.replace(",", ".")
    );

    if (
      !description.trim() ||
      !parsedAmount ||
      parsedAmount <= 0
    ) {
      return;
    }

    await db.transactions.add({
      description:
        description.trim(),

      amount:
        parsedAmount,

      type,

      category,

      occurredAt:
        dateToIsoAtNoon(
          occurredAt
        ),

      createdAt:
        new Date().toISOString()
    });

    setDescription("");
    setAmount("");
  }

  /*
   * =======================================================
   * CRIAR COMPROMISSO
   * =======================================================
   */

  async function handleSubmitCommitment(
    event: FormEvent
  ) {
    event.preventDefault();

    const parsedAmount = Number(
      commitmentAmount.replace(",", ".")
    );

    const parsedPayments =
      Number(totalPayments);

    const parsedInterval =
      Number(intervalDays);

    if (
      !commitmentTitle.trim() ||
      !parsedAmount ||
      parsedAmount <= 0 ||
      !firstPaymentDate
    ) {
      return;
    }

    if (
      hasPaymentLimit &&
      (
        !parsedPayments ||
        parsedPayments <= 0
      )
    ) {
      return;
    }

    if (
      frequency === "custom" &&
      (
        !parsedInterval ||
        parsedInterval <= 0
      )
    ) {
      return;
    }

    await createFinancialCommitment({
      title:
        commitmentTitle.trim(),

      amount:
        parsedAmount,

      category:
        commitmentCategory,

      paymentMethod,

      frequency,

      intervalDays:
        frequency === "custom"
          ? parsedInterval
          : undefined,

      totalPayments:
        hasPaymentLimit
          ? parsedPayments
          : null,

      completedPayments:
        0,

      nextPaymentAt:
        dateToIsoAtNoon(
          firstPaymentDate
        ),

      reminderMinutesBefore:
        reminderMinutes === ""
          ? null
          : Number(
              reminderMinutes
            ),

      status:
        "active",

      notes:
        commitmentNotes.trim()
    });

    /*
     * Limpa somente os campos que normalmente mudam
     * entre um compromisso e outro.
     */

    setCommitmentTitle("");
    setCommitmentAmount("");
    setCommitmentNotes("");

    setActiveTab(
      "commitments"
    );
  }

  /*
   * =======================================================
   * ESTATÍSTICAS
   * =======================================================
   */

  const stats = useMemo(() => {
    const income =
      transactions
        .filter(
          (item) =>
            item.type === "income"
        )
        .reduce(
          (sum, item) =>
            sum + item.amount,
          0
        );

    const expense =
      transactions
        .filter(
          (item) =>
            item.type === "expense"
        )
        .reduce(
          (sum, item) =>
            sum + item.amount,
          0
        );

    return {
      income,
      expense,
      balance:
        income - expense
    };
  }, [transactions]);

  /*
   * =======================================================
   * GASTOS POR CATEGORIA
   * =======================================================
   */

  const expensesByCategory =
    useMemo(() => {
      const map =
        new Map<
          string,
          number
        >();

      transactions
        .filter(
          (item) =>
            item.type ===
            "expense"
        )
        .forEach((item) => {
          map.set(
            item.category,
            (
              map.get(
                item.category
              ) ?? 0
            ) + item.amount
          );
        });

      return [
        ...map.entries()
      ].sort(
        (a, b) =>
          b[1] - a[1]
      );
    }, [transactions]);

  const maxCategory =
    expensesByCategory[0]?.[1] ??
    1;

  /*
   * =======================================================
   * CONSUMO DO MÊS (gráfico)
   * =======================================================
   */

  const monthlyConsumption = useMemo(() => {
    const now = new Date();

    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).getTime();

    const monthTransactions =
      transactions.filter(
        (item) =>
          new Date(item.occurredAt).getTime() >=
          monthStart
      );

    const spent = monthTransactions
      .filter((item) => item.type === "expense")
      .reduce((sum, item) => sum + item.amount, 0);

    const earned = monthTransactions
      .filter((item) => item.type === "income")
      .reduce((sum, item) => sum + item.amount, 0);

    const consumedRatio =
      earned > 0
        ? Math.min(spent / earned, 1)
        : spent > 0
          ? 1
          : 0;

    return { spent, earned, consumedRatio };
  }, [transactions]);

  const consumptionChartData =
    monthlyConsumption.earned > 0
      ? [
          {
            name: "Consumido",
            value: Math.min(
              monthlyConsumption.spent,
              monthlyConsumption.earned
            )
          },
          {
            name: "Restante",
            value: Math.max(
              monthlyConsumption.earned -
                monthlyConsumption.spent,
              0
            )
          }
        ]
      : [
          {
            name: "Consumido",
            value: monthlyConsumption.spent || 1
          }
        ];

  /*
   * =======================================================
   * COMPROMISSOS
   * =======================================================
   */

  const activeCommitments =
    useMemo(
      () =>
        commitments.filter(
          (item) =>
            item.status ===
              "active" ||
            item.status ===
              "paused"
        ),
      [commitments]
    );

  const activeCommitmentCount =
    commitments.filter(
      (item) =>
        item.status === "active"
    ).length;

  /*
   * =======================================================
   * RENDER
   * =======================================================
   */

  return (
    <div className="page nexo-finance-page">
      <PageHeader
        eyebrow="FINANÇAS"
        title="Seu dinheiro, sem complicação"
        description="Registre movimentações, acompanhe seus gastos e organize pagamentos recorrentes."
      />
      <Link to="/financas/importar" className="bank-finance-link"><span>Importar do Nubank e receber do Apple Pay<small>{bankPendingCount ? `${bankPendingCount} movimentação(ões) esperando sua classificação` : "Extratos, pendentes de classificação e regras automáticas"}</small></span><ChevronRight size={20} /></Link>

      {/* ===================================================
          RESUMO
      =================================================== */}

      <section className="stat-grid">
        <div className="stat-card static">
          <div className="icon-box">
            <CircleDollarSign
              size={20}
            />
          </div>

          <span>Saldo</span>

          <strong>
            {formatMoney(
              stats.balance
            )}
          </strong>

          <small>
            resultado registrado
          </small>
        </div>

        <div className="stat-card static">
          <div className="icon-box">
            <ArrowUpRight
              size={20}
            />
          </div>

          <span>Entradas</span>

          <strong>
            {formatMoney(
              stats.income
            )}
          </strong>

          <small>
            receitas
          </small>
        </div>

        <div className="stat-card static">
          <div className="icon-box">
            <ArrowDownRight
              size={20}
            />
          </div>

          <span>Saídas</span>

          <strong>
            {formatMoney(
              stats.expense
            )}
          </strong>

          <small>
            despesas
          </small>
        </div>

        <div className="stat-card static">
          <div className="icon-box">
            <Repeat2
              size={20}
            />
          </div>

          <span>
            Compromissos
          </span>

          <strong>
            {
              activeCommitmentCount
            }
          </strong>

          <small>
            pagamentos ativos
          </small>
        </div>
      </section>

      {/* ===================================================
          ABAS
      =================================================== */}

      <div className="finance-tabs">
        <button
          type="button"
          className={
            activeTab ===
            "transactions"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab(
              "transactions"
            )
          }
        >
          <WalletCards
            size={17}
          />

          Movimentações
        </button>

        <button
          type="button"
          className={
            activeTab ===
            "commitments"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab(
              "commitments"
            )
          }
        >
          <Repeat2 size={17} />

          Compromissos

          {!!activeCommitmentCount && (
            <span className="finance-tab-count">
              {
                activeCommitmentCount
              }
            </span>
          )}
        </button>
      </div>

      {/* ===================================================
          MOVIMENTAÇÕES
      =================================================== */}

      {activeTab ===
        "transactions" && (
        <>
          <section className="panel finance-quick-expense">
            <div className="section-title-row">
              <div>
                <span className="eyebrow">
                  REGISTRO RÁPIDO
                </span>

                <h2>Gasto de hoje</h2>
              </div>

              {quickSaved && (
                <span className="finance-quick-saved" role="status">
                  <Check size={14} />
                  Salvo
                </span>
              )}
            </div>

            <form
              className="finance-quick-form"
              onSubmit={handleQuickFormSubmit}
            >
              <div className="finance-quick-chips">
                {quickExpenseCategories.map(
                  ({ name, icon: Icon }) => (
                    <button
                      type="button"
                      key={name}
                      aria-pressed={quickCategory === name}
                      className={`finance-quick-chip ${
                        quickCategory === name
                          ? "active"
                          : ""
                      }`}
                      onClick={() =>
                        handleQuickCategoryClick(
                          name
                        )
                      }
                    >
                      <Icon size={16} />
                      <span>{name}</span>
                    </button>
                  )
                )}
              </div>

              <div className="finance-quick-amount-row">
                <span className="finance-quick-currency">
                  R$
                </span>

                <input
                  aria-label="Valor do gasto rápido"
                  ref={quickAmountInputRef}
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={quickAmount}
                  onChange={(e) =>
                    setQuickAmount(
                      e.target.value
                    )
                  }
                />

                <button
                  type="submit"
                  className="primary-button"
                  disabled={!quickCategory}
                >
                  <Plus size={16} />
                  Adicionar
                </button>
              </div>
            </form>
          </section>

          <div className="two-column">
            <form
              className="panel form-panel"
              onSubmit={
                handleSubmitTransaction
              }
            >
              <div className="section-title-row">
                <div>
                  <span className="eyebrow">
                    MOVIMENTAÇÃO
                  </span>

                  <h2>
                    Novo registro
                  </h2>
                </div>

                <Plus size={18} />
              </div>

              <div className="segmented">
                <button
                  type="button"
                  className={
                    type ===
                    "expense"
                      ? "selected"
                      : ""
                  }
                  onClick={() =>
                    setType(
                      "expense"
                    )
                  }
                >
                  <ArrowDownRight
                    size={15}
                  />

                  Despesa
                </button>

                <button
                  type="button"
                  className={
                    type ===
                    "income"
                      ? "selected"
                      : ""
                  }
                  onClick={() =>
                    setType(
                      "income"
                    )
                  }
                >
                  <ArrowUpRight
                    size={15}
                  />

                  Receita
                </button>
              </div>

              <label>
                Descrição

                <input
                  value={
                    description
                  }
                  onChange={(e) =>
                    setDescription(
                      e.target
                        .value
                    )
                  }
                  placeholder="Ex.: Abastecimento da moto"
                />
              </label>

              <label>
                Valor

                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) =>
                    setAmount(
                      e.target
                        .value
                    )
                  }
                  placeholder="50,00"
                />
              </label>

              <label>
                Categoria

                <select
                  value={category}
                  onChange={(e) =>
                    setCategory(
                      e.target
                        .value
                    )
                  }
                >
                  {categories.map(
                    (item) => (
                      <option
                        key={
                          item
                        }
                      >
                        {item}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                Data

                <input
                  type="date"
                  value={
                    occurredAt
                  }
                  onChange={(e) =>
                    setOccurredAt(
                      e.target
                        .value
                    )
                  }
                />
              </label>

              <button
                className="primary-button"
                type="submit"
              >
                Registrar movimentação
              </button>
            </form>

            <section className="panel">
              <div className="section-title-row">
                <div>
                  <span className="eyebrow">
                    ANÁLISE
                  </span>

                  <h2>
                    Consumo do mês
                  </h2>
                </div>
              </div>

              <div className="finance-consumption-chart">
                <div className="finance-donut-wrapper">
                  <ResponsiveContainer
                    width="100%"
                    height={180}
                  >
                    <PieChart>
                      <Pie
                        data={consumptionChartData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={62}
                        outerRadius={82}
                        startAngle={90}
                        endAngle={-270}
                        stroke="none"
                      >
                        {consumptionChartData.map(
                          (entry, index) => (
                            <Cell
                              key={entry.name}
                              fill={
                                consumptionChartColors[
                                  index %
                                    consumptionChartColors.length
                                ]
                              }
                            />
                          )
                        )}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>

                  <div className="finance-donut-center">
                    <strong>
                      {formatMoney(
                        monthlyConsumption.spent
                      )}
                    </strong>

                    <span>
                      {monthlyConsumption.earned >
                      0
                        ? `${Math.round(
                            monthlyConsumption.consumedRatio *
                              100
                          )}% da renda`
                        : "gasto este mês"}
                    </span>
                  </div>
                </div>

                <div className="finance-consumption-legend">
                  <div className="finance-consumption-legend-item">
                    <span className="dot consumed" />
                    Consumido ·{" "}
                    {formatMoney(
                      monthlyConsumption.spent
                    )}
                  </div>

                  {monthlyConsumption.earned >
                    0 && (
                    <div className="finance-consumption-legend-item">
                      <span className="dot remaining" />
                      Restante ·{" "}
                      {formatMoney(
                        Math.max(
                          monthlyConsumption.earned -
                            monthlyConsumption.spent,
                          0
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="section-title-row">
                <div>
                  <span className="eyebrow">
                    ANÁLISE
                  </span>

                  <h2>
                    Gastos por categoria
                  </h2>
                </div>
              </div>

              <div className="chart-list">
                {expensesByCategory.map(
                  ([
                    name,
                    value
                  ]) => (
                    <div
                      className="chart-row"
                      key={name}
                    >
                      <div className="chart-label">
                        <span>
                          {name}
                        </span>

                        <strong>
                          {formatMoney(
                            value
                          )}
                        </strong>
                      </div>

                      <div className="chart-track">
                        <div
                          className="chart-bar"
                          style={{
                            width:
                              `${Math.max(
                                7,
                                (
                                  value /
                                  maxCategory
                                ) *
                                  100
                              )}%`
                          }}
                        />
                      </div>
                    </div>
                  )
                )}

                {!expensesByCategory.length && (
                  <div className="empty-state">
                    Cadastre despesas
                    para visualizar o
                    gráfico.
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="panel">
            <div className="section-title-row">
              <div>
                <span className="eyebrow">
                  HISTÓRICO
                </span>

                <h2>
                  Movimentações
                </h2>
              </div>

              <span className="badge">
                {
                  transactions.length
                }
              </span>
            </div>

            <div className="stack-list">
              {transactions.map(
                (transaction) => (
                  <article
                    className="transaction-row"
                    key={
                      transaction.id
                    }
                  >
                    <div
                      className={`transaction-icon ${
                        transaction.type ===
                        "income"
                          ? "income"
                          : "expense"
                      }`}
                    >
                      {transaction.type ===
                      "income" ? (
                        <ArrowUpRight
                          size={18}
                        />
                      ) : (
                        <ArrowDownRight
                          size={18}
                        />
                      )}
                    </div>

                    <div className="transaction-main">
                      <strong>
                        {
                          transaction.description
                        }
                      </strong>

                      <span>
                        {
                          transaction.category
                        }
                        {" · "}
                        {formatDateTime(
                          transaction.occurredAt
                        )}
                      </span>
                    </div>

                    <strong
                      className={
                        transaction.type ===
                        "income"
                          ? "value-income"
                          : "value-expense"
                      }
                    >
                      {transaction.type ===
                      "income"
                        ? "+"
                        : "-"}

                      {formatMoney(
                        transaction.amount
                      )}
                    </strong>

                    <button
                      className="icon-button danger"
                      onClick={() =>
                        transaction.id &&
                        db.transactions.delete(
                          transaction.id
                        )
                      }
                      aria-label="Excluir movimentação"
                    >
                      <Trash2
                        size={17}
                      />
                    </button>
                  </article>
                )
              )}

              {!transactions.length && (
                <div className="empty-state">
                  Nenhuma movimentação
                  financeira registrada.
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* ===================================================
          COMPROMISSOS
      =================================================== */}

      {activeTab ===
        "commitments" && (
        <>
          <div className="finance-commitment-grid">
            {/* =============================================
                FORMULÁRIO
            ============================================= */}

            <form
              className="panel form-panel finance-commitment-form"
              onSubmit={
                handleSubmitCommitment
              }
            >
              <div className="section-title-row">
                <div>
                  <span className="eyebrow">
                    PLANEJAMENTO
                  </span>

                  <h2>
                    Novo compromisso
                  </h2>
                </div>

                <Repeat2
                  size={18}
                />
              </div>

              <label>
                Descrição

                <input
                  value={
                    commitmentTitle
                  }
                  onChange={(e) =>
                    setCommitmentTitle(
                      e.target
                        .value
                    )
                  }
                  placeholder="Ex.: Pix para João"
                />
              </label>

              <label>
                Valor de cada pagamento

                <input
                  inputMode="decimal"
                  value={
                    commitmentAmount
                  }
                  onChange={(e) =>
                    setCommitmentAmount(
                      e.target
                        .value
                    )
                  }
                  placeholder="200,00"
                />
              </label>

              <div className="finance-form-grid">
                <label>
                  Forma

                  <select
                    value={
                      paymentMethod
                    }
                    onChange={(e) =>
                      setPaymentMethod(
                        e.target
                          .value as FinancialCommitmentPaymentMethod
                      )
                    }
                  >
                    {Object.entries(
                      paymentMethodLabels
                    ).map(
                      ([
                        value,
                        label
                      ]) => (
                        <option
                          key={
                            value
                          }
                          value={
                            value
                          }
                        >
                          {label}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label>
                  Categoria

                  <select
                    value={
                      commitmentCategory
                    }
                    onChange={(e) =>
                      setCommitmentCategory(
                        e.target
                          .value
                      )
                    }
                  >
                    {categories.map(
                      (item) => (
                        <option
                          key={
                            item
                          }
                        >
                          {item}
                        </option>
                      )
                    )}
                  </select>
                </label>
              </div>

              <label>
                Frequência

                <select
                  value={frequency}
                  onChange={(e) =>
                    setFrequency(
                      e.target
                        .value as FinancialCommitmentFrequency
                    )
                  }
                >
                  {Object.entries(
                    frequencyLabels
                  ).map(
                    ([
                      value,
                      label
                    ]) => (
                      <option
                        key={
                          value
                        }
                        value={
                          value
                        }
                      >
                        {label}
                      </option>
                    )
                  )}
                </select>
              </label>

              {frequency ===
                "custom" && (
                <label>
                  Repetir a cada quantos
                  dias?

                  <input
                    type="number"
                    min="1"
                    value={
                      intervalDays
                    }
                    onChange={(e) =>
                      setIntervalDays(
                        e.target
                          .value
                      )
                    }
                  />
                </label>
              )}

              <label>
                Primeiro pagamento

                <input
                  type="date"
                  value={
                    firstPaymentDate
                  }
                  onChange={(e) =>
                    setFirstPaymentDate(
                      e.target
                        .value
                    )
                  }
                />
              </label>

              <div className="finance-limit-box">
                <label className="finance-checkbox">
                  <input
                    type="checkbox"
                    checked={
                      hasPaymentLimit
                    }
                    onChange={(e) =>
                      setHasPaymentLimit(
                        e.target
                          .checked
                      )
                    }
                  />

                  <span>
                    Tem quantidade
                    definida de
                    pagamentos
                  </span>
                </label>

                {hasPaymentLimit && (
                  <label>
                    Quantidade

                    <input
                      type="number"
                      min="1"
                      value={
                        totalPayments
                      }
                      onChange={(e) =>
                        setTotalPayments(
                          e.target
                            .value
                        )
                      }
                    />
                  </label>
                )}
              </div>

              <label>
                Lembrar

                <select
                  value={
                    reminderMinutes
                  }
                  onChange={(e) =>
                    setReminderMinutes(
                      e.target
                        .value
                    )
                  }
                >
                  {reminderOptions.map(
                    (option) => (
                      <option
                        key={
                          option.label
                        }
                        value={
                          option.value
                        }
                      >
                        {
                          option.label
                        }
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                Observações

                <textarea
                  rows={4}
                  value={
                    commitmentNotes
                  }
                  onChange={(e) =>
                    setCommitmentNotes(
                      e.target
                        .value
                    )
                  }
                  placeholder="Ex.: referente à compra da peça da moto"
                />
              </label>

              <button
                className="primary-button"
                type="submit"
              >
                <Plus size={17} />

                Criar compromisso
              </button>

              <div className="finance-reminder-info">
                <Bell size={15} />

                <span>
                  Se você escolher um
                  aviso, o NEXO cria o
                  lembrete
                  automaticamente.
                </span>
              </div>
            </form>

            {/* =============================================
                LISTA
            ============================================= */}

            <section className="panel finance-commitments-panel">
              <div className="section-title-row">
                <div>
                  <span className="eyebrow">
                    PRÓXIMOS
                  </span>

                  <h2>
                    Compromissos
                    financeiros
                  </h2>
                </div>

                <span className="badge">
                  {
                    activeCommitments.length
                  }
                </span>
              </div>

              <div className="finance-commitment-list">
                {activeCommitments.map(
                  (commitment) => {
                    const total =
                      commitment.totalPayments;

                    const progress =
                      total
                        ? Math.min(
                            100,
                            (
                              commitment.completedPayments /
                              total
                            ) *
                              100
                          )
                        : 0;

                    return (
                      <article
                        className={`finance-commitment-card ${commitment.status}`}
                        key={
                          commitment.id
                        }
                      >
                        <div className="finance-commitment-card-top">
                          <div className="finance-commitment-icon">
                            <Repeat2
                              size={18}
                            />
                          </div>

                          <div className="finance-commitment-title">
                            <div>
                              <h3>
                                {
                                  commitment.title
                                }
                              </h3>

                              <span>
                                {
                                  paymentMethodLabels[
                                    commitment
                                      .paymentMethod
                                  ]
                                }
                                {" · "}
                                {
                                  frequencyLabels[
                                    commitment
                                      .frequency
                                  ]
                                }
                              </span>
                            </div>

                            <strong>
                              {formatMoney(
                                commitment.amount
                              )}
                            </strong>
                          </div>
                        </div>

                        <div className="finance-commitment-next">
                          <div>
                            <CalendarDays
                              size={15}
                            />

                            <span>
                              Próximo
                              pagamento
                            </span>
                          </div>

                          <strong>
                            {formatDateTime(
                              commitment.nextPaymentAt
                            )}
                          </strong>
                        </div>

                        {total !== null && (
                          <div className="finance-progress">
                            <div className="finance-progress-label">
                              <span>
                                Progresso
                              </span>

                              <strong>
                                {
                                  commitment.completedPayments
                                }
                                /
                                {total}
                              </strong>
                            </div>

                            <div className="finance-progress-track">
                              <div
                                className="finance-progress-bar"
                                style={{
                                  width:
                                    `${progress}%`
                                }}
                              />
                            </div>
                          </div>
                        )}

                        {total === null && (
                          <div className="finance-recurring-badge">
                            <Repeat2
                              size={13}
                            />

                            Recorrência
                            contínua
                          </div>
                        )}

                        {commitment.notes && (
                          <p className="finance-commitment-notes">
                            {
                              commitment.notes
                            }
                          </p>
                        )}

                        <div className="finance-commitment-meta">
                          <span>
                            {
                              commitment.category
                            }
                          </span>

                          {commitment.reminderMinutesBefore !==
                            null && (
                            <span>
                              <Bell
                                size={12}
                              />

                              Lembrete
                              ativo
                            </span>
                          )}
                        </div>

                        <div className="finance-commitment-actions">
                          {commitment.status ===
                            "active" && (
                            <>
                              <button
                                type="button"
                                className="primary-button finance-paid-button"
                                onClick={() =>
                                  markFinancialCommitmentAsPaid(
                                    commitment
                                  )
                                }
                              >
                                <Check
                                  size={16}
                                />

                                Marcar como
                                pago
                              </button>

                              <button
                                type="button"
                                className="icon-button"
                                onClick={() =>
                                  commitment.id &&
                                  pauseFinancialCommitment(
                                    commitment.id
                                  )
                                }
                                aria-label="Pausar compromisso"
                              >
                                <Pause
                                  size={16}
                                />
                              </button>

                              <button
                                type="button"
                                className="icon-button danger"
                                onClick={() => {
                                  if (
                                    !commitment.id
                                  ) {
                                    return;
                                  }

                                  const confirmed =
                                    window.confirm(
                                      "Cancelar este compromisso? Ele para de gerar novos lembretes e cobranças."
                                    );

                                  if (
                                    !confirmed
                                  ) {
                                    return;
                                  }

                                  cancelFinancialCommitment(
                                    commitment.id
                                  );
                                }}
                                aria-label="Cancelar compromisso"
                              >
                                <Ban
                                  size={16}
                                />
                              </button>
                            </>
                          )}

                          {commitment.status ===
                            "paused" && (
                            <>
                              <button
                                type="button"
                                className="primary-button finance-paid-button"
                                onClick={() =>
                                  commitment.id &&
                                  resumeFinancialCommitment(
                                    commitment.id
                                  )
                                }
                              >
                                <Play
                                  size={16}
                                />

                                Reativar
                              </button>

                              <button
                                type="button"
                                className="icon-button danger"
                                onClick={() => {
                                  if (
                                    !commitment.id
                                  ) {
                                    return;
                                  }

                                  const confirmed =
                                    window.confirm(
                                      "Cancelar este compromisso? Ele para de gerar novos lembretes e cobranças."
                                    );

                                  if (
                                    !confirmed
                                  ) {
                                    return;
                                  }

                                  cancelFinancialCommitment(
                                    commitment.id
                                  );
                                }}
                                aria-label="Cancelar compromisso"
                              >
                                <Ban
                                  size={16}
                                />
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            className="icon-button danger"
                            onClick={async () => {
                              if (
                                !commitment.id
                              ) {
                                return;
                              }

                              const confirmed =
                                window.confirm(
                                  "Excluir este compromisso? Movimentações já pagas serão mantidas."
                                );

                              if (
                                !confirmed
                              ) {
                                return;
                              }

                              await deleteFinancialCommitment(
                                commitment.id
                              );
                            }}
                            aria-label="Excluir compromisso"
                          >
                            <Trash2
                              size={16}
                            />
                          </button>
                        </div>
                      </article>
                    );
                  }
                )}

                {!activeCommitments.length && (
                  <div className="empty-state finance-empty-commitments">
                    <Repeat2
                      size={25}
                    />

                    <strong>
                      Nenhum compromisso
                      ativo
                    </strong>

                    <span>
                      Cadastre um
                      pagamento recorrente
                      para começar.
                    </span>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* ===============================================
              CONCLUÍDOS / CANCELADOS
          =============================================== */}

          {!!commitments.filter(
            (item) =>
              item.status ===
                "completed" ||
              item.status ===
                "cancelled"
          ).length && (
            <section className="panel finance-commitment-history">
              <div className="section-title-row">
                <div>
                  <span className="eyebrow">
                    HISTÓRICO
                  </span>

                  <h2>
                    Compromissos
                    encerrados
                  </h2>
                </div>
              </div>

              <div className="stack-list">
                {commitments
                  .filter(
                    (item) =>
                      item.status ===
                        "completed" ||
                      item.status ===
                        "cancelled"
                  )
                  .map(
                    (commitment) => (
                      <article
                        className="finance-finished-row"
                        key={
                          commitment.id
                        }
                      >
                        <div>
                          <Check
                            size={16}
                          />

                          <div>
                            <strong>
                              {
                                commitment.title
                              }
                            </strong>

                            <span>
                              {commitment.status ===
                              "completed"
                                ? "Concluído"
                                : "Cancelado"}
                            </span>
                          </div>
                        </div>

                        <strong>
                          {formatMoney(
                            commitment.amount
                          )}
                        </strong>

                        <ChevronRight
                          size={15}
                        />
                      </article>
                    )
                  )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
