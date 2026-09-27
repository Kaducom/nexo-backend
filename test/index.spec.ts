import { env, createExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';
describe('NEXO notifications API',()=>{
 it('reports its scheduler',async()=>{const response=await worker.fetch(new Request('https://example.com/'),env as any);expect((await response.json() as any).scheduler).toBe('every-minute');});
 it('rejects unauthenticated tests',async()=>{const response=await worker.fetch(new Request('https://example.com/notifications/test',{method:'POST',body:'{}'}),env as any);expect(response.status).toBe(401);});
 it('rejects foreign origins',async()=>{const response=await worker.fetch(new Request('https://example.com/',{headers:{Origin:'https://foreign.example'}}),env as any);expect(response.status).toBe(403);});
});
