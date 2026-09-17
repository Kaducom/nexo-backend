import type { PendingChange } from "../sync/model";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { bindAccountDatabase, type NexoDatabase } from "../db";
import { importLegacy, legacyCount, openAccountDatabase } from "../sync/migration";
import { startSync, type SyncStatus } from "../sync/engine";
import { firestoreTransport } from "../sync/firestoreTransport";

const SyncContext = createContext<{ database: NexoDatabase | null; status: SyncStatus }>({ database: null, status: { state: "connecting" } });
export const useAccountSync = () => useContext(SyncContext);

export default function AccountDataGate({ uid, email, children }: { uid: string; email: string | null; children: ReactNode }) {
  const [database, setDatabase] = useState<NexoDatabase | null>(null);
  const [oldCount, setOldCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<SyncStatus>({ state: "connecting" });
  useEffect(() => {
    let cancelled = false, active: NexoDatabase | undefined;
    void (async () => {
      try {
        active = await openAccountDatabase(uid);
        const count = await legacyCount(uid, active);
        if (cancelled) { active.close(); return; }
        bindAccountDatabase(active); setDatabase(active); setOldCount(count);
      } catch { if (!cancelled) setError("Não foi possível abrir os dados desta conta. Recarregue a página; seus dados locais não foram apagados."); }
    })();
    return () => { cancelled = true; active?.close(); };
  }, [uid]);
  useEffect(() => {
    if (!database || oldCount !== 0) return;
    let cancelled = false; let stop: (() => void) | undefined;
    void database.syncMeta.get("deviceId").then(meta => {
      if (!cancelled) stop = startSync(database, firestoreTransport(uid), String(meta!.value), setStatus);
    }).catch(() => setError("Não foi possível iniciar a sincronização. Recarregue a página."));
    return () => { cancelled = true; stop?.(); };
  }, [database, oldCount, uid]);
  async function migrate(include: boolean) {
    if (!database) return;
    setBusy(true); setError("");
    try {
      if (include) await importLegacy(uid, database);
      else await database.syncMeta.put({ key: "legacySkipped", value: true });
      setOldCount(0);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  if (!database || oldCount === null || oldCount > 0) return <main className="account-gate"><section className="panel">
    <span className="eyebrow">SUA CONTA NEXO</span><h1>{oldCount ? "Levar os dados deste aparelho para sua conta?" : "Abrindo seus dados…"}</h1>
    {oldCount ? <><p>Encontramos {oldCount} registros salvos antes da sincronização. Confirme se eles pertencem a <strong>{email}</strong>.</p><p>Ao vincular, eles serão enviados à sua conta e aparecerão nos outros dispositivos. A cópia antiga permanece guardada neste navegador.</p><div className="bank-actions"><button className="primary-button" disabled={busy} onClick={() => void migrate(true)}>{busy ? "Preparando…" : "Vincular à minha conta"}</button><button className="nexo-button nexo-button-secondary" disabled={busy} onClick={() => void migrate(false)}>Continuar sem vincular</button></div></> : null}
    {error && <p role="alert" className="bank-warning">{error}</p>}
  </section></main>;
  return <SyncContext.Provider value={{ database, status }}>{children}</SyncContext.Provider>;
}

export function SyncIndicator() {
  const { database, status } = useAccountSync();
  const pending = useLiveQuery(() => database?.syncOutbox.toArray() ?? Promise.resolve([] as PendingChange[]), [database], []);
  if (!database) return null;
  const conflicts = pending.filter(row => row.conflict).length;
  const label = conflicts ? `${conflicts} conflito(s) para revisar` : status.state === "offline" ? `Sem internet · ${pending.length} alteração(ões) guardada(s)`
    : status.state === "error" ? "Sincronização precisa de atenção" : pending.length ? `${pending.length} alteração(ões) aguardando envio` : status.state === "connecting" ? "Conectando à sua conta…" : "Dados sincronizados com sua conta";
  return <div className={`account-sync-indicator ${status.state === "error" || conflicts ? "account-sync-attention" : ""}`} role="status"><span>{label}</span><a href="/configuracoes#sincronizacao">Ver sincronização</a></div>;
}
