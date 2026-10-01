import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORDS } from '../src/words.js';
import { endMessage, practiceWords, goalLeftText, countValue } from '../src/summary.js';

const L = (o) => ({ status: 'done', answered: 10, correct: 10, missed: [], ...o });

test('end message follows the real accuracy, perfect lesson is called perfect', () => {
  assert.match(endMessage(L({})), /^Hibátlan lecke: mind a 10 válasz/);
  assert.match(endMessage(L({ answered: 12, correct: 11, missed: ['dog'] })), /^Erős lecke: 92%.*1 tévesztéssel/);
  assert.match(endMessage(L({ answered: 13, correct: 10, missed: ['dog'] })), /^Jó lecke: 77%/);
  assert.match(endMessage(L({ answered: 16, correct: 10, missed: ['dog'] })), /^Ez most nehezebb volt: 63%/);
});

test('tier boundaries: 90 and 70 belong to the higher tier', () => {
  assert.match(endMessage(L({ answered: 10, correct: 9, missed: ['dog'] })), /^Erős/);
  assert.match(endMessage(L({ answered: 10, correct: 7, missed: ['dog'] })), /^Jó lecke/);
  assert.match(endMessage(L({ answered: 10, correct: 6, missed: ['dog'] })), /^Ez most nehezebb/);
});

test('game over message: with and without correct answers, no fake praise', () => {
  assert.match(endMessage(L({ status: 'over', answered: 5, correct: 2, missed: ['dog'] })), /^2 válasz már ült \(40%\)/);
  assert.match(endMessage(L({ status: 'over', answered: 3, correct: 0, missed: ['dog'] })), /nem jött össze/);
});

test('practice list pairs the missed words with the first Hungarian meaning, in order', () => {
  assert.deepEqual(practiceWords(['pig', 'dog'], WORDS), [{ en: 'pig', hu: 'disznó' }, { en: 'dog', hu: 'kutya' }]);
  assert.deepEqual(practiceWords([], WORDS), []);
  assert.deepEqual(practiceWords(['nonexistent'], WORDS), []);
});

test('daily goal text', () => {
  assert.equal(goalLeftText(120, 200), 'Még 80 XP (kb. 1 lecke) a mai célig');
  assert.equal(goalLeftText(200, 200), 'A mai cél megvan ✓');
  assert.equal(goalLeftText(250, 200), 'A mai cél megvan ✓');
});

test('counter ends exactly on the target and never overshoots', () => {
  assert.equal(countValue(80, 0), 0);
  assert.equal(countValue(80, 1), 80);
  assert.equal(countValue(80, 5), 80);
  assert.equal(countValue(0, 0.5), 0);
  let prev = 0;
  for (let i = 0; i <= 20; i++) { const v = countValue(80, i / 20); assert.ok(v >= prev && v <= 80); prev = v; }
});

import { streakStatus } from '../src/summary.js';
import { recordLesson, currentStreak, dayXp, goalReached, EMPTY } from '../src/state.js';

test('streak status on the home screen', () => {
  const p = { ...EMPTY, streak: 3, lastDay: '2026-10-01' };
  assert.equal(streakStatus(p, '2026-10-01'), 'Mára megvan ✓');
  assert.equal(streakStatus(p, '2026-10-02'), '⏳ Ma még nincs lecke');
  assert.equal(streakStatus({ ...p, lastDay: '2026-10-05' }, '2026-10-01'), 'Mára megvan ✓'); // clock went back
  assert.equal(streakStatus(p, '2026-10-04'), null, 'broken streak: no hint');
  assert.equal(streakStatus({ ...EMPTY }, '2026-10-01'), null);
});

test('midnight: stale home day shows no streak/xp, a lesson started yesterday still counts for yesterday', () => {
  const p = { ...EMPTY, streak: 3, lastDay: '2026-09-30', dayXp: 20, dayXpDate: '2026-09-30', goal: 200 };
  // 23:58 the page shows streak 3; at 00:05 (today = 10-01 is the day after lastDay) it is still alive, 0 XP today
  assert.equal(currentStreak(p, '2026-10-01'), 3);
  assert.equal(dayXp(p, '2026-10-01'), 0);
  // missed a whole day -> 0
  assert.equal(currentStreak(p, '2026-10-02'), 0);
  // lesson started on 09-30 (startDay), finished after midnight: app passes the START day
  const p2 = { ...EMPTY, goal: 100, streak: 3, lastDay: '2026-09-29', dayXp: 0, dayXpDate: '2026-09-29' };
  const after = recordLesson(p2, 120, '2026-09-30');
  assert.equal(after.streak, 4);
  assert.equal(after.lastDay, '2026-09-30');
  assert.equal(goalReached(p2, after, '2026-09-30'), true);
  // the bug being prevented: passing the finish day (10-01) would also give 4, but dates the lesson wrong; and
  // a second lesson the next morning then continues instead of resetting
  assert.equal(recordLesson(after, 120, '2026-10-01').streak, 5);
});
