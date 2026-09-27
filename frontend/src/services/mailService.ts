import {firebaseAuth} from '../firebase';
export type MailProvider='gmail'|'icloud';
export type MailStatus={capabilities:{gmail:boolean;icloud:boolean};connections:{provider:MailProvider;address:string;timeZone:string;lastCheckedAt:string|null;lastAdded:number;lastIgnored:number;error:string|null}[]};
export async function mailRequest<T>(path:string,body?:unknown):Promise<T>{
  const base=import.meta.env.VITE_NEXO_API_URL,user=firebaseAuth.currentUser;
  if(!base)throw Error('As conexões de e-mail estarão disponíveis após publicar a atualização do NEXO.');
  if(!user)throw Error('Entre na sua conta Google.');
  const response=await fetch(`${base.replace(/\/$/,'')}/mail/${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${await user.getIdToken()}`,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(90000)});
  const result=await response.json();if(!response.ok)throw Error(result.error || 'Não foi possível acessar sua conexão de e-mail.');return result;
}
export async function connectGmail(){
  finishing=undefined;
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  const browserSecret=btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  sessionStorage.setItem('nexo:gmail-browser-secret',browserSecret);
  const result=await mailRequest<{url:string}>('gmail/start',{browserSecret,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone});
  const url=new URL(result.url);if(url.origin!=='https://accounts.google.com')throw Error('Endereço de autorização inválido.');
  window.location.assign(url.href);
}
let finishing:Promise<string|null>|undefined;
export function finishGmailConnection():Promise<string|null>{
  const params=new URLSearchParams(location.hash.slice(1));
  if(!params.has('gmail_state'))return finishing ?? Promise.resolve(null);
  const state=params.get('gmail_state'),code=params.get('gmail_code'),denied=params.has('gmail_error');
  history.replaceState(null,'',location.pathname+location.search+'#email');
  const browserSecret=sessionStorage.getItem('nexo:gmail-browser-secret');
  finishing=(async()=>{
    try{
      if(denied)throw Error('A autorização do Gmail foi cancelada.');
      if(!browserSecret)throw Error('Conecte o Gmail novamente a partir deste navegador.');
      await mailRequest('gmail/finish',{state,code,browserSecret});return 'Gmail conectado. A verificação automática está habilitada.';
    }finally{sessionStorage.removeItem('nexo:gmail-browser-secret');}
  })();
  return finishing;
}
