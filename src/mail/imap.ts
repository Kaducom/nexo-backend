import { MailError, MAX_EMAIL_BYTES } from './model';
interface SocketLike {readable:ReadableStream<Uint8Array>;writable:WritableStream<Uint8Array>;close():Promise<void>;}
const encoder=new TextEncoder(),decoder=new TextDecoder();
export const quote=(value:string)=>{if(/[\r\n\0]/.test(value))throw new MailError('invalid_credential','Credencial inválida.');return `"${value.replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`;};
export class ImapSession {
  private reader;private writer;private buffer=new Uint8Array(0);private sequence=0;
  private socket:SocketLike;
  constructor(socket:SocketLike){this.socket=socket;this.reader=socket.readable.getReader();this.writer=socket.writable.getWriter();}
  async close(){try{await this.socket.close();}catch{} }
  private async refill(){
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      const result=await Promise.race([this.reader.read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{void this.close();reject(new MailError('icloud_timeout','O iCloud demorou para responder. Tente novamente.'));},12000);})]);
      if(result.done)throw new MailError('icloud_closed','A conexão com o iCloud foi interrompida.');
      const joined=new Uint8Array(this.buffer.length+result.value.length);joined.set(this.buffer);joined.set(result.value,this.buffer.length);this.buffer=joined;
      if(this.buffer.length>MAX_EMAIL_BYTES+65536)throw new MailError('message_too_large','Mensagem acima do limite de leitura.');
    }finally{clearTimeout(timer);}
  }
  async line():Promise<string>{
    for(;;){const index=this.buffer.findIndex((n,i)=>n===13&&this.buffer[i+1]===10);if(index>=0){const line=decoder.decode(this.buffer.slice(0,index));this.buffer=this.buffer.slice(index+2);return line;}await this.refill();}
  }
  private async bytes(size:number){
    if(size>MAX_EMAIL_BYTES)throw new MailError('message_too_large','Mensagem acima do limite de leitura.');
    while(this.buffer.length<size)await this.refill();
    const result=this.buffer.slice(0,size);this.buffer=this.buffer.slice(size);return result;
  }
  async command(command:string):Promise<{lines:string[];literals:Uint8Array[]}>{
    const tag=`N${++this.sequence}`;await this.writer.write(encoder.encode(`${tag} ${command}\r\n`));
    const lines:string[]=[],literals:Uint8Array[]=[];
    for(let i=0;i<10000;i++){
      const line=await this.line();
      if(line.startsWith(`${tag} `)){
        if(!line.startsWith(`${tag} OK`))throw new MailError('icloud_command_failed','O iCloud recusou a leitura. Confira a conta e a senha específica de app.');
        return {lines,literals};
      }
      if(line.startsWith('* BYE'))throw new MailError('icloud_closed','O iCloud encerrou a conexão.');
      lines.push(line);const literal=/\{(\d+)\}$/.exec(line);if(literal)literals.push(await this.bytes(Number(literal[1])));
    }
    throw new MailError('icloud_response_limit','A resposta do iCloud excedeu o limite.');
  }
}
export async function openICloud(address:string,password:string){
  const {connect}=await import('cloudflare:sockets');
  const socket=connect({hostname:'imap.mail.me.com',port:993},{secureTransport:'on',allowHalfOpen:false});
  const session=new ImapSession(socket);
  try{
    if(!(await session.line()).startsWith('* OK'))throw new MailError('icloud_unavailable','O iCloud está indisponível.');
    await session.command(`LOGIN ${quote(address)} ${quote(password)}`);
    const result=await session.command('EXAMINE INBOX');
    const validity=result.lines.join('\n').match(/\[UIDVALIDITY (\d+)\]/)?.[1];
    if(!validity)throw new MailError('icloud_invalid','Não foi possível identificar a caixa de entrada.');
    return {session,validity};
  }catch(error){await session.close();throw error;}
}
