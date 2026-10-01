import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORDS } from '../src/words.js';
import { norm } from '../src/engine.js';

test('30 words, every one with a translation and an emoji, no duplicates', () => {
  assert.equal(WORDS.length, 30);
  for (const w of WORDS) {
    assert.match(w.en, /^[a-z]+$/);
    assert.ok(w.hu.length >= 1 && w.hu.every((h) => h.trim()));
    assert.ok(w.emoji);
  }
  assert.equal(new Set(WORDS.map((w) => w.en)).size, 30);
  assert.equal(new Set(WORDS.map((w) => w.emoji)).size, 30);
  const hu = WORDS.flatMap((w) => w.hu.map(norm));
  assert.equal(new Set(hu).size, hu.length, 'a Hungarian answer must not belong to two words');
});
