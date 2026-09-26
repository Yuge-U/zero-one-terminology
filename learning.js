/* Account-scoped offline learning with explicit guest import. No CANVAS data is written. */
window.Learning = (() => {
  'use strict';
  let store, drive, error = '', syncing = false, ready = false, dirty = false, timer, syncPromise;
  const uuid = () => crypto.randomUUID();
  function notify() { window.dispatchEvent(new CustomEvent('learningchange')); renderPanel(); }
  function fail(e) { error = e.message || '保存できませんでした。'; notify(); }
  function change(action) { try { action(); error = ''; notify(); schedule(); return true; } catch (e) { fail(e); return false; } }
  function schedule() { dirty = true; clearTimeout(timer); if (drive?.account && ready) timer = setTimeout(sync, 1500); }
  async function sync() {
    if (syncing) { dirty = true; return syncPromise; }
    if (!drive?.account || !ready) return;
    syncing = true;
    syncPromise = (async () => {
      try {
        do { dirty = false; error = ''; notify(); await syncLearning(store, drive); } while (dirty);
      } catch (e) { error = e.message || '同期できませんでした。再接続してください。'; }
      finally { syncing = false; notify(); }
    })();
    return syncPromise;
  }
  function favorites() { try { return new Set(Object.entries(store?.state().favorites || {}).filter(([, r]) => r.value).map(([id]) => id)); } catch (e) { error = e.message; return new Set(); } }
  function viewed(id) { if (ready) change(() => store.touch('viewed', id)); }
  function toggleFavorite(id) { if (ready) change(() => store.set('favorites', id, !favorites().has(id))); }
  function quizRecord(quiz) {
    if (!quiz || quiz.saved || !quiz.answers.length) return true;
    if (quiz.scope !== store.scope) throw new Error('クイズ開始時のアカウントへ戻ってください。');
    const record = {
      format: 'zero-one-terminology-quiz', schemaVersion: 1, id: quiz.id,
      dictionaryVersion: 'terms-v4', startedAt: quiz.startedAt, finishedAt: new Date().toISOString(),
      mode: quiz.mode, answerMode: quiz.answer, genre: quiz.genre,
      questionCount: quiz.items.length, completed: quiz.answers.length === quiz.items.length,
      answers: quiz.answers
    };
    if (change(() => store.saveQuiz(record))) { quiz.saved = true; sessionStorage.removeItem('zot_quiz_draft'); return true; }
    return false;
  }
  function beginQuiz(quiz) { Object.assign(quiz, { id: uuid(), scope: store.scope, startedAt: new Date().toISOString(), answers: [] }); }
  function answerQuiz(quiz, termId, correct) {
    quiz.answers.push({ id: uuid(), termId, correct, answeredAt: new Date().toISOString() });
    // Tab-local draft survives refresh; it is recovered as an interrupted quiz on the next visit.
    try { sessionStorage.setItem('zot_quiz_draft', JSON.stringify({ ...quiz, items: Array(quiz.items.length).fill(null) })); } catch (e) { fail(e); }
    if (quiz.answers.length === quiz.items.length) quizRecord(quiz);
  }
  function recoverQuiz() {
    const raw = sessionStorage.getItem('zot_quiz_draft');
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (draft.scope === store.scope) quizRecord(draft);
  }
  function open() { document.getElementById('learningDialog').showModal(); renderPanel(); }
  function renderPanel() {
    const status = document.getElementById('learningStatus');
    if (!status) return;
    status.textContent = error || (!ready ? '保存機能を準備中…' : syncing ? 'OneDriveと同期中…' : drive?.account ? (dirty ? '端末に保存済み・同期待ち' : 'OneDriveに接続中') : 'このブラウザに保存中');
    status.classList.toggle('learning-error', !!error);
    const inline = document.getElementById('learningInlineStatus');
    if (inline) { inline.textContent = status.textContent; inline.classList.toggle('learning-error', !!error); }
    document.getElementById('learningAccount').textContent = drive?.account ? drive.account.username : 'Microsoftアカウントに接続すると、他の端末と学習データを共有できます。';
    document.getElementById('learningConnect').disabled = !ready || syncing || !drive?.client;
    document.getElementById('learningConnect').textContent = drive?.account ? '再接続・アカウント変更' : 'Microsoftアカウントで接続';
    document.getElementById('learningDisconnect').hidden = !drive?.account;
    document.getElementById('learningSync').disabled = !drive?.account || syncing;
    document.getElementById('learningImportGuest').hidden = !drive?.account;
    for (const id of ['learningImportGuest', 'learningBackup', 'learningRestore', 'learningDisconnect']) document.getElementById(id).disabled = !ready || syncing;
    try {
      if (!store) return;
      const quizzes = store.quizzes(), summary = LearningModel.summarize(quizzes), state = store.state();
      const seen = Object.values(state.viewed).filter(r => r.value).length;
      document.getElementById('learningStats').textContent = `お気に入り ${favorites().size}語 ／ 閲覧済み ${seen}語 ／ クイズ ${quizzes.length}回 ／ 正解 ${summary.correct}/${summary.attempts}問`;
      const mistakes = Object.entries(summary.terms).filter(([, value]) => value.mistakes > 0);
      document.getElementById('learningMistakes').replaceChildren(...mistakes.map(([id, value]) => {
        const term = DATA.find(t => t.ID === id), button = document.createElement('button');
        button.className = 'learning-term'; button.textContent = `${term?.['正式/標準用語'] || id} — 誤答 ${value.mistakes}回 / 正解 ${value.correct}回`;
        button.onclick = () => { document.getElementById('learningDialog').close(); closeQuiz(); show(id); };
        return button;
      }));
      const viewed = Object.entries(state.viewed).filter(([, record]) => record.value).sort((a, b) => b[1].clock - a[1].clock).slice(0, 50);
      document.getElementById('learningViewed').replaceChildren(...viewed.map(([id, record]) => {
        const term = DATA.find(t => t.ID === id), button = document.createElement('button');
        button.className = 'learning-term';
        const when = new Date(record.clock).toLocaleString('ja-JP');
        button.textContent = `${term?.['正式/標準用語'] || id} — ${term?.['日本語推奨表記'] || ''} · ${when}`;
        button.onclick = () => { document.getElementById('learningDialog').close(); closeQuiz(); show(id); };
        return button;
      }));
      document.getElementById('learningHistory').replaceChildren(...quizzes.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 30).map(q => {
        const p = document.createElement('p');
        p.textContent = `${new Date(q.startedAt).toLocaleString('ja-JP')} · ${q.mode.toUpperCase()} · ${q.answers.filter(a => a.correct).length}/${q.answers.length}問${q.completed ? '' : '（途中終了）'}`;
        return p;
      }));
    } catch (e) { status.textContent = e.message; }
  }
  async function connect() {
    try { if (typeof Q !== 'undefined' && !quizRecord(Q)) return; closeQuiz(); await drive.signIn(); } catch (e) { fail(e); }
  }
  async function disconnect() {
    try { if (typeof Q !== 'undefined' && !quizRecord(Q)) return; closeQuiz(); await sync(); if (error) return; await drive.signOut(); } catch (e) { fail(e); }
  }
  function importGuest() {
    if (!confirm('このブラウザの未接続時の学習データを、表示中のMicrosoftアカウントへ取り込みますか？')) return;
    change(() => store.importData(store.state('guest'), store.quizzes('guest')));
  }
  function backup() {
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify(store.export(), null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'zero-one-terminology-backup.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { fail(e); }
  }
  async function restore(event) {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('バックアップファイルが大きすぎます。');
      const data = JSON.parse(await file.text());
      if (data.format !== 'zero-one-terminology-backup' || data.schemaVersion !== 1 || !Array.isArray(data.quizzes)) throw new Error('対応するバックアップではありません。');
      LearningModel.validate(data.state); data.quizzes.forEach(LearningModel.validateQuiz);
      if (confirm('バックアップを現在の学習データへ統合しますか？接続中の場合はOneDriveにも同期します。')) change(() => store.importData(data.state, data.quizzes));
    } catch (e) { fail(e); } finally { event.target.value = ''; }
  }
  async function init() {
    try {
      store = new LearningStore(localStorage); store.migrateLegacy();
      drive = new TerminologyOneDrive();
      const account = await drive.init();
      if (account) {
        if (!account.homeAccountId) { drive.account = null; throw new Error('アカウントを識別できません。再接続してください。'); }
        store.scope = drive.clientId + ':' + account.homeAccountId;
      }
      recoverQuiz();
    } catch (e) { error = e.message; }
    ready = !!store; notify();
    if (drive?.account && !error) await sync();
  }
  window.addEventListener('online', () => { if (drive?.account) sync(); });
  window.addEventListener('pagehide', () => { try { if (typeof Q !== 'undefined') quizRecord(Q); } catch (e) { error = e.message; } });
  window.addEventListener('storage', event => {
    if (!store || !event.key?.startsWith(store.prefix())) return;
    notify();
    if (event.key.includes(':op:') || event.key.includes(':quiz:')) schedule();
  });
  return { init, open, favorites, viewed, toggleFavorite, beginQuiz, answerQuiz, finishQuiz: quizRecord, sync, connect, disconnect, importGuest, backup, restore, get ready() { return ready; } };
})();
