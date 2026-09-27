// Shared with the service worker so a push for a signed-out account is hidden.
function accountStore(write: boolean, uid?: string | null): Promise<string | null> {
  return new Promise((resolve,reject)=>{
    const open=indexedDB.open('NexoPushAccount',1);
    open.onupgradeneeded=()=>open.result.createObjectStore('account');
    open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{
      const database=open.result;
      const tx=database.transaction('account',write?'readwrite':'readonly');
      const store=tx.objectStore('account');
      const request=write?store.put(uid ?? null,'active'):store.get('active');
      tx.oncomplete=()=>{database.close();resolve(write?uid ?? null:request.result ?? null);};
      tx.onerror=()=>{database.close();reject(tx.error);};
    };
  });
}
export const setPushAccount=(uid:string|null)=>accountStore(true,uid);
export const getPushAccount=()=>accountStore(false);
