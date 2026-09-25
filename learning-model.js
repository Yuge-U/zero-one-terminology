(function (root) {
  'use strict';
  const FORMAT = 'zero-one-terminology-learning';
  const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
  const empty = () => ({ format: FORMAT, schemaVersion: 1, dictionaryVersion: 'terms-v4', updatedAt: null, favorites: {}, viewed: {} });
  function validate(data) {
    if (!data || data.format !== FORMAT || data.schemaVersion !== 1) throw new Error('学習データの形式・バージョンが対応していません。');
    for (const field of ['favorites', 'viewed']) {
      if (!data[field] || typeof data[field] !== 'object' || Array.isArray(data[field])) throw new Error('学習データが破損しています。');
      for (const [id, record] of Object.entries(data[field])) {
        if (!validId(id) || !record || typeof record.value !== 'boolean' || !Number.isSafeInteger(record.clock) || record.clock < 0 || !validId(record.opId)) throw new Error('学習記録が不正です。');
      }
    }
    return data;
  }
  function merge(...sources) {
    const result = empty();
    for (const source of sources) {
      validate(source);
      for (const field of ['favorites', 'viewed']) for (const [id, record] of Object.entries(source[field])) {
        const previous = result[field][id];
        if (!previous || record.clock > previous.clock || (record.clock === previous.clock && record.opId > previous.opId)) {
          Object.defineProperty(result[field], id, { value: { ...record }, enumerable: true, configurable: true, writable: true });
        }
      }
    }
    const clocks = ['favorites', 'viewed'].flatMap(field => Object.values(result[field]).map(record => record.clock));
    result.updatedAt = clocks.length ? new Date(Math.max(...clocks)).toISOString() : null;
    return result;
  }
  function validateQuiz(quiz) {
    if (!quiz || quiz.format !== 'zero-one-terminology-quiz' || quiz.schemaVersion !== 1 || !validId(quiz.id) || !Array.isArray(quiz.answers) || quiz.answers.length > 1000 || !['spell', 'listen', 'meaning', 'sentence'].includes(quiz.mode) || !['choice', 'free'].includes(quiz.answerMode) || !['ALL', 'OFFENSE', 'DEFENSE', 'SKILL', 'COURT', 'RULE'].includes(quiz.genre) || typeof quiz.completed !== 'boolean' || !Number.isFinite(Date.parse(quiz.startedAt))) throw new Error('クイズ履歴の形式が不正です。');
    const ids = new Set();
    for (const answer of quiz.answers) {
      if (!validId(answer.id) || ids.has(answer.id) || !validId(answer.termId) || typeof answer.correct !== 'boolean' || !Number.isFinite(Date.parse(answer.answeredAt))) throw new Error('回答履歴が不正です。');
      ids.add(answer.id);
    }
    return quiz;
  }
  function summarize(quizzes) {
    const terms = {}, answers = new Map();
    for (const quiz of quizzes) for (const answer of validateQuiz(quiz).answers) answers.set(answer.id, answer);
    for (const answer of answers.values()) {
      const term = terms[answer.termId] || (terms[answer.termId] = { attempts: 0, correct: 0, mistakes: 0 });
      term.attempts++;
      term.correct += Number(answer.correct);
      term.mistakes += Number(!answer.correct);
    }
    return { terms, attempts: answers.size, correct: [...answers.values()].filter(a => a.correct).length };
  }
  const api = { empty, validate, merge, validateQuiz, summarize, validId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LearningModel = api;
})(globalThis);
