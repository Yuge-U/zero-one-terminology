const test = require('node:test');
const assert = require('node:assert/strict');
const { Auth, errorKind } = require('../zero-one-connection.js');
const account = { homeAccountId: 'synthetic-owner', username: 'coach@example.invalid' };
function fixture({ accounts = [account], active = account, response = null, tokens = [] } = {}) {
  const calls = [], values = new Map(); let client;
  class Client {
    constructor(config) { this.config = config; client = this; }
    async initialize() {}
    async handleRedirectPromise() { return response; }
    getAllAccounts() { return accounts; }
    getActiveAccount() { return active; }
    setActiveAccount() {}
    async acquireTokenSilent(options) { calls.push(['token', options]); const value = tokens.shift(); if (value instanceof Error) throw value; return value || { accessToken: 'synthetic-token', account: options.account }; }
    async loginRedirect(options) { calls.push(['login', options]); }
    async logoutRedirect(options) { calls.push(['logout', options]); }
  }
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const auth = new Auth({ msal: { PublicClientApplication: Client }, storage, clientId: 'synthetic-client', redirectUri: 'https://example.invalid/app/', accountKey: 'app-account' });
  return { auth, calls, values, client: () => client };
}
const failure = code => Object.assign(new Error('synthetic failure'), { errorCode: code });
test('restore and verify the cached account without interactive login', async () => {
  const f = fixture(); assert.equal((await f.auth.init()).homeAccountId, account.homeAccountId);
  assert.equal(f.auth.status().state, 'connected'); assert.equal(f.calls.length, 1);
  assert.equal(f.client().config.cache.cacheLocation, 'localStorage');
});
test('one connection action and no forced account chooser after site data deletion', async () => {
  const f = fixture({ accounts: [], active: null }); await f.auth.init(); assert.equal(f.auth.status().state, 'disconnected');
  await Promise.all([f.auth.signIn(), f.auth.signIn(), f.auth.signIn()]);
  assert.equal(f.calls.filter(([type]) => type === 'login').length, 1);
  assert.equal(f.calls[0][1].prompt, undefined);
});
test('account selection is requested only for an explicit switch', async () => {
  const f = fixture(); await f.auth.init(); await f.auth.signIn({ chooseAccount: true });
  assert.equal(f.calls.at(-1)[1].prompt, 'select_account');
});
test('expired credentials remain account scoped, visibly require reconnection and do not redirect during saves', async () => {
  const f = fixture({ tokens: [failure('login_required')] }); await f.auth.init();
  assert.equal(f.auth.status().state, 'auth'); assert.equal(f.auth.account, account);
  await assert.rejects(f.auth.token()); assert.equal(f.calls.filter(([type]) => type === 'login').length, 0);
  await f.auth.signIn(); const request = f.calls.at(-1)[1]; assert.equal(request.loginHint, account.username); assert.equal(request.prompt, undefined);
});
test('network and consent errors are distinct from signed-out state', async () => {
  for (const [code, state] of [['no_network_connectivity', 'error'], ['consent_required', 'permission']]) {
    const f = fixture({ tokens: [failure(code)] }); await f.auth.init(); assert.equal(f.auth.status().state, state);
    assert.equal(f.auth.needsInteraction, false); assert.equal(f.auth.account, account);
  }
});
test('retry a transient failure without requesting login', async () => {
  const f = fixture({ tokens: [failure('no_network_connectivity')] }); await f.auth.init(); await f.auth.check();
  assert.equal(f.auth.status().state, 'connected'); assert.equal(f.calls.filter(([type]) => type === 'login').length, 0);
});
test('parallel requests share refresh; a requested forced refresh is serialized', async () => {
  const f = fixture(); await f.auth.init(); f.calls.length = 0;
  await Promise.all([f.auth.token(), f.auth.token(), f.auth.token({ forceRefresh: true })]);
  assert.deepEqual(f.calls.map(([, options]) => options.forceRefresh), [false, true]);
});
test('another app active account cannot replace this app previous account', async () => {
  const other = { homeAccountId: 'synthetic-other', username: 'other@example.invalid' };
  const f = fixture({ accounts: [account, other], active: other }); f.values.set('app-account', account.homeAccountId);
  await f.auth.init(); assert.equal(f.auth.account, account);
  const missing = fixture({ accounts: [other], active: other }); missing.values.set('app-account', account.homeAccountId);
  await missing.auth.init(); assert.equal(missing.auth.status().state, 'disconnected');
});
test('explicit login result may select a different account', async () => {
  const other = { homeAccountId: 'synthetic-other' }; const f = fixture({ response: { account: other }, accounts: [account, other] });
  f.values.set('app-account', account.homeAccountId); await f.auth.init(); assert.equal(f.auth.account, other);
});
test('token issued for a different account is rejected', async () => {
  const f = fixture({ tokens: [{ accessToken: 'synthetic-token', account: { homeAccountId: 'synthetic-other' } }] });
  await f.auth.init(); assert.equal(f.auth.status().state, 'auth');
});
test('a successful connection check does not prevent a later explicit account switch', async () => {
  const f = fixture(); await f.auth.init(); await f.auth.signIn(); await f.auth.signIn({ chooseAccount: true });
  assert.equal(f.calls.at(-1)[0], 'login'); assert.equal(f.calls.at(-1)[1].prompt, 'select_account');
});
test('permission error precedes MSAL interaction-required name', () => {
  assert.equal(errorKind({ errorCode: 'consent_required', name: 'InteractionRequiredAuthError' }), 'permission');
});
test('consent can be completed by an explicit connection action', async () => {
  const f = fixture({ tokens: [failure('consent_required')] }); await f.auth.init(); await f.auth.signIn();
  assert.equal(f.calls.at(-1)[0], 'login'); assert.equal(f.calls.at(-1)[1].prompt, undefined);
});
