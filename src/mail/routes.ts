import type {Env} from '../google';
import {api,data,encode,root} from '../firestore';
import {base64url,seal,unseal} from './crypto';
import {context,connectionPath,read,put} from './storage';
import {digest,MailError,type Provider} from './model';
import {googleJson} from './providers';
import {openICloud} from './imap';
import {syncConnection} from './engine';
const APP_URL='https://nexo-15b2c.web.app/configuracoes';
const scope='https://www.googleapis.com/auth/gmail.readonly';
function gmailReady(env:Env){return !!(env.MAIL_ENCRYPTION_KEY&&env.GMAIL_CLIENT_ID&&env.GMAIL_CLIENT_SECRET&&env.GMAIL_REDIRECT_URI?.startsWith('https://'));}
function zone(value:unknown){if(typeof value!=='string'||value.length>80)throw new MailError('invalid_zone','Informe um fuso horário válido.');try{new Intl.DateTimeFormat('pt-BR',{timeZone:value});}catch{throw new MailError('invalid_zone','Fuso horário inválido.');}return value;}
function provider(value:unknown):Provider{if(value!=='gmail'&&value!=='icloud')throw new MailError('invalid_provider','Fonte de e-mail inválida.');return value;}
export function gmailCallback(request:Request){
  const url=new URL(request.url);const state=url.searchParams.get('state') ?? '';
  const code=url.searchParams.get('code') ?? '';
  const error=url.searchParams.has('error')?'access_denied':'';
  if(state.length>100||code.length>4096)return new Response('Retorno inválido.',{status:400});
  // Fragment avoids sending the authorization code to Hosting logs. Exchange still
  // requires the original browser secret and the same authenticated Firebase UID.
  const fragment=new URLSearchParams({gmail_state:state,gmail_code:code,...(error?{gmail_error:error}:{})});
  return new Response(null,{status:303,headers:{Location:`${APP_URL}#${fragment}`,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}
export async function mailRoute(request:Request,env:Env,uid:string):Promise<unknown>{
  const path=new URL(request.url).pathname;
  if(request.method==='GET'&&path==='/mail/status'){
    const connections=[];
    for(const type of ['gmail','icloud'] as const){const doc=await read(env,connectionPath(env,uid,type));if(doc){const c=data(doc);connections.push({provider:type,address:c.address,timeZone:c.timeZone,lastCheckedAt:c.lastCheckedAt ?? null,lastAdded:c.lastAdded ?? 0,lastIgnored:c.lastIgnored ?? 0,error:c.error ?? null});}}
    return {capabilities:{gmail:gmailReady(env),icloud:!!env.MAIL_ENCRYPTION_KEY},connections};
  }
  if(request.method!=='POST')throw new MailError('not_found','Rota não encontrada.',404);
  if(Number(request.headers.get('Content-Length'))>12000)throw new MailError('invalid_body','Solicitação muito grande.',413);
  const text=await request.text();if(text.length>12000)throw new MailError('invalid_body','Solicitação muito grande.',413);
  let body:any;try{body=JSON.parse(text);}catch{throw new MailError('invalid_body','Solicitação inválida.');}
  if(path==='/mail/gmail/start'){
    if(!gmailReady(env))throw new MailError('setup_required','A conexão com Gmail ainda precisa ser habilitada no servidor.',503);
    if(typeof body.browserSecret!=='string'||!/^[a-zA-Z0-9_-]{40,100}$/.test(body.browserSecret))throw new MailError('invalid_state','Reabra Configurações para conectar.');
    const timeZone=zone(body.timeZone),state=crypto.randomUUID();
    const verifier=base64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge=base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
    const secret=await seal(env,{verifier},`oauth:${uid}:${state}`);
    await put(env,`${root(env)}/mailOAuthStates/${state}`,{uid,secret,browserHash:await digest(body.browserSecret),timeZone,expiresAt:new Date(Date.now()+600000).toISOString()});
    const params=new URLSearchParams({client_id:env.GMAIL_CLIENT_ID!,redirect_uri:env.GMAIL_REDIRECT_URI!,response_type:'code',scope,access_type:'offline',prompt:'consent',state,code_challenge:challenge,code_challenge_method:'S256'});
    return {url:`https://accounts.google.com/o/oauth2/v2/auth?${params}`};
  }
  if(path==='/mail/gmail/finish'){
    if(!gmailReady(env))throw new MailError('setup_required','Gmail ainda não configurado.',503);
    if(typeof body.state!=='string'||!/^[a-f0-9-]{36}$/.test(body.state)||typeof body.browserSecret!=='string'||typeof body.code!=='string')throw new MailError('invalid_state','Conexão inválida. Tente novamente.');
    const doc=await read(env,`${root(env)}/mailOAuthStates/${body.state}`);const state=doc?data(doc):null;
    if(!doc||state.uid!==uid||state.browserHash!==await digest(body.browserSecret)||Date.parse(state.expiresAt)<Date.now())throw new MailError('invalid_state','Esta autorização expirou ou pertence a outra sessão. Conecte novamente.');
    await api(env,`${root(env)}:commit`,{method:'POST',body:JSON.stringify({writes:[{delete:doc.name,currentDocument:{updateTime:doc.updateTime}}]})});
    const {verifier}=await unseal(env,state.secret,`oauth:${uid}:${body.state}`);
    const tokens=await googleJson('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:env.GMAIL_CLIENT_ID!,client_secret:env.GMAIL_CLIENT_SECRET!,redirect_uri:env.GMAIL_REDIRECT_URI!,grant_type:'authorization_code',code:body.code,code_verifier:verifier})});
    if(!tokens.refresh_token||(tokens.scope&&!tokens.scope.split(' ').includes(scope)))throw new MailError('gmail_permission','Autorize a leitura do Gmail para conectar.');
    const profile=await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:`Bearer ${tokens.access_token}`}});
    const secret=await seal(env,{refreshToken:tokens.refresh_token},context(uid,'gmail'));
    await put(env,connectionPath(env,uid,'gmail'),{uid,provider:'gmail',address:profile.emailAddress,timeZone:state.timeZone,secret,cursor:'',connectedAt:new Date().toISOString(),lastCheckedAt:null});
    return {connected:true};
  }
  if(path==='/mail/icloud/connect'){
    if(!env.MAIL_ENCRYPTION_KEY)throw new MailError('setup_required','A conexão com iCloud ainda precisa ser habilitada no servidor.',503);
    const address=String(body.address ?? '').trim().toLowerCase(),password=String(body.password ?? '').trim();
    if(address.length>320||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)||!/^[a-zA-Z]{4}(?:-[a-zA-Z]{4}){3}$/.test(password))throw new MailError('invalid_credential','Informe seu e-mail iCloud e a senha específica de app no formato xxxx-xxxx-xxxx-xxxx.');
    const timeZone=zone(body.timeZone);
    const {session}=await openICloud(address,password);await session.close();
    const secret=await seal(env,{address,password},context(uid,'icloud'));
    await put(env,connectionPath(env,uid,'icloud'),{uid,provider:'icloud',address,timeZone,secret,cursor:'',connectedAt:new Date().toISOString(),lastCheckedAt:null});
    return {connected:true};
  }
  if(path==='/mail/sync'||path==='/mail/disconnect'){
    const type=provider(body.provider);const connection=await read(env,connectionPath(env,uid,type));
    if(!connection)throw new MailError('not_connected','Conecte essa conta primeiro.',404);
    if(path==='/mail/sync')return syncConnection(env,connection);
    await api(env,`${root(env)}:commit`,{method:'POST',body:JSON.stringify({writes:[{delete:connection.name,currentDocument:{updateTime:connection.updateTime}}]})});
    return {disconnected:true};
  }
  throw new MailError('not_found','Rota não encontrada.',404);
}
