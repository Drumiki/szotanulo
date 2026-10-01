import { currentStreak } from './state.js';
import { weakWords, LESSON_SIZE, XP_LESSON, XP_PERFECT, pickIncluded } from './engine.js';

export const LESSON_XP_ESTIMATE = 110;  // the smallest expected finished lesson: 9 correct (90) + 20 bonus; a flawless one is 130

// Pure helpers for the end screen: no DOM, no storage.

// Message by accuracy, built on the real numbers. `lesson` is an engine lesson (status 'done' | 'over').
// The weak words coming back are listed next to the end screen (carryWords), not in this text.
export function endMessage(lesson) {
  const acc = lesson.answered ? Math.round((lesson.correct / lesson.answered) * 100) : 0;
  const wrong = lesson.answered - lesson.correct;
  const weak = lesson.missed.filter((w) => !(lesson.fixed ?? []).includes(w)).length;
  if (lesson.status === 'over') {
    return (lesson.correct > 0
      ? `${lesson.correct} válasz már ült (${acc}%), de a többi még nem.`
      : 'Ez most nem jött össze.') + ' Indulj újra.';
  }
  if (lesson.missed.length === 0) return `Hibátlan lecke: mind a ${lesson.answered} válasz helyes volt.`;
  if (weak === 0) return `Minden szó megvan, a hibásak is sikerültek újra (${acc}% a pontosságod).`;
  if (acc >= 90) return `Erős lecke: ${acc}% a pontosságod, mindössze ${wrong} tévesztéssel.`;
  if (acc >= 70) return `Jó lecke: ${acc}% a pontosságod.`;
  return `Ez most nehezebb volt: ${acc}% a pontosságod.`;
}

// Missed words as English - Hungarian pairs, in the order they were missed. Unknown words are skipped.
export function practiceWords(missed, words) {
  return missed.flatMap((en) => {
    const w = words.find((x) => x.en === en);
    return w ? [{ en: w.en, hu: w.hu[0] }] : [];
  });
}

// The words the NEXT lesson brings back: exactly pickIncluded of the saved weak list (max 3, newest),
// as English - Hungarian pairs, so the end screen promises nothing else.
export const carryWords = (weakList, words) => practiceWords(pickIncluded(words, weakList), words);

// Title of that list. Words from THIS lesson's misses (still weak after it): "Ezekkel találkozol újra".
// Only older words left in the saved list (flawless / all-fixed lesson): "Korábbról megmaradt szavak".
export function practiceTitle(lesson, weakList, words) {
  const listed = pickIncluded(words, weakList), fresh = weakWords(lesson);
  return listed.some((en) => fresh.includes(en)) ? 'Ezekkel találkozol újra' : 'Korábbról megmaradt szavak';
}

// "X XP (about K lessons) left to today's goal", or the done text once the goal is reached.
export function goalLeftText(earnedToday, goal) {
  const left = goal - earnedToday;
  if (left <= 0) return 'A mai cél megvan ✓';
  return `Még ${left} XP (kb. ${Math.max(1, Math.ceil(left / LESSON_XP_ESTIMATE))} lecke) a mai célig`;
}

// Streak line of the end screen: the streak is safe for today, whatever the goal says.
export const streakDoneText = (days) => `🔥 ${days} napos sorozat, mára megvan`;

// Bonus tile: the value, and a small caption for where the XP above the 10/answer came from.
export function bonusText(lesson) {
  if (lesson.status !== 'done') return { value: '0', note: '' };
  return lesson.bonus >= XP_LESSON + XP_PERFECT
    ? { value: `+${lesson.bonus}`, note: `${XP_LESSON} lecke + ${XP_PERFECT} hibátlan` }
    : { value: `+${lesson.bonus}`, note: 'lecke-bónusz' };
}

// Visible progress label: "Kérdés 3/10" (a lesson is the whole 10), and "Újrapróbálás 1/2" in the retry round.
export function lessonLabel(lesson) {
  if (lesson.index < LESSON_SIZE) return `Kérdés ${lesson.index + 1}/${LESSON_SIZE}`;
  return `Újrapróbálás ${lesson.index - LESSON_SIZE + 1}/${lesson.tasks.length - LESSON_SIZE}`;
}

// Counter frames: value shown at progress t (0..1), ease-out, always an integer, exactly `target` at t >= 1.
export function countValue(target, t) {
  if (t >= 1 || target <= 0) return target;
  return Math.round(target * (1 - (1 - Math.max(0, t)) ** 3));
}

// Home screen hint next to a live streak; null when the streak is 0 (nothing to say).
export function streakStatus(p, today) {
  if (currentStreak(p, today) <= 0) return null;
  return p.lastDay >= today ? 'Mára megvan ✓' : '⏳ Ma még nincs lecke';
}
