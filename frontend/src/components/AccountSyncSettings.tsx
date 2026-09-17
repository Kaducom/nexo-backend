import type { PendingChange } from "../sync/model";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useAccountSync } from "./AccountDataGate";
import { useAuth } from "../context/AuthContext";
import { importLegacy } from "../sync/migration";
import { resolveConflict } from "../sync/engine";

const names: Record<string, string> = { memories: "Memória", reminders: "Lembrete", transactions: "Movimentação", financialCommitments: "Compromisso financeiro", bankImports: "Importação bancária", bankRules: "Regra de categoria" };
const fields: Record<string, string> = { title: "Título", description: "Descrição", content: "Conteúdo", notes: "Observações", tags: "Etiquetas", amount: "Valor", category: "Categoria", type: "Tipo", startsAt: "Data do lembrete", occurredAt: "Data", nextPaymentAt: "Próximo pagamento", completed: "Concluído", status: "Situação", completedPayments: "Parcelas pagas", totalPayments: "Total de parcelas", frequency: "Frequência", intervalDays: "Intervalo em dias", paymentMethod: "Pagamento", reminderMinutesBefore: "Aviso (minutos antes)" };
const labels: Record<string, string> = {income:"Entrada",expense:"Saída",pending:"Pendente",posted:"Lançado",ignored:"Ignorado",active:"Ativo",completed:"Concluído",paused:"Pausado",cancelled:"Cancelado",weekly:"Semanal",biweekly:"Quinzenal",monthly:"Mensal",custom:"Personalizado",pix:"Pix",boleto:"Boleto",transfer:"Transferência",cash:"Dinheiro",card:"Cartão",other:"Outro"};
function Version({ deleted, payload }: Pick<PendingChange, "deleted" | "payload">) {
  if (deleted) return <p>Excluído</p>;
  return <dl>{Object.entries(payload ?? {}).filter(([key]) => fields[key]).map(([key,value]) => {
    const text = value === null ? "Não definido" : key === "amount" ? Number(value).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) : typeof value === "boolean" ? (value ? "Sim" : "Não") : Array.isArray(value) ? value.join(", ") : key.endsWith("At") ? new Date(String(value)).toLocaleString("pt-BR") : labels[String(value)] ?? String(value);
    return <div key={key}><dt>{fields[key]}</dt><dd>{text || "—"}</dd></div>;
  })}</dl>;
}
export default function AccountSyncSettings() {
  const { database, status } = useAccountSync(); const { user } = useAuth();
  const changes = useLiveQuery(() => database?.syncOutbox.toArray() ?? Promise.resolve([] as PendingChange[]), [database], []);
  const skipped = useLiveQuery(() => database?.syncMeta.get("legacySkipped") ?? Promise.resolve(undefined), [database]);
  const imported = useLiveQuery(() => database?.syncMeta.get("legacyImported") ?? Promise.resolve(undefined), [database]);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  if (!database) return null;
  async function act(operation: () => Promise<unknown>) { setBusy(true); setError(""); try { await operation(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }
  return <section id="sincronizacao" className="panel account-sync-settings"><span className="eyebrow">CONTA GOOGLE</span><h2>Seus dados, em todos os dispositivos</h2><p>Entre com <strong>{user?.email}</strong> no celular e no computador. Memórias, lembretes, finanças e regras acompanham sua conta.</p><p>Alterações feitas sem internet ficam neste aparelho até a conexão voltar. Aguarde o envio antes de limpar os dados do navegador.</p><p><strong>{changes.length}</strong> alteração(ões) pendente(s) de envio.</p>
    {status.state === "error" && <p role="alert" className="bank-warning">Não foi possível sincronizar. Seus dados continuam salvos neste aparelho. Verifique sua conexão. O NEXO tentará novamente; se o aviso continuar, entre em contato com o suporte.</p>}
    {skipped && !imported && <button className="nexo-button nexo-button-secondary" disabled={busy} onClick={() => void act(() => importLegacy(user!.uid, database!))}>Vincular os dados antigos deste aparelho</button>}
    {changes.filter(row => row.conflict).map(row => <article className="account-conflict" key={row.key}><h3>{names[row.table]}: alterações em dois dispositivos</h3><p>Escolha qual versão manter. A outra versão não será aplicada.</p><div className="account-conflict-versions"><div><strong>Neste aparelho</strong><Version {...row}/></div><div><strong>Na conta</strong><Version {...row.conflict!}/></div></div><div className="bank-actions"><button className="primary-button" disabled={busy} onClick={() => void act(() => resolveConflict(database!, row.key, true))}>Manter deste aparelho</button><button className="nexo-button nexo-button-secondary" disabled={busy} onClick={() => void act(() => resolveConflict(database!, row.key, false))}>Usar versão da conta</button></div></article>)}
    {error && <p className="bank-warning" role="alert">{error}</p>}
  </section>;
}
