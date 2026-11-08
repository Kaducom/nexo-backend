import {useState} from 'react';
import type {FinanceHistory} from './model';
import {formatCents} from './money';
const labels:Record<string,string>={title:'Nome',description:'Descrição',amount:'Valor anterior em reais',amountCents:'Valor',category:'Categoria',startDate:'Início',dueDate:'Vencimento',nextPaymentAt:'Próximo vencimento',dueDay:'Dia',dueRule:'Regra',state:'Pagamento',status:'Situação',initialPaid:'Já pagas no cadastro',installments:'Parcelas',completedPayments:'Pagamentos realizados',paidAt:'Confirmado em',period:'Periodicidade',card:'Cartão',linked:'Vinculado a despesa existente',historical:'Pagamento anterior ao cadastro'};
const names:Record<string,string>={active:'Ativo',paused:'Pausado',cancelled:'Cancelado',completed:'Concluído',paid:'Pago',pending:'Pendente',day:'Dia fixo',business:'Dia útil',once:'Única',weekly:'Semanal',monthly:'Mensal',yearly:'Anual'};
function description(value:unknown){
  if(value===undefined||value===null)return 'Sem registro';
  if(typeof value!=='object')return names[String(value)]??String(value);
  return Object.entries(value).filter(([key])=>labels[key]).map(([key,v])=>`${labels[key]}: ${key==='amountCents'&&typeof v==='number'?formatCents(v):typeof v==='boolean'?v?'Sim':'Não':names[String(v)]??String(v)}`).join(' · ')||'Registro preservado no histórico';
}
export default function HistoryEntries({entries}:{entries:FinanceHistory[]}){
  const [limit,setLimit]=useState(20);
  if(!entries.length)return <p>Nenhuma alteração registrada nesta versão.</p>;
  return <div className="v2-history">{entries.slice(0,limit).map(h=><details key={h.id}><summary>{new Date(h.at).toLocaleString('pt-BR')} · {h.action}</summary><p><b>Antes:</b> {description(h.before)}</p><p><b>Depois:</b> {description(h.after)}</p></details>)}{entries.length>limit&&<button className="secondary-button" onClick={()=>setLimit(n=>n+20)}>Mostrar mais alterações</button>}</div>;
}
