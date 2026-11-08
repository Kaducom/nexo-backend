import type {FinanceTransaction,FinancialCommitment} from '../types';
import type {FinancePlan,FinanceOccurrence,FinanceSettings} from './model';
import {localDay,parseDay} from './model';
import {recordCents} from './money';
import {endOfMonth,occurrences} from './schedule';
import {calculateNextPaymentDate} from '../services/financialCommitments';
export function financeSummary(transactions:FinanceTransaction[],plans:FinancePlan[],overrides:FinanceOccurrence[],legacy:FinancialCommitment[],settings:FinanceSettings,month:string,today=localDay()){
  const end=endOfMonth(month),start=month+'-01',monthly=transactions.filter(t=>localDay(new Date(t.occurredAt)).startsWith(month));
  const income=monthly.filter(t=>t.type==='income').reduce((n,t)=>n+recordCents(t),0),expenses=monthly.filter(t=>t.type==='expense').reduce((n,t)=>n+recordCents(t),0);
  const referenceDate=parseDay(start);let reference=settings.incomeCents,historyMonths=0;
  if(settings.mode==='average'){
    let total=0;for(let offset=1;offset<=settings.months;offset++){const key=localDay(new Date(referenceDate.getFullYear(),referenceDate.getMonth()-offset,1,12)).slice(0,7);const items=transactions.filter(t=>t.type==='income'&&localDay(new Date(t.occurredAt)).startsWith(key));if(items.length)historyMonths++;total+=items.reduce((n,t)=>n+recordCents(t),0);}
    reference=Math.round(total/settings.months);
  }
  const active=plans.filter(p=>p.status==='active');
  const all=active.flatMap(p=>occurrences(p,overrides,end).map(o=>({...o,plan:p})));
  const pending=all.filter(o=>o.state==='pending'&&o.dueDate>=start),overdue=all.filter(o=>o.state==='pending'&&o.dueDate<today);
  let legacyPending=0,legacyOverdue=0;
  for(const item of legacy.filter(c=>c.status==='active')){
    let day=item.nextPaymentAt;const limit=item.totalPayments===null?6000:Math.max(0,item.totalPayments-item.completedPayments);
    for(let i=0;i<limit;i++){const key=localDay(new Date(day));if(key>end)break;if(key>=start)legacyPending+=recordCents(item);if(key<today)legacyOverdue+=recordCents(item);day=calculateNextPaymentDate(day,item.frequency,item.intervalDays);}
  }
  const pendingCents=pending.reduce((n,o)=>n+o.amountCents,0)+legacyPending;
  const committed=expenses+pendingCents,available=reference-committed;
  let debt=0;
  for(const p of active){const horizon=p.kind==='installment'?'9999-12-31':end;debt+=occurrences(p,overrides,horizon).filter(o=>o.state==='pending'&&(p.kind==='installment'||p.kind==='bill')).reduce((n,o)=>n+o.amountCents,0);}
  for(const c of legacy.filter(c=>c.status==='active'&&c.totalPayments!==null))debt+=Math.max(0,c.totalPayments!-c.completedPayments)*recordCents(c);
  const percentage=reference?committed/reference*100:null;
  const band=percentage===null?'Sem renda de referência':percentage>100?'Déficit projetado':percentage>settings.warning?'Elevado':percentage>settings.comfortable?'Atenção':'Confortável';
  return {income,expenses,reference,pendingCents,legacyPending,overdueCents:overdue.reduce((n,o)=>n+o.amountCents,0)+legacyOverdue,committed,available,debt,percentage,band,historyMonths,pending,subscriptions:pending.filter(o=>o.plan.kind==='subscription').reduce((n,o)=>n+o.amountCents,0),installments:pending.filter(o=>o.plan.kind==='installment').reduce((n,o)=>n+o.amountCents,0),monthlySubscriptions:active.filter(p=>p.kind==='subscription').reduce((n,p)=>n+Math.round(p.amountCents*(p.period==='weekly'?52/12:p.period==='yearly'?1/12:1)),0)};
}
