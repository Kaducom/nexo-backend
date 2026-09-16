# NEXO — Nubank e iPhone

As duas entradas ficam em **Finanças → Importar do Nubank e receber do Apple Pay**.
Esta atualização acrescenta importação OFX/CSV, recebimento por URL do Atalhos, fila de classificação, regras por estabelecimento, revisão de possíveis duplicatas e histórico com reabertura.

## 1. Importar o extrato

1. Exporte seu extrato pelo app Nubank e salve o OFX ou CSV no app Arquivos. A exportação da conta e a fatura do cartão são documentos diferentes.
2. No NEXO, abra a nova área em Finanças. Para CSV, escolha **Conta** ou **Cartão antes de selecionar o arquivo**.
3. Selecione o arquivo e confira as descrições, datas, valores e a coluna Entrada/Saída. O OFX identifica conta/cartão e moeda pelo próprio documento.
4. Toque em **Importar movimentações**. A prévia não altera as finanças. Um arquivo com linhas inválidas fica bloqueado por inteiro, sem importação parcial.
5. Classifique as pendentes. Use **Lembrar para próximas compras neste estabelecimento** para salvar uma regra. Regras novas valem para recebimentos futuros; pendentes anteriores continuam na fila.

Formatos aceitos: OFX bancário/cartão, em XML ou SGML, com uma conta por arquivo, CURDEF=BRL e FITID por movimentação; CSV da conta (`Data,Valor,Identificador,Descrição`) ou do cartão (`date,title,amount`), com vírgula ou ponto e vírgula como separador. CSV da conta usa saída negativa; CSV do cartão usa compra positiva e crédito/estorno negativo. O modo escolhido é necessário para interpretar o sinal corretamente.

Limites: 5 MB e 5.000 movimentações por arquivo; somente reais; PDF não é lido. UTF-8 e Windows-1252 são suportados. Os exemplos em `examples/nubank` usam dados fictícios.

## 2. Configurar o Atalho do Apple Pay

Esta implementação usa **Abrir URLs**: o Atalho abre o NEXO no Safari, que recebe e grava a compra. Não há endpoint de recebimento em segundo plano, leitura das notificações do Nubank ou conexão Open Finance.

1. Publique/atualize o NEXO no endereço HTTPS que você já utiliza, mantendo a configuração Firebase e o domínio autorizado. Abra esse endereço **no Safari do iPhone** e faça login. Um endereço localhost do computador não é acessível pelo iPhone.
2. Em Finanças → Importar, toque em **Ativar recebimento do Atalho**, depois **Copiar endereço**. Configure e use no mesmo navegador: os dados da PWA instalada na Tela de Início podem estar separados dos dados do Safari. Esta versão não sincroniza as finanças entre eles.
3. Abra **Atalhos → Automação → + → Transação**, escolha o cartão Nubank da Carteira e, se disponível, **Executar imediatamente**. Crie uma automação vazia.
4. Adicione **Gerar UUID**. Esse UUID identifica esta execução. Reenviar a mesma URL mantém o mesmo ID; outra execução gera um ID novo.
5. Adicione **Data Atual → Formatar Data**, formato **ISO 8601**. É a data de captura; o NEXO organiza as movimentações pelo dia informado, sem preservar o horário do acionador.
6. Adicione **Dicionário** e preencha:

| Chave | Tipo | Valor |
|---|---|---|
| `amount` | Número | Entrada do Atalho → propriedade Valor/Amount |
| `merchant` | Texto | Entrada do Atalho → propriedade Estabelecimento/Merchant |
| `date` | Texto | Variável da data formatada em ISO 8601 |
| `id` | Texto | Variável do UUID gerado |
| `currency` | Texto | `BRL`, apenas quando a compra estiver em reais |

7. Use **Obter Texto da Entrada** sobre o Dicionário para obter JSON. Depois aplique **Codificar URL** nesse texto.
8. Adicione **Texto**, cole o endereço do NEXO e insira imediatamente após `payload=` a variável do texto JSON codificado, sem espaços extras. Codifique somente o JSON, não o endereço completo.
9. Adicione **Abrir URLs** e use o resultado da ação Texto.
10. Faça uma compra de teste em reais e confira a chegada em Pendentes. Classifique e salve uma regra; na próxima compra equivalente, confira o lançamento automático e o saldo em Finanças.

Exemplo do dicionário antes da codificação (valores fictícios; substituir pelas variáveis):

```json
{
  "amount": 85.90,
  "merchant": "Posto Exemplo",
  "date": "2026-09-12T12:30:00-03:00",
  "id": "77777777-7777-4777-8777-777777777777",
  "currency": "BRL"
}
```

