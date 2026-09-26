(function (root) {
  'use strict';
  const Model = typeof module !== 'undefined' && module.exports ? require('./learning-model.js') : root.LearningModel;
  class LearningStore {
    constructor(storage, uuid = () => crypto.randomUUID(), now = () => Date.now()) {
      this.storage = storage; this.uuid = uuid; this.now = now; this.scope = 'guest';
    }
    prefix(scope = this.scope) { return 'zot_learning_v1:' + encodeURIComponent(scope) + ':'; }
    read(key, fallback) {
      const value = this.storage.getItem(key);
      if (value === null) return fallback;
      try { return JSON.parse(value); } catch { throw new Error('端末の学習データを読み込めません。バックアップを確認してください。'); }
    }
    write(key, data) {
      try { this.storage.setItem(key, JSON.stringify(data)); }
      catch { throw new Error('端末に保存できません。空き容量とブラウザ設定を確認してください。'); }
    }
    keys(prefix) { return Array.from({ length: this.storage.length }, (_, i) => this.storage.key(i)).filter(key => key?.startsWith(prefix)); }
    state(scope = this.scope) {
      const prefix = this.prefix(scope);
      return Model.merge(this.read(prefix + 'snapshot', Model.empty()), ...this.keys(prefix + 'op:').map(key => this.read(key)));
    }
    remember(state) { this.write(this.prefix() + 'snapshot', Model.merge(this.state(), state)); }
    set(field, id, value) {
      if (!['favorites', 'viewed'].includes(field) || !Model.validId(id)) throw new Error('学習項目が不正です。');
      const state = this.state();
      if (state[field][id]?.value === value) return;
      const clock = Math.max(this.now(), ...['favorites', 'viewed'].flatMap(f => Object.values(state[f]).map(r => r.clock + 1)));
      const opId = this.uuid(), op = Model.empty();
      op[field][id] = { value: !!value, clock, opId };
      // Separate operation keys prevent concurrent browser tabs from overwriting unrelated edits.
      this.write(this.prefix() + 'op:' + opId, op);
    }
    touch(field, id) {
      if (!['viewed'].includes(field) || !Model.validId(id)) throw new Error('閲覧項目が不正です。');
      const state = this.state();
      const clock = Math.max(this.now(), ...['favorites', 'viewed'].flatMap(f => Object.values(state[f]).map(r => r.clock + 1)));
      const opId = this.uuid(), op = Model.empty();
      op[field][id] = { value: true, clock, opId };
      this.write(this.prefix() + 'op:' + opId, op);
    }
    migrateLegacy() {
      const prefix = this.prefix('guest');
      if (this.storage.getItem(prefix + 'legacy-migrated')) return;
      const ids = this.read('zot_favs', []);
      if (!Array.isArray(ids)) throw new Error('以前のお気に入りデータの形式が不正です。');
      const old = this.scope; this.scope = 'guest';
      try { for (const id of ids) if (Model.validId(id)) this.set('favorites', id, true); this.storage.setItem(prefix + 'legacy-migrated', '1'); }
      finally { this.scope = old; }
    }
    quizzes(scope = this.scope) { return this.keys(this.prefix(scope) + 'quiz:').map(key => Model.validateQuiz(this.read(key))); }
    saveQuiz(quiz) {
      Model.validateQuiz(quiz);
      const key = this.prefix() + 'quiz:' + quiz.id, previous = this.read(key, null);
      if (previous && JSON.stringify(previous) !== JSON.stringify(quiz)) throw new Error('同じIDの異なるクイズ履歴があります。上書きせず保持します。');
      if (!previous) this.write(key, quiz);
    }
    importData(state, quizzes) {
      Model.validate(state); quizzes.forEach(Model.validateQuiz);
      const existing = new Map(this.quizzes().map(q => [q.id, q]));
      for (const quiz of quizzes) if (existing.has(quiz.id) && JSON.stringify(existing.get(quiz.id)) !== JSON.stringify(quiz)) throw new Error('履歴IDが競合しています。取り込みを中止しました。');
      this.remember(state);
      for (const quiz of quizzes) this.saveQuiz(quiz);
    }
    export() { return { format: 'zero-one-terminology-backup', schemaVersion: 1, exportedAt: new Date(this.now()).toISOString(), state: this.state(), quizzes: this.quizzes() }; }
  }
  async function syncLearning(store, drive) {
    const localHistory = new Map(store.quizzes().map(q => [q.id, q]));
    const remoteHistory = (await drive.histories()).filter(item => item.file && item.name.endsWith('.data'));
    const remoteIds = new Set();
    for (const item of remoteHistory) {
      const id = item.name.slice(0, -5);
      remoteIds.add(id);
      // Verify even an existing ID so a restored/edited remote file cannot silently replace history.
      const quiz = Model.validateQuiz(await drive.readHistory(item.id));
      if (quiz.id !== id) throw new Error('履歴のファイル名とIDが一致しません。');
      store.saveQuiz(quiz);
    }
    for (const [id, quiz] of localHistory) if (!remoteIds.has(id)) await drive.writeHistory(quiz);
    for (let attempt = 0; attempt < 4; attempt++) {
      const previous = await drive.readState();
      const merged = Model.merge(previous?.data || Model.empty(), store.state());
      try {
        if (!previous || previous.snapshotMatches === false || JSON.stringify(merged) !== JSON.stringify(Model.merge(previous.data))) await drive.writeState(merged, previous);
        store.remember(merged);
        return;
      } catch (error) { if (![409, 412].includes(error.status) || attempt === 3) throw error; }
    }
  }
  const api = { LearningStore, syncLearning };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(globalThis);
