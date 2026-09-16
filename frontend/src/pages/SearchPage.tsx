import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Bell, Brain, CircleDollarSign, Search, WalletCards } from "lucide-react";
import { db } from "../db";
import PageHeader from "../components/PageHeader";
import { formatDateTime, formatMoney } from "../utils";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();

  const results = useLiveQuery(async () => {
    if (!normalized) return [];

    const [memories, reminders, transactions, financialCommitments] = await Promise.all([
      db.memories.toArray(),
      db.reminders.toArray(),
      db.transactions.toArray(),
      db.financialCommitments.toArray()
    ]);

    const memoryResults = memories
      .filter((item) =>
        `${item.title} ${item.content} ${item.tags.join(" ")}`
          .toLowerCase()
          .includes(normalized)
      )
      .map((item) => ({
        type: "Memória",
        title: item.title,
        subtitle: item.content,
        meta: formatDateTime(item.updatedAt),
        icon: Brain
      }));

    const reminderResults = reminders
      .filter((item) =>
        `${item.title} ${item.notes}`.toLowerCase().includes(normalized)
      )
      .map((item) => ({
        type: "Lembrete",
        title: item.title,
        subtitle: item.notes || "Sem observações",
        meta: formatDateTime(item.startsAt),
        icon: Bell
      }));

    const transactionResults = transactions
      .filter((item) =>
        `${item.description} ${item.category}`.toLowerCase().includes(normalized)
      )
      .map((item) => ({
        type: "Finanças",
        title: item.description,
        subtitle: item.category,
        meta: `${item.type === "income" ? "+" : "-"} ${formatMoney(item.amount)}`,
        icon: CircleDollarSign
      }));

    const commitmentResults = financialCommitments
      .filter((item) =>
        `${item.title} ${item.category} ${item.notes}`.toLowerCase().includes(normalized)
      )
      .map((item) => ({
        type: "Compromisso financeiro",
        title: item.title,
        subtitle: item.category,
        meta: `${formatMoney(item.amount)} · ${formatDateTime(item.nextPaymentAt)}`,
        icon: WalletCards
      }));

    return [...memoryResults, ...reminderResults, ...transactionResults, ...commitmentResults];
  }, [normalized]) ?? [];

  return (
    <div className="page nexo-search-page">
      <PageHeader
        eyebrow="BUSCA GLOBAL"
        title="Pergunte primeiro ao NEXO"
        description="A busca percorre memórias, lembretes, transações e compromissos financeiros."
      />

      <section className="panel">
        <div className="search-box large">
          <Search size={20} />
          <input
            aria-label="Buscar em todo o NEXO"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Ex.: "iCloud", "moto", "consulta"...'
          />
        </div>

        <div className="stack-list">
          {results.map((result, index) => {
            const Icon = result.icon;
            return (
              <article className="search-result" key={`${result.type}-${index}`}>
                <div className="icon-box"><Icon size={18} /></div>
                <div>
                  <span className="result-type">{result.type}</span>
                  <h3>{result.title}</h3>
                  <p>{result.subtitle}</p>
                </div>
                <span className="result-meta">{result.meta}</span>
              </article>
            );
          })}

          {normalized && !results.length && (
            <div className="empty-state">
              Não encontrei nada relacionado a “{query}”.
            </div>
          )}

          {!normalized && (
            <div className="empty-state">
              Digite alguma coisa que você lembra. O NEXO procura no restante.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
