export type PlanKind='bill'|'subscription'|'installment';
export type PlanStatus='active'|'paused'|'cancelled';
export type Period='once'|'weekly'|'monthly'|'yearly';
export type FinancePlan={id?:number;title:string;kind:PlanKind;amountCents:number;category:string;startDate:string;period:Period;dueRule:'day'|'business';dueDay:number;holidays:string[];installments:number;initialPaid:number;card:string;status:PlanStatus;createdAt:string;updatedAt:string};
export type FinanceOccurrence={id?:number;planId:number;index:number;dueDate:string;amountCents:number;state:'pending'|'paid';transactionId?:number;linkedTransaction?:boolean;historical?:boolean;paidAt?:string;updatedAt:string};
export type FinanceHistory={id?:number;planId:number;occurrenceId?:number;legacyId?:number;action:string;at:string;before?:unknown;after?:unknown;transactionId?:number;reversed?:boolean};
export type FinanceSettings={id?:number;mode:'fixed'|'average';incomeCents:number;months:3|6|12;comfortable:number;warning:number;updatedAt:string};
export const defaultSettings:FinanceSettings={id:1,mode:'fixed',incomeCents:0,months:3,comfortable:50,warning:75,updatedAt:''};
export const localDay=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function parseDay(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Data inválida.');const d=new Date(`${value}T12:00:00`);if(!Number.isFinite(d.getTime())||localDay(d)!==value)throw Error('Data inválida.');return d;}
