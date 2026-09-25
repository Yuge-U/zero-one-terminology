(function (root) {
  'use strict';
  const DEFAULT_CLIENT_ID = 'b75b499d-2b47-42ed-9e10-41cd76dbc6c5';
  const SCOPES = ['Files.ReadWrite.AppFolder'];
  const GRAPH = 'https://graph.microsoft.com/v1.0';
  const Model = typeof module !== 'undefined' && module.exports ? require('./learning-model.js') : root.LearningModel;
  class GraphError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }
  class OneDrive {
    constructor({ fetcher = (...args) => fetch(...args), msal = root.msal, storage = root.localStorage, location = root.location } = {}) {
      this.fetcher = fetcher;
      this.msal = msal;
      this.storage = storage;
      this.redirectUri = new URL('./', location.href).href;
      const override = storage.getItem('basketball-tactics-onedrive-client-id');
      this.clientId = /^[0-9a-f-]{36}$/i.test(override || '') ? override : DEFAULT_CLIENT_ID;
      this.account = null;
      this.updateCache = new Map();
    }
    async init() {
      if (!this.msal?.PublicClientApplication) throw new Error('Microsoft接続機能を読み込めませんでした。ページを再読込してください。');
      this.client = new this.msal.PublicClientApplication({
        auth: { clientId: this.clientId, authority: 'https://login.microsoftonline.com/consumers', redirectUri: this.redirectUri, postLogoutRedirectUri: this.redirectUri },
        cache: { cacheLocation: 'localStorage' }, system: { allowPlatformBroker: false }
      });
      await this.client.initialize();
      const response = await this.client.handleRedirectPromise();
      const accounts = this.client.getAllAccounts();
      this.account = response?.account || this.client.getActiveAccount() || (accounts.length === 1 ? accounts[0] : null);
      if (this.account) this.client.setActiveAccount(this.account);
      return this.account;
    }
    async signIn() {
      await this.client.loginRedirect({ scopes: SCOPES, redirectUri: this.redirectUri, prompt: 'select_account' });
    }
    async signOut() { await this.client.logoutRedirect({ account: this.account, postLogoutRedirectUri: this.redirectUri }); }
    async request(path, options = {}, type = 'json') {
      if (!this.account) throw new Error('Microsoftアカウントへ接続してください。');
      const url = path.startsWith('https:') ? path : GRAPH + path;
      if (new URL(url).origin !== 'https://graph.microsoft.com') throw new Error('不正なGraph接続先です。');
      const token = await this.client.acquireTokenSilent({ account: this.account, scopes: SCOPES });
      for (let attempt = 0; ; attempt++) {
        const response = await this.fetcher(url, { ...options, headers: { ...options.headers, Authorization: 'Bearer ' + token.accessToken } });
        if ((response.status === 429 || response.status === 503) && attempt < 2) {
          const delay = Math.min(30, Number(response.headers.get('Retry-After')) || (attempt + 1) * 2);
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
          continue;
        }
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          const operation = options.method === 'PUT' ? '保存確定' : path.includes('createUploadSession') ? '保存準備' : options.method === 'POST' ? 'フォルダ作成' : path.includes('/content') ? 'データ読込' : '保存先確認';
          if (response.status !== 404) console.error('OneDrive request failed ' + JSON.stringify({ operation, status: response.status, code: detail.error?.code, message: detail.error?.message }));
          throw new GraphError(response.status, `OneDriveの${operation}に失敗しました (${response.status}${detail.error?.code ? ' / ' + detail.error.code : ''})。端末のデータは保持されています。`);
        }
        if (response.status === 204) return null;
        return type === 'text' ? response.text() : response.json();
      }
    }
    async children(id) {
      const result = [];
      let path = `/me/drive/items/${encodeURIComponent(id)}/children?$select=id,name,folder,file,eTag`;
      while (path) { const page = await this.request(path); result.push(...page.value); path = page['@odata.nextLink']; }
      return result;
    }
    async folder(parent, name) {
      const find = async () => (await this.children(parent)).find(item => item.folder && item.name.toLowerCase() === name.toLowerCase());
      const existing = await find();
      if (existing) return existing;
      try {
        return await this.request(`/me/drive/items/${encodeURIComponent(parent)}/children`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }) });
      } catch (error) { if (error.status === 409) { const item = await find(); if (item) return item; } throw error; }
    }
    async folders() {
      if (this.folderIds) return this.folderIds;
      const app = await this.request('/me/drive/special/approot');
      const terminology = await this.folder(app.id, 'TERMINOLOGY');
      const history = await this.folder(terminology.id, 'history');
      const updates = await this.folder(terminology.id, 'state-updates');
      return this.folderIds = { terminology: terminology.id, history: history.id, updates: updates.id };
    }
    // Immutable update records are authoritative; user-data.data is a rebuildable snapshot.
    async readState() {
      const folders = await this.folders();
      const path = `/me/drive/items/${encodeURIComponent(folders.terminology)}:/user-data.data`;
      let snapshot = null;
      try {
        const item = await this.request(path);
        snapshot = Model.validate(JSON.parse(await this.request(`/me/drive/items/${encodeURIComponent(item.id)}/content`, {}, 'text')));
      } catch (error) { if (error.status !== 404) throw error; }
      const items = (await this.children(folders.updates)).filter(item => item.file && item.name.endsWith('.data'));
      let data = snapshot || Model.empty();
      for (const item of items) {
        let cached = this.updateCache.get(item.id);
        if (!cached || !item.eTag || cached.eTag !== item.eTag) {
          const update = Model.validate(JSON.parse(await this.request(`/me/drive/items/${encodeURIComponent(item.id)}/content`, {}, 'text')));
          cached = { eTag: item.eTag, data: update }; this.updateCache.set(item.id, cached);
        }
        data = Model.merge(data, cached.data);
      }
      if (!snapshot && !items.length) return null;
      return { data, snapshotMatches: !!snapshot && JSON.stringify(Model.merge(snapshot)) === JSON.stringify(data) };
    }
    // Never depend on last-writer-wins for learning state. Persist the delta to a
    // unique file FIRST, then update the optional shared snapshot using simple PUT.
    async writeState(data, previous) {
      const folders = await this.folders();
      Model.validate(data);
      const delta = Model.empty();
      for (const field of ['favorites', 'viewed']) for (const [id, record] of Object.entries(data[field])) {
        if (JSON.stringify(record) !== JSON.stringify(previous?.data?.[field]?.[id])) delta[field][id] = record;
      }
      const put = (parent, name, value) => this.request(`/me/drive/items/${encodeURIComponent(parent)}:/${name}:/content`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(value)
      });
      if (Object.keys(delta.favorites).length || Object.keys(delta.viewed).length) await put(folders.updates, crypto.randomUUID() + '.data', Model.merge(delta));
      return put(folders.terminology, 'user-data.data', data);
    }
    async histories() { return this.children((await this.folders()).history); }
    async readHistory(id) { return JSON.parse(await this.request(`/me/drive/items/${encodeURIComponent(id)}/content`, {}, 'text')); }
    async writeHistory(quiz) {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(quiz.id)) throw new Error('履歴IDが不正です。');
      const folder = (await this.folders()).history;
      return this.request(`/me/drive/items/${encodeURIComponent(folder)}:/${quiz.id}.data:/content`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(quiz) });
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { OneDrive, GraphError };
  else root.TerminologyOneDrive = OneDrive;
})(globalThis);
