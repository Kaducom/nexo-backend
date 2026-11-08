# Validação NEXO 0.2

O servidor `server.mjs` usa autenticação e notificações simuladas; IndexedDB e os componentes são reais. Nenhum dado de produção é usado. Execute os comandos na raiz `work/nexo-git`.

```powershell
npm --prefix frontend run build
npm --prefix frontend/qa run test:finance
npm --prefix frontend/qa run test:sync
# Terminal separado, encerrar com Ctrl+C ao terminar:
node frontend/qa/server.mjs
# Outro terminal:
$env:NEXO_TEST_BROWSER='C:/Program Files/Google/Chrome/Application/chrome.exe'
npm --prefix frontend/qa test
```

A suíte atual usa `finance-v2-ui.mjs`, `bank-tests.mjs`, `home-notices.mjs` e `mail-effects.mjs`. Os antigos `test.mjs` e `extra.mjs` registram a interface v0.1 e não compõem a suíte principal da v0.2. Resultados e capturas ficam em `qa/artifacts/` (ignorados pelo Git).

Para regras, inicie `firebase emulators:start --only firestore --project demo-nexo-sync` em `frontend`, com Java configurado. Na raiz:

```powershell
$env:NEXO_SYNC_FIREBASE_TEST='1'
node --import ./frontend/qa/typescript-loader.mjs frontend/qa/firestore-tests.mjs
```

As regras são carregadas no emulador e o transporte Firestore real é exercitado. As suítes financeiras e de sincronização usam fake-indexeddb; a suíte de navegador usa IndexedDB real em contextos descartáveis. Não há login real Google/Apple, envio push real ou teste físico de iPhone. Veja [NEXO-v0.2.md](../../NEXO-v0.2.md) para resultados e limitações.
