import { WORDS } from './words.js';
import { createLesson, answer, advance, accuracy, progress, weakWords, LIVES } from './engine.js';
import { endMessage, carryWords, practiceTitle, goalLeftText, countValue, streakStatus, streakDoneText, bonusText, lessonLabel } from './summary.js';
import { load, save, localDay, currentStreak, recordLesson, dayXp, goalReached, setGoal, goalText, mergeWeak } from './state.js';

const $ = (id) => document.getElementById(id);
const screens = ['home', 'lesson', 'end'];
const show = (name) => screens.forEach((s) => { $('screen-' + s).hidden = s !== name; });

let progressState = load();
let lesson = null;
let xpFrame = 0;
let finishedAt = 0;   // when the end screen appeared: a double tap on "Új lecke" right after must not start a lesson
let selected = null;   // the option chosen but not yet checked

// daily goal bar + "X/Y XP" text; extra = XP of the lesson in progress (not saved yet)
function renderGoal(fill, bar, text, earned) {
  const goal = progressState.goal, pct = Math.min(100, Math.round((earned / goal) * 100));
  fill.style.width = pct + '%';
  bar.setAttribute('aria-valuenow', pct);
  text.textContent = goalText(earned, goal);
}

let homeDay = null;    // the day the home screen was last drawn for
let lessonDay = null;  // the day the running lesson STARTED: it counts for streak and goals, even past midnight

// numbers only: safe to call on a timer, does not switch screens or move focus
function renderHomeData() {
  const today = localDay();
  homeDay = today;
  $('home-streak').textContent = currentStreak(progressState, today);
  const status = streakStatus(progressState, today);
  $('home-streak-status').hidden = !status;
  $('home-streak-status').textContent = status ?? '';
  $('home-xp').textContent = progressState.xp;
  $('goal').value = String(progressState.goal);
  renderGoal($('goal-fill'), $('goal-bar'), $('goal-text'), dayXp(progressState, today));
}

function renderHome() {
  renderHomeData();
  show('home');
  $('start').focus();
}

// a page left open over midnight must not show yesterday's streak and goal
function refreshHomeIfStale() {
  if (!$('screen-home').hidden && homeDay !== localDay()) renderHomeData();
}

// speech: needs speechSynthesis and an English voice. Voices load asynchronously in some browsers.
function englishVoice() {
  try { return speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('en')) || null; } catch { return null; }
}
function checkSpeech() {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve(false);
    if (englishVoice()) return resolve(true);
    const done = () => resolve(!!englishVoice());
    try { speechSynthesis.addEventListener('voiceschanged', done, { once: true }); } catch { return resolve(false); }
    setTimeout(done, 600);
  });
}
function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    const v = englishVoice();
    if (v) u.voice = v;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch { /* the button stays; the options are still answerable only with sound, so we tell the user */
    $('note').hidden = false; $('note').textContent = 'A hang nem szólalt meg ezen az eszközön.';
  }
}

let starting = false;  // a start is in flight (checkSpeech can take ~600 ms): a second click must not start another
async function startLesson() {
  if (starting) return;
  starting = true;
  try {
    lessonDay = localDay();
    const from = screens.find((s) => !$('screen-' + s).hidden);
    const canSpeak = await checkSpeech();
    // the user went to another screen while we waited (e.g. Főoldal): do not pull them back into a lesson
    if (from && $('screen-' + from).hidden) return;
    lesson = createLesson(WORDS, { seed: (Math.random() * 1e9) | 0, canSpeak, include: progressState.weak });
    closeQuit();
    show('lesson');
    renderTask();
  } finally { starting = false; }
}

const TITLES = {
  picture: 'Melyik angol szó illik a képhez?',
  choice: 'Mit jelent ez a szó?',
  listen: 'Hallgasd meg, és válaszd ki a magyar jelentését',
  type: 'Írd le magyarul',
};

