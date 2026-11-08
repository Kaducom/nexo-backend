import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import Dexie from 'dexie';
import {createNexoDatabase,bindAccountDatabase} from '../src/db';
import {formatCents,pasteCents,decimalToCents,splitInstallments,recordCents,MAX_CENTS} from '../src/finance/money';
import {businessDay,occurrenceDate,occurrences} from '../src/finance/schedule';
import {defaultSettings,type FinancePlan} from '../src/finance/model';
import {savePlan,confirmPayment,reversePayment,adjustOccurrence,changePlanStatus,saveTransaction,saveSettings,deleteTransaction} from '../src/finance/service';
import {financeSummary} from '../src/finance/analytics';
import {createFinancialCommitment,markFinancialCommitmentAsPaid,reverseLegacyPayment} from '../src/services/financialCommitments';
import {receiveRecords} from '../src/sync/engine';
import {reopenBankEntry} from '../src/services/bankImports';
import {importLegacy} from '../src/sync/migration';
let passed=0;async function check(name:string,fn:()=>unknown){await fn();console.log('PASS',name);passed++;}
const database=createNexoDatabase('v2-test-'+Date.now(),true);bindAccountDatabase(database);await database.open();
const plan=(patch:Partial<FinancePlan>={}):FinancePlan=>({title:'Spotify',kind:'subscription',amountCents:2190,category:'Assinaturas',startDate:'2026-01-01',period:'monthly',dueRule:'day',dueDay:31,holidays:[],installments:12,initialPaid:0,card:'',status:'active',createdAt:'',updatedAt:'',...patch});
try{
await check('BR formatting, leading zeroes, cents, paste separators and rejected ambiguous input',()=>{
  assert.equal(formatCents(14690),'R$ 146,90');assert.equal(formatCents(146908),'R$ 1.469,08');assert.equal(formatCents(0),'R$ 0,00');
  for(const [input,cents] of [['14690',14690],['00014690',14690],['R$ 1.469,08',146908],['146,9',14690],['146.90',14690],['1.469',146900],['1,469.08',146908],['0',0],['R$ 146',14600]] as const)assert.equal(pasteCents(input),cents,input);
  for(const bad of ['-12','12,345','1e3','R$ banana','12.34.56','99999999999999'])assert.equal(pasteCents(bad),null);
  assert.equal(decimalToCents('0.29'),29);assert.equal(formatCents(MAX_CENTS),'R$ 9.999.999.999,99');assert.equal(recordCents({amount:146.90}),14690);assert.equal(recordCents({amount:150,amountCents:14690}),15000);
});
await check('Sixth weekday, explicit holidays and month-end/year rollover',()=>{
  assert.equal(businessDay(2026,0,6),'2026-01-08');assert.equal(businessDay(2026,0,6,['2026-01-01']),'2026-01-09');
  assert.equal(occurrenceDate(plan(),1),'2026-02-28');assert.equal(occurrenceDate(plan(),2),'2026-03-31');assert.equal(occurrenceDate(plan({startDate:'2026-12-01'}),1),'2027-01-31');assert.equal(occurrenceDate(plan({startDate:'2028-01-01'}),1),'2028-02-29');
  assert.equal(occurrenceDate(plan({startDate:'2026-12-28',period:'weekly'}),1),'2027-01-04');
});
await check('Installments distribute every cent, including initial historical payments',()=>{
  assert.deepEqual(splitInstallments(10000,3),[3334,3333,3333]);assert.equal(splitInstallments(120001,12).reduce((a,b)=>a+b,0),120001);
  const rows=occurrences({...plan({kind:'installment',amountCents:120000,installments:12,initialPaid:4}),id:20},[],'9999-12-31');assert.equal(rows.filter(o=>o.state==='paid').length,4);assert.equal(rows.filter(o=>o.state==='pending').reduce((n,o)=>n+o.amountCents,0),80000);
});
await assert.rejects(savePlan(plan({dueRule:'business',dueDay:6,holidays:Array.from({length:30},(_,i)=>`2026-11-${String(i+1).padStart(2,'0')}`)})),/não possui/);
const id=await savePlan(plan());
await check('Creating a plan or passing a due date never posts a payment',async()=>{
  assert.equal(await database.transactions.count(),0);assert.equal(await database.financeOccurrences.count(),0);
  assert(occurrences((await database.financePlans.get(id))!,[],'2026-12-31').every(o=>o.state==='pending'));
});
await check('Concurrent confirmation is atomic and idempotent; audit and cents are persisted',async()=>{
  const results=await Promise.all([confirmPayment(id,0),confirmPayment(id,0)]);assert.equal(results.filter(Boolean).length,1);assert.equal(await database.transactions.count(),1);
  const tx=(await database.transactions.toArray())[0];assert.equal(tx.amountCents,2190);assert.equal(tx.amount,21.9);assert((await database.financeHistory.toArray()).some(h=>h.action==='Pagamento confirmado'));
});
await check('Changing a subscription preserves paid occurrence amount and due date',async()=>{
  const current=(await database.financePlans.get(id))!;await savePlan({...current,amountCents:2490,dueDay:15});const rows=occurrences((await database.financePlans.get(id))!,await database.financeOccurrences.toArray(),'2026-03-31');assert.equal(rows[0].amountCents,2190);assert.equal(rows[0].dueDate,'2026-01-31');assert.equal(rows[1].amountCents,2490);assert.equal(rows[1].dueDate,'2026-02-15');
});
await check('Reversal removes only generated expense, preserves corrected occurrence and allows reconfirmation',async()=>{
  await reversePayment(id,0);assert.equal(await database.transactions.count(),0);await reversePayment(id,0);await adjustOccurrence(id,0,2500,'2026-02-02');await confirmPayment(id,0);assert.equal((await database.transactions.toArray())[0].amountCents,2500);await reversePayment(id,0);
});
await check('Linking an imported expense avoids double counting; reversal preserves original',async()=>{
  const tx=await database.transactions.add({description:'Importado',amount:25,amountCents:2500,type:'expense',category:'Outros',occurredAt:'2026-02-02T12:00:00Z',createdAt:'2026-02-02T12:00:00Z',importEntryId:123});await database.bankImports.put({id:123,source:'csv',account:'account',externalKey:'v2-linked',description:'Importado',amount:25,type:'expense',occurredAt:'2026-02-02T12:00:00Z',createdAt:'',status:'posted',transactionId:tx});await confirmPayment(id,0,tx);await assert.rejects(reopenBankEntry(123),/Reverta primeiro/);assert.equal(await database.transactions.count(),1);await reversePayment(id,0);assert.equal(await database.transactions.count(),1);assert.equal((await database.transactions.get(tx))?.financeOccurrenceId,undefined);
});
await check('Paused/cancelled plans cannot be paid and are excluded from projections',async()=>{
  await changePlanStatus(id,'paused');await assert.rejects(confirmPayment(id,0),/Reative/);let s=financeSummary([],await database.financePlans.toArray(),[],[],defaultSettings,'2026-02');assert.equal(s.pendingCents,0);await changePlanStatus(id,'cancelled');s=financeSummary([],await database.financePlans.toArray(),[],[],defaultSettings,'2026-02');assert.equal(s.pendingCents,0);await changePlanStatus(id,'active');
});
await check('Manual transactions use integer cents, safe edits and an audit trail',async()=>{
  await saveTransaction({description:'Salário',amountCents:300000,type:'income',category:'Salário',day:'2026-02-01'});const tx=(await database.transactions.toArray()).find(t=>t.type==='income')!;await saveTransaction({id:tx.id,description:'Salário corrigido',amountCents:310000,type:'income',category:'Salário',day:'2026-02-01'});assert.equal((await database.transactions.get(tx.id!))?.amount,3100);await deleteTransaction(tx.id!);assert((await database.financeHistory.toArray()).some(h=>h.action==='Movimentação excluída'));
});
await check('Analytics separates monthly obligations, future debt, no income and deficit',()=>{
  const p={...plan({kind:'installment',amountCents:120000,installments:12,initialPaid:4}),id:90};const t={description:'Pago',amount:900,type:'expense' as const,category:'Outros',occurredAt:'2026-05-01T12:00:00Z',createdAt:''};
  const summary=financeSummary([t],[p],[],[],{...defaultSettings,incomeCents:100000},'2026-05','2026-05-10');assert.equal(summary.expenses,90000);assert.equal(summary.pendingCents,10000);assert.equal(summary.debt,80000);assert.equal(summary.percentage,100);
  const deficit=financeSummary([t],[p],[],[],{...defaultSettings,incomeCents:50000},'2026-05');assert.equal(deficit.available,-50000);assert.equal(deficit.band,'Déficit projetado');assert.equal(financeSummary([],[],[],[],defaultSettings,'2026-05').percentage,null);
});
await check('Income average uses complete prior months, including absent months as zero',()=>{
  const tx=(day:string,amount:number)=>({description:'Receita',amount,type:'income' as const,category:'Outros',occurredAt:day+'T12:00:00Z',createdAt:''});const summary=financeSummary([tx('2026-01-01',3000),tx('2026-03-01',6000),tx('2026-04-01',9999)],[],[],[],{...defaultSettings,mode:'average',months:3},'2026-04');assert.equal(summary.reference,300000);assert.equal(summary.historyMonths,2);assert.equal(summary.income,999900);
});
await check('Reference settings validate thresholds and synchronize',async()=>{await assert.rejects(saveSettings({...defaultSettings,comfortable:80,warning:70}));await saveSettings({...defaultSettings,incomeCents:300000});assert((await database.syncOutbox.toArray()).some(p=>p.table==='financeSettings'));});
await check('Legacy payment uses current record, rejects double clicks and supports reversal',async()=>{
  const legacyId=await createFinancialCommitment({title:'Antigo',amount:146.9,category:'Contas',paymentMethod:'pix',frequency:'monthly',totalPayments:2,completedPayments:0,nextPaymentAt:'2026-01-31T12:00:00Z',reminderMinutesBefore:1440,status:'active',notes:''});const old=(await database.financialCommitments.get(legacyId))!;const count=await database.transactions.count();await Promise.all([markFinancialCommitmentAsPaid(old),markFinancialCommitmentAsPaid(old)]);assert.equal(await database.transactions.count(),count+1);await reverseLegacyPayment(legacyId);assert.equal(await database.transactions.count(),count);assert.equal((await database.financialCommitments.get(legacyId))?.nextPaymentAt,old.nextPaymentAt);assert.equal((await database.financialCommitments.get(legacyId))?.amount,146.9);
});
await check('New tables and cents propagate to another account database without upload echoes',async()=>{
  const other=createNexoDatabase('v2-other-'+Date.now(),true);await other.open();try{const queue=await database.syncOutbox.toArray();await receiveRecords(other,queue.map(p=>({...p,revision:1,deviceId:'phone'})),'pc');assert.equal(await other.financePlans.count(),await database.financePlans.count());assert.equal((await other.financeSettings.get(1))?.incomeCents,300000);assert.equal(await other.syncOutbox.count(),0);}finally{await other.delete();}
});
await check('v5 to v6 migration preserves exact old monetary values and old links after reopening',async()=>{
  const name='old-v5-'+Date.now(),old=new Dexie(name);old.version(5).stores({memories:'++id,title,*tags,createdAt,updatedAt',reminders:'++id,title,startsAt,completed,sourceType,sourceId,createdAt',transactions:'++id,type,category,occurredAt,createdAt,financialCommitmentId',financialCommitments:'++id,status,nextPaymentAt,frequency,paymentMethod,createdAt',bankImports:'++id,&externalKey,status,occurredAt,createdAt',bankRules:'++id,&matchKey',syncOutbox:'key,table',syncVersions:'key',syncMeta:'key'});await old.open();const row={id:7,amount:146.9,description:'Antigo',type:'expense',category:'Contas',financialCommitmentId:8,occurredAt:'2025-01-01',createdAt:'2025-01-01'};await old.table('transactions').add(row);old.close();let upgraded=createNexoDatabase(name);await upgraded.open();assert.deepEqual(await upgraded.transactions.get(7),row);upgraded.close();upgraded=createNexoDatabase(name);await upgraded.open();assert.deepEqual(await upgraded.transactions.get(7),row);await upgraded.delete();
});
await check('Account ownership migration preserves new plan/occurrence/transaction links and fixed settings ID',async()=>{
  const name='v2-local-migration-'+Date.now(),source=createNexoDatabase(name),target=createNexoDatabase(name+'-account',true);
  await source.financePlans.put({...plan(),id:7});await source.financeOccurrences.put({id:8,planId:7,index:0,dueDate:'2026-01-31',amountCents:2190,state:'paid',transactionId:9,updatedAt:''});await source.transactions.put({id:9,description:'Vínculo',amount:21.9,type:'expense',category:'Outros',occurredAt:'2026-01-31',createdAt:'',financeOccurrenceId:8});await source.financeSettings.put({...defaultSettings,id:1,incomeCents:12300});source.close();
  try{await importLegacy('v2-owner',target,name);const p=(await target.financePlans.toArray())[0],o=(await target.financeOccurrences.toArray())[0],t=(await target.transactions.toArray())[0];assert.equal(o.planId,p.id);assert.equal(o.transactionId,t.id);assert.equal(t.financeOccurrenceId,o.id);assert.equal((await target.financeSettings.get(1))?.incomeCents,12300);}finally{await source.delete();await target.delete();}
});
console.log(`${passed} finance v2 scenarios passed`);
}finally{await database.delete();}
