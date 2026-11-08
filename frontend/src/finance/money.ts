// New money inputs and arithmetic use integer cents; legacy amounts remain reais.
export const MAX_CENTS = 999_999_999_999;
export function validCents(value: number) { return Number.isSafeInteger(value) && value >= 0 && value <= MAX_CENTS; }
export function digitsToCents(text: string): number | null {
  if (!/^\d*$/.test(text)) return null;
  const value = Number(text || '0');
  return validCents(value) ? value : null;
}
export function formatCents(cents: number) {
  if (!Number.isSafeInteger(cents)) throw Error('Valor monetário inválido.');
  const digits = String(Math.abs(cents)).padStart(3, '0');
  return `${cents < 0 ? '−' : ''}R$ ${digits.slice(0,-2).replace(/\B(?=(\d{3})+(?!\d))/g,'.')},${digits.slice(-2)}`;
}
export function decimalToCents(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw Error('Informe um valor com até dois centavos.');
  const [whole, fraction=''] = value.split('.');
  const cents = digitsToCents(whole + fraction.padEnd(2,'0'));
  if (cents === null) throw Error('Valor acima do limite permitido.');
  return cents;
}
export function centsToDecimal(cents: number) {
  if (!validCents(cents)) throw Error('Valor monetário inválido.');
  const s=String(cents).padStart(3,'0');return `${s.slice(0,-2)}.${s.slice(-2)}`;
}
export function legacyCents(value: number): number {
  // Read-only conversion for analytics. Never rewrites or rescales old records.
  const cents = Math.round((value + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) throw Error('Valor antigo fora do limite de precisão.');
  return cents;
}
export function recordCents(record: {amount:number;amountCents?:number}) {
  // Older clients may edit `amount` without updating the additive cents field.
  return validCents(record.amountCents!) && record.amountCents! / 100 === record.amount ? record.amountCents! : legacyCents(record.amount);
}
export function pasteCents(raw: string): number | null {
  const s=raw.trim().replace(/^R\$\s*/i,'').replace(/[\s\u00a0]/g,'');
  if (/^\d+$/.test(s)) {try{return /^R\$/i.test(raw.trim())?decimalToCents(s):digitsToCents(s);}catch{return null;}}
  let decimal:string;
  if (/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(s)) decimal=s.replace(/\./g,'').replace(',','.');
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(s)) decimal=s.replace(/\./g,'');
  else if (/^\d+\.\d{1,2}$/.test(s)) decimal=s;
  else if (/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(s)) decimal=s.replace(/,/g,'');
  else return null;
  try{return decimalToCents(decimal);}catch{return null;}
}
export function splitInstallments(total:number,count:number) {
  if (!validCents(total)||!Number.isInteger(count)||count<1||count>600||total<count) throw Error('Use de 1 a 600 parcelas, com pelo menos um centavo em cada.');
  const base=Math.floor(total/count), remainder=total%count;
  return Array.from({length:count},(_,i)=>base+(i<remainder?1:0));
}
