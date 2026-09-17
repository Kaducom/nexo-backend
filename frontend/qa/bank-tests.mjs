import assert from 'node:assert/strict';
import fs from 'node:fs';
const { chromium } = await import(process.env.NEXO_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.NEXO_TEST_BROWSER ? { executablePath: process.env.NEXO_TEST_BROWSER } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: 'America/Sao_Paulo', reducedMotion: 'reduce' });
const page = await context.newPage();
const base = process.env.NEXO_TEST_URL || 'http://127.0.0.1:4174';
fs.mkdirSync(new URL('./artifacts/', import.meta.url), { recursive: true });
const results = []; const errors = [];
page.on('pageerror', err => errors.push(err.message));
const check = async (name, fn) => { try { await fn(); results.push({ name, pass: true }); console.log('PASS', name); } catch (err) { results.push({ name, pass: false, error: err.message }); console.log('FAIL', name, err.message); } };
const evaluate = fn => page.evaluate(fn);
const count = table => page.evaluate(async table => (await import('/src/db.ts')).db[table].count(), table);
async function poll(fn) { for (let i = 0; i < 50; i++) { if (await fn()) return; await page.waitForTimeout(100); } throw Error('Timed out'); }
try {
  await page.goto(base + '/qa/blank.html');
  await check('Upgrade v3 preserves all four existing stores', async () => {
    const result = await evaluate(async () => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('NexoDB', 30);
        request.onupgradeneeded = () => {
          const specs = { memories: 'title,*tags,createdAt,updatedAt', reminders: 'title,startsAt,completed,sourceType,sourceId,createdAt', transactions: 'type,category,occurredAt,createdAt,financialCommitmentId', financialCommitments: 'status,nextPaymentAt,frequency,paymentMethod,createdAt' };
          for (const [name, indices] of Object.entries(specs)) {
            const store = request.result.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
            for (const field of indices.split(',')) store.createIndex(field.replace('*', ''), field.replace('*', ''), { multiEntry: field.startsWith('*') });
            store.add({ id: 1, description: 'Existing record', title: 'Keep me', amount: 9, type: 'expense', occurredAt: '2025-01-01T15:00:00.000Z' });
          }
        };
        request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error);
      });
      const { db } = await import('/src/db.ts'); await db.open();
      return { version: db.verno, counts: await Promise.all(['memories', 'reminders', 'transactions', 'financialCommitments', 'bankImports', 'bankRules'].map(t => db[t].count())) };
    });
    assert.equal(result.version, 5); assert.deepEqual(result.counts, [1, 1, 1, 1, 0, 0]);
  });
  await check('Money/date parsing rejects malformed values and impossible dates', async () => {
    assert.deepEqual(await evaluate(async () => {
      const p = await import('/src/services/bankParser.ts');
      const badMoney = ['0', '-0', 'NaN', 'Infinity', '12abc', '1,234', '1.234', '1.2.3,00', '1000000000'];
      const badDates = ['2026-02-30', '31/04/2026', '2026-13-01', '2026-01-01Tbad', '2026-01-01T99:99:99Z'];
      return [p.parseMoney('R$ 1.234,56'), p.parseMoney('-42.90'), badMoney.every(v => { try { p.parseMoney(v); return false; } catch { return true; } }), badDates.every(v => { try { p.parseBankDate(v); return false; } catch { return true; } }), p.parseBankDate('12/09/2026') === p.parseBankDate('20260912120000[-3:BRT]')];
    }), [1234.56, -42.9, true, true, true]);
  });
  await check('OFX SGML/XML, entities, FITID, BRL and sign conventions', async () => {
    assert.deepEqual(await evaluate(async () => {
      const { parseOfx } = await import('/src/services/bankParser.ts');
      const body = '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL<BANKACCTFROM><BANKID>260<ACCTID>TEST</BANKACCTFROM><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260912120000[-3:BRT]<TRNAMT>-42.90<FITID>ABC<MEMO>Café &amp; Pão</STMTTRN><STMTTRN><DTPOSTED>20260912<TRNAMT>100.00<FITID>DEF<NAME>Entrada</STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>';
      const result = parseOfx(body);
      let foreign = false; try { parseOfx(body.replace('BRL', 'USD')); } catch { foreign = true; }
      return [result.rows.length, result.rows[0].description, result.rows[0].type, result.rows[1].type, result.errors.length, foreign, parseOfx(body.replace('<FITID>ABC', '')).errors.length];
    }), [2, 'Café & Pão', 'expense', 'income', 0, true, 1]);
  });
  await check('CSV BOM, quoted delimiters/newlines, account/card signs and duplicate occurrences', async () => {
    assert.deepEqual(await evaluate(async () => {
      const { parseCsv } = await import('/src/services/bankParser.ts');
      const account = parseCsv('\uFEFFData;Valor;Identificador;Descrição\r\n12/09/2026;-42,90;a;"Café; pão"\r\n12/09/2026;100,00;b;Entrada', 'account');
      const card = parseCsv('date,title,amount\n2026-09-12,"Loja, A\nCentro",50.20\n2026-09-12,Estorno,-5.00\n2026-09-12,Posto,20\n2026-09-12,Posto,20', 'card');
      return [account.rows[0].type, account.rows[1].type, card.rows[0].description, card.rows[1].type, card.rows[2].externalKey !== card.rows[3].externalKey, parseCsv('date,title,amount\n2026-02-30,Loja,12', 'card').errors.length];
    }), ['expense', 'income', 'Loja, A\nCentro', 'income', true, 1]);
  });
  await check('Queue, classification, exact rule, auto-post, repeat import and undo are atomic', async () => {
    const result = await evaluate(async () => {
      const { db } = await import('/src/db.ts'); const p = await import('/src/services/bankParser.ts'); const s = await import('/src/services/bankImports.ts');
      const row = p.parseCsv('date,title,amount\n2026-09-10,Posto Shell,85.00', 'card').rows[0];
      const first = await s.ingestBankRows([row]); const entry = await db.bankImports.where('status').equals('pending').first();
      await s.classifyBankEntry(entry.id, 'Combustível', true, false);
      const next = { ...row, externalKey: 'new-001', occurredAt: p.parseBankDate('2026-09-11'), amount: 95, description: 'POSTO SHELL' };
      const auto = await s.ingestBankRows([next]); const repeated = await s.ingestBankRows([next]);
      const posted = await db.bankImports.where('externalKey').equals('new-001').first(); await s.reopenBankEntry(posted.id);
      return [first, auto, repeated, await db.transactions.count(), (await db.bankImports.get(posted.id)).status, await db.bankRules.count()];
    });
    assert.deepEqual(result, [{ pending: 1, posted: 0, duplicates: 0 }, { pending: 0, posted: 1, duplicates: 0 }, { pending: 0, posted: 0, duplicates: 1 }, 2, 'pending', 1]);
  });
  await check('Potential duplicate cannot auto-post or be classified without acknowledgement', async () => {
    assert.deepEqual(await evaluate(async () => {
      const { db } = await import('/src/db.ts'); const s = await import('/src/services/bankImports.ts');
      const old = await db.bankImports.orderBy('id').first();
      const counts = await s.ingestBankRows([{ ...old, source: 'shortcut', externalKey: 'overlap-001' }]);
      const row = await db.bankImports.where('externalKey').equals('overlap-001').first(); let rejected = false;
      try { await s.classifyBankEntry(row.id, 'Combustível', false, false); } catch { rejected = true; }
      await s.ignoreBankEntry(row.id); const repeat = await s.ingestBankRows([{ ...old, source: 'shortcut', externalKey: 'overlap-001' }]);
      return [counts.pending, !!row.duplicateWarning, rejected, repeat.duplicates, await db.transactions.count()];
    }), [1, true, true, 1, 2]);
  });
  await check('Conflicting bank identifiers roll back entire batch', async () => {
    assert.deepEqual(await evaluate(async () => {
      const { db } = await import('/src/db.ts'); const s = await import('/src/services/bankImports.ts'); const row = await db.bankImports.orderBy('id').first(); const before = await db.bankImports.count(); let rejected = false;
      try { await s.ingestBankRows([{ ...row, externalKey: 'must-rollback', amount: 1 }, { ...row, amount: row.amount + 5 }]); } catch { rejected = true; }
      return [rejected, before === await db.bankImports.count(), !await db.bankImports.where('externalKey').equals('must-rollback').first()];
    }), [true, true, true]);
  });
  await check('Concurrent receipt of same ID writes only one entry', async () => {
    assert.equal(await evaluate(async () => {
      const { db } = await import('/src/db.ts'); const s = await import('/src/services/bankImports.ts'); const row = { ...(await db.bankImports.orderBy('id').first()), externalKey: 'concurrent-001', amount: 113 };
      await Promise.all([s.ingestBankRows([row]), s.ingestBankRows([row])]); return await db.bankImports.where('externalKey').equals('concurrent-001').count();
    }), 1);
  });
  await check('Transfers and credits stay pending even with saved rules', async () => {
    assert.deepEqual(await evaluate(async () => {
      const { db } = await import('/src/db.ts'); const p = await import('/src/services/bankParser.ts'); const s = await import('/src/services/bankImports.ts');
      const rows = p.parseCsv('date,title,amount\n2026-09-02,Pagamento de fatura,1200\n2026-09-03,Estorno,-70', 'card').rows;
      for (const row of rows) await db.bankRules.add({ matchKey: s.ruleKey(row), description: row.description, category: 'Outros', createdAt: new Date().toISOString() });
      const result = await s.ingestBankRows(rows); return [result.pending, result.posted];
    }), [2, 0]);
  });
  await check('Shortcut rejects invalid, foreign, missing, zero and negative amounts', async () => {
    assert.equal(await evaluate(async () => {
      const { parseShortcut } = await import('/src/services/bankParser.ts'); const good = { amount: 34.9, merchant: 'Café', date: '2026-09-12T12:00:00-03:00', id: '12345678-1234', currency: 'BRL' };
      return [{ ...good, amount: 0 }, { ...good, amount: -1 }, { ...good, currency: 'USD' }, { ...good, merchant: '' }, { ...good, id: '' }, { ...good, date: '2026-02-31' }].every(raw => { try { parseShortcut('#payload=' + encodeURIComponent(JSON.stringify(raw))); return false; } catch { return true; } });
    }), true);
  });

  await page.goto(base + '/financas/importar'); await page.locator('h1').waitFor();
  await check('File UI previews without writes then imports and deduplicates re-import', async () => {
    const before = await count('bankImports');
    const csv = { name: 'nubank-conta.csv', mimeType: 'text/csv', buffer: Buffer.from('Data,Valor,Identificador,Descrição\n12/09/2026,-24.90,ui-one,Padaria da Esquina\n12/09/2026,100.00,ui-two,Transferência recebida') };
    await page.getByLabel('Selecionar extrato', { exact: true }).setInputFiles(csv);
    await page.getByRole('button', { name: 'Importar 2 movimentações' }).waitFor(); assert.equal(await count('bankImports'), before);
    await page.getByRole('button', { name: 'Importar 2 movimentações' }).click(); await poll(async () => await count('bankImports') === before + 2);
    await page.getByLabel('Selecionar extrato', { exact: true }).setInputFiles(csv); await page.getByRole('button', { name: 'Importar 2 movimentações' }).click();
    await page.getByRole('status').filter({ hasText: '2 já recebida' }).waitFor(); assert.equal(await count('bankImports'), before + 2);
  });
  await check('UI saves category and remembers rule', async () => {
    const entry = page.locator('.bank-entry').filter({ has: page.getByRole('heading', { name: 'Padaria da Esquina', exact: true }) });
    await entry.getByRole('combobox').selectOption('Alimentação'); await entry.getByLabel('Lembrar para próximas').check(); await entry.getByRole('button', { name: 'Lançar', exact: true }).click();
    await poll(async () => (await page.evaluate(async () => (await import('/src/db.ts')).db.bankRules.toArray())).some(r => r.description === 'Padaria da Esquina'));
  });
  await check('Invalid file blocks entire import with actionable error', async () => {
    const before = await count('bankImports'); await page.getByLabel('Selecionar extrato', { exact: true }).setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('Data,Valor,Descrição\n12/09/2026,-10,Valid\n31/02/2026,-20,Bad') });
    await page.getByText('Corrija o arquivo antes de importar.', { exact: false }).waitFor(); assert(await page.getByRole('button', { name: 'Importar 1 movimentações' }).isDisabled()); assert.equal(await count('bankImports'), before); await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  });
  let prefix;
  await check('Activates shortcut and accepts valid receipt; refresh is idempotent', async () => {
    await page.getByRole('button', { name: 'Ativar recebimento do Atalho' }).click(); prefix = await page.getByLabel('Endereço para o Atalho', { exact: true }).inputValue();
    const url = prefix + encodeURIComponent(JSON.stringify({ amount: 30, merchant: 'Padaria da Esquina', date: '2026-09-13', id: 'shortcut-ui-0001', currency: 'BRL' }));
    const before = await count('bankImports'); await page.goto(url); await page.getByRole('status').filter({ hasText: 'pendente' }).waitFor(); assert.equal(await count('bankImports'), before + 1); assert(!page.url().includes('#')); await page.goto(url); await page.getByRole('status').filter({ hasText: '1 já recebida' }).waitFor(); assert.equal(await count('bankImports'), before + 1);
  });
  await check('Known card rule auto-posts Apple Pay receipt', async () => {
    const before = await count('transactions'); await page.goto(prefix + encodeURIComponent(JSON.stringify({ amount: 99, merchant: 'Posto Shell', date: '2026-09-14', id: 'shortcut-ui-0002', currency: 'BRL' })));
    await page.getByRole('status').filter({ hasText: '1 lançada(s) automaticamente' }).waitFor(); assert.equal(await count('transactions'), before + 1);
  });
  await check('Invalid key and revoked shortcut cannot write', async () => {
    const before = await count('bankImports'); const payload = encodeURIComponent(JSON.stringify({ amount: 10, merchant: 'Unknown', date: '2026-09-12', id: 'shortcut-ui-0003', currency: 'BRL' }));
    await page.goto(base + '/financas/importar#key=wrong&payload=' + payload); await page.getByRole('alert').filter({ hasText: 'não autorizado' }).waitFor(); assert.equal(await count('bankImports'), before);
    await page.getByRole('button', { name: 'Fechar recebimento' }).click(); await page.getByRole('button', { name: 'Desativar', exact: true }).click(); await page.goto(prefix + payload); await page.getByRole('alert').filter({ hasText: 'não autorizado' }).waitFor(); assert.equal(await count('bankImports'), before); await page.getByRole('button', { name: 'Fechar recebimento' }).click();
  });
  await check('Login round trip preserves incoming shortcut', async () => {
    await page.getByRole('button', { name: 'Ativar recebimento do Atalho' }).click(); prefix = await page.getByLabel('Endereço para o Atalho', { exact: true }).inputValue();
    const before = await count('bankImports'); await page.evaluate(() => sessionStorage.setItem('qa-signed-out', '1'));
    await page.goto(base + '/qa/blank.html');
    await page.goto(prefix + encodeURIComponent(JSON.stringify({ amount: 47, merchant: 'Login round trip', date: '2026-09-12', id: 'shortcut-ui-0004', currency: 'BRL' })));
    await page.getByRole('button', { name: 'Continuar com Google' }).click(); await page.getByRole('status').waitFor(); assert.equal(await count('bankImports'), before + 1); assert.equal(new URL(page.url()).pathname, '/financas/importar');
  });
  await check('Responsive import/guide layout has no page overflow at 320–1440px', async () => {
    await page.getByText('Como configurar no iPhone', { exact: true }).click();
    for (const width of [320, 390, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 1000 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow at ${width}`); }
    await page.getByText('Como configurar no iPhone', { exact: true }).click();
  });
  await page.screenshot({ path: new URL('./artifacts/bank-desktop.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: new URL('./artifacts/bank-mobile.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  await check('No uncaught application errors', async () => assert.deepEqual(errors, []));
} finally {
  fs.writeFileSync(new URL('./artifacts/bank-results.json', import.meta.url), JSON.stringify(results, null, 2));
  await browser.close();
}
if (results.some(result => !result.pass)) process.exitCode = 1;
