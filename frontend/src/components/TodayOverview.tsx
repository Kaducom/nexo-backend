import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Plus, Sun } from "lucide-react";
import { Link } from "react-router-dom";
import { db } from "../db";
import { useAuth } from "../context/AuthContext";

export default function TodayOverview() {
  const { user } = useAuth();
  const [now, setNow] = useState(new Date());
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30000); return () => clearInterval(timer); }, []);
  const reminders = useLiveQuery(() => db.reminders.orderBy("startsAt").toArray(), [], []);
  const days = Array.from({ length: 7 }, (_, i) => { const day = new Date(now); day.setDate(day.getDate() + offset + i); day.setHours(0,0,0,0); return day; });
  const date = days[selected];
  const items = reminders.filter(r => new Date(r.startsAt).toDateString() === date.toDateString());
  const pending = items.filter(r => !r.completed).length;
  async function toggle(id: number, completed: boolean) {
    try { await db.reminders.update(id, { completed: !completed }); setError(""); } catch { setError("Não foi possível atualizar. Tente novamente."); }
  }
  return <section className="today-overview">
    <div className="today-intro"><span className="eyebrow"><Sun size={15}/> SEU ESPAÇO, SEU RITMO</span><h1>{now.getHours() < 12 ? "Bom dia" : now.getHours() < 18 ? "Boa tarde" : "Boa noite"}, {user?.displayName?.split(" ")[0] || "vamos lá"}.</h1><p>Um lugar para organizar o dia e deixar a cabeça livre.</p><div className="today-actions"><Link className="primary-button" to="/lembretes"><Plus size={17}/> Novo lembrete</Link><Link className="nexo-button nexo-button-secondary" to="/memorias">Guardar uma ideia <ArrowRight size={16}/></Link></div><div className="today-note"><span className="today-note-line"/><span>{pending ? `${pending} ${pending === 1 ? "lembrete pendente" : "lembretes pendentes"} no dia selecionado.` : "Um respiro na agenda. Seu tempo também importa."}</span></div></div>
    <div className="today-agenda"><div className="today-heading"><div><span className="eyebrow">SUA AGENDA</span><h2>{date.toLocaleDateString("pt-BR", {month:"long",year:"numeric"})}</h2></div><div className="today-week-nav"><button aria-label="Semana anterior" onClick={() => setOffset(n=>n-7)}><ArrowLeft size={16}/></button><button onClick={()=>{setOffset(0);setSelected(0);}}>Hoje</button><button aria-label="Próxima semana" onClick={() => setOffset(n=>n+7)}><ArrowRight size={16}/></button></div></div>
      <div className="today-week">{days.map((day,i)=><button key={i} aria-pressed={i===selected} aria-label={day.toLocaleDateString("pt-BR",{dateStyle:"full"})} onClick={()=>setSelected(i)} className={i===selected?"selected":""}><span>{day.toLocaleDateString("pt-BR",{weekday:"short"}).replace(".","")}</span><strong>{day.getDate()}</strong><i className={reminders.some(r=>!r.completed&&new Date(r.startsAt).toDateString()===day.toDateString())?"has-events":""}/></button>)}</div>
      <div className="today-events">{items.length ? items.map(item=><div className={`today-event ${item.completed?"done":""}`} key={item.id}><time>{new Date(item.startsAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</time><div><strong>{item.title}</strong><span>{item.completed?"Concluído":item.notes || "Lembrete"}</span></div><button aria-label={`${item.completed?"Reabrir":"Concluir"} ${item.title}`} onClick={()=>void toggle(item.id!,item.completed)}>{item.completed?<Check size={16}/>:<span/>}</button></div>) : <div className="today-empty"><CalendarDays size={26}/><strong>Nenhum compromisso neste dia</strong><span>Adicione um lembrete e ele aparece aqui.</span></div>}</div>
      {error && <p role="alert">{error}</p>}<Link className="today-all" to="/lembretes">Abrir todos os lembretes <ArrowRight size={15}/></Link>
    </div>
  </section>;
}
