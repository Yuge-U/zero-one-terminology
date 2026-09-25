const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const msal = `window.msal={PublicClientApplication:class{constructor(){} async initialize(){} async handleRedirectPromise(){return null}getAllAccounts(){return localStorage.testAccount?[{homeAccountId:localStorage.testAccount,username:localStorage.testAccount+'@example.test'}]:[]}getActiveAccount(){return this.getAllAccounts()[0]}setActiveAccount(){}async acquireTokenSilent(){return {accessToken:'test-token'}}}};`;
test('browser: legacy data, favorites, quiz history, reload and account-isolated cloud sync', async () => {
  const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    const target = file === root + path.sep ? path.join(root, 'index.html') : file;
    try {
      res.setHeader('Content-Type', target.endsWith('.wav') ? 'audio/wav' : target.endsWith('.svg') ? 'image/svg+xml' : target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : target.endsWith('.json') ? 'application/json' : 'text/html');
      res.end(fs.readFileSync(target));
    } catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const url = `http://127.0.0.1:${server.address().port}/`;
  const errors = [], cloud = new Map();
  async function context(account, guest = false) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(({ account, guest }) => { if (account) localStorage.testAccount = account; if (guest && !localStorage.getItem('seeded')) { localStorage.zot_favs = '["GBT-0001"]'; localStorage.seeded = '1'; } }, { account, guest });
    await ctx.route('**/vendor/msal-browser.min.js', route => route.fulfill({ contentType: 'text/javascript', body: msal }));
    await ctx.route('https://graph.microsoft.com/**', async route => {
      const request = route.request(), p = new URL(request.url()).pathname, method = request.method();
      const db = cloud.get(account) || { state: null, version: 0, history: new Map(), updates: new Map() }; cloud.set(account, db);
      const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (p.endsWith('/special/approot')) return send({ id: 'root' });
      if (p.endsWith('/root/children')) return send({ value: [{ id: 'term', name: 'TERMINOLOGY', folder: {} }] });
      if (p.endsWith('/term/children')) return send({ value: [{ id: 'history', name: 'history', folder: {} }, { id: 'updates', name: 'state-updates', folder: {} }] });
      if (p.endsWith('/history/children')) return send({ value: [...db.history.keys()].map(id => ({ id, name: id + '.data', file: {} })) });
      if (p.endsWith('/term:/user-data.data') || p.endsWith('/items/state')) return db.state ? send({ id: 'state', eTag: String(db.version) }) : send({}, 404);
      if (p.endsWith('/state/content')) return send(db.state);
      if (p.endsWith('/createUploadSession')) return send({ error: { code: 'invalidRequest' } }, 400);
      if (p.endsWith('/updates/children')) return send({ value: [...db.updates.keys()].map(id => ({ id, name: id + '.data', file: {}, eTag: '1' })) });
      if (p.endsWith('/term:/user-data.data:/content') && method === 'PUT') { db.state = request.postDataJSON(); db.version++; return send({ id: 'state' }); }
      const update = p.match(/updates:\/(.+)\.data:\/content$/);
      if (update && method === 'PUT') { db.updates.set(update[1], request.postDataJSON()); return send({ id: update[1] }); }
      const put = p.match(/history:\/(.+)\.data:\/content$/);
      if (put && method === 'PUT') { db.history.set(put[1], request.postDataJSON()); return send({ id: put[1] }); }
      const get = p.match(/items\/(.+)\/content$/);
      if (get && db.updates.has(get[1])) return send(db.updates.get(get[1]));
      if (get && db.history.has(get[1])) return send(db.history.get(get[1]));
      errors.push(`Unhandled ${method} ${p}`); return send({}, 500);
    });
    const page = await ctx.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(url); await page.waitForFunction(() => Learning.ready && DATA.length > 0);
    await page.getByRole('button',{name:'確認しました',exact:true}).click();
    return { ctx, page };
  }
  try {
    const guest = await context(null, true), page = guest.page;
    assert.equal(await page.evaluate(() => Learning.favorites().has('GBT-0001')), true);
    assert.equal(await page.getByRole('button', {name:'すべて',exact:true}).count(),0);
    const total = await page.locator('.term').count();
    await page.locator('[data-filter="favorites"]').click();
    assert.equal(await page.locator('.term').count(),1);
    await page.locator('[data-filter="sentences"]').click();
    assert.equal(await page.evaluate(() => DATA.filter(match).every(t => favs().has(t.ID) && coachEnglish(t)[0])),true);
    await page.locator('[data-filter="favorites"]').click();
    assert.equal(await page.evaluate(() => DATA.filter(match).every(t => coachEnglish(t)[0])),true);
    await page.locator('[data-filter="sentences"]').click();
    assert.equal(await page.locator('.term').count(),total);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    fs.mkdirSync(path.join(root,'..','outputs'),{recursive:true});
    await page.screenshot({path:path.join(root,'..','outputs','terminology-ui-mobile.png')});
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:path.join(root,'..','outputs','terminology-ui-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});

    await page.locator('.term').first().click();
    await page.evaluate(()=>{const NativeAudio=window.Audio;window.Audio=function(src){const player=new NativeAudio(src);window.testPronunciation=player;return player}});
    await page.getByRole('button',{name:'▶ 英語の発音を聞く',exact:true}).click();
    await page.waitForFunction(()=>window.testPronunciation && window.testPronunciation.currentTime>0);
    assert.equal(await page.evaluate(()=>window.testPronunciation.error),null);
    await page.locator('.fav').click();
    assert.equal(await page.evaluate(() => Learning.favorites().has('GBT-0001')), false);
    await page.reload(); await page.waitForFunction(() => Learning.ready && DATA.length > 0);
    assert.equal(await page.evaluate(() => Learning.favorites().has('GBT-0001')), false);
    await page.getByRole('button', { name: 'QUIZ', exact: true }).click();
    await page.getByRole('button', { name: 'START QUIZ', exact: true }).click();
    for (let i = 0; i < 5; i++) {
      const index=await page.evaluate(correct=>Q.options.findIndex(t=>(t.ID===Q.items[Q.i].ID)===correct),i%2===0);
      await page.locator('.choice').nth(index).click();
      assert.equal(await page.locator('.answer-review-item').count(),5);
      assert.equal(await page.locator('.answer-review-item.is-correct').count(),1);
      const definitions=await page.evaluate(()=>Q.options.map(t=>t['定義']));
      assert.deepEqual(await page.locator('.answer-review-item p').allTextContents(),definitions);
      if(i===0) await page.screenshot({path:path.join(root,'..','outputs','quiz-answer-review.png'),fullPage:true});
      await page.locator('.qnext').click();
    }
    await page.getByRole('button', { name: '辞書へ戻る', exact: true }).click();
    await page.getByRole('button', { name: 'MY LEARNING · 同期' }).click();
    assert.match(await page.locator('#learningStats').textContent(), /クイズ 1回/);
    assert.equal(await page.locator('#learningHistory p').count(), 1);
    fs.mkdirSync(path.join(root, '..', 'outputs'), { recursive: true });
    await page.screenshot({ path: path.join(root, '..', 'outputs', 'terminology-learning-mobile.png') });
    await page.reload(); await page.waitForFunction(() => Learning.ready && DATA.length > 0);
    await page.getByRole('button', { name: 'MY LEARNING · 同期' }).click();
    assert.match(await page.locator('#learningStats').textContent(), /クイズ 1回/);
    const a = await context('account-a', true), b = await context('account-a'), c = await context('account-b');
    await a.page.evaluate(() => Learning.sync()); await b.page.evaluate(() => Learning.sync());
    assert.equal(await a.page.evaluate(() => Learning.favorites().size), 0, 'guest favorites must not auto-upload');
    await a.page.evaluate(() => Learning.toggleFavorite('GBT-0002'));
    await a.page.evaluate(() => Learning.sync()); await b.page.evaluate(() => Learning.sync());
    assert.equal(await b.page.evaluate(() => Learning.favorites().has('GBT-0002')), true);
    await b.page.evaluate(() => Learning.toggleFavorite('GBT-0002'));
    await b.page.evaluate(() => Learning.sync()); await a.page.evaluate(() => Learning.sync());
    assert.equal(await a.page.evaluate(() => Learning.favorites().has('GBT-0002')), false);
    await c.page.evaluate(() => Learning.sync()); assert.equal(await c.page.evaluate(() => Learning.favorites().size), 0);
    // Real bundled MSAL must initialize even when no Microsoft account is signed in.
    const real = await browser.newContext(); const realPage = await real.newPage();
    realPage.on('pageerror', error => errors.push(error.message));
    await realPage.goto(url); await realPage.waitForFunction(() => Learning.ready && DATA.length > 0);
    assert.equal(await realPage.locator('#welcomeDialog').isVisible(),true);
    await realPage.setViewportSize({width:390,height:844});
    await realPage.screenshot({path:path.join(root,'..','outputs','terminology-welcome-mobile.png')});
    await realPage.getByRole('button',{name:'確認しました',exact:true}).click();
    await realPage.reload(); await realPage.waitForFunction(() => Learning.ready && DATA.length > 0);
    assert.equal(await realPage.locator('#welcomeDialog').isVisible(),false);
    await realPage.getByRole('button', { name: 'MY LEARNING · 同期' }).click();
    assert.equal(await realPage.locator('#learningConnect').isEnabled(), true);
    assert.match(await realPage.locator('#learningStatus').textContent(), /このブラウザに保存中/);
    await realPage.screenshot({ path: path.join(root, '..', 'outputs', 'terminology-learning-desktop.png') });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
