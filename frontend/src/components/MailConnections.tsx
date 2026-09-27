import {useEffect,useState} from 'react';
import {Mail,RefreshCw,Link2,Unplug} from 'lucide-react';
import {connectGmail,finishGmailConnection,mailRequest,type MailStatus,type MailProvider} from '../services/mailService';
export default function MailConnections(){
  const [status,setStatus]=useState<MailStatus|null>(null),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState('');
  const [address,setAddress]=useState(''),[password,setPassword]=useState(''),[showICloud,setShowICloud]=useState(false);
  const reload=async()=>setStatus(await mailRequest<MailStatus>('status'));
  useEffect(()=>{
    let active=true;
    void(async()=>{
      try{const message=await finishGmailConnection();if(active&&message)setFeedback(message);}
      catch(error){if(active)setFeedback((error as Error).message);}
      // A cancelled OAuth flow must not prevent reconnecting either provider.
      try{const data=await mailRequest<MailStatus>('status');if(active)setStatus(data);}
      catch(error){if(active)setFeedback((error as Error).message);}
    })();return()=>{active=false;};
  },[]);
  async function act(task:()=>Promise<string>){setBusy(true);setFeedback('');try{setFeedback(await task());await reload();}catch(error){setFeedback((error as Error).message);}finally{setBusy(false);}}
  async function sync(provider:MailProvider){const result=await mailRequest<{added:number;ignored:number}>('sync',{provider});return `${result.added} lembrete(s) criado(s) ou atualizado(s). As demais mensagens não geraram novos lembretes.`;}
  return <section className="panel mail-connections" id="email"><div className="mail-section-title"><Mail size={22}/><div><span className="eyebrow">SUAS CAIXAS DE ENTRADA</span><h2>E-mails que viram lembretes</h2></div></div><p>Conecte Gmail e iCloud para trazer compromissos confirmados e prazos com data clara. O NEXO verifica novos e-mails periodicamente; promoções, newsletters e mensagens ambíguas ficam de fora.</p>
    <div className="mail-provider-grid">{(['gmail','icloud'] as const).map(provider=>{const connection=status?.connections.find(c=>c.provider===provider);return <article className="mail-provider" key={provider}><div className="mail-provider-heading"><span className={`email-source ${provider}`}>{provider==='gmail'?'Gmail':'Mail · iCloud'}</span><span className="mail-state">{connection?'Conectado':'Não conectado'}</span></div><h3>{connection?.address ?? (provider==='gmail'?'Sua conta Gmail':'Seu e-mail iCloud')}</h3><p>{connection?`Fuso: ${connection.timeZone}`:provider==='gmail'?'Autorize a leitura na tela do Google.':'Use uma senha específica de app da Apple.'}</p>
      {connection?.lastCheckedAt&&<p>Última verificação: {new Date(connection.lastCheckedAt).toLocaleString('pt-BR')}</p>}
      {connection?.error&&<p role="alert" className="bank-warning">Não foi possível verificar esta conta. Tente novamente; se o problema continuar, desconecte e conecte de novo.</p>}
      {connection?<div className="bank-actions"><button className="nexo-button nexo-button-secondary" disabled={busy} onClick={()=>void act(()=>sync(provider))}><RefreshCw size={15}/> Verificar agora</button><button className="nexo-button nexo-button-secondary" disabled={busy} onClick={()=>{if(window.confirm('Desconectar esta conta? Os lembretes já criados serão mantidos.'))void act(async()=>{await mailRequest('disconnect',{provider});return 'Conta desconectada. Seus lembretes foram mantidos.';});}}><Unplug size={15}/> Desconectar</button></div>:<button className="primary-button" disabled={busy||!status?.capabilities[provider]} onClick={()=>provider==='gmail'?void act(async()=>{await connectGmail();return 'Abrindo Google…';}):setShowICloud(v=>!v)}><Link2 size={15}/> Conectar {provider==='gmail'?'Gmail':'iCloud'}</button>}
      {!connection&&status&&!status.capabilities[provider]&&<p className="mail-unavailable">Esta conexão ainda precisa ser habilitada na configuração do NEXO.</p>}
    </article>;})}</div>
    {showICloud&&<form className="mail-icloud-form" onSubmit={event=>{event.preventDefault();const credential=password;setPassword('');void act(async()=>{await mailRequest('icloud/connect',{address,password:credential,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone});setShowICloud(false);return 'iCloud conectado. A verificação automática está habilitada.';});}}><h3>Conectar o iCloud Mail</h3><label>E-mail iCloud<input type="email" autoComplete="email" required value={address} onChange={e=>setAddress(e.target.value)}/></label><label>Senha específica de app<input type="password" autoComplete="off" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="xxxx-xxxx-xxxx-xxxx"/></label><p>Crie uma senha para o NEXO em <a href="https://account.apple.com/" target="_blank" rel="noreferrer">Conta Apple → Início de sessão e segurança → Senhas específicas de apps</a>. Use essa senha neste campo.</p><button className="primary-button" disabled={busy}>Conectar conta</button></form>}
    {feedback&&<p role="status" className="settings-feedback">{feedback}</p>}
    <p className="mail-footnote">A primeira leitura considera a caixa de entrada dos últimos 7 dias. Os e-mails são lidos em lotes e não são marcados como lidos. Prazos sem horário recebem um aviso às 09h. Somente o lembrete e sua origem são guardados; anexos não são importados.</p>
  </section>;
}
