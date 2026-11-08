import {stableId} from '../sync/model';
import {splitInstallments} from './money';
import {localDay,parseDay,type FinancePlan,type FinanceOccurrence} from './model';
export function businessDay(year:number,month:number,n:number,holidays:string[]=[]){
  let count=0;
  for(let day=1;day<=31;day++){const date=new Date(year,month,day,12);if(date.getMonth()!==month)break;if(![0,6].includes(date.getDay())&&!holidays.includes(localDay(date))&&++count===n)return localDay(date);}
  throw Error('O mês não possui esse número de dias úteis. Escolha de 1 a 15.');
}
export function occurrenceDate(plan:FinancePlan,index:number):string{
  const start=parseDay(plan.startDate);
  if(plan.period==='once')return plan.startDate;
  if(plan.period==='weekly'){start.setDate(start.getDate()+index*7);return localDay(start);}
  const month=new Date(start.getFullYear(),start.getMonth()+(plan.period==='yearly'?index*12:index),1,12);
  const date=plan.dueRule==='business'?businessDay(month.getFullYear(),month.getMonth(),plan.dueDay,plan.holidays):localDay(new Date(month.getFullYear(),month.getMonth(),Math.min(plan.dueDay,new Date(month.getFullYear(),month.getMonth()+1,0).getDate()),12));
  // First billing month is explicit: startDate must not be after its due day.
  return date;
}
export function occurrences(plan:FinancePlan,overrides:FinanceOccurrence[],through:string):FinanceOccurrence[]{
  if(!plan.id)return [];
  const saved=new Map(overrides.filter(o=>o.planId===plan.id).map(o=>[o.index,o]));
  const amounts=plan.kind==='installment'?splitInstallments(plan.amountCents,plan.installments):null;
  const count=plan.kind==='installment'?plan.installments:plan.period==='once'?1:6000;
  const result:FinanceOccurrence[]=[];
  for(let index=0;index<count;index++){
    const dueDate=occurrenceDate(plan,index);
    if(dueDate>through&&!amounts)break;
    const original:FinanceOccurrence={id:stableId(`financeOccurrence:${plan.id}:${index}`),planId:plan.id,index,dueDate,amountCents:amounts?.[index]??plan.amountCents,state:index<plan.initialPaid?'paid':'pending',historical:index<plan.initialPaid,updatedAt:plan.updatedAt};
    const occurrence=saved.get(index)??original;
    if(occurrence.dueDate<=through)result.push(occurrence);
    saved.delete(index);
  }
  // An explicitly rescheduled occurrence can fall outside the base schedule range.
  for(const occurrence of saved.values())if(occurrence.dueDate<=through)result.push(occurrence);
  return result.sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.index-b.index);
}
export function endOfMonth(month:string){const date=parseDay(month+'-01');return localDay(new Date(date.getFullYear(),date.getMonth()+1,0,12));}
