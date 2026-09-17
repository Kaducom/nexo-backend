import { registerHooks, stripTypeScriptTypes } from 'node:module';
import fs from 'node:fs';
registerHooks({
  resolve(specifier, context, next) {
    if (process.env.NEXO_SYNC_FIREBASE_TEST === '1' && specifier.startsWith('firebase/')) return next(specifier, {...context,parentURL:new URL('./firestore-tests.mjs',import.meta.url).href});
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/i.test(specifier)) {
      const candidate = new URL(specifier + '.ts', context.parentURL);
      if (fs.existsSync(candidate)) return next(candidate.href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (process.env.NEXO_SYNC_FIREBASE_TEST === '1' && url.endsWith('/src/firebase.ts')) return {format:'module',shortCircuit:true,source:'export const {firestoreDb,firebaseAuth}=globalThis.__syncFirebase;'};
    if (url.endsWith('.ts')) return {format:'module',shortCircuit:true,source:stripTypeScriptTypes(fs.readFileSync(new URL(url),'utf8'))};
    return next(url, context);
  }
});
