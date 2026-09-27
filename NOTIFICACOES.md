# Home e notificações

A home agora mostra uma semana navegável e os lembretes do dia, com conclusão direta. Os atalhos, finanças e histórico continuam disponíveis. O estado da sincronização fica exclusivamente em Configurações.

## Avisos no aplicativo

O NEXO aberto verifica lembretes a cada 15 segundos e ao retornar à aba. Exibe até três avisos e não exige permissão de push. A deduplicação fica na base local da conta. Na abertura, são considerados lembretes vencidos nas últimas 24 horas; os mais antigos continuam na lista de pendências. Reabrir ou alterar a data de um lembrete pode gerar novo aviso do servidor.

## Avisos com o aplicativo fechado

O Worker anterior só possuía endpoints de envio manual; não havia um cron no repositório. Agora `scheduled` verifica os espelhos de lembretes uma vez por minuto. Tokens ficam em `users/{uid}/devices/{deviceId}`, e cada aparelho recebe separadamente. A revisão do documento protege o processamento concorrente; entregas confirmadas são persistidas por aparelho/data. Falhas transitórias são tentadas novamente, tokens que o FCM declara expirados são removidos. O transporte FCM não oferece garantia de entrega exatamente uma vez; a mesma tag reduz avisos repetidos se o processo for interrompido após enviar.

A varredura é paginada e adequada ao volume pessoal atual. Ela lê os espelhos de lembretes a cada minuto; contas com muito histórico precisarão de uma fila/indexação específica para limitar leituras e tempo de execução.

`publicar.ps1` também instala as dependências e publica o Worker, captura seu endereço `workers.dev` e define `VITE_NEXO_API_URL` para o build. Continua publicando as regras do Firestore antes do Hosting. Execute em uma sessão conectada às contas Cloudflare, Firebase e GitHub do projeto. O Worker utiliza os secrets existentes `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY`; a conta de serviço precisa de permissão para FCM e acesso de leitura/gravação no Firestore (por exemplo, papel Cloud Datastore User). Credenciais não são incluídas no frontend.

Depois de publicar, reabra o NEXO e use **Configurações → Ativar notificações** em cada aparelho (ou **Registrar este aparelho novamente**). **Testar notificação** faz um envio real pelo servidor, autenticado pela conta Google e restrito ao aparelho cadastrado nessa conta. Os endpoints antigos que aceitavam um token arbitrário foram removidos.

No iPhone, Web Push requer iOS 16.4 ou posterior e o NEXO instalado na Tela de Início; abra pelo ícone e conceda a permissão após tocar no botão. Bloqueios do sistema e modos de foco podem impedir a apresentação. A interface somente registra sucesso depois que o token foi salvo no servidor.

## Validação

- Build do frontend e TypeScript do Worker.
- `npm run test:scheduler`: datas, envio para dois aparelhos, deduplicação, falha parcial e autenticação com FCM simulado.
- Com o emulador Firestore ativo: `node --import ./frontend/qa/typescript-loader.mjs test/scheduler-emulator.ts` valida a consulta REST, precondições, armazenamento das entregas e deduplicação usando Firestore real emulado.
- Testes de regras verificam acesso privado aos tokens; testes de navegador cobrem home responsiva, conclusão e avisos locais, sem depender de push real.
- A suíte Vitest/Workers não inicializou neste sandbox por restrição de acesso do esbuild às pastas superiores. Os cenários do agendador foram executados pelo runner Node e pelo emulador.
- Recebimento real em iPhone/Windows e permissões da conta de serviço só podem ser confirmados após a publicação e um teste no aparelho.

O usuário definiu Gmail e iCloud Mail como fontes de lembretes. A conexão de e-mails está implementada e precisa da configuração descrita em [EMAILS.md](EMAILS.md). A semana da home mostra os lembretes do NEXO, incluindo os importados. Sincronização bidirecional com calendários não faz parte desta integração de e-mail.
