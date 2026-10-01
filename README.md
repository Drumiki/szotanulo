# Szotanulo

A small Duolingo-style vocabulary trainer prototype (Hungarian UI, English words). Vanilla ES modules, no build step, no external dependencies, all progress stays in the browser (`localStorage`).

## Run

```bash
python3 -m http.server 3003
# open http://localhost:3003
```

## Test

```bash
node --test
```

## What it does

- 10-question lessons with several task types, 3 lives, XP and a daily streak
- daily goal (100 / 200 / 300 XP, default 200)
- words missed even after the retry round come back in the next lesson (at most 3)
- lesson summary with accuracy, bonus XP and the remaining XP to the daily goal
- keyboard and screen-reader friendly (visible keyboard focus, live regions, reduced-motion respected)

## Status

Prototype. Not tested on a real phone, Safari/Firefox, a screen reader or with real speech output. The word list is a small hand-written set (about 30 words) and the Hungarian translations were only checked by the QA agent, not by a human.
