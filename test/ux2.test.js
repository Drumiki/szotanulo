import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORDS } from '../src/words.js';
import { createLesson, answer, advance, weakWords, pickIncluded, LESSON_SIZE, MAX_INCLUDE } from '../src/engine.js';
import { load, save, EMPTY, mergeWeak, cleanWeak, MAX_WEAK } from '../src/state.js';
import { endMessage, practiceWords, carryWords, practiceTitle, LESSON_XP_ESTIMATE, goalLeftText, bonusText, lessonLabel, streakDoneText, streakStatus } from '../src/summary.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const wrongOf = (t) => (t.type === 'type' ? 'xxx' : t.options.find((o) => o !== t.answer));
// play a lesson: wrongSet = words answered wrong the first time; retryRight = whether the retry round is solved
function play(l, wrongSet, retryRight) {
  let guard = 0;
  while (l.status === 'active' && guard++ < 40) {
    const t = l.tasks[l.index];
    const bad = t.retry ? !retryRight : wrongSet.includes(t.word);
    l = advance(answer(l, bad ? wrongOf(t) : t.answer));
  }
  return l;
}

test('fixed = words solved in the retry round; weak = missed minus fixed (done)', () => {
  const base = createLesson(WORDS, { seed: 3 });
  const [a, b] = [base.tasks[0].word, base.tasks[1].word];
  let l = play(createLesson(WORDS, { seed: 3 }), [a, b], true);
  assert.equal(l.status, 'done');
  assert.deepEqual([...l.missed].sort(), [a, b].sort());
  assert.deepEqual([...l.fixed].sort(), [a, b].sort());
  assert.deepEqual(weakWords(l), []);
  // retry wrong for everything: lesson still ends (retry happens once), words stay weak
  l = play(createLesson(WORDS, { seed: 3 }), [a, b], false);
  assert.equal(l.lives > 0 ? l.status : 'over', l.status);
  assert.deepEqual(l.fixed, []);
  assert.deepEqual([...weakWords(l)].sort(), [a, b].sort());
});

test('weak words after a game over: missed minus fixed (nothing was retried yet)', () => {
  const base = createLesson(WORDS, { seed: 4 });
  const bad = base.tasks.slice(0, 3).map((t) => t.word);
  const l = play(createLesson(WORDS, { seed: 4 }), bad, true);
  assert.equal(l.status, 'over');
  assert.deepEqual(weakWords(l), bad);
});

test('include: up to 3 weak words newest first from the end of the list, unknown skipped, the rest random', () => {
  const inc = ['dog', 'nonexistent', 'cat', 'pig', 'cow', 'dog'];
  const l = createLesson(WORDS, { seed: 7, include: inc });
  assert.deepEqual(l.included, ['dog', 'cow', 'pig'], 'newest first, from the end of the list');
  assert.equal(MAX_INCLUDE, 3);
  assert.equal(l.tasks.length, LESSON_SIZE);
  assert.equal(new Set(l.tasks.map((t) => t.word)).size, LESSON_SIZE);
  for (const w of l.included) assert.ok(l.tasks.some((t) => t.word === w), w);
  assert.deepEqual(createLesson(WORDS, { seed: 7, include: inc }).tasks, l.tasks, 'seeded');
  assert.deepEqual(createLesson(WORDS, { seed: 7, include: ['nonexistent'] }).included, []);
});

test('without include the old seeded draw is bit-identical', () => {
  for (const seed of [1, 5, 9, 123]) {
    const a = createLesson(WORDS, { seed }), b = createLesson(WORDS, { seed, include: [] }), c = createLesson(WORDS, { seed, include: undefined });
    assert.deepEqual(a.tasks, b.tasks);
    assert.deepEqual(a.tasks, c.tasks);
  }
  assert.deepEqual(createLesson(WORDS, { seed: 5 }).tasks.map((t) => t.word),
    createLesson(WORDS, { seed: 5 }).tasks.map((t) => t.word));
});

