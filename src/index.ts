import { type Env } from './google';
import { api, data, root } from './firestore';
import { processReminders, sendPush } from './notifications';

const allowedOrigins=new Set(['https://nexo-15b2c.web.app','https://nexo-15b2c.firebaseapp.com','http://localhost:5173','http://127.0.0.1:5173']);
export async function authenticate(request:Request,env:Env):Promise<string>{
  const token=request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if(!token)throw Object.assign(new Error('Entre na sua conta Google.'),{status:401});
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Object.assign(new Error('Sua sessão expirou. Entre novamente.'),{status:401});
  const result=await response.json() as any;const user=result.users?.[0];
  if(!user?.localId||user.disabled)throw Object.assign(new Error('Conta indisponível.'),{status:401});
  return user.localId;
}
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const origin=request.headers.get('Origin') ?? '';
    const headers:Record<string,string>={'Vary':'Origin','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'};
    if(allowedOrigins.has(origin))headers['Access-Control-Allow-Origin']=origin;
    const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
    if(origin&&!allowedOrigins.has(origin))return json({error:'Origem não permitida.'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    const url=new URL(request.url);
    if(url.pathname==='/'&&request.method==='GET')return json({service:'NEXO Backend',status:'online',scheduler:'every-minute',version:2});
    try{
      if(url.pathname==='/notifications/test'&&request.method==='POST'){
        const uid=await authenticate(request,env);
        const input=await request.json() as any;
        if(typeof input.deviceId!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(input.deviceId))return json({error:'Aparelho inválido.'},400);
        const device=await api(env,`${root(env)}/users/${uid}/devices/${input.deviceId}`);
        await sendPush(env,data(device).token,'Tudo certo com seus avisos','O NEXO consegue enviar notificações para este aparelho.',`nexo-test-${Date.now()}`,uid);
        return json({success:true});
      }
      return json({error:'Rota não encontrada.'},404);
    }catch(error:any){console.error('api_failed',{status:error.status ?? 500});return json({error:error.status===401?error.message:'Não foi possível enviar o aviso. Confira o registro deste aparelho e a configuração do servidor.'},error.status===401?401:503);}
  },
  async scheduled(_controller:ScheduledController,env:Env,ctx:ExecutionContext){ctx.waitUntil(processReminders(env));},
};
