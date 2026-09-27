import type {Env} from '../google';
import {api,data,encode,root,type Document} from '../firestore';
import {digest,type Candidate,type MailMessage,type Provider,normalize} from './model';
export const connectionPath=(env:Env,uid:string,provider:Provider)=>`${root(env)}/mailConnections/${uid}_${provider}`;
export const context=(uid:string,provider:Provider)=>`mail:${uid}:${provider}`;
export async function read(env:Env,path:string):Promise<Document|null>{try{return await api(env,path);}catch(e:any){if(e.status===404)return null;throw e;}}
export async function put(env:Env,path:string,value:Record<string,unknown>){return api(env,path,{method:'PATCH',body:JSON.stringify({fields:encode(value).mapValue!.fields})});}
export function verify(connection:Document){return {verify:connection.name,currentDocument:{updateTime:connection.updateTime}};}
export async function saveCandidate(env:Env,connection:Document,mail:MailMessage,candidate:Candidate):Promise<boolean>{
  const config=data(connection);const uid=config.uid as string,provider=config.provider as Provider;
  const messageKey=await digest(`${uid}:${provider}:${config.address}:${mail.id}`);
  const seenPath=`${root(env)}/mailReceipts/${messageKey}`;
  if(await read(env,seenPath))return false;
  const fingerprint=await digest(`${uid}:${normalize(mail.from)}:${normalize(candidate.title)}:${candidate.startsAt}`);
  const duplicatePath=`${root(env)}/mailEvents/${fingerprint}`;
  const duplicate=await read(env,duplicatePath);
  // Stable conversation IDs let newer confirmations update an existing imported reminder.
  const thread=mail.threadId || mail.references?.match(/<[^>]+>/)?.[0] || mail.messageId || mail.id;
  const identity=await digest(`${uid}:${provider}:${config.address}:${thread}`);
  const id=parseInt(identity.slice(0,13),16)||1;
  const recordPath=`${root(env)}/users/${uid}/data/reminders_${id}`;
  const existing=await read(env,recordPath);const previous=existing?data(existing):null;
  const now=new Date().toISOString();
  const receipt={update:{name:seenPath,fields:encode({uid,provider,receivedAt:mail.receivedAt,processedAt:now}).mapValue!.fields},currentDocument:{exists:false}};
  const prior=previous?.payload;
  const userEdited=prior && (prior.title!==prior.emailOriginalTitle||prior.startsAt!==prior.emailOriginalStart||prior.notes!==prior.emailOriginalNotes);
  const skip=duplicate || previous?.deleted || prior?.completed || userEdited || (prior && Date.parse(prior.emailReceivedAt)>=Date.parse(mail.receivedAt));
  if(skip){await api(env,`${root(env)}:commit`,{method:'POST',body:JSON.stringify({writes:[verify(connection),receipt]})});return false;}
  const payload={id,...candidate,completed:false,sourceType:'email',emailProvider:provider,emailSender:mail.from.slice(0,320),emailReceivedAt:mail.receivedAt,emailOriginalTitle:candidate.title,emailOriginalStart:candidate.startsAt,emailOriginalNotes:candidate.notes,createdAt:prior?.createdAt ?? now};
  const record={key:`reminders_${id}`,id,table:'reminders',revision:(previous?.revision ?? 0)+1,changeId:crypto.randomUUID(),deviceId:'mail-import',deleted:false,payload};
  const writes=[verify(connection),receipt,{update:{name:duplicatePath,fields:encode({uid,id,createdAt:now}).mapValue!.fields},currentDocument:{exists:false}},
    {update:{name:recordPath,fields:encode(record).mapValue!.fields},currentDocument:existing?{updateTime:existing.updateTime}:{exists:false},updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]},
    {update:{name:`${root(env)}/users/${uid}/reminders/${id}`,fields:encode({...candidate,title:`${provider==='gmail'?'Gmail':'Mail · iCloud'}: ${candidate.title}`,completed:false,notifiedAt:null,updatedAt:now}).mapValue!.fields},updateMask:{fieldPaths:['title','notes','startsAt','completed','notifiedAt','updatedAt']}}];
  await api(env,`${root(env)}:commit`,{method:'POST',body:JSON.stringify({writes})});
  return true;
}