test('state: weak loads/saves, bad values become [], an old save without weak still loads', () => {
  const s = mem();
  assert.deepEqual(load(s).weak, []);
  s.setItem('szotanulo.v1', JSON.stringify({ xp: 1, streak: 1 }));
  assert.deepEqual(load(s).weak, []);
  for (const bad of ['dog', 5, null, { a: 1 }]) {
    s.setItem('szotanulo.v1', JSON.stringify({ xp: 1, streak: 1, weak: bad }));
    assert.deepEqual(load(s).weak, [], String(bad));
  }
  s.setItem('szotanulo.v1', JSON.stringify({ xp: 1, streak: 1, weak: ['dog', 3, 'dog', '', 'cat'] }));
  assert.deepEqual(load(s).weak, ['dog', 'cat']);
  assert.ok(save({ ...EMPTY, weak: ['pig'] }, s));
  assert.deepEqual(load(s).weak, ['pig']);
  assert.deepEqual(EMPTY.weak, []);
});

test('mergeWeak: finished lesson drops used words, still-wrong come back; over keeps used; max 20 FIFO', () => {
  assert.deepEqual(mergeWeak(['a', 'b', 'c'], ['a', 'b'], ['b', 'x'], false), ['c', 'b', 'x']);
  assert.deepEqual(mergeWeak(['a', 'b', 'c'], ['a', 'b'], ['x'], true), ['a', 'b', 'c', 'x']);
  assert.deepEqual(mergeWeak(['a'], [], ['a', 'b'], false), ['a', 'b'], 'dedupe');
  const many = Array.from({ length: 25 }, (_, i) => 'w' + i);
  assert.equal(cleanWeak(many).length, MAX_WEAK);
  assert.deepEqual(cleanWeak(many)[0], 'w5');
  assert.deepEqual(mergeWeak(many.slice(0, 20), [], ['n1', 'n2'], false).slice(-2), ['n1', 'n2']);
  assert.equal(mergeWeak(many.slice(0, 20), [], ['n1', 'n2'], false).length, 20);
});

const L = (o) => ({ status: 'done', answered: 10, correct: 10, missed: [], fixed: [], ...o });

test('end message: flawless badge only without a miss; all-fixed has its own text; weak says what really happens', () => {
  assert.match(endMessage(L({})), /^Hibátlan/);
  const allFixed = endMessage(L({ answered: 12, correct: 11, missed: ['dog'], fixed: ['dog'] }));
  assert.match(allFixed, /^Minden szó megvan, a hibásak is sikerültek újra/);
  assert.doesNotMatch(allFixed, /Hibátlan/);
  // the carry-over promise lives next to the list (carryWords), not in the subtitle
  const weak = endMessage(L({ answered: 12, correct: 10, missed: ['dog', 'cat'], fixed: ['dog'] }));
  assert.doesNotMatch(weak, /előkerül|lenti/);
  assert.match(endMessage(L({ status: 'over', answered: 4, correct: 1, missed: ['dog'] })), /^1 válasz már ült.* Indulj újra\.$/);
  assert.doesNotMatch(endMessage(L({ answered: 12, correct: 11, missed: ['dog'], fixed: ['dog'] })), /előkerül/);
});

test('practice list shows only the weak words', () => {
  const l = L({ missed: ['pig', 'dog', 'cat'], fixed: ['dog'] });
  assert.deepEqual(practiceWords(weakWords(l), WORDS).map((w) => w.en), ['pig', 'cat']);
});

test('carryWords == pickIncluded of the weak list: max 3, newest first, unknown skipped', () => {
  const weak = ['dog', 'cat', 'pig', 'cow', 'nonexistent'];
  const list = carryWords(weak, WORDS).map((w) => w.en);
  assert.deepEqual(list, pickIncluded(WORDS, weak));
  assert.deepEqual(list, ['cow', 'pig', 'cat']);
  assert.deepEqual(carryWords(['dog'], WORDS).map((w) => w.en), ['dog']);
  assert.deepEqual(carryWords([], WORDS), []);
  // what the lesson really includes is what was listed
  assert.deepEqual(createLesson(WORDS, { seed: 5, include: weak }).included, list);
});

