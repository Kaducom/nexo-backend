import {useState} from 'react';
import {Link} from 'react-router-dom';
import {Bell,Brain,Search,ArrowDownLeft,ArrowUpRight,ChevronRight} from 'lucide-react';
import {useLiveQuery} from 'dexie-react-hooks';
import {db} from '../db';
import {useAuth} from '../context/AuthContext';
import TodayOverview from '../components/TodayOverview';
import {useFinance} from '../finance/useFinance';
import FinanceOverview from '../finance/FinanceOverview';
import {localDay} from '../finance/model';
import {occurrences} from '../finance/schedule';
import {formatCents,recordCents} from '../finance/money';
import HomePage from './HomePage';
export default function HomeV2Page(){
  const {user}=useAuth(),data=useFinance(),[expanded,setExpanded]=useState(false);
  const memories=useLiveQuery(()=>db.memories.orderBy('updatedAt').reverse().limit(3).toArray(),[])??[];
  const month=localDay().slice(0,7),horizon=`${new Date().getFullYear()+1}-12-31`;
  const upcoming=data?[...data.plans.filter(p=>p.status==='active').flatMap(p=>occurrences(p,data.overrides,horizon).filter(o=>o.state==='pending').map(o=>({id:String(o.id),title:p.title,day:o.dueDate,amount:o.amountCents,tab:p.kind==='subscription'?'subscriptions':p.kind==='installment'?'installments':'bills'}))),...data.legacy.filter(c=>c.status==='active').map(c=>({id:`legacy:${c.id}`,title:c.title,day:localDay(new Date(c.nextPaymentAt)),amount:recordCents(c),tab:'bills'}))].sort((a,b)=>a.day.localeCompare(b.day)).slice(0,5):[];
  return <div className="page v2-page v2-home"><header className="v2-home-heading"><span className="v2-eyebrow">NEXO · SEU DIA, ORGANIZADO</span><h1>Olá, {user?.displayName?.split(' ')[0]??'você'}.</h1><p>Um lugar para cuidar do seu tempo, das suas ideias e do seu dinheiro.</p></header><div className="v2-quick-links"><Link to="/financas?tab=transactions&type=expense"><ArrowUpRight/> Nova despesa</Link><Link to="/financas?tab=transactions&type=income"><ArrowDownLeft/> Nova receita</Link><Link to="/lembretes"><Bell/> Criar lembrete</Link><Link to="/memorias"><Brain/> Guardar memória</Link></div>
    <div className="v2-section-heading"><h2>Seu dinheiro neste mês</h2><Link to="/financas">Ver finanças <ChevronRight size={16}/></Link></div>{data?<FinanceOverview data={data} month={month} compact/>:<div className="v2-skeleton" role="status">Carregando resumo…</div>}
    <div className="v2-home-grid"><section className="v2-panel"><div className="v2-section-heading"><h2>Próximos vencimentos</h2><Link to="/financas?tab=bills">Ver contas</Link></div>{upcoming.length===0?<p className="v2-empty">Nenhuma cobrança pendente cadastrada.</p>:upcoming.map(o=><Link className="v2-upcoming" key={o.id} to={`/financas?tab=${o.tab}`}><div><strong>{o.title}</strong><small className={o.day<localDay()?'v2-negative':''}>{o.day.split('-').reverse().join('/')}{o.day<localDay()?' · Vencida, ainda pendente':''}</small></div><b>{formatCents(o.amount)}</b></Link>)}</section><section className="v2-panel"><div className="v2-section-heading"><h2>Ideias por perto</h2><Link to="/buscar"><Search size={18}/> Buscar</Link></div>{memories.length===0?<p className="v2-empty">Suas memórias mais recentes aparecerão aqui.</p>:memories.map(m=><Link className="v2-memory" to="/memorias" key={m.id}><Brain size={17}/><div><strong>{m.title}</strong><small>{m.content.slice(0,110)}</small></div></Link>)}</section></div>
    <div className="v2-agenda"><TodayOverview/></div>
    <section className="v2-panel"><button className="secondary-button" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Ocultar ferramentas anteriores':'Mais ferramentas e registro rápido'}</button>{expanded&&<div className="v2-previous-home"><HomePage/></div>}</section>
  </div>;
}
