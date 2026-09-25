const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../learning-model.js');
const { LearningStore, syncLearning } = require('../learning-store.js');
const { OneDrive } = require('../onedrive.js');
class Storage {
  values = new Map();
  get length() { return this.values.size; }
  key(i) { return [...this.values.keys()][i]; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}
let sequence = 0;
const store = (storage = new Storage()) => new LearningStore(storage, () => 'op-' + ++sequence, () => 1000);
const quiz = id => ({ format: 'zero-one-terminology-quiz', schemaVersion: 1, id, mode: 'spell', answerMode: 'choice', genre: 'ALL', completed: true, startedAt: '2026-09-25T00:00:00Z', answers: [{ id: id + '-answer', termId: 'GBT-0001', correct: false, answeredAt: '2026-09-25T00:00:01Z' }] });
test('legacy favorites are preserved and imported once without leaking to accounts', () => {
  const s = store(); s.storage.setItem('zot_favs', '["GBT-0001"]'); s.migrateLegacy();
  assert.equal(s.state().favorites['GBT-0001'].value, true);
  s.set('favorites', 'GBT-0001', false); s.migrateLegacy();
  assert.equal(s.state().favorites['GBT-0001'].value, false);
  s.scope = 'account-A'; assert.deepEqual(s.state(), Model.empty());
  s.importData(s.state('guest'), []);
  assert.equal(s.state().favorites['GBT-0001'].value, false);
  s.scope = 'account-B'; assert.deepEqual(s.state(), Model.empty());
  assert.equal(s.storage.getItem('zot_favs'), '["GBT-0001"]');
});
test('parallel tabs retain independent operations and removals win over stale snapshots', () => {
  const shared = new Storage(), a = store(shared), b = store(shared);
  a.set('favorites', 'GBT-0001', true); const stale = a.state();
  b.set('favorites', 'GBT-0002', true); a.set('favorites', 'GBT-0001', false);
  b.remember(stale);
  assert.equal(a.state().favorites['GBT-0001'].value, false);
  assert.equal(a.state().favorites['GBT-0002'].value, true);
  assert.deepEqual(Model.merge(a.state(), stale), Model.merge(stale, a.state()));
});
test('merge ties converge regardless of device order', () => {
  const a = Model.empty(), b = Model.empty();
  a.favorites['GBT-0001'] = { value: true, clock: 1000, opId: 'a' };
  b.favorites['GBT-0001'] = { value: false, clock: 1000, opId: 'b' };
  assert.deepEqual(Model.merge(a, b), Model.merge(b, a));
  assert.equal(Model.merge(a, b).favorites['GBT-0001'].value, false);
});
test('quiz retries are idempotent; distinct attempts contribute to progress', () => {
  const s = store(), q = quiz('quiz-1'); s.saveQuiz(q); s.saveQuiz(q); s.saveQuiz(quiz('quiz-2'));
  assert.equal(s.quizzes().length, 2);
  assert.equal(Model.summarize(s.quizzes()).terms['GBT-0001'].mistakes, 2);
  assert.throws(() => s.saveQuiz({ ...q, completed: false }), /異なる/);
});
test('malformed/future data and prototype keys are rejected', () => {
  assert.throws(() => Model.merge({ ...Model.empty(), schemaVersion: 2 }));
  assert.throws(() => Model.validate(JSON.parse('{"format":"zero-one-terminology-learning","schemaVersion":1,"favorites":{"__proto__":{"value":true,"clock":1,"opId":"a"}},"viewed":{}}')));
  assert.throws(() => Model.validateQuiz({ ...quiz('q'), answers: [{ termId: 'GBT-0001' }] }));
});
test('quota error leaves previous data intact and does not claim success', () => {
  const s = store(); s.set('favorites', 'GBT-0001', true);
  s.storage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => s.set('favorites', 'GBT-0001', false), /保存できません/);
  assert.equal(s.state().favorites['GBT-0001'].value, true);
});
test('ETag conflict re-reads and merges both devices; history is retried after offline failure', async () => {
  const a = store(), b = store(); a.set('favorites', 'GBT-0001', true); a.saveQuiz(quiz('q1'));
  b.set('favorites', 'GBT-0002', true);
  let remote = Model.empty(), version = 1, writes = 0, offline = true;
  const histories = new Map();
  const drive = {
    histories: async () => [...histories].map(([id]) => ({ id, name: id + '.data', file: {} })),
    readHistory: async id => histories.get(id),
    writeHistory: async q => { if (offline) throw new Error('offline'); histories.set(q.id, q); },
    readState: async () => ({ data: remote, id: 'state', eTag: String(version) }),
    writeState: async (data, previous) => {
      writes++;
      if (writes === 1) { remote = b.state(); version++; throw Object.assign(new Error('conflict'), { status: 412 }); }
      assert.equal(previous.eTag, String(version)); remote = data; version++;
    }
  };
  await assert.rejects(syncLearning(a, drive), /offline/); assert.equal(a.quizzes().length, 1);
  offline = false; await syncLearning(a, drive); await syncLearning(a, drive);
  assert.equal(histories.size, 1); assert.equal(writes, 2);
  assert.equal(remote.favorites['GBT-0001'].value, true); assert.equal(remote.favorites['GBT-0002'].value, true);
});
test('new-file conflict is merged and repeated conflict remains an error', async () => {
  const a = store(); a.set('viewed', 'GBT-0001', true);
  let reads = 0;
  const d = { histories: async () => [], readState: async () => { reads++; return null; }, writeState: async () => { throw Object.assign(new Error('conflict'), { status: 409 }); } };
  await assert.rejects(syncLearning(a, d)); assert.equal(reads, 4); assert.equal(a.state().viewed['GBT-0001'].value, true);
});
test('immutable deltas survive concurrent snapshots and failed snapshot writes', async () => {
  const files = new Map(); let snapshot = null, failSnapshot = false;
  function drive() {
    const d = new OneDrive({ storage: new Storage(), location: { href: 'https://example.test/' } });
    d.folderIds = { terminology: 't', history: 'h', updates: 'u' };
    d.children = async () => [...files.keys()].map(id => ({ id, name: id + '.data', file: {}, eTag: '1' }));
    d.request = async (p, options = {}) => {
      if (options.method === 'PUT') {
        assert.ok(p.endsWith('.data:/content'));
        if (p.includes('/u:/')) { files.set(p.split('/u:/')[1].split('.data:')[0], JSON.parse(options.body)); return {}; }
        if (failSnapshot) throw new Error('offline');
        snapshot = JSON.parse(options.body); return {};
      }
      if (p.endsWith(':/user-data.data')) { if (!snapshot) throw Object.assign(new Error('missing'), { status: 404 }); return { id: 's' }; }
      if (p.endsWith('/s/content')) return JSON.stringify(snapshot);
      const id = p.split('/items/')[1].split('/content')[0];
      return JSON.stringify(files.get(id));
    };
    return d;
  }
  const a = store(), b = store(), da = drive(), db = drive();
  a.set('favorites', 'GBT-0001', true); b.set('favorites', 'GBT-0002', true);
  await da.writeState(a.state(), null); await db.writeState(b.state(), null);
  assert.equal(snapshot.favorites['GBT-0001'], undefined, 'snapshot may be stale');
  let remote = await drive().readState();
  assert.equal(remote.data.favorites['GBT-0001'].value, true);
  assert.equal(remote.data.favorites['GBT-0002'].value, true);
  assert.equal(remote.snapshotMatches, false);
  a.remember(remote.data); a.set('favorites', 'GBT-0001', false);
  failSnapshot = true; await assert.rejects(da.writeState(a.state(), remote), /offline/);
  remote = await drive().readState();
  assert.equal(remote.data.favorites['GBT-0001'].value, false, 'committed delta survives failed snapshot');
  failSnapshot = false; const before = files.size;
  await da.writeState(remote.data, remote);
  assert.equal(files.size, before, 'retry does not duplicate committed operations');
  assert.equal((await drive().readState()).snapshotMatches, true);
});
test('CANVAS scanner ignores all proposed learning files', () => {
  const fs = require('node:fs');
  const names = ['user-data.data', 'quiz-1.data'];
  assert.ok(names.every(name => !name.toLowerCase().endsWith('.json')));
  assert.ok(fs.readFileSync(require('node:path').join(__dirname, '../onedrive.js'), 'utf8').includes('TERMINOLOGY'));
});
