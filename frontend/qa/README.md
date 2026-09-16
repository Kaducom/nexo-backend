# Validação visual e funcional local

Este diretório é independente do build do produto. `server.mjs` substitui AuthContext, notificationService e reminderSync **somente no servidor de QA**. O código em `src/` continua usando os serviços reais. O banco Dexie é real, preenchido com dados fictícios em um contexto de navegador descartável.

## Preparação

Na raiz do projeto:

```sh
npm ci
npm run build
cd qa
npm install
npx playwright install chromium
```

Mantenha dois terminais abertos:

```sh
# Terminal 1, raiz NEXO
npm run preview -- --host 127.0.0.1 --port 4173
```

```sh
# Terminal 2, pasta NEXO/qa
npm run serve
```

Em um terceiro terminal, na pasta `qa`:

```sh
npm test
```

Resultados e capturas ficam em `qa/artifacts/`. Os testes usam as portas 4173 e 4174. Opcionalmente, `NEXO_TEST_BROWSER` pode apontar para um Chrome/Chromium instalado; sem essa variável, é usado o Chromium instalado pelo Playwright.

A suíte principal executa 60 verificações; a complementar executa 15. Google login/logout e ativação de notificações são simulados. O redirecionamento de rotas protegidas para Login e o layout de Login são verificados no bundle de produção. Não há envio real de notificações, autenticação Google interativa, teste em aparelho físico ou certificação de leitor de tela.


## Nubank e Atalhos

A atualização acrescenta 19 cenários em `bank-tests.mjs` (94 verificações ao todo). `npm test` executa as três suítes; `npm run test:bank` executa somente a nova. Mantenha o servidor de QA na porta 4174. O parâmetro opcional `NEXO_TEST_URL` muda essa origem. O teste de migração usa uma página HTML vazia e um IndexedDB v3 fictício. Os testes de Atalhos simulam a URL entregue pelo iPhone, sem executar Apple Pay. Os resultados e capturas ficam em `qa/artifacts`.
