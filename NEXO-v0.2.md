# NEXO 0.2 — entrega e publicação

Implementação feita na cópia Git atual `work/nexo-git`, preservando as melhorias anteriores. O ZIP v0.1 não foi usado para substituir o projeto atualizado. Esta entrega está no código local; publicar é uma etapa separada.

## O que mudou

- **Início:** resumo financeiro compacto, ações de receita/despesa/lembrete/memória, próximos vencimentos, memórias recentes e agenda. Os atalhos e painéis anteriores continuam acessíveis em “Mais ferramentas e registro rápido”.
- **Finanças:** abas Visão geral, Movimentações, Contas e compromissos, Assinaturas, Parcelamentos e Análises. Filtros de mês, categoria, tipo e situação; edição de movimentações manuais; histórico.
- **Receita/despesa:** contexto verde/coral, ícones, títulos e botões próprios. Só valores efetivamente recebidos ou gastos entram como movimentações.
- **Assinaturas e contas:** cadastro, edição, pausa, reativação e cancelamento. Recorrência semanal, mensal ou anual; conta única. Vencimento mensal por dia fixo ou N-ésimo dia útil. Cobranças calculadas deterministicamente; valores e vencimentos podem ser corrigidos por ocorrência.
- **Parcelamentos:** valor total em centavos distribuído sem perda; parcelas já pagas, cartão opcional, progresso, total pago e saldo restante. Cada parcela pode ser confirmada ou revertida. Criar uma compra não lança o valor integral como despesa.
- **Análises:** receitas recebidas, despesas pagas, pendências, vencidos, assinaturas, parcelas, total comprometido, projeção e dívida finita restante. Gráfico sem fatias negativas; déficit explícito. Renda fixa de referência ou média de 3/6/12 meses completos; faixas configuráveis. Meses sem receitas registradas contam como zero e a limitação aparece na tela.
- **Dinheiro:** componente `MoneyInput` com teclado numérico, centavos automáticos, milhar brasileiro, cursor, seleção, exclusão e colagem. A máscara foi aplicada também aos formulários antigos e ao registro rápido.

## Como digitar e colar

Digite `14690` para `R$ 146,90`; mais um `8` produz `R$ 1.469,08`. Backspace remove o dígito anterior; Delete remove o seguinte. A seleção permite substituir parte ou todo o valor.

Colagens aceitas: `R$ 1.469,08`, `146,90`, `146.90`, `1,469.08`. Uma sequência sem separador segue a regra dos centavos (`14690`); com prefixo de moeda, `R$ 146` significa 146 reais. Sinais negativos, texto estranho e formatos ambíguos são rejeitados. O limite por campo é **R$ 9.999.999.999,99**, abaixo do limite de inteiros seguros. Nenhuma precisão excedente é silenciosamente arredondada na entrada.

## Pagamentos e histórico

Vencimento nunca confirma pagamento. A confirmação manual cria uma despesa e uma ocorrência paga na mesma transação IndexedDB, com registro de antes/depois. Cliques repetidos não geram outra despesa. A reversão remove somente a despesa criada por essa confirmação e mantém o histórico.

Se já existe uma despesa do mesmo valor, a interface exige escolher entre vincular esse lançamento e declarar que é outro pagamento. A vinculação não cria uma segunda despesa; sua reversão retira o vínculo e preserva o lançamento original. Uma importação vinculada não pode ser reaberta antes da reversão do pagamento. A coincidência de valor é apenas uma sugestão, não uma conciliação bancária automática.

Parcelas informadas como já pagas no cadastro são históricas e não criam despesas retroativas. Seus valores entram no progresso da compra, não nas despesas de caixa do mês.

Compromissos antigos mantêm seus vínculos e lembretes. Confirmações feitas a partir desta versão podem ser desfeitas, da mais recente para a mais antiga. Não se inventa a data ou o estado anterior de pagamentos feitos antes de existir histórico.

## Banco, sincronização e backend

Migração **Dexie v5 → v6**, estritamente aditiva:

| Tabela nova | Conteúdo |
| --- | --- |
| `financePlans` | Planos, recorrência, parcelas, feriados e situação |
| `financeOccurrences` | Exceções de vencimento/valor e confirmações individuais |
| `financeHistory` | Eventos com data e valores anteriores/posteriores |
| `financeSettings` | Renda de referência e faixas, registro único por conta |

As tabelas antigas continuam existindo. `amount` antigo continua em **reais**, sem reinterpretação ou regravação em massa. Novos lançamentos mantêm `amount` por compatibilidade e acrescentam `amountCents`; planos e cálculos novos usam inteiros. O componente guarda centavos separados do texto exibido. Se um cliente antigo alterar apenas `amount`, a leitura detecta a divergência em vez de usar um campo de centavos obsoleto.

As quatro tabelas participam da fila de sincronização já existente e das regras privadas por UID. Migração de propriedade remapeia referências de planos, ocorrências e transações. As regras novas precisam ser publicadas antes do frontend. O Worker Cloudflare não precisa de endpoints, segredos ou serviços novos para esta versão; estes dados usam Firestore diretamente, como os módulos anteriores.

As operações financeiras são atômicas localmente. A sincronização existente envia registros separadamente e trata conflitos por registro; alterações concorrentes offline podem exigir resolução em Configurações. Esta entrega não implementa uma transação distribuída entre aparelhos. Atualize celular e computador para a mesma versão antes de usar os novos módulos.

