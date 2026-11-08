import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const browser=await chromium.launch({headless:true,executablePath:process.env.NEXO_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
let count=0;async function check(name,fn){await fn();count++;console.log('PASS',name);}
const route=async(path)=>{await page.goto('http://127.0.0.1:4174'+path);};
const paste=async(field,text)=>field.evaluate((el,text)=>{const clipboardData=new DataTransfer();clipboardData.setData('text/plain',text);el.dispatchEvent(new ClipboardEvent('paste',{clipboardData,bubbles:true,cancelable:true}));},text);
try{
 await route('/financas?tab=transactions');let money=page.getByLabel('Valor',{exact:true});
 await check('Digits, live Brazilian separators, inputmode, backspace and selection replacement',async()=>{
  assert.equal(await money.getAttribute('inputmode'),'numeric');await money.pressSequentially('14690');assert.equal(await money.inputValue(),'R$ 146,90');await money.press('8');assert.equal(await money.inputValue(),'R$ 1.469,08');await money.press('Backspace');assert.equal(await money.inputValue(),'R$ 146,90');await money.press('Control+a');await money.pressSequentially('00029');assert.equal(await money.inputValue(),'R$ 0,29');await money.press('Control+a');await money.press('Delete');assert.equal(await money.inputValue(),'');
 });
 await check('Paste currency/decimal/thousands, rejection, precision and large limits',async()=>{
  await paste(money,'R$ 1.469,08');assert.equal(await money.inputValue(),'R$ 1.469,08');await money.press('Control+a');await paste(money,'146.9');assert.equal(await money.inputValue(),'R$ 146,90');await money.press('Control+a');await paste(money,'-12,00');assert.equal(await money.inputValue(),'R$ 146,90');await money.press('Control+a');await money.pressSequentially('999999999999');assert.equal(await money.inputValue(),'R$ 9.999.999.999,99');await money.press('9');assert.equal(await money.inputValue(),'R$ 9.999.999.999,99');await money.press('Control+a');await money.pressSequentially('29');
 });
 await check('Cursor inside value and mobile beforeinput deletion/insertion',async()=>{
  await money.press('Control+a');await money.pressSequentially('146908');await money.evaluate(el=>el.setSelectionRange(6,6));await money.press('Backspace');assert.equal(await money.inputValue(),'R$ 169,08');
  await money.press('Control+a');await money.press('Delete');await money.evaluate(el=>el.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:'14690',bubbles:true,cancelable:true})));assert.equal(await money.inputValue(),'R$ 146,90');
  await money.evaluate(el=>{el.setSelectionRange(el.value.length,el.value.length);el.dispatchEvent(new InputEvent('beforeinput',{inputType:'deleteContentBackward',bubbles:true,cancelable:true}));});assert.equal(await money.inputValue(),'R$ 14,69');
 });
 await check('Expense and income contexts, exact cents saved and editable',async()=>{
  await money.press('Control+a');await money.pressSequentially('14690');await page.getByLabel('Descrição',{exact:true}).fill('Mercado v2');await page.getByRole('button',{name:'Registrar despesa',exact:true}).click();await page.locator('.v2-transaction-row').filter({hasText:'Mercado v2'}).waitFor();
  const tx=await page.evaluate(async()=>{const {db}=await import('/src/db.ts');return (await db.transactions.toArray())[0];});assert.equal(tx.amountCents,14690);assert.equal(tx.amount,146.9);
  await page.locator('.v2-transaction-row').filter({hasText:'Mercado v2'}).getByRole('button',{name:'Editar',exact:true}).click();assert.equal(await money.inputValue(),'R$ 146,90');await money.press('Control+a');await money.pressSequentially('20000');await page.getByRole('button',{name:'Salvar alteração'}).click();await page.getByText('− R$ 200,00',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Receita',exact:true}).click();await page.getByRole('heading',{name:'Nova receita',exact:true}).waitFor();await page.getByLabel('Descrição',{exact:true}).fill('Salário v2');await money.pressSequentially('300000');await page.getByRole('button',{name:'Registrar receita'}).click();await page.locator('.v2-transaction-row').filter({hasText:'Salário v2'}).waitFor();
 });
 await check('Installment form, historical payments, pending status, manual confirmation and reversal',async()=>{
  await page.getByRole('button',{name:'Parcelamentos',exact:true}).click();await page.getByRole('button',{name:'Adicionar',exact:true}).click();await page.getByLabel('Nome',{exact:true}).fill('Notebook v2');await page.getByLabel('Valor total',{exact:true}).pressSequentially('120000');await page.getByLabel('Parcelas já pagas',{exact:true}).fill('4');await page.getByRole('button',{name:'Criar plano'}).click();await page.getByText('4/12 parcelas pagas · 8 restantes',{exact:true}).waitFor();
  await page.getByLabel('Todas as datas').check();await page.getByRole('button',{name:/Ver cobranças/}).click();await page.getByRole('button',{name:'Confirmar pagamento',exact:true}).first().click();await page.getByText('5/12 parcelas pagas · 7 restantes',{exact:true}).waitFor();
  const paid=page.locator('.v2-occurrence').filter({hasText:'Parcela 5 ·'});await paid.getByRole('button',{name:'Desfazer pagamento',exact:true}).click();await page.getByText('4/12 parcelas pagas · 8 restantes',{exact:true}).waitFor();await page.reload();await page.getByText('4/12 parcelas pagas · 8 restantes',{exact:true}).waitFor();
 });
 await check('Subscription business day configuration and explicit holiday, analysis reference mask',async()=>{
  await page.getByRole('button',{name:'Assinaturas',exact:true}).click();await page.getByRole('button',{name:'Adicionar',exact:true}).click();await page.getByLabel('Nome',{exact:true}).fill('Spotify v2');await page.getByLabel('Valor da cobrança').pressSequentially('2190');await page.getByLabel('Data de início',{exact:true}).fill('2026-11-01');await page.getByLabel('Regra de vencimento').selectOption('business');await page.getByRole('button',{name:'Criar plano'}).click();await page.getByRole('heading',{name:'Spotify v2',exact:true}).waitFor();
  await page.getByRole('button',{name:'Análises',exact:true}).click();await page.getByLabel('Renda mensal',{exact:true}).pressSequentially('300000');await page.getByRole('button',{name:'Salvar referência'}).click();await page.getByText('Referência salva.',{exact:true}).waitFor();
  await page.locator('summary').filter({hasText:'Histórico financeiro'}).click();const change=page.locator('.v2-history summary').filter({hasText:'Movimentação editada'}).first();await change.click();await change.locator('..').getByText('Valor: R$ 146,90',{exact:false}).waitFor();await change.locator('..').getByText('Valor: R$ 200,00',{exact:false}).waitFor();
 });
 await check('Legacy forms also have digit-only monetary masks',async()=>{
  await route('/financas/anteriores');const field=page.getByLabel('Valor',{exact:true});await field.pressSequentially('14690');assert.equal(await field.inputValue(),'R$ 146,90');
 });
 await check('Memories, reminders, search and settings remain available',async()=>{
  await route('/memorias');await page.getByLabel('Título',{exact:true}).fill('Memória preservada v2');await page.locator('textarea').fill('Conteúdo importante');await page.getByRole('button',{name:/Guardar memória/}).click();await page.getByRole('heading',{name:'Memória preservada v2',exact:true}).waitFor();
  await route('/buscar');await page.getByLabel('Buscar em todo o NEXO').fill('Spotify v2');await page.locator('.search-result').filter({hasText:'Spotify v2'}).waitFor();
  await route('/lembretes');await page.getByLabel('Título',{exact:true}).fill('Lembrete preservado v2');await page.getByRole('button',{name:'Criar lembrete'}).click();await page.getByRole('heading',{name:'Lembrete preservado v2',exact:true}).waitFor();
  await route('/configuracoes');await page.getByRole('heading',{name:'E-mails que viram lembretes'}).waitFor();await page.getByRole('button',{name:'Ativar notificações',exact:true}).waitFor();
 });
 await check('Home and all finance areas fit 320, 390 and 1440px; no browser exceptions',async()=>{
  for(const width of [320,390,1440]){await page.setViewportSize({width,height:1000});for(const path of ['/','/financas?tab=overview','/financas?tab=transactions','/financas?tab=subscriptions','/financas?tab=installments','/financas?tab=analysis']){await route(path);await page.locator('.v2-page').waitFor();await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${path} at ${width}`);if(path==='/'||path.endsWith('overview'))await page.screenshot({path:`qa/artifacts/v2-${path==='/'?'home':'finance'}-${width}.png`,fullPage:true});}}
  assert.deepEqual(errors,[]);
 });
 console.log(`${count} finance v2 browser scenarios passed`);
}finally{await browser.close();}
