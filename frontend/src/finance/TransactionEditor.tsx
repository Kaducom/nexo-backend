import {useState,type FormEvent} from 'react';
import {ArrowDownLeft,ArrowUpRight} from 'lucide-react';
import MoneyInput from '../components/MoneyInput';
import {celebrateMoney} from '../components/MoneyEffects';
import type {FinanceTransaction} from '../types';
import {recordCents} from './money';
import {localDay} from './model';
import {saveTransaction} from './service';
export const categories=['Alimentação','Combustível','Casa','Compras','Lazer','Salário','Transferência','Assinaturas','Contas','Reserva','Outros'];
export default function TransactionEditor({existing,onSaved,initialType='expense'}:{existing?:FinanceTransaction;onSaved?:()=>void;initialType?:'expense'|'income'}){
  const [type,setType]=useState(existing?.type??initialType),[description,setDescription]=useState(existing?.description??''),[value,setValue]=useState<number|null>(existing?recordCents(existing):null),[category,setCategory]=useState(existing?.category??'Outros'),[day,setDay]=useState(existing?localDay(new Date(existing.occurredAt)):localDay()),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
  async function submit(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');setSaved(false);try{await saveTransaction({id:existing?.id,type,description,amountCents:value??0,category,day});celebrateMoney(type,`${category} ${description}`);setSaved(true);if(!existing){setDescription('');setValue(null);}onSaved?.();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <form className={`v2-panel v2-transaction ${type}`} onSubmit={submit}>
    <div className="v2-segment" aria-label="Tipo de movimentação"><button type="button" aria-pressed={type==='expense'} onClick={()=>setType('expense')}><ArrowUpRight size={18}/> Despesa</button><button type="button" aria-pressed={type==='income'} onClick={()=>setType('income')}><ArrowDownLeft size={18}/> Receita</button></div>
    <h2>{existing?'Editar movimentação':type==='expense'?'Nova despesa':'Nova receita'}</h2><p>{type==='expense'?'Registre o dinheiro que saiu. Cobranças futuras ficam em contas e compromissos.':'Registre o dinheiro efetivamente recebido.'}</p>
    <div className="v2-form-grid"><label>Descrição<input value={description} onChange={e=>setDescription(e.target.value)} maxLength={160} required placeholder={type==='expense'?'Ex.: Mercado':'Ex.: Salário'}/></label><label>Valor<MoneyInput aria-label="Valor" value={value} onValueChange={setValue} required/></label><label>Categoria<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label>Data<input type="date" value={day} onChange={e=>setDay(e.target.value)} required/></label></div>
    {error&&<p role="alert" className="v2-error">{error}</p>}{saved&&<p role="status">Movimentação salva.</p>}
    <button className="v2-submit" disabled={busy}>{busy?'Salvando…':existing?'Salvar alteração':type==='expense'?'Registrar despesa':'Registrar receita'}</button>
  </form>;
}