## Limites explícitos

- Dias úteis são segunda a sexta, menos os feriados que você informar. Não há calendário bancário nacional automático. O dia útil escolhido aceita 1 a 15 para existir mesmo em meses curtos usuais; uma lista de feriados que elimine esse dia será recusada.
- Dia fixo 29/30/31 usa o último dia em meses curtos e volta ao dia original no mês seguinte. Não altera a regra dos compromissos legados.
- Até 600 parcelas; recorrências são calculadas sob demanda, com limite de 6.000 ocorrências. “Todas as datas” de planos recorrentes exibe até o fim do ano seguinte ao ano atual ou selecionado. Parcelamentos exibem todas as parcelas.
- Nome, categoria, cartão, valor da assinatura e regra de vencimento podem ser editados. Tipo, início, periodicidade e quantidade de parcelas ficam fixos após o cadastro para preservar a identidade das cobranças. Para mudar essa estrutura, cancele e crie outro plano. O valor total contratado de parcelamentos fica preservado; correções são feitas individualmente e aparecem no histórico.
- Planos pausados/cancelados ficam fora das projeções enquanto assim estiverem; histórico e pagamentos continuam guardados. A projeção do mês não inclui atrasos de outros meses, mostrados separadamente. Assinaturas sem fim não contam como dívida infinita.
- Os novos planos exibem vencimentos no NEXO; não criam automaticamente lembretes push. Os lembretes existentes e os compromissos legados mantêm seu funcionamento.
- A verificação automatizada usa bancos e contas de teste. Não foi realizado login real do usuário, deploy ou teste físico de iPhone nesta entrega.

## Arquivos principais

| Grupo | Arquivos |
| --- | --- |
| Nova interface | `frontend/src/pages/HomeV2Page.tsx`, `FinanceV2Page.tsx`, `styles/finance-v2.css` |
| Entrada monetária | `frontend/src/components/MoneyInput.tsx`, `frontend/src/finance/money.ts` |
| Regras e formulários | `frontend/src/finance/{model,schedule,service,analytics,useFinance}.ts`, `TransactionEditor.tsx`, `PlanEditor.tsx`, `PlanCard.tsx`, `FinanceOverview.tsx`, `HistoryEntries.tsx` |
| Compatibilidade | `frontend/src/{App,db,types}.ts*`, páginas anteriores de início/finanças, pesquisa, configurações, `services/financialCommitments.ts`, `services/bankImports.ts` |
| Sincronização | `frontend/src/sync/{model,migration}.ts`, `AccountSyncSettings.tsx`, `frontend/firestore.rules` |
| Testes | `frontend/qa/finance-v2-tests.ts`, `finance-v2-ui.mjs`, suítes de sincronização, regras, importações e efeitos |

## Validação

- 17 grupos de testes financeiros: máscara/colagem, datas, dias úteis, parcelas e centavos, estados, duplicidade, reversão, importação vinculada, renda, déficit, migrações, reabertura e sincronização.
- 10 cenários da sincronização existente e 17 cenários de regras/transportes no emulador Firestore.
- 9 cenários de navegador da versão 0.2, 19 de importações bancárias, 5 de agenda/avisos e a suíte de efeitos/conexões simuladas.
- Build de produção React/TypeScript/Vite e revisão visual em 320/390/1440 pixels. Capturas de QA contêm dados fictícios identificados como testes, não dados do usuário.

Para repetir na raiz do repositório:

```powershell
npm --prefix frontend run build
npm --prefix frontend/qa run test:finance
npm --prefix frontend/qa run test:sync
```

Para testes de interface, execute `node frontend/qa/server.mjs` em um terminal. Em outro, configure `$env:NEXO_TEST_BROWSER='C:/Program Files/Google/Chrome/Application/chrome.exe'` e execute `npm --prefix frontend/qa test`. Encerre o servidor com Ctrl+C ao terminar. Os testes de regras usam o emulador Firestore em `127.0.0.1:8080` e `NEXO_SYNC_FIREBASE_TEST=1`; detalhes em `frontend/qa/README.md`.

## Publicar e conferir

Feche servidores locais antes de publicar para evitar o bloqueio de arquivos do npm no Windows. No PowerShell:

```powershell
& "C:\Users\ce020\Documents\Codex\2026-09-12\files-mentioned-by-the-user-nexo\work\nexo-git\publicar.ps1"
```

O script publica o Worker, gera o frontend, envia commits ao GitHub e publica regras Firestore e Hosting. Autorize a conta correta no navegador quando solicitado. Aguarde **Publicacao concluida**. No PC, atualize com Ctrl+F5. No iPhone, feche e reabra o NEXO. Em Configurações, confirme **NEXO 0.2**.

Confira um lançamento de `14690`, uma assinatura no sexto dia útil e uma compra de 1.200 reais em 12 parcelas com 4 já pagas. O cadastro da compra deve mostrar 800 reais restantes sem lançar 1.200 reais como despesa. Confirme e desfaça uma parcela, conferindo a movimentação e o histórico. Crie apenas registros que queira manter ou remova/cancele os testes depois. Para sincronização, confira também o status em Configurações e o segundo aparelho; não limpe o armazenamento do navegador para atualizar.
