# Gmail e iCloud no NEXO

Esta versão transforma e-mails selecionados em lembretes da conta NEXO conectada, sincronizados entre celular e computador. A origem aparece como **Gmail** ou **Mail · iCloud**, inclusive nas notificações. Não envia e-mails nem sincroniza eventos de calendário nos dois sentidos.

## Ativar uma vez

1. Execute `publicar.ps1` para publicar backend, frontend e regras. Anote a URL `https://nexo-backend.…workers.dev` mostrada na publicação.
2. Execute `configurar-email.ps1`. Ele cria uma chave de criptografia no Cloudflare e preserva uma chave já existente. Se necessário, entre com `npx wrangler login`. Isso habilita o iCloud.
3. Para Gmail, abra o [Google Cloud Console](https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=nexo-15b2c), selecione o projeto e ative a Gmail API. Configure a tela de consentimento e um cliente OAuth **Aplicativo da Web**. Cadastre como URI de redirecionamento `https://nexo-backend.SEUSUBDOMINIO.workers.dev/mail/gmail/callback`, substituindo pela URL real do passo 1. Adicione o escopo `https://www.googleapis.com/auth/gmail.readonly`. Em modo de teste, adicione seu Gmail aos usuários de teste.
4. Baixe o JSON desse cliente para fora do repositório. Execute `./configurar-email.ps1 -GoogleClientJson 'C:\Users\ce020\Downloads\client_secret_SEUARQUIVO.json'`, usando o caminho real. O script envia os segredos ao Cloudflare sem exibi-los. Não envie esse arquivo no chat ou ao GitHub.
5. Abra **Configurações → E-mails que viram lembretes** no NEXO. Autorize Gmail na tela do Google. Para iCloud, gere uma senha específica para NEXO em [Conta Apple](https://account.apple.com/) e preencha o endereço iCloud e essa senha no formulário. A senha principal da Apple não é utilizada.

O login Google do NEXO continua separado da autorização de leitura Gmail. Os segredos existentes do Firebase no Worker continuam necessários. Não troque `MAIL_ENCRYPTION_KEY` enquanto houver contas conectadas: isso impediria a leitura das credenciais atuais.

No modo de testes do Google, a autorização Gmail expira após sete dias e exige reconexão. Uso público pode exigir verificação do escopo restrito; consulte as [regras OAuth do Google](https://developers.google.com/identity/protocols/oauth2). A configuração iCloud segue as [instruções da Apple](https://support.apple.com/en-ie/102525).

## O que entra

- Confirmação de consulta, reunião, entrevista ou agendamento, com uma data numérica e horário claros. Exemplo: “Consulta confirmada para 28/09/2026 às 14h”.
- Vencimento ou prazo com data clara. Exemplo: “Vencimento 30/09/2026”. Sem horário, o aviso será às 09h no fuso escolhido ao conectar.
- “Hoje” e “amanhã” são relativos à data de recebimento do e-mail.

O filtro é conservador e baseado em regras. Promoções, newsletters, pagamentos já confirmados, cancelamentos, reagendamentos ambíguos, mensagens sem data e múltiplos horários ficam de fora. Não interpreta todas as formas de linguagem natural. Cancelamentos por e-mail não apagam lembretes existentes; revise-os no NEXO. HTML sem alternativa de texto não é analisado, mas o assunto pode conter a informação necessária. Anexos não são importados; mensagens maiores que 400 KB são ignoradas.

A leitura inicial considera a caixa de entrada dos últimos sete dias. Gmail continua procurando nessa janela; iCloud acompanha novos identificadores da caixa. O agendador roda a cada cinco minutos, com até duas conexões e três mensagens por conexão em cada execução; filas maiores demoram mais. “Verificar agora” processa um lote. Mensagens não são marcadas como lidas.

Mensagens repetidas não recriam lembretes; itens concluídos, excluídos ou editados pelo usuário são preservados. Credenciais ficam criptografadas no servidor e não podem ser lidas pelo cliente Firestore. São salvos o assunto, remetente, data do lembrete e identificadores de controle; o corpo completo não é persistido. Desconectar remove a credencial do NEXO e mantém os lembretes. A autorização também pode ser revogada na conta Google ou Apple.

## Verificação local

`npm run test:mail` verifica filtros, MIME, criptografia e protocolo IMAP. Com o emulador Firestore em localhost:8080, `node --import ./frontend/qa/typescript-loader.mjs test/mail-emulator.ts` verifica importação, duplicatas, alterações manuais, exclusão, isolamento de contas e proteção OAuth. Os testes não acessam caixas reais. A conexão real depende da configuração acima e da autorização do titular.

## Efeitos financeiros

Receitas confirmadas exibem uma pequena explosão de partículas; gastos exibem moedas caindo. Lançamentos cuja descrição/categoria contém “reserva”, “poupança”, “guardei”, “guardar” ou “investimento” recebem a comemoração de reserva. Isso é apenas feedback visual: não cria uma modalidade de investimento nem muda o cálculo do saldo. O efeito dura cerca de dois segundos, não bloqueia cliques e respeita movimento reduzido.

Validação desta alteração: build do frontend e checagem TypeScript passaram; 60 cenários de interface, 13 cenários de regras Firestore e testes de importação/efeitos passaram. O empacotamento Wrangler em modo dry-run ficou bloqueado pela restrição de leitura do esbuild às pastas superiores neste sandbox; precisa ser confirmado na publicação local.
