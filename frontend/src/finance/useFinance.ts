import {useLiveQuery} from 'dexie-react-hooks';
import {db} from '../db';
import {defaultSettings} from './model';
export function useFinance(){return useLiveQuery(()=>db.transaction('r',[db.transactions,db.financialCommitments,db.financePlans,db.financeOccurrences,db.financeHistory,db.financeSettings],async()=>{
  const [transactions,legacy,plans,overrides,history,settings]=await Promise.all([db.transactions.toArray(),db.financialCommitments.toArray(),db.financePlans.toArray(),db.financeOccurrences.toArray(),db.financeHistory.orderBy('at').reverse().toArray(),db.financeSettings.get(1)]);
  return {transactions,legacy,plans,overrides,history,settings:settings??defaultSettings};
}),[]);}
export type FinanceData=NonNullable<ReturnType<typeof useFinance>>;