O endereço tem o formato `https://SEU-DOMINIO/financas/importar#key=CHAVE&payload=JSON_CODIFICADO`. A chave e os dados ficam no fragmento, não na query enviada ao servidor HTTP. Ao concluir, o NEXO remove o fragmento da URL atual. Não compartilhe seu endereço com a chave. **Desativar** revoga a chave; ativar novamente gera outra.

Os nomes das ações e propriedades podem variar com o idioma/versão do iOS. Se o cartão não fornecer valor ou estabelecimento, complete usando **Pedir Entrada**. Campo ausente, valor zero/negativo ou moeda diferente de BRL são recusados. Não escreva BRL para representar uma compra em outra moeda: não há conversão cambial.

A automação depende do acionador da Carteira, do desbloqueio e da abertura do navegador. Não cobre Pix, boletos ou compras fora desse acionador. Um acionamento não comprova que o pagamento foi liquidado; confira o extrato para cancelamentos e ajustes. Se a chave não for reconhecida, confira domínio, navegador e conta Google usados na configuração.

Não há arquivo `.shortcut` assinado nesta entrega. A automação precisa ser montada no app Atalhos seguindo os passos acima; não foi instalada remotamente no iPhone.

## Classificação e duplicidades

- Pendentes não entram no saldo. **Lançar** cria a movimentação no financeiro existente.
- Regras comparam o nome completo, normalizando acentos, espaços e maiúsculas; são separadas por conta/cartão e entrada/saída. Nomes parecidos não são tratados como iguais.
- Transferências, faturas, ajustes e entradas exigem revisão, mesmo que haja uma regra. Se as compras do cartão já foram lançadas, normalmente descarte o pagamento da fatura para não contabilizar duas vezes. Transferências próprias também podem ser descartadas.
- O mesmo FITID/identificador/UUID não é importado novamente. Dados diferentes com o mesmo identificador interrompem todo o lote para revisão.
- CSV sem identificador usa data, valor, descrição, origem e ordem entre linhas iguais. Prefira arquivos originais completos: recortes/editados de compras idênticas podem ser indistinguíveis. Este recurso foi configurado para uma conta Nubank e seu cartão neste navegador.
- Mesmo valor e data de uma movimentação existente geram aviso de possível duplicata, inclusive entre Apple Pay, OFX, CSV e lançamentos manuais. A comparação é conservadora: compras distintas também podem gerar aviso. Confirme **É outra movimentação** para lançar ou descarte a repetição.
- **Histórico → Reabrir** retira do financeiro o lançamento associado e o devolve à fila. Reabrir um item descartado recupera-o. Excluir uma regra não altera lançamentos antigos. Uma movimentação excluída diretamente em Finanças conserva seu histórico de recebimento; reabra esse recebimento para classificá-la novamente.

## Instalação e validação técnica

Use o código deste pacote no projeto existente. Preserve seu `.env.local` original; ele não acompanha o ZIP. Na raiz: `npm ci` e `npm run build`. Publique o conteúdo de `dist` no seu hosting habitual, com fallback SPA para `/financas/importar`. Nenhum backend ou regra Firebase foi alterado e nenhum serviço foi publicado nesta sessão.

O banco Dexie recebe a versão 4, adicionando `bankImports` e `bankRules`. As quatro tabelas existentes são preservadas. Os lançamentos importados recebem um vínculo opcional `importEntryId`; a criação do lançamento e a atualização da fila ocorrem na mesma transação IndexedDB. Dados financeiros continuam locais, seguindo a arquitetura atual; limpar os dados do navegador remove também fila, regras e chave. Trocar de navegador/dispositivo não transfere dados automaticamente.

Validação executada: TypeScript e build de produção; 19 cenários novos de parsing, migração v3→v4, persistência, atomicidade, concorrência, classificação, duplicatas, chaves, retorno do login e interface em 320–1440 px; suíte de regressão existente de 75 verificações. Capturas desktop/mobile revisadas. Os testes usam Dexie real e autenticação/notificações simuladas em um servidor isolado; o bundle de produção mantém Firebase real.

Não houve teste em iPhone físico, compra real, arquivo pessoal Nubank, login Google real, deploy ou sincronização externa. A confirmação dos campos fornecidos pelo seu cartão/versão do iOS ocorre no teste do passo 10. Permanecem os avisos existentes do build sobre bundle grande e opção obsoleta de empacotamento do service worker.

Referências: [acionador de transação da Apple](https://support.apple.com/pt-br/guide/shortcuts/apd65c67538a/ios) e [exportação de extrato do Nubank](https://comunidade.nubank.com.br/novidades/post/exporte-extratos-diretamente-de-sua-conta-nubank-pelo-app-rbRYnw8qndyPd2S).
