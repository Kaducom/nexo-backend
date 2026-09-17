import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { createNexoDatabase } from '../src/db';
import { openAccountDatabase, importLegacy, legacyCount } from '../src/sync/migration';
import { receiveRecords, acknowledge, resolveConflict, startSync } from '../src/sync/engine';
import { syncedTables } from '../src/sync/model';
import type { CloudRecord, PendingChange } from '../src/sync/model';

const events = new EventTarget();
Object.assign(globalThis, { window: Object.assign(events, { setInterval, clearInterval }) });
Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
let passed = 0;
const check = async (name: string, task: () => Promise<void>) => { await task(); console.log('PASS', name); passed++; };
const a = await openAccountDatabase('alice', 'test-a:');
const b = await openAccountDatabase('alice', 'test-b:');
const other = await openAccountDatabase('bob', 'test-a:');
const now = new Date().toISOString();
const memory = {title:'Celular', content:'Conteúdo', tags:['teste'], createdAt:now, updatedAt:now};
const cloud = (p: PendingChange, revision=1, deviceId='a'): CloudRecord => ({key:p.key,table:p.table,id:p.id,changeId:p.changeId,deleted:p.deleted,payload:p.payload,revision,deviceId});
let id: number;
await check('Local writes atomically queue full payload and use safe numeric IDs', async () => {
  id = await a.memories.add({...memory});
  assert(Number.isSafeInteger(id) && id>0);
  const p = await a.syncOutbox.get(`memories_${id}`);
  assert.equal(p?.payload?.title,'Celular'); assert.equal(p?.baseRevision,0);
});
await check('Receive on second device without echo and isolate another account', async () => {
  const p = (await a.syncOutbox.toArray())[0];
  await receiveRecords(b,[cloud(p)],'b');
  assert.equal((await b.memories.get(id))?.content,memory.content);
  assert.equal(await b.syncOutbox.count(),0); assert.equal(await other.memories.count(),0);
  await acknowledge(a,p,cloud(p),false); assert.equal(await a.syncOutbox.count(),0);
});
await check('Updates and deletions propagate, stale snapshots do not resurrect', async () => {
  await a.memories.update(id,{title:'Editado'});
  const p = (await a.syncOutbox.toArray())[0]; assert.equal(p.baseRevision,1);
  await receiveRecords(b,[cloud(p,2)],'b'); await acknowledge(a,p,cloud(p,2),false);
  assert.equal((await b.memories.get(id))?.title,'Editado');
  await a.memories.delete(id);
  const deletion = (await a.syncOutbox.toArray())[0]; assert(deletion.deleted);
  await receiveRecords(b,[cloud(deletion,3)],'b'); await receiveRecords(b,[cloud(p,2)],'b');
  assert.equal(await b.memories.get(id),undefined); await acknowledge(a,deletion,cloud(deletion,3),false);
});
await check('Bulk writes, range delete and rollback include the outbox', async () => {
  await a.memories.bulkAdd([{...memory},{...memory}]); assert.equal(await a.syncOutbox.count(),2);
  await a.memories.clear(); assert((await a.syncOutbox.toArray()).every(p=>p.deleted));
  const count = await a.syncOutbox.count();
  await assert.rejects(a.transaction('rw',a.memories,async()=>{await a.memories.add({...memory});throw Error('rollback');}));
  assert.equal(await a.memories.count(),0); assert.equal(await a.syncOutbox.count(),count);
  await a.syncOutbox.clear();
});
await check('Editing during upload preserves newest local value and base revision', async () => {
  id = await a.memories.add({...memory}); const sent=(await a.syncOutbox.toArray())[0];
  await a.memories.update(id,{title:'Mais recente'});
  await acknowledge(a,sent,cloud(sent),false);
  assert.equal((await a.memories.get(id))?.title,'Mais recente');
  assert.equal((await a.syncOutbox.get(sent.key))?.baseRevision,1);
});
await check('Concurrent edits require explicit resolution; remote and local choices work', async () => {
  const p=(await a.syncOutbox.toArray())[0];
  const remote={...cloud(p,2,'b'),changeId:'remote',payload:{...p.payload!,title:'Computador'}};
  await acknowledge(a,p,remote,true);
  assert.equal((await a.memories.get(id))?.title,'Mais recente');
  await resolveConflict(a,p.key,false); assert.equal((await a.memories.get(id))?.title,'Computador');
  await a.memories.update(id,{title:'Meu texto'}); const edited=(await a.syncOutbox.toArray())[0];
  await acknowledge(a,edited,{...remote,revision:3},true); await resolveConflict(a,p.key,true);
  const kept=(await a.syncOutbox.toArray())[0]; assert.equal(kept.baseRevision,3); assert.equal(kept.conflict,undefined);
  await acknowledge(a,edited,{...remote,revision:2},false);
  assert.equal((await a.syncOutbox.toArray())[0].baseRevision,3);
  await acknowledge(a,kept,cloud(kept,4),false);
});
await check('All six stores queue and survive reopening the browser database',async()=>{
  for(const table of syncedTables) await a.table(table).add({...memory,externalKey:'unique',matchKey:'merchant',amount:12});
  assert.equal(await a.syncOutbox.count(),6); a.close(); await a.open(); assert.equal(await a.syncOutbox.count(),6);
  await a.syncOutbox.clear();
});
await check('Stable IDs deduplicate matching bank imports across devices',async()=>{
  const entry={externalKey:'same-bank-entry',description:'Compra',amount:12};
  const x=await a.bankImports.add(entry as any), y=await b.bankImports.add(entry as any); assert.equal(x,y);
});
await check('Legacy migration preserves references and is idempotent and owner-only',async()=>{
  const legacy=createNexoDatabase('test-legacy');
  await legacy.financialCommitments.add({...memory,id:1} as any);
  await legacy.reminders.add({...memory,id:1,sourceType:'financialCommitment',sourceId:1} as any);
  await legacy.bankImports.add({id:1,externalKey:'legacy',transactionId:1} as any);
  await legacy.transactions.add({id:1,importEntryId:1,financialCommitmentId:1} as any);
  legacy.close();
  assert.equal(await legacyCount('alice',b,'test-legacy'),4);
  await importLegacy('alice',b,'test-legacy');
  const reminder=(await b.reminders.toArray())[0]; const commitment=(await b.financialCommitments.toArray())[0];
  assert.equal(reminder.sourceId,commitment.id);
  const bank=await b.bankImports.where('externalKey').equals('legacy').first();
  const transaction=await b.transactions.get(bank!.transactionId!);
  assert.equal(transaction?.importEntryId,bank?.id); assert.equal(transaction?.financialCommitmentId,commitment.id);
  const count=await b.syncOutbox.count(); await importLegacy('alice',b,'test-legacy'); assert.equal(await b.syncOutbox.count(),count);
  await assert.rejects(importLegacy('bob',other,'test-legacy')); assert.equal(await other.reminders.count(),0);
});
await check('Automatic real-time engine syncs two devices and retries offline changes',async()=>{
  const x=await openAccountDatabase('alice','engine-a:'), y=await openAccountDatabase('alice','engine-b:');
  const records=new Map<string,CloudRecord>(), listeners=new Set<(r:CloudRecord[],s:boolean)=>void>();
  const transport={listen(fn:any){listeners.add(fn);queueMicrotask(()=>fn([...records.values()],true));return()=>{listeners.delete(fn);};},async send(p:PendingChange,deviceId:string){const prev=records.get(p.key);if(prev&&prev.revision!==p.baseRevision)return{record:prev,conflict:true};const record=cloud(p,(prev?.revision??0)+1,deviceId);records.set(p.key,record);for(const fn of listeners)fn([record],true);return{record,conflict:false};}};
  const errors:string[]=[]; const report=(s:any)=>{if(s.state==='error')errors.push(s.message);};
  const stopX=startSync(x,transport,'x',report),stopY=startSync(y,transport,'y',report);
  const wait=async(fn:()=>Promise<boolean>)=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('sync timeout '+errors);};
  try{
    const key=await x.memories.add({...memory}); await wait(async()=>!!await y.memories.get(key));
    Object.defineProperty(navigator,'onLine',{value:false,configurable:true});
    await y.memories.update(key,{title:'Offline'}); await new Promise(r=>setTimeout(r,50));
    assert.equal((await x.memories.get(key))?.title,'Celular');
    Object.defineProperty(navigator,'onLine',{value:true,configurable:true}); events.dispatchEvent(new Event('online'));
    await wait(async()=>(await x.memories.get(key))?.title==='Offline'); assert.deepEqual(errors,[]);
  }finally{stopX();stopY();x.close();y.close();}
});
a.close();b.close();other.close();console.log(`${passed} synchronization scenarios passed`);
