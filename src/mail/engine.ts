import type {Env} from '../google';
import {data,list,patch,root,type Document} from '../firestore';
import {unseal} from './crypto';
import {context,saveCandidate} from './storage';
import {gmailBatch,icloudBatch} from './providers';
import {extractReminder} from './filter';
import {MailError} from './model';
export async function syncConnection(env:Env,document:Document){
  const config=data(document);
  if(config.leaseUntil&&Date.parse(config.leaseUntil)>Date.now())throw new MailError('sync_busy','A verificação já está em andamento.',409);
  const locked=await patch(env,document,{leaseUntil:new Date(Date.now()+180000).toISOString()});
  try{
    const secret=await unseal(env,config.secret,context(config.uid,config.provider));
    const batch=config.provider==='gmail'?await gmailBatch(env,secret,config.cursor):await icloudBatch(secret,config.cursor);
    let added=0,ignored=batch.skipped;
    for(const mail of batch.messages){
      const candidate=extractReminder(mail,config.timeZone);
      if(candidate && await saveCandidate(env,locked,mail,candidate))added++;else ignored++;
    }
    await patch(env,locked,{leaseUntil:null,cursor:batch.cursor,lastCheckedAt:new Date().toISOString(),lastAdded:added,lastIgnored:ignored,error:null});
    return {added,ignored};
  }catch(error:any){
    const code=error instanceof MailError?error.code:'mail_unavailable';
    try{await patch(env,locked,{leaseUntil:null,lastCheckedAt:new Date().toISOString(),error:code,...(code==='gmail_reconnect'?{cursor:''}:{})});}catch{}
    throw error instanceof MailError?error:new MailError('mail_unavailable','Não foi possível verificar os e-mails agora. Tente novamente.',503);
  }
}
export async function processMail(env:Env){
  if(!env.MAIL_ENCRYPTION_KEY)return;
  const connections:Document[]=[];
  for await(const doc of list(env,`${root(env)}/mailConnections`))connections.push(doc);
  connections.sort((a,b)=>String(data(a).lastCheckedAt ?? '').localeCompare(String(data(b).lastCheckedAt ?? '')));
  // Bound background API usage; the least recently checked accounts run first.
  for(const doc of connections.slice(0,2)){try{await syncConnection(env,doc);}catch(error:any){console.warn('mail_check_failed',{code:error instanceof MailError?error.code:'unavailable'});}}
}
