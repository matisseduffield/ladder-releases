// Overland's pure logic: routes across the map, a game's progress and the shareable
// result. No DOM and no app state, so the same file runs in the page, in
// scripts/build-overland.mjs and under `node --test`.
//
// A game is two countries and a number of guesses. A guess is a country code. The
// game is won when the guessed countries join the two ends by land.
(function (root) {
  const PRACTICE = { length: [4, 5], spare: 3 };

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Days count in the player's own calendar, so a new puzzle arrives at their
  // midnight. Day 1 is the epoch.
  function dayNumber(date, epoch) {
    const [y, m, d] = epoch.split('-').map(Number);
    return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(y, m - 1, d)) / 864e5) + 1;
  }
  function weekdayOf(day, epoch) {
    const [y, m, d] = epoch.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + day - 1)).getUTCDay();
  }

  // Steps from `from` to every country it can reach by land, through `open` ones.
  function steps(map, from, open = () => true) {
    const seen = new Map([[from, 0]]);
    const queue = [from];
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i];
      for (const n of map.countries[c].borders) {
        if (seen.has(n) || !open(n)) continue;
        seen.set(n, seen.get(c) + 1);
        queue.push(n);
      }
    }
    return seen;
  }

  // A shortest way, both ends included, or [] if there's none. Ties go by code, so
  // it's always the same one.
  function route(map, a, b, open = () => true) {
    const back = steps(map, b, open);
    if (!back.has(a)) return [];
    const way = [a];
    while (way[way.length - 1] !== b) {
      const here = way[way.length - 1];
      way.push(map.countries[here].borders.find(n => back.get(n) === back.get(here) - 1));
    }
    return way;
  }

  // Every country on any shortest way, with the ends.
  function onBest(map, a, b) {
    const from = steps(map, a), to = steps(map, b);
    if (!from.has(b)) return new Set();
    const total = from.get(b);
    return new Set([...from.keys()].filter(c => to.has(c) && from.get(c) + to.get(c) === total));
  }

  function countRoutes(map, a, b) {
    const to = steps(map, b);
    const memo = new Map([[b, 1]]);
    const count = c => {
      if (memo.has(c)) return memo.get(c);
      const n = map.countries[c].borders.filter(x => to.get(x) === to.get(c) - 1).reduce((s, x) => s + count(x), 0);
      memo.set(c, n);
      return n;
    };
    return to.has(a) ? count(a) : 0;
  }

  // Accents, spaces and hyphens don't matter to a thumb.
  const squash = text => text.normalize('NFD').replace(/[^\p{L}]/gu, '').toLowerCase();

  // Names to match against, built once per map: the whole name, the other names,
  // and the name from each later word on, so "afr" finds South Africa.
  const indexes = new WeakMap();
  function index(map) {
    if (indexes.has(map)) return indexes.get(map);
    const list = Object.entries(map.countries).map(([code, c]) => {
      const words = c.name.split(/[\s-]+/);
      return { code, whole: squash(c.name), later: words.slice(1).map((_, i) => squash(words.slice(i + 1).join(''))), also: c.also.map(squash) };
    });
    indexes.set(map, list);
    return list;
  }

  // Edits (a letter changed, added, dropped or two swapped) between a and b.
  function edits(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[a.length][b.length];
  }
  // A misspelling of how a name starts: "columb" for Colombia, "kazakst" for Kazakhstan.
  const near = (q, name) => {
    const allowed = q.length >= 7 ? 2 : 1;
    for (let n = q.length - allowed; n <= q.length + allowed; n++) if (n > 0 && edits(q, name.slice(0, n)) <= allowed) return true;
    return false;
  };

  // Countries a typed text could be, best first: the name itself, how a name
  // starts, how a later word starts, then anywhere in a name ("stan" finds every
  // -stan), then a near miss once nothing else matches.
  function search(map, typed, limit = 12) {
    const q = squash(typed);
    if (q.length < 2) return [];
    const rank = e => {
      if (e.whole === q || e.also.includes(q)) return 0;
      if (e.whole.startsWith(q)) return 1;
      if (e.also.some(a => a.startsWith(q))) return 2;
      if (e.later.some(w => w.startsWith(q))) return 3;
      if (q.length >= 3 && e.whole.includes(q)) return 4;
      if (q.length >= 3 && e.also.some(a => a.includes(q))) return 5;
      return 9;
    };
    const found = index(map).map(e => [rank(e), e]).filter(([r]) => r < 9);
    if (!found.length && q.length >= 4) {
      for (const e of index(map)) if ([e.whole, ...e.also, ...e.later].some(name => near(q, name))) found.push([6, e]);
    }
    return found
      .sort(([a, x], [b, y]) => a - b || map.countries[x.code].name.localeCompare(map.countries[y.code].name))
      .slice(0, limit).map(([, e]) => e.code);
  }

  function game(map, start, end, spare) {
    const best = route(map, start, end).length - 2;
    return { start, end, best, spare, limit: best + spare };
  }

  // The list goes round at its end, and it's a whole number of weeks long, so a day
  // stays on its weekday. A clock set before the epoch still gets a puzzle.
  function daily(day, data, map) {
    const n = data.days.length;
    const at = (((day - 1) % n) + n) % n;
    const [start, end, spare] = data.days[at].split(' ');
    return game(map, start, end, Number(spare));
  }

  // Practice: any two countries the right distance apart.
  function practice(seed, map) {
    const random = rng(seed);
    const pool = Object.keys(map.countries).filter(c => map.countries[c].borders.length && map.countries[c].area >= 10000);
    for (;;) {
      const a = pool[Math.floor(random() * pool.length)], b = pool[Math.floor(random() * pool.length)];
      const length = route(map, a, b).length - 2;
      if (length >= PRACTICE.length[0] && length <= PRACTICE.length[1]) return game(map, a, b, PRACTICE.spare);
    }
  }

  // Where a game stands. `joined` is every guess now linked by land to either end;
  // the rest are out on their own for now.
  function replay(map, puzzle, guesses) {
    const have = new Set([puzzle.start, puzzle.end, ...guesses]);
    const open = c => have.has(c);
    const fromStart = steps(map, puzzle.start, open), fromEnd = steps(map, puzzle.end, open);
    const won = fromStart.has(puzzle.end);
    const used = guesses.length;
    return {
      used, won,
      over: won || used >= puzzle.limit,
      left: puzzle.limit - used,
      joined: new Set(guesses.filter(g => fromStart.has(g) || fromEnd.has(g))),
    };
  }

  // Keeps only guesses that make sense, so a damaged save can't break a game.
  function cleanGuesses(map, puzzle, guesses) {
    const out = [];
    for (const g of Array.isArray(guesses) ? guesses : []) {
      if (replay(map, puzzle, out).over) break;
      if (!map.countries[g] || g === puzzle.start || g === puzzle.end || out.includes(g)) continue;
      out.push(g);
    }
    return out;
  }

  // Days won in a row, up to today (or yesterday, if today isn't done yet).
  function streak(wonDays, today) {
    const won = new Set(wonDays);
    let day = won.has(today) ? today : today - 1;
    let n = 0;
    while (won.has(day)) { n++; day--; }
    return n;
  }

  function bestStreak(wonDays) {
    const days = [...new Set(wonDays)].sort((a, b) => a - b);
    let best = 0, run = 0;
    days.forEach((d, i) => { run = i && d === days[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run); });
    return best;
  }

  const guessesText = n => (n === 1 ? '1 guess' : `${n} guesses`);
  const scoreText = (puzzle, s) => (s.won ? `${guessesText(s.used)}, best ${puzzle.best}` : `Lost, best ${puzzle.best}`);

  // A mark per guess: filled if it lies on a best route. No country names.
  function shareText(day, map, puzzle, guesses) {
    const s = replay(map, puzzle, guesses);
    const best = onBest(map, puzzle.start, puzzle.end);
    const head = day ? `Overland ${day}` : 'Overland practice';
    return `${head} · ${scoreText(puzzle, s)}\n${guesses.map(g => (best.has(g) ? '■' : '□')).join('')}`;
  }

  const lib = { PRACTICE, rng, dayNumber, weekdayOf, steps, route, onBest, countRoutes, squash, search, game, daily, practice, replay, cleanGuesses, streak, bestStreak, guessesText, scoreText, shareText };
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.OverlandLib = lib;
})(this);
