import { getGoogleAccessToken, type Env } from './google';
type Value = { stringValue?: string; booleanValue?: boolean; integerValue?: string; doubleValue?: number; nullValue?: null; mapValue?: { fields: Record<string, Value> }; arrayValue?: { values?: Value[] } };
export interface Document { name: string; fields: Record<string, Value>; updateTime: string; }
export function encode(value: any): Value {
  if (value == null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)])) } };
}
export function decode(value: Value): any {
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([k,v])=>[k,decode(v)]));
  if (value.arrayValue) return (value.arrayValue.values ?? []).map(decode);
  return null;
}
export const data = (doc: Document): any => decode({mapValue:{fields:doc.fields}});
export const root = (env: Env) => `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
export async function api(env: Env, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://firestore.googleapis.com/v1/${path}`, { ...init, headers:{Authorization:`Bearer ${await getGoogleAccessToken(env)}`,'Content-Type':'application/json',...init.headers}, signal:AbortSignal.timeout(20000) });
  if (!response.ok) {
    const error = await response.json() as any;
    throw Object.assign(new Error(`Firestore: HTTP ${response.status}`),{status:response.status,precondition:['FAILED_PRECONDITION','ABORTED','NOT_FOUND'].includes(error.error?.status)});
  }
  return response.json() as Promise<any>;
}
export async function patch(env: Env, doc: Document, updates: Record<string,unknown>) {
  const fields=encode(updates).mapValue!.fields;
  const result=await api(env,`${root(env)}:commit`,{method:'POST',body:JSON.stringify({writes:[{update:{name:doc.name,fields},updateMask:{fieldPaths:Object.keys(updates)},currentDocument:{updateTime:doc.updateTime}}]})});
  return {name:doc.name,fields:{...doc.fields,...fields},updateTime:result.writeResults[0].updateTime} as Document;
}
export async function* list(env: Env, path: string): AsyncGenerator<Document> {
  let pageToken = '';
  do { const result = await api(env,`${path}?pageSize=100${pageToken?`&pageToken=${encodeURIComponent(pageToken)}`:''}`); for(const doc of result.documents ?? []) yield doc; pageToken=result.nextPageToken ?? ''; } while(pageToken);
}