function renderTask() {
  const task = lesson.tasks[lesson.index];
  selected = null;
  $('task').dataset.type = task.type;
  $('task-title').textContent = task.retry ? 'Újra, mert elsőre nem sikerült: írd le magyarul' : TITLES[task.type];
  const visual = $('task-visual');
  visual.textContent = '';
  visual.className = 'visual';
  if (task.type === 'picture') visual.textContent = task.emoji;
  if (task.type === 'choice' || task.type === 'type') {
    visual.className = 'word-big'; visual.textContent = task.prompt;
    visual.removeAttribute('aria-hidden');
  } else visual.setAttribute('aria-hidden', 'true');

  $('speak').hidden = task.type !== 'listen';
  const optsBox = $('options');
  optsBox.textContent = '';
  optsBox.hidden = !task.options;
  for (const [i, text] of (task.options || []).entries()) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'opt'; b.textContent = text; b.dataset.key = i + 1;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => select(b, text));
    optsBox.append(b);
  }
  const form = $('type-form'), input = $('type-input');
  form.hidden = task.type !== 'type';
  input.value = ''; input.disabled = false; input.className = '';

  $('note').hidden = !(lesson.index === 0 && lesson.notes.includes('no-speech')); // said once, at the first task
  if (!$('note').hidden) $('note').textContent = 'Ezen az eszközön nincs angol hang, ezért a hallgatós feladatok szöveges kérdésre cseréltük.';

  setBar('idle', '', 'Ellenőrzés', task.type === 'type' ? false : true);
  renderHud();
  if (task.type === 'type') input.focus();
  else if (task.type === 'listen') { $('speak').focus(); speak(task.speak); }
  else $('task-title').focus();  // picture/choice: the new question is announced, focus does not fall back to the body
}

function setBar(state, text, label, disabled) {
  $('bar').dataset.state = state;
  $('feedback').textContent = text;
  $('check').textContent = label;
  $('check').disabled = disabled;
}

function renderHud() {
  $('lives').textContent = lesson.lives;
  $('xp').textContent = lesson.xp;
  const pct = Math.round(progress(lesson) * 100);
  $('progress-fill').style.width = pct + '%';
  $('progress').setAttribute('aria-valuenow', pct);
  $('progress-label').textContent = lessonLabel(lesson);
}

function select(btn, text) {
  if (!$('quit-confirm').hidden) return;
  if (lesson.current) return;
  selected = text;
  for (const b of $('options').children) b.setAttribute('aria-pressed', String(b === btn));
  $('check').disabled = false;
}

function check() {
  if (!$('quit-confirm').hidden) return;
  if (lesson.current) { next(); return; }
  const task = lesson.tasks[lesson.index];
  const response = task.type === 'type' ? $('type-input').value : selected;
  if (response == null || (task.type === 'type' && !response.trim())) return;
  lesson = answer(lesson, response);
  const r = lesson.current;
  // visual state: colour + icon + text, never colour alone
  if (task.options) {
    for (const b of $('options').children) {
      b.disabled = true;
      if (b.textContent === task.answer) b.classList.add('right');
      else if (b.textContent === response) b.classList.add('wrong');
    }
  } else {
    $('type-input').disabled = true;
    $('type-input').className = r.ok ? 'right' : 'wrong';
  }
  setBar(r.ok ? 'right' : 'wrong',
    r.ok ? '✅ Helyes! +10 XP' : `❌ Nem egészen. A helyes válasz: ${r.correctAnswer}`,
    'Tovább', false);
  renderHud();
  $('check').focus();
}

function next() {
  lesson = advance(lesson);
  if (lesson.status === 'active') renderTask();
  else finish();
}

// counts the XP number up to the final value; reduced motion (or no rAF) sets it at once
function animateXp(el, target) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  cancelAnimationFrame(xpFrame);
  if (reduce || target <= 0) { el.textContent = target; return; }
  const t0 = performance.now(), MS = 900;
  const step = (now) => {
    const t = (now - t0) / MS;
    el.textContent = countValue(target, t);
    if (t < 1) xpFrame = requestAnimationFrame(step);
  };
  el.textContent = 0;
  xpFrame = requestAnimationFrame(step);
}

