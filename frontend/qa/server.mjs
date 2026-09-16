import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const mockAuth = `import React, {createContext,useContext,useState} from 'react';
const Context=createContext(null);
const demo={displayName:'Marina Costa',email:'marina@example.test',photoURL:null,uid:'visual-test'};
export function AuthProvider({children}) { const [user,setUser]=useState(sessionStorage.getItem('qa-signed-out')?null:demo); return React.createElement(Context.Provider,{value:{user,loading:false,loginWithGoogle:async()=>{sessionStorage.removeItem('qa-signed-out');setUser(demo)},logout:async()=>{sessionStorage.setItem('qa-signed-out','1');setUser(null)}}},children); }
export function useAuth(){return useContext(Context);}`;
const mockNotifications=`export async function supportsNexoNotifications(){return true;}
export function getNotificationPermission(){return localStorage.getItem('qa-notifications')?'granted':'default';}
export function getStoredNexoNotificationToken(){return localStorage.getItem('qa-notifications');}
export async function enableNexoNotifications(){localStorage.setItem('qa-notifications','test-only');return {success:true,token:'test-only'};}
export async function startNexoForegroundNotifications(){}
export function stopNexoForegroundNotifications(){}`;
const server=await createServer({root,configFile:false,plugins:[{name:'isolated-qa-mocks',enforce:'pre',resolveId(id){if(id==='virtual:pwa-register')return '\0qa-pwa';},load(id){if(id==='\0qa-pwa')return 'export function registerSW(){}';if(id.endsWith('/context/AuthContext.tsx'))return mockAuth;if(id.endsWith('/services/notificationService.ts'))return mockNotifications;if(id.endsWith('/services/reminderSync.ts'))return 'export async function mirrorReminderUpsert(){}; export async function mirrorReminderDelete(){}; export async function mirrorReminderDeleteMany(){};';}},react()],server:{host:'127.0.0.1',port:4174,strictPort:true},optimizeDeps:{include:['react','react-dom/client']}});
await server.listen();console.log('Isolated QA server http://127.0.0.1:4174');
