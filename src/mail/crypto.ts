import type { Env } from '../google';
import { MailError } from './model';
export const base64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
export const unbase64=(value:string)=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function key(env:Env){
  if(!env.MAIL_ENCRYPTION_KEY||!/^[a-f0-9]{64}$/i.test(env.MAIL_ENCRYPTION_KEY))throw new MailError('setup_required','A conexão de e-mail ainda precisa ser habilitada no servidor.',503);
  return crypto.subtle.importKey('raw',Uint8Array.from(env.MAIL_ENCRYPTION_KEY.match(/../g)!,x=>parseInt(x,16)),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export async function seal(env:Env,value:unknown,context:string){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(context)},await key(env),new TextEncoder().encode(JSON.stringify(value)));
  return `${base64url(iv)}.${base64url(new Uint8Array(encrypted))}`;
}
export async function unseal(env:Env,value:string,context:string):Promise<any>{
  const [iv,encrypted]=value.split('.');
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(iv),additionalData:new TextEncoder().encode(context)},await key(env),unbase64(encrypted))));
}
