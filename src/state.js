// Persistent progress: total XP and the daily streak. localStorage only, always in try/catch.
const KEY = 'szotanulo.v1';
export const GOALS = Object.freeze([100, 200, 300]);   // about 1 / 2 / 3 finished lessons (a finished lesson is 110-130 XP)
export const DEFAULT_GOAL = 200;
// weak (English words to bring back in the next lesson) was added later too
// goal/dayXp/dayXpDate were added later: an old save without them still loads (defaults fill in)
export const EMPTY = Object.freeze({ xp: 0, streak: 0, lastDay: null, lessons: 0, goal: DEFAULT_GOAL, dayXp: 0, dayXpDate: null, weak: [] });

// Even reading globalThis.localStorage can throw (blocked site data), so it happens inside try.
const storageOf = (storage) => { try { return storage ?? globalThis.localStorage; } catch { return undefined; } };

export const MAX_WEAK = 20;
// not an array -> []; otherwise only strings, no duplicates, newest MAX_WEAK kept (FIFO)
export function cleanWeak(w) {
  if (!Array.isArray(w)) return [];
  return [...new Set(w.filter((x) => typeof x === 'string' && x))].slice(-MAX_WEAK);
}

// weak list after a lesson. used = weak words that were in the lesson, now = words weak after it.
// finished lesson: used words leave (the ones still wrong come back via now); game over: used stay.
// A word that is weak again moves to the END of the list (newest), where the next lesson picks from.
export function mergeWeak(prev, used, now, keepUsed) {
  const base = (keepUsed ? prev : prev.filter((w) => !used.includes(w))).filter((w) => !now.includes(w));
  return cleanWeak([...base, ...now]);
}

export function load(storage) {
  try {
    const p = JSON.parse(storageOf(storage).getItem(KEY));
    if (p && typeof p.xp === 'number' && typeof p.streak === 'number') {
      const merged = { ...EMPTY, ...p };
      if (!GOALS.includes(merged.goal)) merged.goal = DEFAULT_GOAL;
      if (typeof merged.dayXp !== 'number') merged.dayXp = 0;
      merged.weak = cleanWeak(merged.weak);
      return merged;
    }
  } catch { /* no storage, or garbage in it: start fresh */ }
  return { ...EMPTY };
}

// true if written; false means the progress is NOT saved and the caller must say so
export function save(progress, storage) {
  try { storageOf(storage).setItem(KEY, JSON.stringify(progress)); return true; } catch { return false; }
}

const pad = (n) => String(n).padStart(2, '0');
export const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function previousDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d - 1));
}

// A stored day later than "today" means the clock went back: that stored day counts as today.
const isFuture = (day, today) => day != null && day > today;

// streak that is still alive today (it breaks if yesterday was missed)
export function currentStreak(p, today) {
  return p.lastDay === today || isFuture(p.lastDay, today) || p.lastDay === previousDay(today) ? p.streak : 0;
}

// XP earned today (resets when the day changes; a future-dated entry still counts as today)
export function dayXp(p, today) {
  return p.dayXpDate != null && p.dayXpDate >= today ? p.dayXp : 0;
}

export function recordLesson(p, xpGained, today) {
  const sameDay = p.lastDay === today || isFuture(p.lastDay, today);
  const streak = sameDay ? Math.max(1, p.streak) : currentStreak(p, today) + 1;
  const keepDay = p.dayXpDate != null && p.dayXpDate >= today;
  return {
    ...p, xp: p.xp + xpGained, streak, lessons: p.lessons + 1,
    lastDay: isFuture(p.lastDay, today) ? p.lastDay : today,
    dayXp: dayXp(p, today) + xpGained,
    dayXpDate: keepDay ? p.dayXpDate : today,
  };
}

// true only for the lesson that carries today's XP over the goal, never again that day
export const goalReached = (before, after, today) => dayXp(before, today) < before.goal && dayXp(after, today) >= after.goal;

export const setGoal = (p, goal) => (GOALS.includes(goal) ? { ...p, goal } : p);

// "X/Y XP" for the goal bars: never above Y (the real XP total is shown elsewhere), a check mark once reached
export const goalText = (earned, goal) => (earned >= goal ? `${goal}/${goal} XP ✓` : `${earned}/${goal} XP`);
