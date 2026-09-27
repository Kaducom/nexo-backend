import { type Candidate, type MailMessage, normalize } from './model';

function parts(date:Date,zone:string){
  const fields=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  return Object.fromEntries(fields.map(p=>[p.type,Number(p.value)]));
}
export function localInstant(year:number,month:number,day:number,hour:number,minute:number,zone:string):string|null {
  if(hour>23||minute>59||month<1||month>12||day<1||day>31)return null;
  const civil=Date.UTC(year,month-1,day,hour,minute);
  const check=new Date(civil);if(check.getUTCMonth()!==month-1||check.getUTCDate()!==day)return null;
  let instant=civil;
  for(let i=0;i<3;i++){const p=parts(new Date(instant),zone);instant+=civil-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);}
  const p=parts(new Date(instant),zone);
  return p.year===year&&p.month===month&&p.day===day&&p.hour===hour&&p.minute===minute?new Date(instant).toISOString():null;
}
export function extractReminder(mail:MailMessage,zone='America/Sao_Paulo',now=Date.now()):Candidate|null {
  if(mail.bulk)return null;
  // The parser treats mail as data, never as instructions. Quoted history is excluded.
  const body=mail.text.split(/\n(?:On .+wrote:|Em .+escreveu:|De: |From: |_{5,}|-{5,})/i)[0].split('\n').filter(line=>!/^\s*>/.test(line)).join('\n').slice(0,16000);
  const text=normalize(`${mail.subject}\n${body}`);
  if(/\b(newsletter|promocao|cupom|oferta|desconto|black friday|liquidacao|unsubscribe|descadastre|cancelad[oa]|cancelamento|reagend\w*|remarcad\w*|nao esta confirmad\w*|pagamento (?:ja )?(?:recebido|confirmado)|fatura paga|comprovante de pagamento)\b/.test(text))return null;
  const appointment=/\b(consulta|reuniao|entrevista|agendamento|compromisso|appointment|meeting)\b/.test(text)&&/\b(confirmad[oa]|agendad[oa]|marcad[oa]|confirmed|scheduled)\b/.test(text);
  const deadline=/\b(vencimento|vence|prazo (?:final|para)|data limite|due date)\b/.test(text);
  if(!appointment&&!deadline)return null;
  // Accept only one unambiguous calendar day. This avoids footer dates and date ranges.
  const dates=[...text.matchAll(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}))?\b/g)];
  const unique=[...new Set(dates.map(m=>`${m[1]}/${m[2]}/${m[3]??''}`))];
  const received=parts(new Date(mail.receivedAt),zone);
  let year:number,month:number,day:number;
  if(unique.length===1){const m=dates[0];day=Number(m[1]);month=Number(m[2]);year=Number(m[3]||received.year);}
  else if(unique.length===0 && /\b(amanha|hoje)\b/.test(text)){
    if(/\bamanha\b/.test(text)&&/\bhoje\b/.test(text))return null;
    const dayDate=new Date(Date.UTC(received.year,received.month-1,received.day+(/\bamanha\b/.test(text)?1:0)));
    year=dayDate.getUTCFullYear();month=dayDate.getUTCMonth()+1;day=dayDate.getUTCDate();
  }else return null;
  const times=[...text.matchAll(/\b(\d{1,2})(?::([0-5]\d)|h(?:([0-5]\d))?)\b/g)];
  const timeValues=[...new Set(times.map(m=>`${Number(m[1])}:${Number(m[2]||m[3]||0)}`))];
  if(timeValues.length>1||(!timeValues.length&&appointment&&!deadline))return null;
  const [hour,minute]=timeValues.length?timeValues[0].split(':').map(Number):[9,0];
  let startsAt=localInstant(year,month,day,hour,minute,zone);
  // Yearless December -> January dates are safe to infer; other past dates are ignored.
  if(startsAt&&Date.parse(startsAt)<now&&dates.length&&!dates[0][3]&&received.month===12&&month===1)startsAt=localInstant(year+1,month,day,hour,minute,zone);
  if(!startsAt||Date.parse(startsAt)<now||Date.parse(startsAt)>now+366*86400000)return null;
  return {title:mail.subject.trim().slice(0,160)||'Compromisso por e-mail',notes:`Recebido de ${mail.from.slice(0,160)}.${!timeValues.length?' Aviso às 09h no dia do prazo (o e-mail não informa horário).':''}`,startsAt};
}