function finish() {
  const done = lesson.status === 'done';
  const today = lessonDay;
  const weak = weakWords(lesson);
  let saved = true, reached = false;
  const before = progressState;
  if (done) {
    progressState = recordLesson(before, lesson.xp, today);
    reached = goalReached(before, progressState, today);
  }
  // the weak list is saved after a game over too (xp, streak and lessons stay as they were)
  progressState = { ...progressState, weak: mergeWeak(before.weak, lesson.included, weak, !done) };
  saved = save(progressState);
  // a failed save must be visible: the progress lives only until the page is closed
  $('end-save').hidden = saved;
  $('end-goal').hidden = !reached;
  $('end-goal-row').hidden = !done; // after a game over there is no bar from the previous lesson
  if (done) renderGoal($('end-goal-fill'), $('end-goal-bar'), $('end-goal-text'), dayXp(progressState, today));
  $('end-title').textContent = done ? 'Lecke kész! 🎉' : 'Elfogyott az életed 💔';
  $('end-text').textContent = endMessage(lesson);
  const gained = done ? lesson.xp : 0;
  $('end-xp-box').hidden = !done;
  $('end-xp-sr').textContent = `${gained} XP szerzett`;
  animateXp($('end-xp'), gained);
  if (done) {
    $('end-streak').textContent = streakDoneText(currentStreak(progressState, today));
    $('end-goal-left').textContent = goalLeftText(dayXp(progressState, today), progressState.goal);
  }
  const bonus = bonusText(lesson);
  const rows = [['Pontosság', accuracy(lesson) + '%'],
    ['Helyes válasz', `${lesson.correct}/${lesson.answered}`], ['Megmaradt élet', `${Math.max(0, lesson.lives)}/${LIVES}`],
    ['Bónusz XP', bonus.value, bonus.note]];
  const dl = $('end-stats');
  dl.textContent = '';
  for (const [k, v, note] of rows) {
    const d = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = k; dd.textContent = v;
    if (note) { const s = document.createElement('small'); s.textContent = note; dd.append(s); }
    d.append(dt, dd); dl.append(d);
  }
  // exactly what the next lesson brings back (max 3, newest), from the list just saved
  const words = carryWords(progressState.weak, WORDS), list = $('practice-list');
  list.textContent = '';
  for (const w of words) {
    const li = document.createElement('li'), en = document.createElement('strong');
    en.textContent = w.en; li.append(en, ` – ${w.hu}`); list.append(li);
  }
  // no weak words: after a game over there is nothing to show; after a lesson only a flawless one gets the badge
  const perfect = done && lesson.missed.length === 0 && words.length === 0;
  $('practice').hidden = words.length === 0 && !perfect;
  $('practice-perfect').hidden = !perfect;
  $('practice-note').hidden = words.length === 0;
  $('practice-title').hidden = words.length === 0;
  $('practice-title').textContent = practiceTitle(lesson, progressState.weak, WORDS);
  $('again').textContent = done ? 'Új lecke' : 'Újrakezdés';
  show('end');
  $('again').focus();
  finishedAt = performance.now();
}

// quit (X): asks first, but only when there is something to lose
function openQuit() {
  if (!lesson || lesson.answered === 0) { renderHome(); return; }
  $('quit-confirm').hidden = false;
  for (const id of ['task', 'bar', 'quit']) $(id).inert = true;
  $('quit-stay').focus();
}
function closeQuit() {
  $('quit-confirm').hidden = true;
  for (const id of ['task', 'bar', 'quit']) $(id).inert = false;
}
function stayInLesson() {
  closeQuit();
  $('quit').focus();
}

// last input modality: a script-focused title must not draw a focus ring after a tap/click, but must after a key
addEventListener('pointerdown', () => document.body.classList.add('pointer'), true);
addEventListener('keydown', () => document.body.classList.remove('pointer'), true);

$('start').addEventListener('click', startLesson);
$('again').addEventListener('click', () => { if (performance.now() - finishedAt >= 700) startLesson(); });
$('goal').addEventListener('change', () => {
  progressState = setGoal(progressState, Number($('goal').value));
  $('goal-save').hidden = save(progressState);
  renderGoal($('goal-fill'), $('goal-bar'), $('goal-text'), dayXp(progressState, localDay()));
});
$('home').addEventListener('click', () => { cancelAnimationFrame(xpFrame); renderHome(); });
$('quit').addEventListener('click', openQuit);
$('quit-stay').addEventListener('click', stayInLesson);
$('quit-leave').addEventListener('click', () => { closeQuit(); renderHome(); });
$('speak').addEventListener('click', () => speak(lesson.tasks[lesson.index].speak));
$('check').addEventListener('click', check);
$('type-form').addEventListener('submit', (e) => { e.preventDefault(); check(); });
addEventListener('keydown', (e) => {
  if ($('screen-lesson').hidden) return;
  if (!$('quit-confirm').hidden) { if (e.key === 'Escape') stayInLesson(); return; }
  if (e.key === 'Enter' && lesson?.current && document.activeElement !== $('check')) { e.preventDefault(); next(); return; }
  if (!lesson?.current && /^[1-4]$/.test(e.key) && document.activeElement !== $('type-input')) {
    $('options').children[Number(e.key) - 1]?.click();
  }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshHomeIfStale(); });
addEventListener('focus', refreshHomeIfStale);
setInterval(refreshHomeIfStale, 60000);
renderHome();
