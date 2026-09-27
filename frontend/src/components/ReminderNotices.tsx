import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BellRing, X } from "lucide-react";
import { Link } from "react-router-dom";
import { db } from "../db";
import { enableNexoNotifications, getNotificationPermission } from "../services/notificationService";

type Notice = { title:string; body:string; tag:string };
export default function ReminderNotices() {
  const [notices,setNotices]=useState<Notice[]>([]);
  const [now,setNow]=useState(Date.now());
  const mounted=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const reminders=useLiveQuery(()=>db.reminders.toArray(),[],[]);
  useEffect(()=>{const interval=setInterval(()=>setNow(Date.now()),15000);const visible=()=>setNow(Date.now());document.addEventListener('visibilitychange',visible);return()=>{clearInterval(interval);document.removeEventListener('visibilitychange',visible);};},[]);
  useEffect(()=>{
    const database=db;
    async function notify(notice:Notice){
      const claimed=await database.transaction('rw',database.syncMeta,async()=>{
        const key=`notice:${notice.tag}`;if(await database.syncMeta.get(key))return false;
        await database.syncMeta.put({key,value:new Date().toISOString()});return true;
      });
      if(mounted.current&&claimed)setNotices(items=>[...items,notice].slice(-3));
    }
    for(const r of reminders){const due=Date.parse(r.startsAt);if(!r.completed&&due<=now&&due>=now-86400000)void notify({title:r.emailProvider?`${r.emailProvider==='gmail'?'Gmail':'Mail · iCloud'} · ${r.title}`:r.title,body:r.notes || 'Chegou a hora do seu lembrete.',tag:`nexo-${r.id}-${r.startsAt}`}).catch(()=>{});}
    const receive=(event:Event)=>{void notify((event as CustomEvent<Notice>).detail).catch(()=>{});};
    window.addEventListener('nexo:notice',receive);
    return()=>{window.removeEventListener('nexo:notice',receive);};
  },[reminders,now]);
  useEffect(()=>{if(getNotificationPermission()==='granted')void enableNexoNotifications();},[]);
  return <aside className="reminder-notices" aria-label="Avisos do NEXO" aria-live="polite">{notices.map(notice=><article key={notice.tag} className="reminder-notice"><BellRing size={20}/><div><strong>{notice.title}</strong><p>{notice.body}</p><Link to="/lembretes" onClick={()=>setNotices(items=>items.filter(n=>n.tag!==notice.tag))}>Ver lembrete</Link></div><button aria-label={`Dispensar aviso ${notice.title}`} onClick={()=>setNotices(items=>items.filter(n=>n.tag!==notice.tag))}><X size={16}/></button></article>)}</aside>;
}
