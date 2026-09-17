# Dados por conta Google

Memórias, lembretes, movimentações, compromissos financeiros, importações bancárias e regras de categoria são sincronizados em tempo real pelo UID do Firebase Authentication. É necessário entrar com a mesma conta Google em cada dispositivo. O acesso offline usa uma cópia IndexedDB separada por UID; a fila de alterações também persiste após fechar o navegador.

## Publicação

Execute `publicar.ps1` na raiz do repositório. Ele compila o frontend, envia os commits ao GitHub, publica `frontend/firestore.rules` no projeto `nexo-15b2c` e só então publica o Hosting. O banco Firestore `(default)` precisa existir nesse projeto. O comando interrompe a publicação se as regras falharem. A URL continua sendo `https://nexo-15b2c.web.app`.

Na primeira abertura em cada aparelho, os dados anteriores em `NexoDB` só são vinculados após confirmação da conta. A base original permanece como cópia de segurança local; a migração pode ser repetida sem duplicar registros. Se a pessoa optar por continuar sem vincular, pode importar depois em Configurações. Uma base antiga já vinculada não pode ser reclamada por outro UID.

## Comportamento

- Registros ficam em `users/{uid}/data/{table}_{id}`. As regras permitem acesso apenas ao dono, validam identidade e revisão e proíbem exclusões físicas dos marcadores de remoção.
- Toda gravação local e sua intenção de envio são atômicas. Downloads não geram novos uploads. IDs numéricos aleatórios mantêm compatibilidade com as telas; importações e regras usam IDs determinísticos para evitar duplicatas entre aparelhos.
- Uma transação Firestore compara a revisão antes de aplicar a mudança. Edições concorrentes do mesmo registro ficam pendentes para escolha em Configurações. Operações relacionadas a vários registros são atômicas localmente, mas chegam à nuvem registro a registro; os dispositivos podem ver um estado intermediário durante o envio.
- Os lembretes mantêm o espelho `users/{uid}/reminders` consumido pelo agendador existente. A sincronização de dados não amplia o envio de notificações para vários tokens de dispositivos.
- Sem internet, as alterações ficam neste aparelho. Aguarde “Dados sincronizados com sua conta” antes de limpar o armazenamento. A chave do Atalho do iPhone e permissões de notificações continuam específicas do navegador.
- A primeira conexão baixa a coleção da conta, incluindo marcadores de exclusão. Para volumes muito grandes, será necessário adicionar paginação/compactação com uma estratégia de recuperação dos dispositivos offline.

## Validação

Além dos 94 cenários existentes de interface/importação, há 10 cenários de sincronização com IndexedDB simulado, 11 cenários de regras/transporte no emulador oficial do Firestore e 4 verificações de navegador com IndexedDB real (migração, revisão de conflito, separação de contas e erros).

Na pasta `frontend/qa`, use Node 24 e `npm ci`. Execute `npm run test:sync`. Para regras, inicie `firebase emulators:start --only firestore --project demo-nexo-sync` na pasta frontend (Java 21), defina `NEXO_SYNC_FIREBASE_TEST=1` e execute `npm run test:rules` em qa. Os testes usam exclusivamente o projeto de demonstração.

Para a interface de sincronização, inicie `server.mjs` com `NEXO_QA_SYNC=1` e execute `node sync-ui.mjs`. Esse servidor usa a porta 4175 e substitui apenas autenticação/transporte; o gate, as telas e o IndexedDB são reais. Os testes de transporte usam o código de produção contra o emulador. Um teste final entre iPhone físico e PC depende da publicação e do login do usuário nos dois aparelhos.
