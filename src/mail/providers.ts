import PostalMime from 'postal-mime';
import type { Env } from '../google';
import { openICloud } from './imap';
import { unbase64 } from './crypto';
import { BATCH_SIZE, MAX_EMAIL_BYTES, MailError, type MailMessage } from './model';
export async function parseEmail(raw:Uint8Array,id:string,receivedAt?:string,threadId?:string):Promise<MailMessage>{
  const mail=await PostalMime.parse(raw,{maxNestingDepth:20,maxHeadersSize:65536});
  // HTML-only marketing is not promoted into a reminder by guessing rendered text.
  return {id,threadId,messageId:mail.messageId,references:mail.references,from:mail.from?.address ?? '',subject:mail.subject ?? '',text:mail.text ?? '',receivedAt:receivedAt ?? mail.date ?? new Date().toISOString(),bulk:mail.headers.some(h=>h.key==='list-unsubscribe'||h.key==='list-id'||(h.key==='precedence'&&/bulk|list|junk/i.test(h.value)))};
}
export async function googleJson(url:string,init:RequestInit={}){
  const response=await fetch(url,{...init,signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new MailError(response.status===401||response.status===400?'gmail_reconnect':'gmail_unavailable',response.status===401||response.status===400?'Reconecte o Gmail para continuar.':'Não foi possível consultar o Gmail agora.',502);
  return response.json() as Promise<any>;
}
export async function gmailBatch(env:Env,secret:{refreshToken:string},cursor?:string){
  const token=await googleJson('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:env.GMAIL_CLIENT_ID!,client_secret:env.GMAIL_CLIENT_SECRET!,refresh_token:secret.refreshToken,grant_type:'refresh_token'})});
  const headers={Authorization:`Bearer ${token.access_token}`};
  const query=new URLSearchParams({maxResults:String(BATCH_SIZE),q:'in:inbox newer_than:7d -category:promotions -category:social {consulta reunião reuniao entrevista agendamento vencimento vence prazo appointment meeting}',...(cursor?{pageToken:cursor}:{})});
  const listing=await googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${query}`,{headers});
  const messages:MailMessage[]=[];let skipped=0;
  for(const item of listing.messages ?? []){
    const metadata=await googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=metadata`,{headers});
    if(metadata.sizeEstimate>MAX_EMAIL_BYTES){skipped++;continue;}
    const raw=await googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=raw`,{headers});
    const bytes=unbase64(raw.raw);if(bytes.length>MAX_EMAIL_BYTES){skipped++;continue;}
    try { messages.push(await parseEmail(bytes,item.id,new Date(Number(raw.internalDate)).toISOString(),raw.threadId)); } catch { skipped++; }
  }
  return {messages,cursor:listing.nextPageToken ?? '',skipped};
}
export async function icloudBatch(secret:{address:string;password:string},cursor?:string){
  const {session,validity}=await openICloud(secret.address,secret.password);
  try{
    const [previousValidity,last]=String(cursor ?? '').split(':');
    let lastUid=previousValidity===validity?Number(last)||0:0;
    const since=new Date(Date.now()-7*86400000);const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const search=await session.command(lastUid?`UID SEARCH UID ${lastUid+1}:*`:`UID SEARCH SINCE ${since.getUTCDate()}-${months[since.getUTCMonth()]}-${since.getUTCFullYear()}`);
    const ids=search.lines.filter(l=>l.startsWith('* SEARCH')).flatMap(l=>l.slice(8).trim().split(/\s+/).map(Number)).filter(n=>Number.isSafeInteger(n)&&n>lastUid).sort((a,b)=>a-b).slice(0,BATCH_SIZE);
    const messages:MailMessage[]=[];let skipped=0;
    for(const uid of ids){
      const info=await session.command(`UID FETCH ${uid} (RFC822.SIZE INTERNALDATE)`);
      const size=Number(info.lines.join('\n').match(/RFC822\.SIZE (\d+)/i)?.[1] ?? Infinity);
      if(size>MAX_EMAIL_BYTES){skipped++;lastUid=uid;continue;}
      const message=await session.command(`UID FETCH ${uid} (BODY.PEEK[])`);
      const internalDate=info.lines.join(' ').match(/INTERNALDATE "([^"]+)"/i)?.[1];
      try {
        if(message.literals[0])messages.push(await parseEmail(message.literals[0],`${validity}:${uid}`,internalDate ? new Date(internalDate).toISOString() : undefined));else skipped++;
      } catch { skipped++; }
      lastUid=uid;
    }
    return {messages,cursor:`${validity}:${lastUid}`,skipped};
  }finally{await session.close();}
}
