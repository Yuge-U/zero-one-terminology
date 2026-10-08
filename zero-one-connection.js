(function (root) {
  'use strict';
  // Shared by CANVAS, TERMINOLOGY, ROSTER and PRACTICE. Tokens stay in MSAL.
  function errorKind(error) {
    const code = error?.errorCode || error?.code;
    if (['consent_required', 'access_denied', 'PERMISSION'].includes(code)) return 'permission';
    if (['interaction_required', 'login_required', 'no_account_error', 'AUTH'].includes(code) || error?.name === 'InteractionRequiredAuthError') return 'auth';
    return 'error';
  }
  const labels = { checking: '確認中…', connecting: '接続中…', connected: '接続済み', disconnected: '未接続', auth: '再接続が必要', error: '接続を確認できません', permission: 'アクセス許可が必要' };
  class Auth {
    constructor({ msal = root.msal, storage = root.localStorage, clientId, authority = 'https://login.microsoftonline.com/consumers', redirectUri, accountKey }) {
      Object.assign(this, { msal, storage, clientId, authority, redirectUri, accountKey });
      this.account = null; this.client = null; this.state = 'checking'; this.detail = ''; this.needsInteraction = false;
      this.listeners = new Set(); this.initFlight = null; this.tokenFlight = null; this.signInFlight = null;
    }
    status() { return { state: this.state, username: this.account?.username || '', account: Boolean(this.account), detail: this.detail }; }
    subscribe(listener) { this.listeners.add(listener); listener(this.status()); return () => this.listeners.delete(listener); }
    emit() { for (const listener of this.listeners) listener(this.status()); }
    setState(state, detail = '') { this.state = state; this.detail = detail; this.emit(); }
    fail(error) {
      const kind = errorKind(error);
      if (kind === 'auth') this.needsInteraction = true;
      this.setState(kind, kind === 'auth' ? '「再接続」を押してください。端末のデータは保持されています。' : kind === 'permission' ? 'Microsoftのアクセス許可を確認してください。' : '通信状態を確認して「再試行」を押してください。');
    }
    requireInteraction() { const error = Object.assign(new Error('OneDriveの再接続が必要です。'), { code: 'AUTH' }); this.fail(error); return error; }
    async init() {
      if (this.initFlight) return this.initFlight;
      this.initFlight = this.initialize();
      try { return await this.initFlight; } catch (error) { this.initFlight = null; this.fail(error); throw error; }
    }
    async initialize() {
      if (!this.msal?.PublicClientApplication) throw new Error('Microsoft接続機能を読み込めません。ページを再読み込みしてください。');
      this.client = new this.msal.PublicClientApplication({
        auth: { clientId: this.clientId, authority: this.authority, redirectUri: this.redirectUri, postLogoutRedirectUri: this.redirectUri },
        cache: { cacheLocation: 'localStorage' }, system: { allowPlatformBroker: false }
      });
      await this.client.initialize();
      const result = await this.client.handleRedirectPromise();
      const accounts = this.client.getAllAccounts(), previous = this.storage?.getItem(this.accountKey);
      this.account = result?.account || (previous ? accounts.find(account => account.homeAccountId === previous) : this.client.getActiveAccount() || (accounts.length === 1 ? accounts[0] : null)) || null;
      if (!this.account) { this.setState('disconnected', 'この端末のみで利用中'); return null; }
      this.client.setActiveAccount(this.account);
      if (this.account.homeAccountId) this.storage?.setItem(this.accountKey, this.account.homeAccountId);
      // A cached account alone does not prove that the connection is usable.
      try { await this.token(); } catch { /* Local records remain usable while reconnecting. */ }
      return this.account;
    }
    async token({ forceRefresh = false } = {}) {
      if (!this.client || !this.account || this.needsInteraction) throw this.requireInteraction();
      if (this.tokenFlight) {
        const flight = this.tokenFlight, token = await flight.promise;
        return forceRefresh && !flight.forceRefresh ? this.token({ forceRefresh: true }) : token;
      }
      const client = this.client, account = this.account;
      const flight = { forceRefresh, promise: null }; this.tokenFlight = flight;
      flight.promise = (async () => {
        try {
          const result = await client.acquireTokenSilent({ account, scopes: ['Files.ReadWrite.AppFolder'], forceRefresh });
          if (client !== this.client || account !== this.account || this.needsInteraction || !result.accessToken || (result.account && result.account.homeAccountId !== account.homeAccountId)) throw this.requireInteraction();
          this.needsInteraction = false; this.setState('connected', ''); return result.accessToken;
        } catch (error) { this.fail(error); throw error; }
      })();
      try { return await flight.promise; } finally { if (this.tokenFlight === flight) this.tokenFlight = null; }
    }
    async check() { await this.init(); if (this.account) return this.token(); return null; }
    async signIn({ chooseAccount = false } = {}) {
      if (this.signInFlight) return this.signInFlight;
      this.signInFlight = this.performSignIn(chooseAccount);
      try { return await this.signInFlight; } catch (error) { this.fail(error); throw error; }
      finally { if (this.state !== 'connecting') this.signInFlight = null; }
    }
    async performSignIn(chooseAccount) {
      await this.init();
      if (this.account && !this.needsInteraction && !chooseAccount && this.state !== 'permission') {
        try { await this.token(); return this.account; } catch (error) { if (!['auth', 'permission'].includes(errorKind(error))) throw error; }
      }
      this.setState('connecting');
      await this.client.loginRedirect({ scopes: ['Files.ReadWrite.AppFolder'], redirectUri: this.redirectUri,
        ...(chooseAccount ? { prompt: 'select_account' } : this.account?.username ? { loginHint: this.account.username } : {}) });
    }
    async signOut() {
      await this.init(); if (!this.account) return;
      const account = this.account;
      this.setState('connecting');
      try { await this.client.logoutRedirect({ account, postLogoutRedirectUri: this.redirectUri }); }
      catch (error) { this.fail(error); throw error; }
    }
  }

  function create({ mount, connect, retry = connect, switchAccount, signOut, settings, settingsLabel = 'バックアップ・保存設定', sync, syncId, extra, presentation = 'compact' }) {
    const host = typeof mount === 'string' ? document.querySelector(mount) : mount;
    if (!host) throw new Error('OneDrive接続表示の場所がありません。');
    host.classList.add('zero-one-connection');
    host.classList.toggle('zoc-compact', presentation === 'compact');
    host.innerHTML = '<div class="zoc-copy"><div class="zoc-line"><strong>OneDrive</strong><span class="zoc-status" role="status" aria-live="polite"></span></div><span class="zoc-account"></span></div><button class="zoc-primary" type="button" aria-haspopup="dialog"></button>';
    const status = host.querySelector('.zoc-status'), account = host.querySelector('.zoc-account'), button = host.querySelector('button');
    if (presentation === 'compact') button.innerHTML = '<span class="zoc-cloud" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18H6a4 4 0 0 1-.5-8 6.5 6.5 0 0 1 12.4-1.4A4.8 4.8 0 0 1 19 18h-2"/><path d="M9 18h6"/></svg><span class="zoc-indicator"></span></span><span class="zoc-caption" aria-hidden="true"></span>';
    const dialog = document.createElement('dialog'); dialog.className = 'zoc-dialog'; dialog.setAttribute('aria-labelledby', 'zoc-dialog-title');
    dialog.innerHTML = '<div class="zoc-dialog-head"><h2 id="zoc-dialog-title">OneDrive・バックアップ</h2><button type="button" class="zoc-close" aria-label="閉じる">×</button></div><p class="zoc-dialog-status" role="status" aria-live="polite"></p><p class="zoc-dialog-account"></p><p class="zoc-dialog-detail"></p><p class="zoc-dialog-sync" role="status" aria-live="polite"></p><div class="zoc-extra"></div><div class="zoc-dialog-actions"><button type="button" class="zoc-connect"></button><button type="button" class="zoc-sync">今すぐ同期</button><button type="button" class="zoc-more"></button><button type="button" class="zoc-switch">アカウントを変更</button><button type="button" class="zoc-signout">サインアウト</button></div><p class="zoc-note">OneDriveに保存したデータは、サインアウトしても削除されません。</p>';
    document.body.append(dialog);
    const syncButton = dialog.querySelector('.zoc-sync');
    if (syncId) syncButton.id = syncId;
    if (extra) { const content = typeof extra === 'string' ? document.querySelector(extra) : extra; if (content) dialog.querySelector('.zoc-extra').append(content); }
    dialog.querySelector('.zoc-more').textContent = settingsLabel;
    let current = { state: 'checking' }, actionFlight = null, actionKind = '';
    function update(next) {
      current = { ...next };
      const state = actionFlight && actionKind === 'connect' ? 'connecting' : labels[current.state] ? current.state : 'disconnected';
      const busy = Boolean(actionFlight || current.busy || state === 'checking' || state === 'connecting');
      const syncing = current.sync || {};
      const syncState = state === 'connected' ? (actionKind === 'sync' && actionFlight ? 'busy' : syncing.state || 'idle') : '';
      const captions = { busy: '同期中', pending: '同期待ち', synced: '同期済み', error: '同期未完', offline: 'オフライン', conflict: '要確認' };
      const caption = captions[syncState] || { connected: '接続済み', disconnected: '未接続', auth: '再接続', permission: '許可が必要', error: '要確認', checking: '確認中', connecting: '接続中' }[state];
      host.dataset.state = state; host.dataset.sync = syncState;
      status.textContent = labels[state] + (captions[syncState] ? ' · ' + caption : '');
      account.textContent = current.username || (state === 'disconnected' ? 'この端末のみで利用中' : current.detail || '');
      account.title = current.username || '';
      const actionLabel = state === 'auth' ? '再接続' : state === 'permission' ? 'アクセス許可を確認' : state === 'error' ? '再試行' : 'OneDriveに接続';
      if (presentation === 'compact') {
        button.querySelector('.zoc-caption').textContent = caption;
        button.querySelector('.zoc-indicator').textContent = syncState === 'busy' ? '↻' : syncState === 'pending' ? '↑' : ['error', 'offline', 'conflict'].includes(syncState) ? '!' : { connected: '✓', disconnected: '＋', auth: '!', permission: '!', error: '!', checking: '…', connecting: '…' }[state];
      } else button.textContent = caption + ' · 設定';
      button.setAttribute('aria-label', 'OneDrive：' + status.textContent + '。接続・同期・バックアップ');
      button.title = 'OneDrive · ' + status.textContent + (current.username ? '\n' + current.username : '') + '\n接続・同期・バックアップ';
      // Details stay available during background sync; mutating actions remain single-flight.
      button.disabled = current.disabled === true;
      dialog.querySelector('.zoc-dialog-status').textContent = 'OneDrive · ' + labels[state];
      dialog.querySelector('.zoc-dialog-account').textContent = current.username || 'Microsoftアカウントは未接続です。';
      dialog.querySelector('.zoc-dialog-detail').textContent = current.detail || '';
      const syncText = dialog.querySelector('.zoc-dialog-sync');
      syncText.textContent = [syncing.title, syncing.detail].filter(Boolean).join(' · '); syncText.hidden = Boolean(extra) || !syncText.textContent;
      const connectButton = dialog.querySelector('.zoc-connect');
      connectButton.textContent = state === 'checking' ? '確認中…' : state === 'connecting' ? '接続中…' : actionLabel;
      const canSync = Boolean(sync && (state === 'connected' || (state === 'error' && current.syncAvailable)));
      connectButton.hidden = state === 'connected' || canSync;
      syncButton.hidden = !canSync;
      syncButton.textContent = syncState === 'busy' ? '同期中…' : syncing.action || '今すぐ同期';
      dialog.querySelector('.zoc-switch').hidden = !switchAccount || !current.account;
      dialog.querySelector('.zoc-signout').hidden = !signOut || !current.account;
      dialog.querySelector('.zoc-more').hidden = !settings;
      for (const control of dialog.querySelectorAll('.zoc-dialog-actions button')) control.disabled = busy || current.disabled === true;
      syncButton.disabled ||= current.syncDisabled === true;
      dialog.querySelector('.zoc-more').disabled = current.disabled === true;
    }
    async function run(action, kind = 'connect') {
      if (actionFlight || !action) return;
      const previous = current;
      actionKind = kind; actionFlight = Promise.resolve().then(action); update(current);
      try { await actionFlight; }
      catch (error) {
        const failure = errorKind(error);
        if (kind === 'sync' && failure === 'error') update({ ...current, sync: { state: 'error', title: '同期未完了', detail: '通信状態を確認して同期を再試行してください。' } });
        else update({ ...previous, state: failure, detail: failure === 'auth' ? '「再接続」を押してください。' : '通信状態やMicrosoftのアクセス許可を確認してください。' });
      }
      finally { actionFlight = null; actionKind = ''; update(current); }
    }
    button.onclick = () => dialog.showModal();
    dialog.querySelector('.zoc-close').onclick = () => dialog.close();
    dialog.querySelector('.zoc-connect').onclick = () => { dialog.close(); return run(current.state === 'error' ? retry : connect); };
    syncButton.onclick = () => run(sync, 'sync');
    dialog.querySelector('.zoc-switch').onclick = () => { dialog.close(); return run(switchAccount); };
    dialog.querySelector('.zoc-signout').onclick = () => { dialog.close(); return run(signOut); };
    dialog.querySelector('.zoc-more').onclick = () => { dialog.close(); settings(); };
    dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
    update(current);
    return { update, open: () => dialog.showModal(), activate: () => button.click() };
  }
  const api = { Auth, create, errorKind, labels };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ZeroOneConnection = api;
})(globalThis);
