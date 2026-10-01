// Pure lesson logic: no DOM, no storage. All functions return new objects.
export const LIVES = 3;
export const LESSON_SIZE = 10;
export const XP_CORRECT = 10;
export const XP_LESSON = 20;   // bonus for finishing a lesson
export const XP_PERFECT = 10;  // extra bonus for a lesson without a single mistake

// task type per slot: gentle start, typing later (the "advancing" part of the lesson)
const SEQUENCE = ['picture', 'choice', 'picture', 'choice', 'listen', 'type', 'listen', 'type', 'choice', 'type'];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Typed-answer comparison: case, accents, punctuation, extra spaces and a leading article don't matter.
export function norm(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/^(a|az|egy) (?=.)/, '');
}

export function isTypedCorrect(task, input) {
  const got = norm(input);
  return got !== '' && task.accept.some((a) => norm(a) === got);
}

export function isCorrect(task, response) {
  return task.type === 'type' ? isTypedCorrect(task, response) : response === task.answer;
}

// 4 options: the right one plus 3 distractors that cannot also be right.
function options(words, word, field, rnd) {
  const show = (w) => (field === 'en' ? w.en : w.hu[0]);
  const bad = new Set(field === 'en' ? [word.en] : word.hu.map(norm));
  const pool = shuffle(words.filter((w) => w !== word && !bad.has(field === 'en' ? w.en : norm(w.hu[0]))), rnd);
  return shuffle([show(word), ...pool.slice(0, 3).map(show)], rnd);
}

function makeTask(type, word, words, rnd, extra = {}) {
  const base = { type, word: word.en, ...extra };
  switch (type) {
    case 'picture': return { ...base, emoji: word.emoji, options: options(words, word, 'en', rnd), answer: word.en };
    case 'choice': return { ...base, prompt: word.en, options: options(words, word, 'hu', rnd), answer: word.hu[0] };
    case 'listen': return { ...base, speak: word.en, options: options(words, word, 'hu', rnd), answer: word.hu[0] };
    case 'type': return { ...base, prompt: word.en, accept: word.hu, answer: word.hu[0] };
    default: throw new Error('unknown task type ' + type);
  }
}

export const MAX_INCLUDE = 3;  // at most this many weak words are carried into the next lesson

// the weak words to bring back: the NEWEST ones (end of the list, newest first), real and distinct,
// at most MAX_INCLUDE: these are the words the end screen of the last lesson listed
export function pickIncluded(words, include = []) {
  const known = new Set(words.map((w) => w.en));
  return [...new Set([...include].reverse())].filter((en) => known.has(en)).slice(0, MAX_INCLUDE);
}

// canSpeak=false: listening tasks turn into plain text choices and the lesson says so in notes.
// include: English words (weak ones) that must be in the lesson; the rest is random. Without
// include the draw is exactly the old seeded one.
export function createLesson(words, { seed = 1, canSpeak = true, include } = {}) {
  const rnd = mulberry32(seed);
  const included = pickIncluded(words, include);
  let picked;
  if (included.length === 0) picked = shuffle(words, rnd).slice(0, LESSON_SIZE);
  else {
    const forced = included.map((en) => words.find((w) => w.en === en));
    const rest = shuffle(words.filter((w) => !included.includes(w.en)), rnd).slice(0, LESSON_SIZE - forced.length);
    picked = shuffle([...forced, ...rest], rnd);
  }
  const notes = [];
  const tasks = picked.map((w, i) => {
    let type = SEQUENCE[i];
    if (type === 'listen' && !canSpeak) {
      type = 'choice';
      if (!notes.includes('no-speech')) notes.push('no-speech');
    }
    return makeTask(type, w, words, rnd);
  });
  return {
    words, rnd, tasks, notes,
    index: 0, lives: LIVES, xp: 0, correct: 0, answered: 0,
    missed: [], fixed: [],   // fixed: missed words answered right in the retry round
    included,                // weak words that were brought into this lesson
    retried: false,
    current: null,         // result of the answer given to the current task, until advance()
    status: 'active',      // 'active' | 'done' | 'over'
    bonus: 0,
  };
}

export function answer(lesson, response) {
  if (lesson.status !== 'active' || lesson.current) return lesson;
  const task = lesson.tasks[lesson.index];
  const ok = isCorrect(task, response);
  return {
    ...lesson,
    answered: lesson.answered + 1,
    correct: lesson.correct + (ok ? 1 : 0),
    xp: lesson.xp + (ok ? XP_CORRECT : 0),
    lives: lesson.lives - (ok ? 0 : 1),
    missed: !ok && !task.retry && !lesson.missed.includes(task.word) ? [...lesson.missed, task.word] : lesson.missed,
    fixed: ok && task.retry && !lesson.fixed.includes(task.word) ? [...lesson.fixed, task.word] : lesson.fixed,
    current: { ok, response, correctAnswer: task.answer },
  };
}

// Move on after the feedback was shown: next task, the retry round for missed words, or the end.
export function advance(lesson) {
  if (lesson.status !== 'active' || !lesson.current) return lesson;
  const base = { ...lesson, current: null };
  if (base.lives <= 0) return { ...base, status: 'over' };
  const index = base.index + 1;
  if (index < base.tasks.length) return { ...base, index };
  if (!base.retried && base.missed.length > 0) {
    const retry = base.missed.map((en) => makeTask('type', base.words.find((w) => w.en === en), base.words, base.rnd, { retry: true }));
    return { ...base, index, retried: true, tasks: [...base.tasks, ...retry] };
  }
  const perfect = base.answered === base.correct;
  const bonus = XP_LESSON + (perfect ? XP_PERFECT : 0);
  return { ...base, index, status: 'done', bonus, xp: base.xp + bonus };
}

// words still weak at the end: missed the first time and not solved in the retry round
export const weakWords = (l) => l.missed.filter((w) => !(l.fixed ?? []).includes(w));
export const accuracy = (l) => (l.answered ? Math.round((l.correct / l.answered) * 100) : 0);
export const progress = (l) => (l.status === 'done' ? 1 : l.index / l.tasks.length);
