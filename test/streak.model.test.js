// Reference-model test for the daily streak. The model counts consecutive calendar days with plain
// UTC day numbers, so it shares nothing with src/state.js's previousDay() (local Date arithmetic).
// Every scenario runs in several time zones, including DST changes and a skipped calendar day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDay, currentStreak, recordLesson, EMPTY } from '../src/state.js';

const ZONES = ['Europe/Budapest', 'UTC', 'America/Sao_Paulo', 'Pacific/Apia', 'America/New_York', 'Pacific/Kiritimati', 'Australia/Lord_Howe'];
const dayNo = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const at = (y, m, d, h = 12, mi = 0) => new Date(y, m - 1, d, h, mi);

// model: lessonDays = sorted distinct day numbers; streak alive on `today` = length of the run ending at the
// last lesson day, if that day is today or yesterday, else 0
function modelStreak(lessonDays, todayNo) {
  const past = lessonDays.filter((n) => n <= todayNo);
  if (!past.length) return 0;
  const last = past.at(-1);
  if (last < todayNo - 1) return 0;
  let run = 1;
  while (past.includes(last - run)) run++;
  return run;
}

// plays dates (Date objects, in order) through recordLesson and checks it against the model after each one
function replay(label, dates) {
  let p = { ...EMPTY };
  const days = [];
  for (const d of dates) {
    const today = localDay(d);
    p = recordLesson(p, 10, today);
    if (!days.includes(dayNo(today))) days.push(dayNo(today));
    assert.equal(p.streak, modelStreak(days, dayNo(today)), `${label}: after lesson on ${today} (${d.toString()})`);
    assert.equal(currentStreak(p, today), p.streak, `${label}: currentStreak right after a lesson on ${today}`);
  }
  // display on every following day until the streak must be dead
  const last = localDay(dates.at(-1));
  for (let k = 0; k <= 4; k++) {
    const d = new Date(dates.at(-1).getTime()); d.setDate(d.getDate() + k);
    const shown = localDay(d);
    assert.equal(currentStreak(p, shown), modelStreak(days, dayNo(shown)), `${label}: shown on ${shown}, last lesson ${last}`);
  }
  return p;
}

for (const tz of ZONES) {
  test(`streak model, hand-picked sequences [${tz}]`, () => {
    const prev = process.env.TZ; process.env.TZ = tz;
    try {
      replay('plain 3 days', [at(2026, 10, 1), at(2026, 10, 2), at(2026, 10, 3)]);
      replay('skipped a day', [at(2026, 10, 1), at(2026, 10, 2), at(2026, 10, 4)]);
      replay('two lessons same day', [at(2026, 10, 1, 8), at(2026, 10, 1, 23, 59), at(2026, 10, 2, 0, 1)]);
      replay('23:59 then 00:01 are different days', [at(2026, 10, 1, 23, 59), at(2026, 10, 2, 0, 1)]);
      replay('month border', [at(2026, 1, 30), at(2026, 1, 31), at(2026, 2, 1), at(2026, 2, 28), at(2026, 3, 1)]);
      replay('year border', [at(2025, 12, 30), at(2025, 12, 31), at(2026, 1, 1)]);
      replay('leap day 2028', [at(2028, 2, 28), at(2028, 2, 29), at(2028, 3, 1)]);
      replay('no leap day 2026', [at(2026, 2, 27), at(2026, 2, 28), at(2026, 3, 1)]);
      replay('DST spring Budapest', [at(2026, 3, 28, 23, 30), at(2026, 3, 29, 0, 10), at(2026, 3, 29, 3, 30), at(2026, 3, 30, 0, 5)]);
      replay('DST spring, lesson in the gap hour', [at(2026, 3, 28, 12), at(2026, 3, 29, 2, 30), at(2026, 3, 30, 12)]);
      replay('DST autumn Budapest', [at(2026, 10, 24, 23, 59), at(2026, 10, 25, 0, 1), at(2026, 10, 25, 2, 30), at(2026, 10, 26, 0, 1)]);
      replay('DST spring US', [at(2026, 3, 7, 23, 30), at(2026, 3, 8, 0, 10), at(2026, 3, 9, 0, 10)]);
      replay('Apia skipped 2011-12-30', [at(2011, 12, 29), at(2011, 12, 31), at(2012, 1, 1)]);
      replay('Sao Paulo midnight DST (2018-11-04)', [at(2018, 11, 3, 23, 30), at(2018, 11, 4, 1, 0), at(2018, 11, 5, 0, 30)]);
    } finally { if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev; }
  });

  test(`streak model, 40 seeded random sequences [${tz}]`, () => {
    const prev = process.env.TZ; process.env.TZ = tz;
    try {
      let seed = 12345;
      const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
      for (let s = 0; s < 40; s++) {
        const start = at(2026 - rnd(3), 1 + rnd(12), 1 + rnd(28), rnd(24), rnd(60));
        const dates = []; let cur = start;
        for (let i = 0; i < 25; i++) {
          dates.push(new Date(cur.getTime()));
          cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + (rnd(4) === 0 ? 2 + rnd(2) : rnd(2)), rnd(24), rnd(60));
          if (cur <= dates.at(-1)) cur = new Date(dates.at(-1).getTime() + 60000);
        }
        replay(`random #${s} from ${start.toString()}`, dates);
      }
    } finally { if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev; }
  });
}

test('clock set back: a later stored day never lowers or resets the streak, never double counts', () => {
  const p = { ...EMPTY, streak: 4, lastDay: '2026-10-10', xp: 40 };
  assert.equal(currentStreak(p, '2026-10-05'), 4);
  const r = recordLesson(recordLesson(p, 10, '2026-10-05'), 10, '2026-10-05');
  assert.equal(r.streak, 4);
  assert.equal(r.lastDay, '2026-10-10');
  // once the real date catches up the streak continues normally
  assert.equal(recordLesson(r, 10, '2026-10-11').streak, 5);
  assert.equal(currentStreak(r, '2026-10-11'), 4);
  assert.equal(currentStreak(r, '2026-10-12'), 0);
});

test('a lesson right after the streak died starts again at 1, and a null lastDay (inconsistent save) cannot revive an old streak', () => {
  assert.equal(recordLesson({ ...EMPTY, streak: 7, lastDay: '2026-09-01' }, 10, '2026-10-01').streak, 1);
  assert.equal(recordLesson({ ...EMPTY, streak: 7, lastDay: null }, 10, '2026-10-01').streak, 1);
});
