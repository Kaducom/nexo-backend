import { getGoogleAccessToken, type Env } from './google';
import { api, data, list, patch, root, type Document } from './firestore';
export async function sendPush(env: Env, token: string, title: string, body: string, tag: string, uid: string) {
  const response=await fetch(`https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`,{method:'POST',headers:{Authorization:`Bearer ${await getGoogleAccessToken(env)}`,'Content-Type':'application/json'},body:JSON.stringify({message:{token,data:{uid,title:title.slice(0,120),body:body.slice(0,500),url:'/lembretes',tag},webpush:{headers:{Urgency:'high',TTL:'86400'}}}}),signal:AbortSignal.timeout(20000)});
  if (!response.ok) {
    const result=await response.json() as any;
    const invalid=result.error?.details?.some((item:any)=>item.errorCode==='UNREGISTERED');
    throw Object.assign(new Error(`FCM: HTTP ${response.status}`),{invalidToken:!!invalid});
  }
}
export function isDue(reminder: any, now = Date.now()) {
  const time=Date.parse(reminder.startsAt);
  return reminder.completed===false && Number.isFinite(time) && time<=now && (!reminder.leaseUntil || Date.parse(reminder.leaseUntil)<=now);
}
async function deliver(env: Env, original: Document) {
  const reminder=data(original);
  if(!isDue(reminder)) return;
  const suffix=original.name.slice(root(env).length+1);
  const match=/^users\/([^/]+)\/reminders\/([^/]+)$/.exec(suffix);if(!match)return;
  const [,uid,id]=match;
  const devices:Document[]=[];
  for await(const device of list(env,`${root(env)}/users/${uid}/devices`)) if(data(device).token) devices.push(device);
  if(!devices.length)return;
  const deliveries={...(reminder.deliveries ?? {})};
  if(devices.every(device=>deliveries[device.name.split('/').pop()!]===reminder.startsAt))return;
  let current:Document;
  try { current=await patch(env,original,{leaseUntil:new Date(Date.now()+180000).toISOString()}); } catch(error:any) { if(error.precondition)return;throw error; }
  for(const device of devices){
    const deviceId=device.name.split('/').pop()!;
    if(deliveries[deviceId]===reminder.startsAt)continue;
    try {
      await sendPush(env,data(device).token,reminder.title || 'Lembrete NEXO',reminder.notes || 'Chegou a hora do seu lembrete.',`nexo-${id}-${reminder.startsAt}`,uid);
      deliveries[deviceId]=reminder.startsAt;
      current=await patch(env,current,{deliveries});
    }catch(error:any){
      if(error.invalidToken) { await api(env,device.name,{method:'DELETE'}); }
      else if(error.precondition)return;
      else console.error('notification_delivery_failed',{status:error.status ?? 'transport'});
    }
  }
  try {await patch(env,current,{leaseUntil:null});}catch(error:any){if(!error.precondition)throw error;}
}
export async function processReminders(env: Env) {
  let lastName:string|undefined;
  do {
    const results=await api(env,`${root(env)}:runQuery`,{method:'POST',body:JSON.stringify({structuredQuery:{from:[{collectionId:'reminders',allDescendants:true}],orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit:100,...(lastName?{startAt:{values:[{referenceValue:lastName}],before:false}}:{})}})});
    const documents:Document[]=results.flatMap((entry:any)=>entry.document?[entry.document]:[]);
    for(const doc of documents){try{await deliver(env,doc);}catch{console.error('reminder_processing_failed');}}
    lastName=documents.length===100?documents.at(-1)!.name:undefined;
  }while(lastName);
}
