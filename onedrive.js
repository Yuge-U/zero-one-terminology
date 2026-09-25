(function (root) {
  'use strict';
  const DEFAULT_CLIENT_ID = 'b75b499d-2b47-42ed-9e10-41cd76dbc6c5';
  const SCOPES = ['Files.ReadWrite.AppFolder'];
  const GRAPH = 'https://graph.microsoft.com/v1.0';
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
          console.error('OneDrive request failed', { operation, status: response.status, code: detail.error?.code, message: detail.error?.message });
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
      return this.folderIds = { terminology: terminology.id, history: history.id };
    }
    // Read metadata on both sides of content download: never pair stale bytes with a newer ETag.
    async readState() {
      const folders = await this.folders();
      const path = `/me/drive/items/${encodeURIComponent(folders.terminology)}:/user-data.data`;
      for (let attempt = 0; attempt < 3; attempt++) {
        let before;
        try { before = await this.request(path); } catch (error) { if (error.status === 404) return null; throw error; }
        const data = JSON.parse(await this.request(`/me/drive/items/${encodeURIComponent(before.id)}/content`, {}, 'text'));
        const after = await this.request(`/me/drive/items/${encodeURIComponent(before.id)}`);
        if (before.eTag && before.eTag === after.eTag) return { data, id: before.id, eTag: before.eTag };
      }
      throw new GraphError(412, '他の端末で更新中です。少し待って同期してください。');
    }
    // Upload sessions document If-Match and fail-on-create, unlike the simple PUT API.
    async writeState(data, previous) {
      const folders = await this.folders();
      const path = previous ? `/me/drive/items/${encodeURIComponent(previous.id)}/createUploadSession` : `/me/drive/items/${encodeURIComponent(folders.terminology)}:/user-data.data:/createUploadSession`;
      const session = await this.request(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(previous ? { 'If-Match': previous.eTag } : {}) },
        body: JSON.stringify({ deferCommit: true, item: { name: 'user-data.data', '@microsoft.graph.conflictBehavior': previous ? 'replace' : 'fail' } })
      });
      const body = new TextEncoder().encode(JSON.stringify(data));
      if (body.length > 10 * 1024 * 1024) throw new Error('学習データが大きすぎます。バックアップしてください。');
      if (new URL(session.uploadUrl).protocol !== 'https:') throw new Error('不正なアップロード先です。');
      // Preauthenticated URL: do not forward the Graph bearer token.
      const response = await this.fetcher(session.uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes 0-${body.length - 1}/${body.length}` }, body });
      if (!response.ok) throw new GraphError(response.status, '学習データを保存できませんでした。再試行してください。');
      if (response.status !== 202) throw new Error('条件付き保存の応答を確認できませんでした。同期を停止しました。');
      // Compare again at COMMIT, not merely when opening the session: another
      // device may update the file while these bytes are being transferred.
      return this.request(`/me/drive/items/${encodeURIComponent(folders.terminology)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', ...(previous ? { 'If-Match': previous.eTag } : {}) },
        body: JSON.stringify({ name: 'user-data.data', '@microsoft.graph.conflictBehavior': previous ? 'replace' : 'fail', '@microsoft.graph.sourceUrl': session.uploadUrl })
      });
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
