import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, save, localDay, previousDay, currentStreak, recordLesson, EMPTY } from '../src/state.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('local day uses local calendar date and previousDay crosses month/year/leap boundaries', () => {
  assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(previousDay('2026-03-01'), '2026-02-28');
  assert.equal(previousDay('2026-01-01'), '2025-12-31');
  assert.equal(previousDay('2028-03-01'), '2028-02-29');
});

test('first lesson starts a streak of 1; same day does not double count; next day adds one', () => {
  let p = recordLesson({ ...EMPTY }, 50, '2026-10-01');
  assert.deepEqual([p.streak, p.xp, p.lessons], [1, 50, 1]);
  p = recordLesson(p, 30, '2026-10-01');
  assert.deepEqual([p.streak, p.xp, p.lessons], [1, 80, 2]);
  p = recordLesson(p, 10, '2026-10-02');
  assert.equal(p.streak, 2);
});

test('missing a day resets the streak to 1 on the next lesson, and shows 0 meanwhile', () => {
  const p = { ...EMPTY, streak: 5, lastDay: '2026-10-01', xp: 100 };
  assert.equal(currentStreak(p, '2026-10-01'), 5);
  assert.equal(currentStreak(p, '2026-10-02'), 5);
  assert.equal(currentStreak(p, '2026-10-03'), 0);
  assert.equal(recordLesson(p, 10, '2026-10-03').streak, 1);
});

test('storage round trip, garbage and missing/throwing storage', () => {
  const s = mem();
  assert.deepEqual(load(s), EMPTY);
  assert.equal(save({ ...EMPTY, xp: 70, streak: 2, lastDay: '2026-10-01' }, s), true);
  assert.equal(load(s).xp, 70);
  s.setItem('szotanulo.v1', '{not json');
  assert.deepEqual(load(s), EMPTY);
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(load(broken), EMPTY);
  assert.equal(save(EMPTY, broken), false);
  assert.deepEqual(load(undefined), EMPTY);
});

test('a throwing localStorage getter does not break load/save', () => {
  const orig = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  try {
    assert.deepEqual(load(), { ...EMPTY });
    assert.equal(save({ ...EMPTY }), false);
  } finally {
    if (orig) Object.defineProperty(globalThis, 'localStorage', orig); else delete globalThis.localStorage;
  }
});

import { dayXp, goalReached, setGoal, goalText, GOALS, DEFAULT_GOAL } from '../src/state.js';

test('future lastDay (clock set forward then back) keeps the streak instead of resetting it', () => {
  const p = { ...EMPTY, streak: 4, lastDay: '2026-10-10', xp: 40 };
  assert.equal(currentStreak(p, '2026-10-05'), 4);
  const r = recordLesson(p, 10, '2026-10-05');
  assert.equal(r.streak, 4, 'no +1 and no reset');
  assert.equal(r.lastDay, '2026-10-10', 'the later day stays the reference');
  assert.equal(recordLesson(r, 10, '2026-10-05').streak, 4);
  assert.equal(recordLesson({ ...EMPTY, streak: 0, lastDay: '2026-10-10' }, 10, '2026-10-05').streak, 1);
});

test('daily XP accumulates within a day and resets on the next one', () => {
  let p = recordLesson({ ...EMPTY }, 30, '2026-10-01');
  assert.equal(dayXp(p, '2026-10-01'), 30);
  p = recordLesson(p, 25, '2026-10-01');
  assert.equal(dayXp(p, '2026-10-01'), 55);
  assert.equal(dayXp(p, '2026-10-02'), 0, 'new day, new count');
  p = recordLesson(p, 20, '2026-10-02');
  assert.equal(dayXp(p, '2026-10-02'), 20);
  assert.equal(p.xp, 75, 'the total keeps counting');
  assert.equal(dayXp({ ...EMPTY, dayXp: 30, dayXpDate: '2026-10-09' }, '2026-10-05'), 30, 'future date counts as today');
});

test('the goal is announced exactly once per day: by the lesson that crosses it', () => {
  const day = '2026-10-01';
  let p = { ...EMPTY, goal: 200 };
  let n = recordLesson(p, 120, day);
  assert.equal(goalReached(p, n, day), false);
  p = n; n = recordLesson(p, 120, day);                // 120 -> 240 crosses 200
  assert.equal(goalReached(p, n, day), true);
  p = n; n = recordLesson(p, 120, day);                // already past it
  assert.equal(goalReached(p, n, day), false);
  p = n; n = recordLesson({ ...p, goal: 100 }, 120, '2026-10-02'); // next day: a new goal, new announcement
  assert.equal(goalReached({ ...p, goal: 100 }, n, '2026-10-02'), true);
});

test('goal choices: 100/200/300, default 200, anything else is ignored', () => {
  assert.deepEqual([...GOALS], [100, 200, 300]);
  assert.equal(EMPTY.goal, DEFAULT_GOAL);
  assert.equal(setGoal(EMPTY, 300).goal, 300);
  assert.equal(setGoal(EMPTY, 33), EMPTY);
  assert.equal(setGoal(EMPTY, '300'), EMPTY);
});

test('an old save without the goal fields still loads and gets defaults', () => {
  const s = mem();
  s.setItem('szotanulo.v1', JSON.stringify({ xp: 120, streak: 3, lastDay: '2026-09-30', lessons: 4 }));
  const p = load(s);
  assert.deepEqual([p.xp, p.streak, p.lessons], [120, 3, 4]);
  assert.deepEqual([p.goal, p.dayXp, p.dayXpDate], [200, 0, null]);
  s.setItem('szotanulo.v1', JSON.stringify({ xp: 1, streak: 1, goal: 77 }));
  assert.equal(load(s).goal, 200, 'an invalid stored goal falls back to the default');
  for (const old of [20, 50]) {
    s.setItem('szotanulo.v1', JSON.stringify({ xp: 1, streak: 1, goal: old }));
    assert.equal(load(s).goal, 200, `old goal ${old} becomes the new default`);
  }
  s.setItem('szotanulo.v1', JSON.stringify({ xp: 1, streak: 1, goal: 100 }));
  assert.equal(load(s).goal, 100, 'a stored 100 stays');
});

test('save failures are reported (false), also when merely touching localStorage throws', () => {
  const full = { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } };
  assert.equal(save(EMPTY, full), false);
  assert.equal(save(EMPTY, undefined), false, 'no storage at all');
  const saved = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    assert.equal(save(EMPTY), false);
    assert.deepEqual(load(), EMPTY);
  } finally {
    if (saved === undefined) delete globalThis.localStorage; else Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: saved });
  }
});

test('goal text never exceeds the goal and gets a check mark once reached', () => {
  assert.equal(goalText(0, 200), '0/200 XP');
  assert.equal(goalText(199, 200), '199/200 XP');
  assert.equal(goalText(200, 200), '200/200 XP ✓');
  assert.equal(goalText(350, 300), '300/300 XP ✓');
});
