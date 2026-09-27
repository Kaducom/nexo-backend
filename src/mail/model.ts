export type Provider = 'gmail' | 'icloud';
export interface MailMessage {
  id: string; threadId?: string; messageId?: string; references?: string;
  from: string; subject: string; text: string; receivedAt: string;
  bulk?: boolean;
}
export interface Candidate { title:string; notes:string; startsAt:string; }
export class MailError extends Error {
  code: string; status: number;
  constructor(code: string, message: string, status = 400) { super(message); this.code=code; this.status=status; }
}
export const MAX_EMAIL_BYTES=400_000;
export const BATCH_SIZE=3;
export async function digest(text:string) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export function normalize(text:string){return text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();}
