import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Bell,
  Brain,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Fuel,
  Home as HomeIcon,
  Plus,
  Popcorn,
  Receipt,
  Search,
  ShoppingBag,
  Sparkles,
  UtensilsCrossed,
  WalletCards,
  Zap
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { db } from "../db";
import { formatDateTime, formatMoney, formatRelativeDays } from "../utils";
import {
  cardMotion,
  pageMotion,
  staggerContainer
} from "../design/motion";

const quickExpenseCategories = [
  { name: "Alimentação", icon: UtensilsCrossed },
  { name: "Combustível", icon: Fuel },
  { name: "Casa", icon: HomeIcon },
  { name: "Compras", icon: ShoppingBag },
  { name: "Lazer", icon: Popcorn },
  { name: "Contas", icon: Receipt },
  { name: "Outros", icon: Zap }
];

const quickIncomeCategories = [
  { name: "Salário", icon: Banknote },
  { name: "Transferência", icon: ArrowLeftRight },
  { name: "Outros", icon: Sparkles }
];

export default function HomePage() {
  const navigate = useNavigate();

  /*
   * =========================================================
   * REGISTRO RÁPIDO (GASTO OU GANHO) DIRETO NA HOME
   * =========================================================
   */

  const [quickType, setQuickType] =
    useState<"expense" | "income">("expense");

  const [quickCategory, setQuickCategory] =
    useState<string | null>(null);

  const [quickAmount, setQuickAmount] =
    useState("");

  const [quickSaved, setQuickSaved] =
    useState(false);

  const quickAmountInputRef =
    useRef<HTMLInputElement | null>(null);

  const [historyExpanded, setHistoryExpanded] =
    useState(false);

  async function submitQuickTransaction(
    type: "expense" | "income",
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

    const now = new Date().toISOString();

    await db.transactions.add({
      description: categoryName,
      amount: parsedAmount,
      type,
      category: categoryName,
      occurredAt: now,
      createdAt: now
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
      void submitQuickTransaction(
        quickType,
        categoryName,
        quickAmount
      );

      return;
    }

    quickAmountInputRef.current?.focus();
  }

  function handleQuickTypeChange(
    type: "expense" | "income"
  ) {
    setQuickType(type);
    setQuickCategory(null);
  }

  function handleQuickSubmit(
    event: FormEvent
  ) {
    event.preventDefault();

    if (!quickCategory) return;

    void submitQuickTransaction(
      quickType,
      quickCategory,
      quickAmount
    );
  }

  const memories =
    useLiveQuery(() => db.memories.count(), []) ?? 0;

  const reminders =
    useLiveQuery(
      async () => {
        const items = await db.reminders.toArray();

        return items.filter(
          (item) => !item.completed
        ).length;
      },
      []
    ) ?? 0;

  const memoryItems =
    useLiveQuery(
      () =>
        db.memories
          .orderBy("updatedAt")
          .reverse()
          .limit(8)
          .toArray(),
      []
    ) ?? [];

  const reminderItems =
    useLiveQuery(
      () =>
        db.reminders
          .orderBy("startsAt")
          .toArray(),
      []
    ) ?? [];

  const transactions =
    useLiveQuery(
      () =>
        db.transactions
          .orderBy("occurredAt")
          .reverse()
          .toArray(),
      []
    ) ?? [];

  const financialCommitments =
    useLiveQuery(
      () =>
        db.financialCommitments
          .orderBy("nextPaymentAt")
          .toArray(),
      []
    ) ?? [];

  const greeting = useMemo(() => {
    const hour = new Date().getHours();

    if (hour < 12) {
      return "Bom dia";
    }

    if (hour < 18) {
      return "Boa tarde";
    }

    return "Boa noite";
  }, []);

  const currentDate = useMemo(() => {
    return new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long"
    }).format(new Date());
  }, []);

  const nextReminder = useMemo(() => {
    const now = Date.now();

    return reminderItems
      .filter(
        (item) =>
          !item.completed &&
          new Date(item.startsAt).getTime() >= now
      )
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() -
          new Date(b.startsAt).getTime()
      )[0];
  }, [reminderItems]);

  const overdueReminders = useMemo(() => {
    const now = Date.now();

    return reminderItems
      .filter(
        (item) =>
          !item.completed &&
          new Date(item.startsAt).getTime() < now
      )
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() -
          new Date(b.startsAt).getTime()
      );
  }, [reminderItems]);

  const upcomingCommitments = useMemo(() => {
    const now = Date.now();
    const inFourteenDays =
      now + 14 * 24 * 60 * 60 * 1000;

    return financialCommitments
      .filter((item) => {
        if (item.status !== "active") {
          return false;
        }

        const paymentDate = new Date(
          item.nextPaymentAt
        ).getTime();

        return paymentDate <= inFourteenDays;
      })
      .sort(
        (a, b) =>
          new Date(a.nextPaymentAt).getTime() -
          new Date(b.nextPaymentAt).getTime()
      )
      .slice(0, 4);
  }, [financialCommitments]);

  const attentionCount =
    overdueReminders.length +
    upcomingCommitments.length;

  const monthTransactions = useMemo(() => {
    const now = new Date();

    return transactions.filter((item) => {
      const date = new Date(item.occurredAt);

      return (
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
      );
    });
  }, [transactions]);

  const finance = useMemo(() => {
    const income = monthTransactions
      .filter((item) => item.type === "income")
      .reduce(
        (total, item) => total + item.amount,
        0
      );

    const expense = monthTransactions
      .filter((item) => item.type === "expense")
      .reduce(
        (total, item) => total + item.amount,
        0
      );

    return {
      income,
      expense,
      balance: income - expense
    };
  }, [monthTransactions]);

  const budgetRisk = useMemo(() => {
    const committedTotal =
      upcomingCommitments.reduce(
        (sum, item) => sum + item.amount,
        0
      );

    if (
      committedTotal > 0 &&
      committedTotal > finance.balance
    ) {
      return {
        committedTotal,
        shortfall:
          committedTotal - finance.balance
      };
    }

    return null;
  }, [upcomingCommitments, finance]);

  const previousMonthBalance = useMemo(() => {
    const now = new Date();

    const previousMonth =
      now.getMonth() === 0 ? 11 : now.getMonth() - 1;

    const previousMonthYear =
      now.getMonth() === 0
        ? now.getFullYear() - 1
        : now.getFullYear();

    const previousMonthTransactions =
      transactions.filter((item) => {
        const date = new Date(item.occurredAt);

        return (
          date.getMonth() === previousMonth &&
          date.getFullYear() === previousMonthYear
        );
      });

    if (previousMonthTransactions.length === 0) {
      return null;
    }

    const income = previousMonthTransactions
      .filter((item) => item.type === "income")
      .reduce((total, item) => total + item.amount, 0);

    const expense = previousMonthTransactions
      .filter((item) => item.type === "expense")
      .reduce((total, item) => total + item.amount, 0);

    return income - expense;
  }, [transactions]);

  const expensesByCategory = useMemo(() => {
    const categories = new Map<string, number>();

    monthTransactions
      .filter((item) => item.type === "expense")
      .forEach((item) => {
        categories.set(
          item.category,
          (categories.get(item.category) ?? 0) +
            item.amount
        );
      });

    return [...categories.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [monthTransactions]);

  const biggestCategoryValue =
    expensesByCategory[0]?.[1] ?? 1;

  const completedReminders = useMemo(() => {
    return reminderItems.filter(
      (item) => item.completed
    ).length;
  }, [reminderItems]);

  const activitySummary = useMemo(() => {
    const total =
      memoryItems.length +
      reminderItems.length +
      transactions.length;

    return {
      total,
      completedReminders
    };
  }, [
    memoryItems,
    reminderItems,
    transactions,
    completedReminders
  ]);

  const activities = useMemo(() => {
    const memoryActivities = memoryItems.map((item) => ({
      id: `memory-${item.id}`,
      type: "memory",
      title: item.title,
      subtitle: "Memória atualizada",
      date: item.updatedAt
    }));

    const reminderActivities = reminderItems
      .slice(0, 8)
      .map((item) => ({
        id: `reminder-${item.id}`,
        type: "reminder",
        title: item.title,
        subtitle: item.completed
          ? "Lembrete concluído"
          : "Lembrete cadastrado",
        date: item.createdAt
      }));

    const financeActivities = transactions
      .slice(0, 8)
      .map((item) => ({
        id: `finance-${item.id}`,
        type: item.type,
        title: item.description,
        subtitle:
          item.type === "income"
            ? `Entrada de ${formatMoney(item.amount)}`
            : `Saída de ${formatMoney(item.amount)}`,
        date: item.createdAt
      }));

    return [
      ...memoryActivities,
      ...reminderActivities,
      ...financeActivities
    ]
      .sort(
        (a, b) =>
          new Date(b.date).getTime() -
          new Date(a.date).getTime()
      )
      .slice(0, 16);
  }, [
    memoryItems,
    reminderItems,
    transactions
  ]);

  const visibleActivities = historyExpanded
    ? activities
    : activities.slice(0, 4);

  const nextReminderStatus = useMemo(() => {
    if (!nextReminder) {
      return null;
    }

    const now = Date.now();

    const difference =
      new Date(nextReminder.startsAt).getTime() -
      now;

    const hours =
      Math.floor(
        difference / (1000 * 60 * 60)
      );

    if (hours < 1) {
      return "Em breve";
    }

    if (hours < 24) {
      return `Daqui a ${hours}h`;
    }

    const days = Math.ceil(hours / 24);

    if (days === 1) {
      return "Amanhã";
    }

    return `Daqui a ${days} dias`;
  }, [nextReminder]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();

        navigate("/buscar");
      }
    }

    window.addEventListener(
      "keydown",
      handleShortcut
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleShortcut
      );
    };
  }, [navigate]);

  return (
    <motion.div
      className="page nexo-home"
      variants={pageMotion}
      initial="hidden"
      animate="visible"
    >
      <header className="nexo-topbar">
        <div>
          <div className="nexo-version">
            <Sparkles size={14} />
            <span>Visão geral</span>
          </div>

          <span className="nexo-current-date">
            {currentDate}
          </span>
        </div>

        <div className="nexo-topbar-actions">
          <button
            type="button"
            className="nexo-topbar-button"
            aria-label="Ver lembretes"
            onClick={() => navigate("/lembretes")}
          >
            <Bell size={18} />

            {attentionCount > 0 && (
              <span className="nexo-topbar-badge">
                {attentionCount > 9
                  ? "9+"
                  : attentionCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <motion.section
        className="nexo-welcome"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={cardMotion}>
          <span className="nexo-welcome-label">
            SEU SEGUNDO CÉREBRO
          </span>

          <h1>
            {greeting}.
            <span>Seu dia, com mais clareza.</span>
          </h1>

          <p>
            Memórias, compromissos e finanças.
            O que importa, sempre por perto.
          </p>
        </motion.div>

        <motion.div variants={cardMotion}>
          <button
            type="button"
            className="nexo-command-search"
            onClick={() => navigate("/buscar")}
          >
            <div className="nexo-command-search-left">
              <Search size={19} />
              <span>
                Buscar em todo o NEXO...
              </span>
            </div>

            <kbd>Ctrl K</kbd>
          </button>
        </motion.div>

        <motion.div
          className="nexo-home-pulse"
          variants={cardMotion}
        >
          <div className="nexo-pulse-item">
            <Sparkles size={14} />

            <span>
              {activitySummary.total} registros
              acompanhados
            </span>
          </div>

          <div className="nexo-pulse-divider" />

          <div className="nexo-pulse-item">
            <CheckCircle2 size={14} />

            <span>
              {activitySummary.completedReminders}
              {" "}{activitySummary.completedReminders === 1 ? "lembrete concluído" : "lembretes concluídos"}
            </span>
          </div>
        </motion.div>
      </motion.section>

      <motion.section
        className="nexo-stat-grid"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={cardMotion}>
          <Link
            to="/memorias"
            className="nexo-stat-card"
          >
            <div className="nexo-stat-icon purple">
              <Brain size={20} />
            </div>

            <div className="nexo-stat-content">
              <span>Memórias</span>

              <strong>{memories}</strong>

              <small>
                informações guardadas
              </small>
            </div>

            <ArrowUpRight
              className="nexo-stat-arrow"
              size={17}
            />
          </Link>
        </motion.div>

        <motion.div variants={cardMotion}>
          <Link
            to="/lembretes"
            className="nexo-stat-card"
          >
            <div className="nexo-stat-icon amber">
              <Bell size={20} />
            </div>

            <div className="nexo-stat-content">
              <span>Lembretes</span>

              <strong>{reminders}</strong>

              <small>pendentes</small>
            </div>

            <ArrowUpRight
              className="nexo-stat-arrow"
              size={17}
            />
          </Link>
        </motion.div>

        <motion.div variants={cardMotion}>
          <Link
            to="/financas"
            className="nexo-stat-card"
          >
            <div className="nexo-stat-icon green">
              <CircleDollarSign size={20} />
            </div>

            <div className="nexo-stat-content">
              <span>Saldo do mês</span>

              <strong
                className={
                  finance.balance < 0
                    ? "nexo-balance-negative"
                    : ""
                }
              >
                {formatMoney(finance.balance)}
              </strong>

              {previousMonthBalance !== null ? (
                <small className="nexo-stat-trend">
                  {finance.balance >=
                  previousMonthBalance ? (
                    <ArrowUpRight
                      size={11}
                      className="nexo-stat-trend-up"
                    />
                  ) : (
                    <ArrowDownRight
                      size={11}
                      className="nexo-stat-trend-down"
                    />
                  )}
                  {formatMoney(
                    Math.abs(
                      finance.balance -
                        previousMonthBalance
                    )
                  )}{" "}
                  vs. mês passado
                </small>
              ) : (
                <small>
                  entradas − saídas
                </small>
              )}
            </div>

            <ArrowUpRight
              className="nexo-stat-arrow"
              size={17}
            />
          </Link>
        </motion.div>
      </motion.section>

      {attentionCount > 0 && (
        <motion.section
          className="nexo-dashboard-card nexo-attention-card"
          variants={cardMotion}
          initial="hidden"
          animate="visible"
        >
          <div className="nexo-card-header">
            <div>
              <span className="nexo-card-eyebrow nexo-card-eyebrow-warning">
                <AlertTriangle size={14} />
                ATENÇÃO
              </span>

              <h2>O que merece sua atenção agora</h2>
            </div>

            <span className="nexo-activity-count">
              {attentionCount}{" "}
              {attentionCount === 1 ? "item" : "itens"}
            </span>
          </div>

          {budgetRisk && (
            <div className="nexo-risk-banner">
              <AlertTriangle size={15} />

              <span>
                Seus compromissos dos
                próximos 14 dias somam{" "}
                <strong>
                  {formatMoney(
                    budgetRisk.committedTotal
                  )}
                </strong>
                {" "}— {formatMoney(
                  budgetRisk.shortfall
                )}{" "}
                a mais que seu saldo atual.
              </span>
            </div>
          )}

          <div className="nexo-attention-list">
            {overdueReminders.map((item) => (
              <Link
                to="/lembretes"
                className="nexo-attention-item overdue"
                key={`overdue-${item.id}`}
              >
                <div className="nexo-attention-icon">
                  <Bell size={16} />
                </div>

                <div className="nexo-attention-content">
                  <strong>{item.title}</strong>
                  <span>
                    {formatRelativeDays(item.startsAt)}
                  </span>
                </div>
              </Link>
            ))}

            {upcomingCommitments.map((item) => (
              <Link
                to="/financas"
                className="nexo-attention-item commitment"
                key={`commitment-${item.id}`}
              >
                <div className="nexo-attention-icon">
                  <WalletCards size={16} />
                </div>

                <div className="nexo-attention-content">
                  <strong>{item.title}</strong>
                  <span>
                    {formatRelativeDays(item.nextPaymentAt)}
                    {" · "}
                    {formatMoney(item.amount)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </motion.section>
      )}

      <section className="nexo-dashboard-grid">
        <motion.article
          className="nexo-dashboard-card nexo-next-card"
          variants={cardMotion}
          initial="hidden"
          animate="visible"
        >
          <div className="nexo-card-header">
            <div>
              <span className="nexo-card-eyebrow">
                <CalendarDays size={14} />
                PRÓXIMO
              </span>

              <h2>
                Seu próximo compromisso
              </h2>
            </div>

            <Link
              to="/lembretes"
              className="nexo-card-link"
            >
              Ver agenda
              <ArrowRight size={15} />
            </Link>
          </div>

          {nextReminder ? (
            <div className="nexo-next-event">
              <div className="nexo-next-event-icon">
                <Bell size={20} />
              </div>

              <div className="nexo-next-event-content">
                <div className="nexo-event-meta">
                  <span>PRÓXIMO EVENTO</span>

                  {nextReminderStatus && (
                    <small>
                      <Clock3 size={11} />
                      {nextReminderStatus}
                    </small>
                  )}
                </div>

                <h3>
                  {nextReminder.title}
                </h3>

                <strong>
                  {formatDateTime(
                    nextReminder.startsAt
                  )}
                </strong>

                {nextReminder.notes && (
                  <p>
                    {nextReminder.notes}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="nexo-empty-feature">
              <div className="nexo-empty-icon">
                <CalendarDays size={27} />
              </div>

              <strong>
                Nada marcado por enquanto
              </strong>

              <p>
                Quando você criar um compromisso,
                ele aparece aqui.
              </p>
            </div>
          )}

          <Link
            to="/lembretes"
            className="nexo-secondary-action"
          >
            <Plus size={16} />
            Novo lembrete
          </Link>
        </motion.article>

        <motion.article
          className="nexo-dashboard-card nexo-finance-card"
          variants={cardMotion}
          initial="hidden"
          animate="visible"
        >
          <div className="nexo-card-header">
            <div>
              <span className="nexo-card-eyebrow">
                <WalletCards size={14} />
                FINANÇAS
              </span>

              <h2>Resumo deste mês</h2>
            </div>

            <Link
              to="/financas"
              className="nexo-card-link"
            >
              Abrir financeiro
              <ArrowRight size={15} />
            </Link>
          </div>

          <div className="nexo-finance-summary">
            <div>
              <span>
                <ArrowUpRight size={14} />
                Entradas
              </span>

              <strong className="nexo-income">
                {formatMoney(finance.income)}
              </strong>
            </div>

            <div>
              <span>
                <ArrowDownRight size={14} />
                Saídas
              </span>

              <strong className="nexo-expense">
                {formatMoney(finance.expense)}
              </strong>
            </div>

            <div>
              <span>
                <CircleDollarSign size={14} />
                Saldo
              </span>

              <strong
                className={
                  finance.balance < 0
                    ? "nexo-balance-negative"
                    : ""
                }
              >
                {formatMoney(finance.balance)}
              </strong>
            </div>
          </div>

          <div className="nexo-category-section">
            <div className="nexo-category-title">
              <span>Gastos por categoria</span>
              <small>Mês atual</small>
            </div>

            {expensesByCategory.length ? (
              <div className="nexo-category-list">
                {expensesByCategory.map(
                  ([category, value]) => (
                    <div
                      className="nexo-category-item"
                      key={category}
                    >
                      <div className="nexo-category-meta">
                        <span>{category}</span>

                        <strong>
                          {formatMoney(value)}
                        </strong>
                      </div>

                      <div className="nexo-category-track">
                        <motion.div
                          className="nexo-category-bar"
                          initial={{ width: 0 }}
                          animate={{
                            width: `${Math.max(
                              7,
                              (value /
                                biggestCategoryValue) *
                                100
                            )}%`
                          }}
                          transition={{
                            duration: 0.7,
                            delay: 0.15
                          }}
                        />
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="nexo-chart-empty">
                <CircleDollarSign size={26} />

                <div>
                  <strong>
                    Nenhuma despesa este mês
                  </strong>

                  <span>
                    Seus gastos por categoria
                    aparecerão aqui.
                  </span>
                </div>
              </div>
            )}
          </div>
        </motion.article>
      </section>

      <motion.section
        className="nexo-quick-actions-grid"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <motion.div
          className="nexo-dashboard-card nexo-quick-transaction-card"
          variants={cardMotion}
        >
          <div className="nexo-card-header">
            <div>
              <span className="nexo-card-eyebrow">
                <CircleDollarSign size={14} />
                REGISTRO RÁPIDO
              </span>

              <h2>Gasto ou ganho de hoje</h2>
            </div>

            {quickSaved && (
              <span className="nexo-quick-saved" role="status">
                <Check size={14} />
                Salvo
              </span>
            )}
          </div>

          <form
            className="nexo-quick-form"
            onSubmit={handleQuickSubmit}
          >
            <div className="nexo-quick-type-toggle">
              <button
                type="button"
                aria-pressed={quickType === "expense"}
                className={
                  quickType === "expense"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  handleQuickTypeChange(
                    "expense"
                  )
                }
              >
                <ArrowDownRight size={14} />
                Gasto
              </button>

              <button
                type="button"
                aria-pressed={quickType === "income"}
                className={
                  quickType === "income"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  handleQuickTypeChange(
                    "income"
                  )
                }
              >
                <ArrowUpRight size={14} />
                Ganho
              </button>
            </div>

            <p id="quick-transaction-hint" className="nexo-quick-hint">
              Digite o valor e toque na categoria para salvar, ou selecione a categoria e use Adicionar.
            </p>

            <div className="nexo-quick-chips">
              {(quickType === "expense"
                ? quickExpenseCategories
                : quickIncomeCategories
              ).map(({ name, icon: Icon }) => (
                <button
                  type="button"
                  key={name}
                  aria-pressed={quickCategory === name}
                  className={`nexo-quick-chip ${
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
                  <Icon size={15} />
                  <span>{name}</span>
                </button>
              ))}
            </div>

            <div className="nexo-quick-amount-row">
              <span>R$</span>

              <input
                aria-label="Valor do registro rápido"
                aria-describedby="quick-transaction-hint"
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
                <Plus size={15} />
                Adicionar
              </button>
            </div>
          </form>
        </motion.div>

        <motion.div
          className="nexo-dashboard-card nexo-links-card"
          variants={cardMotion}
        >
          <div className="nexo-card-header">
            <div>
              <span className="nexo-card-eyebrow">
                <Sparkles size={14} />
                ATALHOS
              </span>

              <h2>Ir direto para</h2>
            </div>
          </div>

          <div className="nexo-quick-links">
            <Link to="/memorias" className="nexo-quick-link">
              <div className="nexo-quick-link-icon memory">
                <Brain size={17} />
              </div>
              <span>Nova memória</span>
              <ArrowRight size={14} />
            </Link>

            <Link to="/lembretes" className="nexo-quick-link">
              <div className="nexo-quick-link-icon reminder">
                <Bell size={17} />
              </div>
              <span>Novo lembrete</span>
              <ArrowRight size={14} />
            </Link>

            <Link to="/financas" className="nexo-quick-link">
              <div className="nexo-quick-link-icon finance">
                <WalletCards size={17} />
              </div>
              <span>Ver finanças</span>
              <ArrowRight size={14} />
            </Link>

            <Link to="/buscar" className="nexo-quick-link">
              <div className="nexo-quick-link-icon search">
                <Search size={17} />
              </div>
              <span>Buscar tudo</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </motion.div>
      </motion.section>

      <motion.section
        className="nexo-dashboard-card nexo-activity-card"
        variants={cardMotion}
        initial="hidden"
        animate="visible"
      >
        <div className="nexo-card-header">
          <div>
            <span className="nexo-card-eyebrow">
              <Sparkles size={14} />
              HISTÓRICO
            </span>

            <h2>Atividades recentes</h2>
          </div>

          {activities.length > 0 && (
            <span className="nexo-activity-count">
              {activities.length} recentes
            </span>
          )}
        </div>

        {activities.length ? (
          <>
            <div className="nexo-activity-list">
              {visibleActivities.map((activity) => {
                const Icon =
                  activity.type === "memory"
                    ? Brain
                    : activity.type === "reminder"
                      ? Bell
                      : activity.type === "income"
                        ? ArrowUpRight
                        : ArrowDownRight;

                return (
                  <div
                    className="nexo-activity-item"
                    key={activity.id}
                  >
                    <div
                      className={`nexo-activity-icon ${activity.type}`}
                    >
                      <Icon size={17} />
                    </div>

                    <div className="nexo-activity-content">
                      <strong>
                        {activity.title}
                      </strong>

                      <span>
                        {activity.subtitle}
                      </span>
                    </div>

                    <time>
                      {formatDateTime(
                        activity.date
                      )}
                    </time>
                  </div>
                );
              })}
            </div>

            {activities.length > 4 && (
              <button
                type="button"
                className="nexo-activity-toggle"
                aria-expanded={historyExpanded}
                onClick={() =>
                  setHistoryExpanded(
                    (value) => !value
                  )
                }
              >
                {historyExpanded
                  ? "Ver menos"
                  : `Ver mais (${
                      activities.length - 4
                    })`}

                <ChevronDown
                  size={14}
                  className={
                    historyExpanded
                      ? "nexo-activity-toggle-icon expanded"
                      : "nexo-activity-toggle-icon"
                  }
                />
              </button>
            )}
          </>
        ) : (
          <div className="nexo-empty-activity">
            <Sparkles size={24} />

            <strong>
              Ainda está tranquilo por aqui.
            </strong>

            <span>
              Suas últimas ações no NEXO
              aparecerão neste espaço.
            </span>
          </div>
        )}
      </motion.section>
    </motion.div>
  );
}