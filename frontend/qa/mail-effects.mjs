import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,executablePath:process.env.NEXO_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:4174/');await page.locator('.today-agenda').waitFor();
  await page.getByRole('button',{name:'Ganho',exact:true}).click();
  await page.getByLabel('Valor do registro rápido').fill('200');await page.getByRole('button',{name:'Salário',exact:true}).click();
  await page.locator('.money-effect.income').waitFor();await page.screenshot({path:'qa/artifacts/money-income-mobile.png'});
  await page.waitForTimeout(2200);assert.equal(await page.locator('.money-effect').count(),0);
  await page.goto('http://127.0.0.1:4174/financas');
  await page.getByLabel('Descrição',{exact:true}).fill('Guardei para minha reserva');await page.getByLabel('Valor',{exact:true}).fill('50');
  await page.getByRole('button',{name:'Registrar movimentação'}).click();await page.locator('.money-effect.saving').waitFor();
  await page.waitForTimeout(2200);
  await page.getByLabel('Descrição',{exact:true}).fill('Almoço');await page.getByLabel('Valor',{exact:true}).fill('20');
  await page.getByRole('button',{name:'Registrar movimentação'}).click();await page.locator('.money-effect.expense').waitFor();
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.money-effect-particles').isVisible(),false);
  await page.evaluate(async()=>{const {db}=await import('/src/db.ts');for(const provider of ['gmail','icloud'])await db.reminders.add({title:`Consulta ${provider}`,notes:'Teste',startsAt:new Date(Date.now()+3600000).toISOString(),createdAt:new Date().toISOString(),completed:false,sourceType:'email',emailProvider:provider});});
  await page.goto('http://127.0.0.1:4174/lembretes');await page.locator('.email-source.gmail').waitFor();await page.locator('.email-source.icloud').waitFor();
  await page.goto('http://127.0.0.1:4174/configuracoes');await page.getByText('E-mails que viram lembretes',{exact:true}).waitFor();
  for(const width of [320,390,1440]) {await page.setViewportSize({width,height:1000});await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`qa/artifacts/mail-settings-${width}.png`,fullPage:true});}
  const connectionPage=await browser.newPage();
  await connectionPage.route('**/src/services/mailService.ts', route=>route.fulfill({contentType:'application/javascript',body:`
    let connected=false;
    export async function finishGmailConnection(){throw Error("A autorização do Gmail foi cancelada.");}
    export async function connectGmail(){window.__gmailClicked=true;}
    export async function mailRequest(path,body){
      if(path==='status')return {capabilities:{gmail:true,icloud:true},connections:connected?[{provider:'icloud',address:'qa@icloud.com',timeZone:'America/Sao_Paulo',lastCheckedAt:null}]:[]};
      if(path==='icloud/connect'){if(body.password!=='aaaa-bbbb-cccc-dddd')throw Error('Senha inválida');connected=true;return {};}
      if(path==='sync')return {added:1,ignored:2};
      if(path==='disconnect'){connected=false;return {};}
    }`}));
  await connectionPage.goto('http://127.0.0.1:4174/configuracoes');
  await connectionPage.getByRole('button',{name:'Conectar Gmail',exact:true}).click();
  assert.equal(await connectionPage.evaluate(()=>window.__gmailClicked),true);
  await connectionPage.getByRole('button',{name:'Conectar iCloud',exact:true}).click();
  await connectionPage.getByLabel('E-mail iCloud').fill('qa@icloud.com');
  await connectionPage.getByLabel('Senha específica de app').fill('aaaa-bbbb-cccc-dddd');
  await connectionPage.getByRole('button',{name:'Conectar conta',exact:true}).click();
  await connectionPage.getByText('qa@icloud.com',{exact:true}).waitFor();
  assert.equal(await connectionPage.locator('input[type=password]').count(),0);
  await connectionPage.getByRole('button',{name:'Verificar agora'}).click();
  await connectionPage.getByText('1 lembrete(s) criado(s) ou atualizado(s).',{exact:false}).waitFor();
  connectionPage.on('dialog',dialog=>dialog.accept());
  await connectionPage.getByRole('button',{name:'Desconectar',exact:true}).click();
  await connectionPage.getByRole('button',{name:'Conectar iCloud',exact:true}).waitFor();
  await connectionPage.close();
  assert.deepEqual(errors,[]);console.log('PASS saved income/expense/reserve effects, cleanup, reduced motion, email badges and responsive settings');
} finally {await browser.close();}
