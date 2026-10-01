import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORDS } from '../src/words.js';
import {
  norm, isTypedCorrect, createLesson, answer, advance, accuracy,
  LIVES, LESSON_SIZE, XP_CORRECT, XP_LESSON, XP_PERFECT,
} from '../src/engine.js';

const typeTask = (w) => ({ type: 'type', accept: w.hu, answer: w.hu[0] });
const word = (en) => WORDS.find((w) => w.en === en);

test('typed answer ignores case, accents, spaces, punctuation and a leading article', () => {
  const t = typeTask(word('horse'));
  for (const ok of ['ló', 'LÓ', 'lo', ' Lo ', 'a ló', 'A LO', 'egy lo', 'ló!']) assert.ok(isTypedCorrect(t, ok), ok);
  for (const bad of ['', '   ', 'a', 'lo lo', 'lov', 'kutya']) assert.ok(!isTypedCorrect(t, bad), bad);
  assert.ok(isTypedCorrect(typeTask(word('apple')), 'ALMA'));
  assert.equal(norm('Őrült Űr'), 'orult ur');
});

test('alternative correct answers are accepted', () => {
  assert.ok(isTypedCorrect(typeTask(word('pig')), 'sertes'));
  assert.ok(isTypedCorrect(typeTask(word('pig')), 'Disznó'));
  assert.ok(isTypedCorrect(typeTask(word('bike')), 'kerekpar'));
});

test('a lesson is 10 tasks over 10 different words with mixed types', () => {
  const l = createLesson(WORDS, { seed: 5 });
  assert.equal(l.tasks.length, LESSON_SIZE);
  assert.equal(new Set(l.tasks.map((t) => t.word)).size, LESSON_SIZE);
  const types = new Set(l.tasks.map((t) => t.type));
  for (const t of ['picture', 'choice', 'type', 'listen']) assert.ok(types.has(t), t);
  assert.equal(l.lives, LIVES);
});

test('every choice task has 4 distinct options including exactly one right answer', () => {
  for (let seed = 1; seed <= 50; seed++) {
    for (const t of createLesson(WORDS, { seed }).tasks.filter((x) => x.options)) {
      assert.equal(t.options.length, 4);
      assert.equal(new Set(t.options.map(norm)).size, 4);
      assert.equal(t.options.filter((o) => o === t.answer).length, 1);
    }
  }
});

test('same seed = same lesson, different seed = different lesson', () => {
  const a = createLesson(WORDS, { seed: 9 }), b = createLesson(WORDS, { seed: 9 }), c = createLesson(WORDS, { seed: 10 });
  assert.deepEqual(a.tasks, b.tasks);
  assert.notDeepEqual(a.tasks.map((t) => t.word), c.tasks.map((t) => t.word));
});

test('without speech the listening tasks fall back to text choices and the lesson says so', () => {
  const l = createLesson(WORDS, { seed: 5, canSpeak: false });
  assert.ok(!l.tasks.some((t) => t.type === 'listen'));
  assert.deepEqual(l.notes, ['no-speech']);
  assert.deepEqual(createLesson(WORDS, { seed: 5 }).notes, []);
});

const respond = (l, ok) => {
  const t = l.tasks[l.index];
  const wrong = t.type === 'type' ? 'xxx' : t.options.find((o) => o !== t.answer);
  return answer(l, ok ? (t.type === 'type' ? t.answer : t.answer) : wrong);
};

test('perfect lesson: +10 XP per answer, bonuses, 100% accuracy, no retry round', () => {
  let l = createLesson(WORDS, { seed: 1 });
  for (let i = 0; i < LESSON_SIZE; i++) {
    l = respond(l, true);
    assert.equal(l.current.ok, true);
    l = advance(l);
  }
  assert.equal(l.status, 'done');
  assert.equal(l.xp, LESSON_SIZE * XP_CORRECT + XP_LESSON + XP_PERFECT);
  assert.equal(accuracy(l), 100);
  assert.equal(l.lives, LIVES);
});

test('a wrong answer costs a life, gives no XP and exposes the right answer', () => {
  let l = respond(createLesson(WORDS, { seed: 1 }), false);
  assert.equal(l.lives, LIVES - 1);
  assert.equal(l.xp, 0);
  assert.equal(l.current.ok, false);
  assert.equal(l.current.correctAnswer, l.tasks[0].answer);
  assert.equal(answer(l, l.tasks[0].answer), l, 'a task is answered only once');
});

test('missed words are asked again at the end, once, then the lesson completes', () => {
  let l = createLesson(WORDS, { seed: 2 });
  const missedWords = [];
  for (let i = 0; i < LESSON_SIZE; i++) {
    const miss = i === 1 || i === 4;          // two mistakes
    if (miss) missedWords.push(l.tasks[i].word);
    l = advance(respond(l, !miss));
  }
  assert.equal(l.status, 'active');
  assert.equal(l.tasks.length, LESSON_SIZE + 2);
  assert.deepEqual(l.tasks.slice(LESSON_SIZE).map((t) => t.word), missedWords);
  assert.ok(l.tasks.slice(LESSON_SIZE).every((t) => t.retry && t.type === 'type'));
  l = advance(respond(l, true));              // first retry right, second wrong
  l = advance(respond(l, false));
  assert.equal(l.lives, 0);
  assert.equal(l.status, 'over');
});

test('retry round finishes the lesson with the bonus (but no perfect bonus)', () => {
  let l = createLesson(WORDS, { seed: 2 });
  for (let i = 0; i < LESSON_SIZE; i++) l = advance(respond(l, i !== 3));
  assert.equal(l.tasks.length, LESSON_SIZE + 1);
  l = advance(respond(l, true));
  assert.equal(l.status, 'done');
  assert.equal(l.bonus, XP_LESSON);
  assert.equal(l.xp, (LESSON_SIZE - 1) * XP_CORRECT + XP_CORRECT + XP_LESSON);
  assert.equal(accuracy(l), Math.round((10 / 11) * 100));
});

test('losing the last life ends the lesson (game over) after the feedback', () => {
  let l = createLesson(WORDS, { seed: 3 });
  for (let i = 0; i < LIVES; i++) {
    l = respond(l, false);
    assert.equal(l.status, 'active', 'feedback is shown before game over');
    l = advance(l);
  }
  assert.equal(l.lives, 0);
  assert.equal(l.status, 'over');
  assert.equal(l.xp, 0);
  assert.equal(advance(l), l);
});

test('answer() is pure', () => {
  const l = createLesson(WORDS, { seed: 4 });
  const before = JSON.stringify({ ...l, rnd: 0 });
  answer(l, 'whatever');
  assert.equal(JSON.stringify({ ...l, rnd: 0 }), before);
});
