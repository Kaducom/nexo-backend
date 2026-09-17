import fs from 'node:fs';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,deleteDoc,serverTimestamp} from 'firebase/firestore';
const env=await initializeTestEnvironment({projectId:'demo-nexo-sync',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}});
const alice=env.authenticatedContext('alice').firestore(),bob=env.authenticatedContext('bob').firestore(),anon=env.unauthenticatedContext().firestore();
const record=(table,id=1)=>({key:`${table}_${id}`,table,id,revision:1,changeId:'initial',deviceId:'phone',deleted:false,payload:{id,title:'Teste'},updatedAt:serverTimestamp()});
let passed=0;const check=async(name,fn)=>{await fn();passed++;console.log('PASS',name);};
try{
 await env.clearFirestore();
 for(const table of ['memories','reminders','transactions','financialCommitments','bankImports','bankRules'])await check(`Owner access / cross-account isolation: ${table}`,async()=>{
   const path=`users/alice/data/${table}_1`;
   await assertSucceeds(setDoc(doc(alice,path),record(table)));
   await assertSucceeds(getDoc(doc(alice,path)));
   await assertFails(getDoc(doc(bob,path)));await assertFails(getDoc(doc(anon,path)));
   await assertFails(setDoc(doc(bob,path),record(table)));await assertFails(deleteDoc(doc(alice,path)));
 });
 await check('Collection queries isolated by account',async()=>{await assertSucceeds(getDocs(collection(alice,'users/alice/data')));await assertFails(getDocs(collection(bob,'users/alice/data')));});
 await check('Revision, identity and timestamp validation',async()=>{
   const path=doc(alice,'users/alice/data/memories_1');
   await assertFails(setDoc(path,record('memories')));
   await assertFails(setDoc(path,{...record('memories'),revision:4}));
   await assertFails(setDoc(path,{...record('memories'),revision:2,id:2}));
   await assertFails(setDoc(path,{...record('memories'),revision:2,payload:{id:2}}));
   await assertFails(setDoc(path,{...record('memories'),revision:2,updatedAt:'fake'}));
   await assertSucceeds(setDoc(path,{...record('memories'),revision:2,deleted:true,payload:null}));
 });
 await check('Existing notification mirror and token access retained',async()=>{
   await assertSucceeds(setDoc(doc(alice,'users/alice'),{fcmToken:'test'}));
   await assertSucceeds(setDoc(doc(alice,'users/alice/reminders/9'),{title:'Teste',startsAt:new Date().toISOString(),completed:false}));
   await assertFails(getDoc(doc(bob,'users/alice')));await assertFails(getDoc(doc(bob,'users/alice/reminders/9')));
 });
 // Test the production transport against the emulator, injecting only its Firebase singleton.
 globalThis.__syncFirebase={firestoreDb:alice._delegate,firebaseAuth:{currentUser:{uid:'alice'}}};
 const {firestoreTransport}=await import('../src/sync/firestoreTransport.ts');
 await check('Production transport: atomic reminder mirror, conflict detection, delete and idempotency',async()=>{
   const transport=firestoreTransport('alice');
   const p={key:'reminders_900',table:'reminders',id:900,baseRevision:0,changeId:'transport-1',deleted:false,payload:{id:900,title:'Celular',notes:'Teste',startsAt:'2026-10-01T12:00:00Z',completed:false}};
   const first=await transport.send(p,'phone');assert.equal(first.record.revision,1);assert(!first.conflict);
   assert.equal((await getDoc(doc(alice,'users/alice/reminders/900'))).data().title,'Celular');
   assert.equal((await transport.send(p,'phone')).record.revision,1);
   const conflict=await transport.send({...p,changeId:'pc-edit'},'pc');assert(conflict.conflict);
   const removed=await transport.send({...p,baseRevision:1,changeId:'delete',deleted:true,payload:null},'phone');assert.equal(removed.record.revision,2);
   assert.equal((await getDoc(doc(alice,'users/alice/reminders/900'))).exists(),false);
 });
 await check('Production transport receives real-time cloud updates',async()=>{
   const transport=firestoreTransport('alice');let stop;
   const received=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('snapshot timeout')),5000);stop=transport.listen((rows)=>{if(rows.some(r=>r.key==='memories_888')){clearTimeout(timer);resolve();}},reject);});
   try{await setDoc(doc(alice,'users/alice/data/memories_888'),record('memories',888));await received;}finally{stop?.();}
 });
 console.log(`${passed} Firestore scenarios passed`);
}finally{await env.cleanup();}
