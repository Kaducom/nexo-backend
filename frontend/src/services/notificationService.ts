import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { doc, setDoc } from "firebase/firestore";
import { firebaseApp, firebaseAuth, firestoreDb } from "../firebase";

export type NotificationSetupResult = { success: true; token: string } | { success: false; reason: "unsupported"|"permission-denied"|"permission-default"|"missing-vapid-key"|"token-unavailable"|"registration-failed"; error?: unknown };
const key = (uid: string) => `nexo:push:${uid}`;
export function notificationDeviceId() {
  const storageKey="nexo:push-device";
  let id=localStorage.getItem(storageKey);
  if(!id){id=crypto.randomUUID();localStorage.setItem(storageKey,id);}
  return id;
}
export function isIPhoneBrowser() { return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches; }
export async function supportsNexoNotifications() { return 'Notification' in window && 'serviceWorker' in navigator && !isIPhoneBrowser() && await isSupported(); }
export function getNotificationPermission() { return 'Notification' in window ? Notification.permission : 'unsupported' as const; }
export function getStoredNexoNotificationToken() { const uid=firebaseAuth.currentUser?.uid; return uid ? localStorage.getItem(key(uid)) : null; }
async function registration() {
  return Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('O aplicativo ainda está atualizando. Reabra o NEXO e tente novamente.')),12000))]);
}
let generation=0;
let unsubscribe:(()=>void)|null=null;
let starting=false;
export async function startNexoForegroundNotifications() {
  if(starting||unsubscribe)return;
  starting=true; const current=++generation;
  try {
    if(!await supportsNexoNotifications()||current!==generation)return;
    unsubscribe=onMessage(getMessaging(firebaseApp),payload=>{
      if(!firebaseAuth.currentUser || payload.data?.uid !== firebaseAuth.currentUser.uid)return;
      window.dispatchEvent(new CustomEvent('nexo:notice',{detail:{title:payload.data?.title ?? payload.notification?.title ?? 'NEXO',body:payload.data?.body ?? payload.notification?.body ?? '',tag:payload.data?.tag ?? payload.messageId}}));
    });
  } catch { console.warn('Não foi possível iniciar os avisos push. Os avisos locais continuam disponíveis.'); }
  finally { if(current===generation)starting=false; }
}
export function stopNexoForegroundNotifications(){generation++;unsubscribe?.();unsubscribe=null;starting=false;}
export async function enableNexoNotifications(): Promise<NotificationSetupResult> {
  try {
    // Request permission directly from the click, before asynchronous SDK checks (iOS).
    const permissionPromise = getNotificationPermission()==='default' ? Notification.requestPermission() : Promise.resolve(getNotificationPermission());
    const permission=await permissionPromise;
    if(!await supportsNexoNotifications())return {success:false,reason:'unsupported'};
    if(permission==='denied')return {success:false,reason:'permission-denied'};
    if(permission!=='granted')return {success:false,reason:'permission-default'};
    const vapidKey=import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if(!vapidKey)return {success:false,reason:'missing-vapid-key'};
    const uid=firebaseAuth.currentUser?.uid;
    if(!uid)throw Error('Entre na conta Google antes de ativar os avisos.');
    const token=await getToken(getMessaging(firebaseApp),{vapidKey,serviceWorkerRegistration:await registration()});
    if(!token)return {success:false,reason:'token-unavailable'};
    if(firebaseAuth.currentUser?.uid!==uid)throw Error('A conta mudou. Tente novamente.');
    await setDoc(doc(firestoreDb,'users',uid,'devices',notificationDeviceId()),{token,updatedAt:new Date().toISOString(),platform:/iPhone|iPad/.test(navigator.userAgent)?'iOS':'web'});
    localStorage.setItem(key(uid),token);
    await startNexoForegroundNotifications();
    return {success:true,token};
  }catch(error){return {success:false,reason:'registration-failed',error};}
}
export async function testNexoNotification() {
  const user=firebaseAuth.currentUser;
  if(!user)throw Error('Entre na sua conta Google.');
  const base=import.meta.env.VITE_NEXO_API_URL;
  if(!base)throw Error('O servidor de avisos ainda precisa ser publicado.');
  const response=await fetch(`${base.replace(/\/$/,'')}/notifications/test`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify({deviceId:notificationDeviceId()}),signal:AbortSignal.timeout(20000)});
  const result=await response.json();if(!response.ok)throw Error(result.error || 'Não foi possível enviar o teste.');
}
