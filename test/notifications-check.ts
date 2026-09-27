import assert from 'node:assert/strict';
import worker from '../src/index';
import { processReminders, isDue } from '../src/notifications';
import { encode, data, root } from '../src/firestore';
const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const pem=Buffer.from(await crypto.subtle.exportKey('pkcs8',keys.privateKey)).toString('base64');
const env={FIREBASE_PROJECT_ID:'demo-nexo',FIREBASE_API_KEY:'test',FIREBASE_CLIENT_EMAIL:'test@example.test',FIREBASE_PRIVATE_KEY:`-----BEGIN PRIVATE KEY-----\n${pem}\n-----END PRIVATE KEY-----`};
const store=new Map();let counter=0, pushes=[];let failedToken='';
const doc=(path,value)=>{const item={name:`${root(env)}/${path}`,fields:encode(value).mapValue.fields,updateTime:String(++counter)};store.set(item.name,item);return item;};
const past=new Date(Date.now()-60000).toISOString();
const reminder=doc('users/alice/reminders/9',{title:'Teste',notes:'Nota',startsAt:past,completed:false});
doc('users/alice/devices/phone',{token:'phone-token'});doc('users/alice/devices/pc',{token:'pc-token'});
globalThis.fetch=async(url,init={})=>{
 const parsed=new URL(String(url)),body=init.body?JSON.parse(String(init.body).startsWith('{')?String(init.body):'{}'):{};
 if(parsed.hostname==='oauth2.googleapis.com')return Response.json({access_token:'mock',expires_in:3600});
 if(parsed.hostname==='identitytoolkit.googleapis.com')return body.idToken==='alice-id-token'?Response.json({users:[{localId:'alice'}]}):Response.json({}, {status:400});
 if(parsed.hostname==='fcm.googleapis.com') {const token=body.message.token;if(token===failedToken)return Response.json({error:{details:[]}}, {status:503});pushes.push(token);return Response.json({name:'sent'});}
 const path=decodeURI(parsed.pathname.slice(4));
 if(path.endsWith(':runQuery'))return Response.json([...store.values()].filter(item=>/\/reminders\//.test(item.name)).map(document=>({document})));
 if(parsed.searchParams.has('pageSize'))return Response.json({documents:[...store.values()].filter(item=>item.name.startsWith(path+'/'))});
 if(path.endsWith(':commit')) {const write=body.writes[0],previous=store.get(write.update.name);if(previous.updateTime!==write.currentDocument.updateTime)return Response.json({error:{status:'FAILED_PRECONDITION'}},{status:400});const updated={...previous,fields:{...previous.fields,...write.update.fields},updateTime:String(++counter)};store.set(previous.name,updated);return Response.json({writeResults:[{updateTime:updated.updateTime}]});}
 if(init.method==='DELETE'){store.delete(path);return Response.json({});}
 return store.has(path)?Response.json(store.get(path)):Response.json({}, {status:404});
};
assert(!isDue({startsAt:'invalid',completed:false}));assert(!isDue({startsAt:past,completed:true}));assert(isDue({startsAt:past,completed:false}));console.log('PASS Due dates and completed reminders');
await processReminders(env);assert.deepEqual(pushes,['phone-token','pc-token']);await processReminders(env);assert.equal(pushes.length,2);console.log('PASS Due reminder reaches both devices exactly once across repeated polls');
let item=store.get(reminder.name);doc('users/alice/reminders/9',{...data(item),startsAt:new Date(Date.now()-30000).toISOString()});failedToken='pc-token';await processReminders(env);assert.equal(pushes.length,3);failedToken='';await processReminders(env);assert.equal(pushes.length,4);assert.equal(pushes.at(-1),'pc-token');console.log('PASS Transient failure retries only the device still pending');
const request=(path,body,token)=>new Request('https://nexo-backend.test'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
assert.equal((await worker.fetch(request('/notifications/test',{deviceId:'pc'}),env)).status,401);
assert.equal((await worker.fetch(request('/notifications/test',{deviceId:'../../bob'},'alice-id-token'),env)).status,400);
assert.equal((await worker.fetch(request('/notifications/test',{deviceId:'pc'},'alice-id-token'),env)).status,200);
assert.equal((await worker.fetch(request('/notifications/send',{token:'arbitrary'},'alice-id-token'),env)).status,404);
console.log('PASS Auth required, device path validated, arbitrary token endpoint removed');
console.log('4 backend scenarios passed');
