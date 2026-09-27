import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,executablePath:process.env.NEXO_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:4174/');await page.locator('.today-agenda').waitFor();
 assert.equal(await page.locator('.content > .account-sync-indicator').count(),0);
 await page.evaluate(async()=>{const {db}=await import('/src/db.ts');const now=new Date();await db.reminders.add({title:'Planejar a semana',notes:'Revisar prioridades',startsAt:new Date(now.getTime()+3600000).toISOString(),createdAt:now.toISOString(),completed:false});await db.reminders.add({title:'Lembrete vencido agora',notes:'Aviso local',startsAt:new Date(now.getTime()-1000).toISOString(),createdAt:now.toISOString(),completed:false});});
 await page.locator('.reminder-notice').getByText('Lembrete vencido agora',{exact:true}).waitFor();
 assert.equal(await page.locator('.reminder-notice').count(),1);console.log('PASS Local notification works without push permission, including StrictMode');
 await page.getByRole('button',{name:'Dispensar aviso Lembrete vencido agora'}).click();await page.reload();await page.locator('.today-agenda').waitFor();await page.waitForTimeout(200);
 assert.equal(await page.locator('.reminder-notice').count(),0);console.log('PASS Dismissed notice does not reappear on reload');
 await page.getByRole('button',{name:'Concluir Planejar a semana',exact:true}).click();await page.getByRole('button',{name:'Reabrir Planejar a semana',exact:true}).waitFor();console.log('PASS Agenda quick completion updates reminder');
 await page.getByRole('button',{name:'Próxima semana'}).click();await page.getByText('Nenhum compromisso neste dia',{exact:true}).waitFor();await page.getByRole('button',{name:'Hoje',exact:true}).click();console.log('PASS Week navigation and return to today');
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(250); const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)console.log(width,await page.evaluate(()=>[...document.querySelectorAll("body *")].map(e=>({c:e.className,w:e.getBoundingClientRect().width,r:e.getBoundingClientRect().right})).filter(e=>e.r>innerWidth+1)));assert.equal(overflow,false);await page.screenshot({path:`qa/artifacts/home-new-${width}.png`,fullPage:true});}
 console.log('PASS Responsive home 320/390/768/1440');assert.deepEqual(errors,[]);
}finally{await browser.close();}