test('practice title: the lesson weak words -> "Ezekkel", only older ones -> "Korábbról"', () => {
  const NEW = 'Ezekkel találkozol újra', OLD = 'Korábbról megmaradt szavak';
  assert.equal(practiceTitle(L({}), ['cow', 'pig'], WORDS), OLD, 'flawless + old');
  assert.equal(practiceTitle(L({ answered: 12, correct: 11, missed: ['dog'], fixed: ['dog'] }), ['cow'], WORDS), OLD, 'retry-fixed + old');
  assert.equal(practiceTitle(L({ answered: 12, correct: 10, missed: ['dog', 'cat'], fixed: ['dog'] }), ['cow', 'pig', 'cat'], WORDS), NEW, 'new miss + old (mixed)');
  assert.equal(practiceTitle(L({ status: 'over', answered: 4, correct: 1, missed: ['dog'] }), ['cow', 'dog'], WORDS), NEW, 'game over');
  assert.equal(practiceTitle(L({ answered: 11, correct: 10, missed: ['dog'] }), ['dog', 'cow', 'pig', 'cat'], WORDS), OLD, 'fresh word beyond the listed 3');
});

test('lesson XP estimate is the smallest finished lesson: 9 correct + 20 bonus', () => {
  assert.equal(LESSON_XP_ESTIMATE, 9 * 10 + 20);
  assert.equal(goalLeftText(120, 200), 'Még 80 XP (kb. 1 lecke) a mai célig');
  assert.equal(goalLeftText(30, 200), 'Még 170 XP (kb. 2 lecke) a mai célig');
  assert.equal(goalLeftText(90, 200), 'Még 110 XP (kb. 1 lecke) a mai célig');
  assert.equal(goalLeftText(89, 200), 'Még 111 XP (kb. 2 lecke) a mai célig');
});

test('goal text: ceil(N/110) lessons, at least 1; reached text', () => {
  assert.equal(goalLeftText(120, 200), 'Még 80 XP (kb. 1 lecke) a mai célig');
  assert.equal(goalLeftText(0, 200), 'Még 200 XP (kb. 2 lecke) a mai célig');
  assert.equal(goalLeftText(0, 300), 'Még 300 XP (kb. 3 lecke) a mai célig');
  assert.equal(goalLeftText(199, 200), 'Még 1 XP (kb. 1 lecke) a mai célig');
  assert.equal(goalLeftText(121, 300), 'Még 179 XP (kb. 2 lecke) a mai célig');
  assert.equal(goalLeftText(200, 200), 'A mai cél megvan ✓');
});

test('bonus text, progress label, streak wording', () => {
  assert.deepEqual(bonusText({ status: 'done', bonus: 20 }), { value: '+20', note: 'lecke-bónusz' });
  assert.deepEqual(bonusText({ status: 'done', bonus: 30 }), { value: '+30', note: '20 lecke + 10 hibátlan' });
  assert.deepEqual(bonusText({ status: 'over', bonus: 0 }), { value: '0', note: '' });
  assert.equal(lessonLabel({ index: 2, tasks: new Array(10) }), 'Kérdés 3/10');
  assert.equal(lessonLabel({ index: 10, tasks: new Array(12) }), 'Újrapróbálás 1/2');
  assert.match(streakDoneText(4), /^🔥 4 napos sorozat, mára megvan$/);
  assert.equal(streakStatus({ ...EMPTY, streak: 2, lastDay: '2026-10-01' }, '2026-10-01'), 'Mára megvan ✓');
});

test('M1: with 5 old weak words and 1 new one, the new one is in the next lesson', () => {
  const old = ['dog', 'cat', 'horse', 'pig', 'cow'];
  const weak = mergeWeak(old, [], ['apple'], false);
  assert.deepEqual(weak, [...old, 'apple']);
  const l = createLesson(WORDS, { seed: 11, include: weak });
  assert.deepEqual(l.included, ['apple', 'cow', 'pig']);
  assert.ok(l.tasks.some((t) => t.word === 'apple'));
});

test('M1: an old word that is wrong again moves to the end, so the next lesson gets it', () => {
  const weak = mergeWeak(['dog', 'cat', 'horse', 'pig'], [], ['dog'], false);
  assert.deepEqual(weak, ['cat', 'horse', 'pig', 'dog']);
  assert.deepEqual(createLesson(WORDS, { seed: 2, include: weak }).included, ['dog', 'pig', 'horse']);
  // the same with a finished lesson that used dog and missed it again
  assert.deepEqual(mergeWeak(['dog', 'cat'], ['dog'], ['dog'], false), ['cat', 'dog']);
  // storage FIFO unchanged: 20 max, oldest drops
  const full = Array.from({ length: 20 }, (_, i) => 'w' + i);
  assert.deepEqual(mergeWeak(full, [], ['n'], false).slice(0, 2), ['w1', 'w2']);
});
