import {db} from '../db';
import {randomId,stableId} from '../sync/model';
import {validCents,recordCents,splitInstallments} from './money';
import {parseDay,type FinancePlan,type FinanceOccurrence,type FinanceSettings} from './model';
import {businessDay,occurrenceDate} from './schedule';
import type {FinanceTransaction} from '../types';
const now=()=>new Date().toISOString();
function positive(value:number){if(!validCents(value)||value<=0)throw Error('Informe um valor positivo dentro do limite.');}
function validate(plan:FinancePlan){
  positive(plan.amountCents);parseDay(plan.startDate);
  if(!plan.title.trim()||plan.title.length>160)throw Error('Informe um título de até 160 caracteres.');
  if(!['bill','subscription','installment'].includes(plan.kind)||!['once','weekly','monthly','yearly'].includes(plan.period)||!['active','paused','cancelled'].includes(plan.status))throw Error('Plano inválido.');
  if(!Number.isInteger(plan.dueDay)||plan.dueDay<1||plan.dueDay>(plan.dueRule==='business'?15:31))throw Error('Dia de vencimento inválido.');
  if(plan.holidays.length>366)throw Error('Use até 366 feriados explícitos.');plan.holidays.forEach(parseDay);
  if(plan.dueRule==='business')for(const month of new Set(plan.holidays.map(day=>day.slice(0,7)))){const date=parseDay(month+'-01');businessDay(date.getFullYear(),date.getMonth(),plan.dueDay,plan.holidays);}
  if(plan.kind==='installment'&&(!Number.isInteger(plan.installments)||plan.installments<1||plan.installments>600||plan.amountCents<plan.installments||!Number.isInteger(plan.initialPaid)||plan.initialPaid<0||plan.initialPaid>plan.installments||plan.period!=='monthly'))throw Error('Confira o total e a quantidade de parcelas.');
  if(plan.kind!=='installment'&&plan.initialPaid!==0)throw Error('Pagamentos anteriores são informados apenas em parcelamentos.');
  if(occurrenceDate(plan,0)<plan.startDate)throw Error('O primeiro vencimento calculado fica antes do início. Ajuste a data de início ou o dia de vencimento.');
}
export async function savePlan(input:FinancePlan){
  validate(input);
  return db.transaction('rw',db.financePlans,db.financeOccurrences,db.financeHistory,async()=>{
    const old=input.id?await db.financePlans.get(input.id):undefined;
    if(input.id&&!old)throw Error('Este plano não existe mais.');
    if(old&&old.updatedAt!==input.updatedAt)throw Error('Este plano mudou. Reabra a edição.');
    if(old&&(old.kind!==input.kind||old.initialPaid!==input.initialPaid||old.installments!==input.installments||old.startDate!==input.startDate||old.period!==input.period))throw Error('Depois de criar, preserve tipo, início, periodicidade e quantidade de parcelas. Cancele e crie outro plano para mudar a estrutura.');
    if(old?.kind==='installment'&&old.amountCents!==input.amountCents)throw Error('Para preservar o total parcelado, corrija uma ocorrência individualmente.');
    const time=now(),id=input.id??randomId();
    const plan={...input,id,title:input.title.trim(),createdAt:old?.createdAt??time,updatedAt:time};
    await db.financePlans.put(plan);
    await db.financeHistory.add({planId:id,action:old?'Plano alterado':'Plano criado',at:time,before:old??null,after:plan});
    return id;
  });
}
export async function changePlanStatus(id:number,status:FinancePlan['status']){
  await db.transaction('rw',db.financePlans,db.financeHistory,async()=>{const old=await db.financePlans.get(id);if(!old)throw Error('Plano não encontrado.');if(old.status===status)return;await db.financePlans.update(id,{status,updatedAt:now()});await db.financeHistory.add({planId:id,action:status==='active'?'Plano reativado':status==='paused'?'Plano pausado':'Plano cancelado',at:now(),before:old.status,after:status});});
}
async function resolve(planId:number,index:number){
  const plan=await db.financePlans.get(planId);if(!plan)throw Error('Plano não encontrado.');
  const overrides=await db.financeOccurrences.where('planId').equals(planId).toArray();
  if(!Number.isInteger(index)||index<0||index>=6000||(plan.kind==='installment'&&index>=plan.installments)||(plan.period==='once'&&index!==0))throw Error('Cobrança inválida.');
  const occurrence:FinanceOccurrence=overrides.find(o=>o.index===index)??{id:stableId(`financeOccurrence:${planId}:${index}`),planId,index,dueDate:occurrenceDate(plan,index),amountCents:plan.kind==='installment'?splitInstallments(plan.amountCents,plan.installments)[index]:plan.amountCents,state:index<plan.initialPaid?'paid':'pending',historical:index<plan.initialPaid,updatedAt:plan.updatedAt};
  if(!occurrence)throw Error('Cobrança não encontrada.');return {plan,occurrence};
}
export async function confirmPayment(planId:number,index:number,existingTransactionId?:number){
  return db.transaction('rw',db.financePlans,db.financeOccurrences,db.transactions,db.financeHistory,async()=>{
    const {plan,occurrence}=await resolve(planId,index);
    if(occurrence.state==='paid')return false;
    if(plan.status!=='active')throw Error('Reative o plano antes de confirmar o pagamento.');
    const time=now(),transactionId=existingTransactionId??stableId(`financePayment:${occurrence.id}`);
    const existing=await db.transactions.get(transactionId);
    if(existingTransactionId){if(!existing||existing.type!=='expense'||recordCents(existing)!==occurrence.amountCents||existing.financialCommitmentId||existing.financeOccurrenceId)throw Error('Escolha uma despesa do mesmo valor ainda não vinculada.');await db.transactions.update(transactionId,{financeOccurrenceId:occurrence.id});}
    else {if(existing)throw Error('Já existe uma movimentação para esta cobrança. Atualize a sincronização.');await db.transactions.add({id:transactionId,description:plan.title,amount:occurrence.amountCents/100,amountCents:occurrence.amountCents,type:'expense',category:plan.category,occurredAt:time,createdAt:time,financeOccurrenceId:occurrence.id});}
    await db.financeOccurrences.put({...occurrence,state:'paid',historical:false,linkedTransaction:!!existingTransactionId,transactionId,paidAt:time,updatedAt:time});
    await db.financeHistory.add({planId,occurrenceId:occurrence.id,action:existingTransactionId?'Pagamento vinculado':'Pagamento confirmado',at:time,before:occurrence,after:{transactionId,linked:!!existingTransactionId}});
    return true;
  });
}
export async function reversePayment(planId:number,index:number){
  await db.transaction('rw',db.financePlans,db.financeOccurrences,db.transactions,db.financeHistory,async()=>{
    const {occurrence}=await resolve(planId,index);if(occurrence.state!=='paid')return;
    if(occurrence.transactionId){
      const tx=await db.transactions.get(occurrence.transactionId);
      if(!tx||tx.financeOccurrenceId!==occurrence.id)throw Error('O vínculo do pagamento mudou. Confira as movimentações antes de reverter.');
      if(occurrence.linkedTransaction)await db.transactions.update(tx.id!,{financeOccurrenceId:undefined});
      else await db.transactions.delete(tx.id!);
    }
    await db.financeOccurrences.put({...occurrence,state:'pending',historical:false,transactionId:undefined,paidAt:undefined,updatedAt:now()});
    await db.financeHistory.add({planId,occurrenceId:occurrence.id,action:'Pagamento revertido',at:now(),before:occurrence,after:{state:'pending'}});
  });
}
export async function adjustOccurrence(planId:number,index:number,amountCents:number,dueDate:string){
  positive(amountCents);parseDay(dueDate);
  await db.transaction('rw',db.financePlans,db.financeOccurrences,db.financeHistory,async()=>{const {occurrence}=await resolve(planId,index);if(occurrence.state==='paid')throw Error('Reverta o pagamento antes de alterar a cobrança.');await db.financeOccurrences.put({...occurrence,amountCents,dueDate,updatedAt:now()});await db.financeHistory.add({planId,occurrenceId:occurrence.id,action:'Cobrança corrigida',at:now(),before:occurrence,after:{amountCents,dueDate}});});
}
export async function saveTransaction(input:{id?:number;description:string;amountCents:number;type:'income'|'expense';category:string;day:string}){
  positive(input.amountCents);parseDay(input.day);if(!input.description.trim())throw Error('Informe a descrição.');
  await db.transaction('rw',db.transactions,db.financeHistory,async()=>{
    const old=input.id?await db.transactions.get(input.id):undefined;
    if(input.id&&!old)throw Error('Movimentação removida.');
    if(old?.financialCommitmentId||old?.financeOccurrenceId||old?.importEntryId)throw Error('Altere este registro pelo módulo que o originou.');
    const id=input.id??randomId(),time=now();
    const record:FinanceTransaction={...old,id,description:input.description.trim(),amount:input.amountCents/100,amountCents:input.amountCents,type:input.type,category:input.category,occurredAt:parseDay(input.day).toISOString(),createdAt:old?.createdAt??time};
    await db.transactions.put(record);await db.financeHistory.add({planId:0,transactionId:id,action:old?'Movimentação editada':'Movimentação criada',at:time,before:old??null,after:record});
  });
}
export async function deleteTransaction(id:number){await db.transaction('rw',db.transactions,db.financeHistory,async()=>{const tx=await db.transactions.get(id);if(!tx)return;if(tx.financialCommitmentId||tx.financeOccurrenceId||tx.importEntryId)throw Error('Reverta o pagamento ou reabra a importação no módulo de origem.');await db.transactions.delete(id);await db.financeHistory.add({planId:0,transactionId:id,action:'Movimentação excluída',at:now(),before:tx});});}
export async function saveSettings(settings:FinanceSettings){if(!validCents(settings.incomeCents)||!['fixed','average'].includes(settings.mode)||![3,6,12].includes(settings.months)||!Number.isFinite(settings.comfortable)||!Number.isFinite(settings.warning)||settings.comfortable<0||settings.warning<=settings.comfortable||settings.warning>=100)throw Error('Confira renda e faixas: 0 ≤ confortável < atenção < 100.');await db.financeSettings.put({...settings,id:1,updatedAt:now()});}
