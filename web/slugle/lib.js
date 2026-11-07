// Slugle's pure logic: the word graph, the daily puzzle, par, hints and the
// shareable result. No DOM and no app state, so the same file runs in the
// page and under `node --test`.
//
// A ladder climbs from one word to another by changing one letter at a time,
// and every rung has to be a word. Par is the fewest changes possible using
// everyday words; any word in the bigger list is allowed along the way.
(function (root) {
  const LEN = 4;
  const split = s => { const out = []; for (let i = 0; i < s.length; i += LEN) out.push(s.slice(i, i + LEN)); return out; };

  // `known` words make up par and solutions; `extra` ones are allowed too.
  function dictionary(data) {
    const known = new Set(split(data.known));
    const all = new Set(known);
    for (const w of split(data.extra)) all.add(w);
    return { known, all, common: new Set(split(data.ends)) };
  }

  function neighbours(word, set) {
    const out = [];
    for (let i = 0; i < word.length; i++) {
      for (let c = 97; c < 123; c++) {
        const ch = String.fromCharCode(c);
        if (ch === word[i]) continue;
        const w = word.slice(0, i) + ch + word.slice(i + 1);
        if (set.has(w)) out.push(w);
      }
    }
    return out;
  }

  const oneApart = (a, b) => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
    return diff === 1;
  };
  const changedAt = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i; return -1; };

  // Breadth-first: how far every word is from `from`.
  function distances(from, set) {
    const dist = new Map([[from, 0]]);
    const queue = [from];
    for (let i = 0; i < queue.length; i++) {
      const d = dist.get(queue[i]) + 1;
      for (const n of neighbours(queue[i], set)) if (!dist.has(n)) { dist.set(n, d); queue.push(n); }
    }
    return dist;
  }

  // The ladder to show a player: as short as any, and of those the one with
  // the most everyday words. Through known words if it can be, else any. The
  // ends needn't be in the lists: a player's own rung may not be.
  function way(a, b, dict) {
    for (const words of [dict.known, dict.all]) {
      const set = new Set([...words, a, b]);
      const dist = distances(b, set);
      if (!dist.has(a)) continue;
      const best = new Map([[b, { score: 0, path: [b] }]]);
      const walk = w => {
        if (best.has(w)) return best.get(w);
        let top = null;
        for (const n of neighbours(w, set)) {
          if (dist.get(n) !== dist.get(w) - 1) continue;
          const next = walk(n), score = next.score + (dict.common.has(n) ? 1 : 0);
          if (!top || score > top.score) top = { score, path: [w, ...next.path] };
        }
        best.set(w, top);
        return top;
      };
      return walk(a).path;
    }
    return null;
  }

  // The next rung from `word` towards `target`, for hints.
  function nextStep(word, target, dict) {
    const path = way(word, target, dict);
    return path && path.length > 1 ? path[1] : null;
  }

  // Seeded randomness, so a practice ladder can be the same on every device.
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

  // A pair `par` apart that ends on `target`.
  function towards(target, starts, dict, par, random) {
    const dist = distances(target, dict.known);
    const from = starts.filter(w => dist.get(w) === par);
    return from.length ? { start: from[Math.floor(random() * from.length)], target, par } : null;
  }

  // Days count in the player's own calendar, so a new puzzle arrives at
  // their midnight. Day 1 is the epoch.
  function dayNumber(date, epoch) {
    const [y, m, d] = epoch.split('-').map(Number);
    return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(y, m - 1, d)) / 864e5) + 1;
  }
  // Monday is gentle and Sunday is long. 0 = Sunday, as Date.getDay().
  const PAR_BY_WEEKDAY = [8, 5, 5, 6, 6, 7, 7];
  const parForDay = (day, epoch) => {
    const [y, m, d] = epoch.split('-').map(Number);
    return PAR_BY_WEEKDAY[new Date(Date.UTC(y, m - 1, d + day - 1)).getUTCDay()];
  };

  // The day's puzzle comes from a fixed list, so it stays the same for
  // everyone even after the word lists change. Every day on it is exactly
  // its weekday's par apart (the tests check), so nothing needs searching.
  // Past the list's end it's made from the day number instead.
  function daily(day, data, dict) {
    const pairs = data.days;
    const at = (day - 1) * LEN * 2;
    if (day >= 1 && at + LEN * 2 <= pairs.length) {
      const start = pairs.slice(at, at + LEN), target = pairs.slice(at + LEN, at + LEN * 2);
      return { day, start, target, par: parForDay(day, data.epoch) };
    }
    return { day, ...towards(data.goal, split(data.starts), dict, parForDay(day, data.epoch), rng(day * 2654435761)) };
  }

  // Practice comes in three lengths, as a range of par.
  const LENGTHS = { short: [4, 5], medium: [6, 7], long: [8, 9] };
  function practice(seed, data, dict, length = 'medium') {
    const random = rng(seed);
    const [lo, hi] = LENGTHS[length] || LENGTHS.medium;
    return towards(data.goal, split(data.starts), dict, lo + Math.floor(random() * (hi - lo + 1)), random);
  }

  // Days solved in a row, up to today (or yesterday, if today isn't done yet).
  function streak(solvedDays, today) {
    const solved = new Set(solvedDays);
    let day = solved.has(today) ? today : today - 1;
    let n = 0;
    while (solved.has(day)) { n++; day--; }
    return n;
  }

  // The longest run of days solved in a row, ever.
  function bestStreak(solvedDays) {
    const days = [...new Set(solvedDays)].sort((a, b) => a - b);
    let best = 0, run = 0;
    days.forEach((d, i) => { run = i && d === days[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run); });
    return best;
  }

  // A spoiler-free picture of the climb: one row per change, with the
  // letter that changed filled in.
  function shareText(puzzle, ladder, hints = 0) {
    const steps = ladder.length - 1;
    const rows = [];
    for (let i = 1; i < ladder.length; i++) {
      const at = changedAt(ladder[i - 1], ladder[i]);
      let row = '';
      for (let j = 0; j < LEN; j++) row += j === at ? '■' : '□';
      rows.push(row);
    }
    const title = puzzle.day ? `Slugle ${puzzle.day}` : 'Slugle practice';
    return `${title} · ${puzzle.start.toUpperCase()} → ${puzzle.target.toUpperCase()}\n${steps} ${steps === 1 ? 'step' : 'steps'}, par ${puzzle.par}${hints ? `, ${hints} ${hints === 1 ? 'hint' : 'hints'}` : ''}\n${rows.join('\n')}`;
  }

  const lib = { LEN, split, dictionary, neighbours, oneApart, changedAt, distances, way, nextStep, rng, towards, dayNumber, parForDay, daily, LENGTHS, practice, streak, bestStreak, shareText };
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.LadderLib = lib;
})(this);
