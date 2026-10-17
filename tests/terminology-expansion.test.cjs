const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const terms = JSON.parse(fs.readFileSync(path.join(root, 'terms.json'), 'utf8'));
const english = JSON.parse(fs.readFileSync(path.join(root, 'english.json'), 'utf8'));
const additions = ['Criss-cross','Three-man weave','Five-man weave','Two-man passing drill','Rip and go','Jab and go','Jab and rip','Jab and shoot','Shot fake and drive','Hand-off','Mikan drill','Reverse Mikan drill','Zig-zag dribbling drill','Star passing drill','Four-corner passing drill','3-on-2 to 2-on-1 drill','11-man break','Scissors action','Pass and cut','Pass and follow drill','Figure-eight ball handling','Figure-eight dribble','Cutthroat drill','Pass, cut and replace'];
test('original terms and unique IDs remain stable after expanding the dictionary', () => {
  assert.equal(terms.length, 538);
  assert.equal(new Set(terms.map(t => t.ID)).size, terms.length);
  assert.deepEqual(terms.slice(514).map(t => t.ID), additions.map((_, i) => 'GBT-' + String(515 + i).padStart(4, '0')));
  assert.equal(terms[0].ID, 'GBT-0001');
  assert.equal(terms[513].ID, 'GBT-0514');
  assert.deepEqual(terms.slice(514).map(t => t['正式/標準用語']), additions);
});
test('new terms have accessible definitions, Japanese aliases, English coaching phrases and credible sources', () => {
  for (const term of terms.slice(514)) {
    assert.ok(term['日本語推奨表記'], term.ID);
    assert.ok(term['定義'].length >= 16, term.ID);
    assert.match(term['主要出典URL'], /^https:\/\//, term.ID);
    assert.match(term['最終確認日'], /^2026-10-17$/, term.ID);
    const en = english[term['正式/標準用語']];
    assert.ok(Array.isArray(en) && en.length === 4 && en[0] && en[1], term.ID);
  }
});
test('criss-cross and hand-off variants remain distinguishable in search', () => {
  const lookup = (word) => terms.filter(t => [t['正式/標準用語'], t['日本語推奨表記'], t['別称']].join(' ').toLowerCase().includes(word.toLowerCase()));
  assert.ok(lookup('クリスクロス').some(t => t['正式/標準用語'] === 'Criss-cross'));
  assert.ok(lookup('リップアンドゴー').some(t => t['正式/標準用語'] === 'Rip and go'));
  assert.ok(lookup('ハンドオフ').some(t => t['正式/標準用語'] === 'Hand-off'));
  assert.ok(lookup('3人クリスクロス').some(t => t['正式/標準用語'] === 'Criss-cross'));
  assert.ok(terms.find(t => t['正式/標準用語'] === 'Criss-cross')['備考'].includes('ハンドオフ'));
  assert.ok(terms.find(t => t['正式/標準用語'] === 'Hand-off')['備考'].includes('DHO'));
});
