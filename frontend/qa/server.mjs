import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
const syncMode = process.env.NEXO_QA_SYNC === '1';
const root = fileURLToPath(new URL('../', import.meta.url));
const mockAuth = `import React, {createContext,useContext,useState} from 'react';
const Context=createContext(null);
const demo={displayName:'Marina Costa',email:'marina@example.test',photoURL:null,uid:sessionStorage.getItem('qa-uid')||'visual-test'};
export function AuthProvider({children}) { const [user,setUser]=useState(sessionStorage.getItem('qa-signed-out')?null:demo); return React.createElement(Context.Provider,{value:{user,loading:false,loginWithGoogle:async()=>{sessionStorage.removeItem('qa-signed-out');setUser(demo)},logout:async()=>{sessionStorage.setItem('qa-signed-out','1');setUser(null)}}},children); }
export function useAuth(){return useContext(Context);}`;
const mockNotifications=`export async function supportsNexoNotifications(){return true;}
export function getNotificationPermission(){return localStorage.getItem('qa-notifications')?'granted':'default';}
export function getStoredNexoNotificationToken(){return localStorage.getItem('qa-notifications');}
export async function enableNexoNotifications(){localStorage.setItem('qa-notifications','test-only');return {success:true,token:'test-only'};}
export async function startNexoForegroundNotifications(){}
export function stopNexoForegroundNotifications(){}`;
const server=await createServer({root,configFile:false,plugins:[{name:'isolated-qa-mocks',enforce:'pre',resolveId(id){if(id==='virtual:pwa-register')return '\0qa-pwa';},load(id){if(syncMode && id.endsWith('/sync/firestoreTransport.ts'))return 'export function firestoreTransport(){return {listen(next){queueMicrotask(()=>next([],true));return()=>{}},async send(p,deviceId){return {conflict:false,record:{...p,deviceId,revision:p.baseRevision+1}}}}}';if(!syncMode && id.endsWith('/components/AccountDataGate.tsx'))return 'export default function Gate({children}){return children}; export function SyncIndicator(){return null}; export function useAccountSync(){return {database:null,status:{state:"connecting"}}}';if(id==='\0qa-pwa')return 'export function registerSW(){}';if(id.endsWith('/context/AuthContext.tsx'))return mockAuth;if(id.endsWith('/services/notificationService.ts'))return mockNotifications;if(id.endsWith('/services/reminderSync.ts'))return 'export async function mirrorReminderUpsert(){}; export async function mirrorReminderDelete(){}; export async function mirrorReminderDeleteMany(){};';}},react()],server:{host:'127.0.0.1',port:syncMode?4175:4174,strictPort:true},optimizeDeps:{include:['react','react-dom/client']}});
await server.listen();console.log('Isolated QA server http://127.0.0.1:4174');
