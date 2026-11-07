// Cluey's pure logic: reading a puzzle, moving round the grid, typing, checking,
// streaks and the shareable result. No DOM and no app state, so the same file
// runs in the page, in scripts/build-cluey.mjs and under `node --test`.
(function (root) {
  const CHECKS = 3;     // Check word, per puzzle
  const REVEALS = 3;    // Reveal letter, per puzzle
  const BLOCK = '#';

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

  // A puzzle ready to play. `answer` is the letters cell by cell (# for a
  // block), `entries` the answers in clue order with their cell indexes, and
  // `of[cell]` the across and down entry through each cell.
  function parse(raw) {
    const [grid, ...clues] = raw;
    const rows = grid.split('/');
    const size = rows.length;
    const answer = rows.join('');
    const isOpen = (r, c) => r >= 0 && c >= 0 && r < size && c < size && rows[r][c] !== BLOCK;
    const numbers = new Array(size * size).fill(0);
    const across = [], down = [];
    let n = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!isOpen(r, c)) continue;
        const startsAcross = !isOpen(r, c - 1), startsDown = !isOpen(r - 1, c);
        if (!startsAcross && !startsDown) continue;
        numbers[r * size + c] = ++n;
        const walk = (dr, dc) => {
          const cells = [];
          for (let a = r, b = c; isOpen(a, b); a += dr, b += dc) cells.push(a * size + b);
          return cells;
        };
        if (startsAcross) across.push({ number: n, across: true, cells: walk(0, 1) });
        if (startsDown) down.push({ number: n, across: false, cells: walk(1, 0) });
      }
    }
    const entries = [...across, ...down];
    entries.forEach((e, i) => {
      e.index = i;
      e.level = Number(clues[i][0]);
      e.tag = clues[i][1];
      e.clue = clues[i].slice(2);
      e.word = e.cells.map(c => answer[c]).join('');
    });
    const of = answer.split('').map(() => [-1, -1]);
    for (const e of entries) for (const c of e.cells) of[c][e.across ? 0 : 1] = e.index;
    return { size, answer, numbers, entries, of, cells: [...answer].flatMap((ch, i) => (ch === BLOCK ? [] : [i])) };
  }

  // Each day takes the next puzzle, going round again at the end of the list.
  // A clock set before the epoch still gets one.
  const rawFor = (day, data) => { const n = data.puzzles.length; return data.puzzles[(((day - 1) % n) + n) % n]; };
  const daily = (day, data) => parse(rawFor(day, data));

  const blank = p => p.answer.replace(/[^#]/g, ' ');
  const entryAt = (p, cell, across) => p.entries[p.of[cell][across ? 0 : 1]];
  const label = e => `${e.number}${e.across ? 'A' : 'D'}`;

  // A game: `fill` is the player's letters (space for empty, # for a block) and
  // `marks` what help has said about a cell: 'r' revealed, 'c' checked right,
  // 'x' checked wrong, or a space. A revealed or checked-right letter is locked.
  const locked = (marks, cell) => marks[cell] === 'r' || marks[cell] === 'c';
  const setAt = (s, i, ch) => s.slice(0, i) + ch + s.slice(i + 1);

  const wordFull = (p, fill, e) => e.cells.every(c => fill[c] !== ' ');
  const isFull = fill => !fill.includes(' ');
  const isRight = (p, fill) => fill === p.answer;

  // The next entry with a gap, going round from `from` in steps of `dir`.
  function nextGap(p, fill, from, dir = 1) {
    const n = p.entries.length;
    for (let k = 1; k <= n; k++) {
      const e = p.entries[(((from + k * dir) % n) + n) % n];
      if (!wordFull(p, fill, e)) return e;
    }
    return null;
  }
  const firstGap = (fill, e) => e.cells.find(c => fill[c] === ' ');

  // The next or previous clue, in order, finished or not, so an answer can be
  // read again. The cursor lands on its first gap, if it has one.
  function stepClue(p, fill, index, dir) {
    const n = p.entries.length;
    const e = p.entries[(((index + dir) % n) + n) % n];
    const gap = firstGap(fill, e);
    return { cell: gap === undefined ? e.cells[0] : gap, across: e.across };
  }

  // After a letter goes in. Typing into a gap goes to the next gap in the word,
  // then on to the next unfinished clue. Typing over a letter is a correction,
  // so it only moves on one cell, past anything locked.
  function afterType(p, fill, marks, cell, across, wasEmpty) {
    const e = entryAt(p, cell, across);
    const at = e.cells.indexOf(cell);
    if (!wasEmpty) {
      for (let i = at + 1; i < e.cells.length; i++) {
        if (!locked(marks, e.cells[i])) return { cell: e.cells[i], across };
      }
      return { cell, across };
    }
    const ahead = e.cells.slice(at + 1).find(c => fill[c] === ' ');
    if (ahead !== undefined) return { cell: ahead, across };
    const gap = firstGap(fill, e);
    if (gap !== undefined) return { cell: gap, across };
    const next = nextGap(p, fill, e.index);
    return next ? { cell: firstGap(fill, next), across: next.across } : { cell, across };
  }

  // Type a letter at the cursor. A locked cell passes the letter on to the next
  // one that can take it, or does nothing.
  function type(p, game, letter) {
    let { fill } = game;
    const { marks, across } = game;
    let { cell } = game;
    if (locked(marks, cell)) {
      const e = entryAt(p, cell, across);
      const open = e.cells.slice(e.cells.indexOf(cell) + 1).find(c => !locked(marks, c));
      if (open === undefined) return game;
      cell = open;
    }
    const wasEmpty = fill[cell] === ' ';
    fill = setAt(fill, cell, letter);
    const after = afterType(p, fill, marks, cell, across, wasEmpty);
    return { ...game, fill, marks: marks[cell] === 'x' ? setAt(marks, cell, ' ') : marks, ...after };
  }

  // Backspace: a letter here goes. An empty cell steps back and takes that
  // letter out; at the start of a word it steps to the end of the previous
  // clue and stops, so a word already done isn't eaten by accident.
  function erase(p, game) {
    const { fill, marks, across, cell } = game;
    const clear = (at, g) => ({ ...g, fill: setAt(g.fill, at, ' '), marks: marks[at] === 'x' ? setAt(marks, at, ' ') : marks });
    if (fill[cell] !== ' ' && !locked(marks, cell)) return clear(cell, game);
    const e = entryAt(p, cell, across);
    for (let i = e.cells.indexOf(cell) - 1; i >= 0; i--) {
      const c = e.cells[i];
      if (!locked(marks, c)) return clear(c, { ...game, cell: c });
    }
    const n = p.entries.length;
    const prev = p.entries[(e.index - 1 + n) % n];
    return { ...game, cell: prev.cells[prev.cells.length - 1], across: prev.across };
  }

  // The next open cell in a straight line, or the same cell at the edge.
  function arrow(p, cell, dr, dc) {
    const n = p.size;
    let r = Math.floor(cell / n) + dr, c = cell % n + dc;
    while (r >= 0 && c >= 0 && r < n && c < n) {
      if (p.answer[r * n + c] !== BLOCK) return r * n + c;
      r += dr; c += dc;
    }
    return cell;
  }

  // Check word: marks each filled letter of a word right or wrong and leaves
  // gaps alone. Says nothing about gaps, and only counts if there's a letter
  // not already checked.
  const canCheck = (game, e) => e.cells.some(c => game.fill[c] !== ' ' && !locked(game.marks, c) && game.marks[c] !== 'x');
  function check(p, game, e) {
    let { marks } = game;
    for (const c of e.cells) {
      if (game.fill[c] === ' ' || locked(marks, c)) continue;
      marks = setAt(marks, c, game.fill[c] === p.answer[c] ? 'c' : 'x');
    }
    return { ...game, marks };
  }

  // Reveal letter: the right letter at a cell, locked.
  function reveal(p, game, cell) {
    return { ...game, fill: setAt(game.fill, cell, p.answer[cell]), marks: setAt(game.marks, cell, 'r') };
  }

  // What the result counts: every use of help, plus each time the grid was full
  // and wrong, because being told that is a check of the whole grid. A clean
  // solve has none of these.
  const clean = g => !g.checks && !g.reveals && !g.misses;
  function helpText(g) {
    const parts = [];
    if (g.checks) parts.push(`${g.checks} ${g.checks === 1 ? 'check' : 'checks'}`);
    if (g.reveals) parts.push(`${g.reveals} ${g.reveals === 1 ? 'reveal' : 'reveals'}`);
    if (g.misses) parts.push(`${g.misses} wrong ${g.misses === 1 ? 'finish' : 'finishes'}`);
    return parts.join(', ');
  }

  const clock = ms => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  };

  // Days solved in a row, up to today (or yesterday, if today isn't done yet).
  function streak(solvedDays, today) {
    const solved = new Set(solvedDays);
    let day = solved.has(today) ? today : today - 1;
    let n = 0;
    while (solved.has(day)) { n++; day--; }
    return n;
  }

  function bestStreak(solvedDays) {
    const days = [...new Set(solvedDays)].sort((a, b) => a - b);
    let best = 0, run = 0;
    days.forEach((d, i) => { run = i && d === days[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run); });
    return best;
  }

  // Gives no letters away: the size, the time and what it took.
  function shareText(day, p, g) {
    const head = `Cluey ${day} · ${p.size}×${p.size}`;
    if (g.gaveUp) return `${head} · Gave up at ${clock(g.ms)}`;
    return `${head} · ${clock(g.ms)} · ${clean(g) ? 'Clean' : helpText(g)}`;
  }

  const lib = { CHECKS, REVEALS, BLOCK, rng, dayNumber, weekdayOf, parse, rawFor, daily, blank, entryAt, label, locked, wordFull, isFull, isRight, nextGap, firstGap, stepClue, type, erase, arrow, canCheck, check, reveal, clean, helpText, clock, streak, bestStreak, shareText };
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.ClueyLib = lib;
})(this);
