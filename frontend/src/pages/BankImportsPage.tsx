import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ArrowDownToLine, Smartphone, Inbox, Check, Copy, Trash2 } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { db } from "../db";
import { formatMoney, formatDateTime } from "../utils";
import type { BankImportEntry } from "../types";
import { bankCategories, parseShortcut, readBankFile, type ParsedBankFile } from "../services/bankParser";
import { authorizeShortcut, classifyBankEntry, createShortcutKey, getShortcutKey, ignoreBankEntry, ingestBankRows, reopenBankEntry, revokeShortcutKey } from "../services/bankImports";

function PendingEntry({ entry, onError }: { entry: BankImportEntry; onError: (text: string) => void }) {
  const [category, setCategory] = useState("");
  const [remember, setRemember] = useState(false);
  const [separate, setSeparate] = useState(false);
  const [busy, setBusy] = useState(false);
  async function act(save: boolean) {
    setBusy(true);
    try {
      if (save) await classifyBankEntry(entry.id!, category, remember, separate);
      else await ignoreBankEntry(entry.id!);
    } catch (error) { onError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <article className="bank-entry">
    <div className="bank-entry-heading"><div><h3>{entry.description}</h3><p>{formatDateTime(entry.occurredAt)} · {entry.source === "shortcut" ? "Apple Pay" : entry.source.toUpperCase()} · {entry.account === "card" ? "Cartão" : "Conta"}</p></div><strong>{entry.type === "expense" ? "−" : "+"} {formatMoney(entry.amount)}</strong></div>
    {entry.reviewReason && <p className="bank-warning">{entry.reviewReason}</p>}
    {entry.duplicateWarning && <div className="bank-warning"><p>{entry.duplicateWarning}</p><label className="bank-checkbox"><input type="checkbox" checked={separate} onChange={event => setSeparate(event.target.checked)} />É outra movimentação; quero lançar separadamente.</label></div>}
    <form className="bank-classify" onSubmit={(event: FormEvent) => { event.preventDefault(); void act(true); }}>
      <label>Categoria<select aria-label={`Categoria de ${entry.description}`} required value={category} onChange={event => setCategory(event.target.value)}><option value="">Escolha uma categoria</option>{bankCategories.map(value => <option key={value}>{value}</option>)}</select></label>
      {!entry.reviewReason && <label className="bank-checkbox"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} />Lembrar para próximas compras neste estabelecimento</label>}
      <div className="bank-actions"><button className="primary-button" disabled={busy || !category || (!!entry.duplicateWarning && !separate)}><Check size={16} />Lançar</button><button type="button" className="nexo-button nexo-button-ghost" disabled={busy} onClick={() => void act(false)}>Descartar</button></div>
    </form>
  </article>;
}

export default function BankImportsPage() {
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const location = useLocation(); const navigate = useNavigate();
  const entries = useLiveQuery(() => db.bankImports.orderBy("createdAt").reverse().toArray(), [], []);
  const rules = useLiveQuery(() => db.bankRules.toArray(), [], []);
  const [account, setAccount] = useState<"account" | "card">("account");
  const [preview, setPreview] = useState<ParsedBankFile | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const [key, setKey] = useState(() => getShortcutKey(uid));
  const [limit, setLimit] = useState(20);
  const [historyLimit, setHistoryLimit] = useState(20);
  const [retry, setRetry] = useState(0);
  const processing = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const pending = entries.filter(row => row.status === "pending");
  const history = entries.filter(row => row.status !== "pending");
  const shortcutPrefix = `${window.location.origin}/financas/importar#key=${key ?? ""}&payload=`;

  useEffect(() => { setKey(getShortcutKey(uid)); }, [uid]);

  function report(counts: Awaited<ReturnType<typeof ingestBankRows>>) {
    setMessage(`${counts.posted} lançada(s) automaticamente · ${counts.pending} pendente(s) · ${counts.duplicates} já recebida(s).`);
  }

  useEffect(() => {
    if (!location.hash || !uid || processing.current) return;
    processing.current = true;
    setError("");
    void (async () => {
      try {
        const incoming = parseShortcut(location.hash);
        authorizeShortcut(uid, incoming.token);
        report(await ingestBankRows([incoming.candidate]));
        navigate("/financas/importar", { replace: true });
      } catch (err) { setError(`Não foi possível receber a compra. ${(err as Error).message}`); }
      finally { processing.current = false; }
    })();
  }, [location.hash, uid, retry, navigate]);

  async function chooseFile(file?: File) {
    setPreview(null); setError(""); setMessage(""); setFileName("");
    if (!file) return;
    setBusy(true);
    try { setPreview(await readBankFile(file, account)); setFileName(file.name); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function importFile() {
    if (!preview || preview.errors.length) return;
    setBusy(true); setError("");
    try { report(await ingestBankRows(preview.rows)); setPreview(null); if (fileInput.current) fileInput.current.value = ""; }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function copyPrefix() {
    try { await navigator.clipboard.writeText(shortcutPrefix); setMessage("Endereço copiado. Cole na ação Texto do Atalhos."); }
    catch { setError("Não foi possível copiar. Selecione e copie o endereço no campo abaixo."); }
  }
  function changeKey(revoke = false) {
    try { if (revoke) { revokeShortcutKey(uid); setKey(null); } else setKey(createShortcutKey(uid)); setMessage(revoke ? "Atalho desativado neste navegador." : "Chave criada. Configure o Atalho com o novo endereço."); }
    catch { setError("O navegador não permitiu salvar a configuração. Confira se o armazenamento está disponível."); }
  }

  return <div className="page bank-page">
    <Link className="bank-back" to="/financas"><ArrowLeft size={16} />Finanças</Link>
    <PageHeader eyebrow="NUBANK · ENTRADAS" title="Seu dinheiro, organizado na chegada" description="Receba compras do Apple Pay ou importe seu extrato. Você decide as categorias; o NEXO lembra das próximas." />
    <div className="bank-summary"><span><strong>{pending.length}</strong> para classificar</span><span><strong>{rules.length}</strong> regras salvas</span><span>Dados salvos neste navegador</span></div>
    {message && <p className="bank-feedback" role="status">{message}</p>}
    {error && <div className="bank-warning" role="alert"><p>{error}</p>{location.hash && <div className="bank-actions"><button className="nexo-button nexo-button-secondary" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button><button className="nexo-button nexo-button-ghost" onClick={() => { navigate("/financas/importar", { replace: true }); setError(""); }}>Fechar recebimento</button></div>}</div>}

    <div className="bank-sources">
      <section className="panel bank-source"><span className="eyebrow"><ArrowDownToLine size={16} />EXTRATO NUBANK</span><h2>Traga suas movimentações</h2><p>Escolha o OFX ou CSV exportado pelo Nubank. Confira a prévia antes de importar.</p>
        <label>Origem do CSV<select value={account} disabled={busy} onChange={event => { setAccount(event.target.value as "account" | "card"); setPreview(null); if (fileInput.current) fileInput.current.value = ""; }}><option value="account">Conta — saídas com valor negativo</option><option value="card">Cartão — compras com valor positivo</option></select></label>
        <p className="bank-help">No OFX, conta/cartão são identificados pelo arquivo. Somente reais (BRL).</p>
        <label className="bank-file">Selecionar extrato<input ref={fileInput} aria-label="Selecionar extrato" type="file" accept=".ofx,.csv" disabled={busy} onChange={event => void chooseFile(event.target.files?.[0])} /></label>
        <p className="bank-help">Até 5 MB · PDF não é aceito · nenhum arquivo é enviado ao banco ou a um servidor.</p>
      </section>
      <section className="panel bank-source"><span className="eyebrow"><Smartphone size={16} />ATALHOS DO IPHONE</span><h2>Do Apple Pay para o NEXO</h2><p>Ao pagar por aproximação, seu Atalho abre este endereço para entregar a compra. Uma regra conhecida permite o lançamento automático.</p>
        <p className="bank-help">Configure e use no mesmo Safari. A PWA da Tela de Início pode ter um banco de dados separado. A abertura pode exigir desbloquear o iPhone.</p>
        {!key ? <button className="primary-button" onClick={() => changeKey()}>Ativar recebimento do Atalho</button> : <><span className="bank-connected"><Check size={16} />Recebimento autorizado neste navegador</span><label>Endereço para o Atalho<input aria-label="Endereço para o Atalho" value={shortcutPrefix} readOnly onFocus={event => event.target.select()} /></label><div className="bank-actions"><button className="nexo-button nexo-button-secondary" onClick={() => void copyPrefix()}><Copy size={16} />Copiar endereço</button><button className="nexo-button nexo-button-ghost" onClick={() => changeKey(true)}>Desativar</button></div><p className="bank-help">O endereço contém sua chave. Desativar revoga os Atalhos configurados com ela.</p></>}
        <details className="bank-guide"><summary>Como configurar no iPhone</summary><ol>
          <li>Abra o NEXO no Safari, entre na sua conta e ative o recebimento acima.</li>
          <li>No app Atalhos, entre em <strong>Automação → + → Transação</strong> e escolha o cartão Nubank. Escolha executar imediatamente, se disponível.</li>
          <li>Na automação, adicione <strong>Gerar UUID</strong> e <strong>Data Atual → Formatar Data</strong> em ISO 8601.</li>
          <li>Crie um <strong>Dicionário</strong> com os campos abaixo. Em <code>amount</code> e <code>merchant</code>, selecione a propriedade correspondente da Entrada do Atalho. Não escreva os nomes das variáveis como texto.</li>
        </ol><dl className="bank-fields"><dt>amount</dt><dd>Valor da compra (número positivo)</dd><dt>merchant</dt><dd>Estabelecimento (texto)</dd><dt>date</dt><dd>Data formatada (ISO 8601)</dd><dt>id</dt><dd>UUID gerado</dd><dt>currency</dt><dd>BRL, somente para compras em reais</dd></dl><ol start={5}>
          <li>Use <strong>Obter Texto da Entrada</strong> com o Dicionário; depois <strong>Codificar URL</strong> nesse texto JSON.</li>
          <li>Adicione <strong>Texto</strong>: cole o endereço copiado e, logo após <code>payload=</code>, insira a variável do texto codificado, sem espaços extras.</li>
          <li>Finalize com <strong>Abrir URLs</strong> usando o Texto. Faça uma compra de teste e confira se ela chegou nesta página.</li>
        </ol><p>Se o cartão não fornecer valor ou estabelecimento, use “Pedir Entrada” para completar o campo. O NEXO recusa dados incompletos. A automação não confirma a liquidação da compra; confira o extrato para cancelamentos e ajustes.</p><p>Não cobre Pix, boletos ou compras fora desse acionador. Não funciona como recebimento em segundo plano: o NEXO precisa abrir.</p><a href="https://support.apple.com/pt-br/guide/shortcuts/apd65c67538a/ios" target="_blank" rel="noreferrer">Guia de transações da Apple ↗</a></details>
      </section>
    </div>

    {preview && <section className="panel bank-preview" aria-label="Prévia do extrato"><span className="eyebrow">ANTES DE IMPORTAR</span><h2>{fileName}</h2><p>{preview.rows.length} movimentações válidas · {preview.account === "card" ? "Cartão" : "Conta"} · {preview.format.toUpperCase()}</p><p>As regras serão aplicadas às compras reconhecidas. Entradas, transferências, ajustes e possíveis duplicatas precisam de revisão.</p>
      {preview.errors.length > 0 && <div className="bank-warning" role="alert"><strong>Corrija o arquivo antes de importar. Nenhuma linha foi salva.</strong><ul>{preview.errors.slice(0, 10).map((value, index) => <li key={index}>{value}</li>)}</ul>{preview.errors.length > 10 && <p>Mais {preview.errors.length - 10} erros no arquivo.</p>}</div>}
      <div className="bank-table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Movimento</th><th>Valor</th></tr></thead><tbody>{preview.rows.slice(0, 20).map((row, index) => <tr key={index}><td>{new Date(row.occurredAt).toLocaleDateString("pt-BR")}</td><td>{row.description}</td><td>{row.type === "expense" ? "Saída" : "Entrada"}</td><td>{formatMoney(row.amount)}</td></tr>)}</tbody></table></div>
      {preview.rows.length > 20 && <p className="bank-help">Mostrando as primeiras 20 de {preview.rows.length} movimentações.</p>}<div className="bank-actions"><button className="primary-button" disabled={busy || !!preview.errors.length || !preview.rows.length} onClick={() => void importFile()}>{busy ? "Importando…" : `Importar ${preview.rows.length} movimentações`}</button><button className="nexo-button nexo-button-ghost" disabled={busy} onClick={() => { setPreview(null); if (fileInput.current) fileInput.current.value = ""; }}>Cancelar</button></div>
    </section>}

    <section className="panel bank-inbox"><div className="section-title-row"><div><span className="eyebrow"><Inbox size={16} />SUA REVISÃO</span><h2>Pendentes de classificação <span className="finance-tab-count">{pending.length}</span></h2></div></div>
      {!pending.length ? <div className="bank-empty"><Check size={24} /><h3>Tudo em dia por aqui</h3><p>Compras sem regra aparecerão aqui. Elas só entram no saldo depois de classificadas.</p></div> : pending.slice(0, limit).map(entry => <PendingEntry key={entry.id} entry={entry} onError={setError} />)}
      {pending.length > limit && <button className="nexo-button nexo-button-secondary" onClick={() => setLimit(value => value + 20)}>Mostrar mais pendentes</button>}
    </section>
    <section className="panel"><details className="bank-guide"><summary>Regras de classificação · {rules.length}</summary><p>Correspondência pelo nome completo do estabelecimento, sem diferenciar maiúsculas ou acentos. A regra vale para novas compras na mesma origem (conta ou cartão). Pendentes anteriores continuam aguardando sua revisão.</p>{!rules.length && <p>Ao classificar uma compra, marque “Lembrar” para criar a primeira regra.</p>}{rules.map(rule => <div className="bank-history-row" key={rule.id}><div><strong>{rule.description}</strong><p>{rule.category}</p></div><button className="nexo-button nexo-button-ghost" aria-label={`Excluir regra de ${rule.description}`} onClick={() => void db.bankRules.delete(rule.id!).catch(() => setError("Não foi possível excluir a regra."))}><Trash2 size={16} /></button></div>)}</details></section>
    <section className="panel"><details className="bank-guide"><summary>Histórico de recebimentos · {history.length}</summary><p>Reabrir um lançamento o retira do saldo e devolve à fila. A regra salva permanece até você excluí-la.</p>{history.slice(0, historyLimit).map(entry => <div className="bank-history-row" key={entry.id}><div><strong>{entry.description}</strong><p>{formatMoney(entry.amount)} · {entry.status === "posted" ? `Lançada em ${entry.category}` : "Descartada"} · {new Date(entry.occurredAt).toLocaleDateString("pt-BR")}</p></div><button className="nexo-button nexo-button-secondary" onClick={() => void reopenBankEntry(entry.id!).catch(() => setError("Não foi possível reabrir a movimentação."))}>Reabrir</button></div>)}{history.length > historyLimit && <button className="nexo-button nexo-button-ghost" onClick={() => setHistoryLimit(value => value + 20)}>Mostrar mais recebimentos</button>}</details></section>
  </div>;
}
