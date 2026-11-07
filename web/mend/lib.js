// Mend's pure logic: the boards, marking tiles, dealing a day, streaks and the
// shareable result. No DOM and no app state, so the same file runs in the page,
// in scripts/build-mend.mjs and under `node --test`.
//
// A board of crossing words has had its letters mixed up. A swap trades two
// tiles, and every tile says how it stands. All the search (does this board have
// one solution, what's the fewest swaps) was done by the generator: this file
// only reads the answers back.
(function (root) {
  // Each board reads as a grid: X is a tile. Every run of two or more tiles is a
  // word. A board that matches itself on the diagonal could be filled the other
  // way round with the same letters, which would be two solutions, so none does.
  const BOARDS = {
    wheel:    ['....X.', 'XXXXX.', '.X..X.', '.X..X.', '.XXXXX', '.X....'],
    wheel2:   ['.X....', '.XXXXX', '.X..X.', '.X..X.', 'XXXXX.', '....X.'],
    wide:     ['.X..X.', 'XXXXXX', '.X..X.', 'XXXXXX', '.X..X.'],
    tall:     ['.X.X.', 'XXXXX', '.X.X.', '.X.X.', 'XXXXX', '.X.X.'],
    table:    ['XXXXXX', '.X..X.', '.X..X.', 'XXXXXX', '.X..X.', '.X..X.'],
    stool:    ['.X..X.', '.X..X.', 'XXXXXX', '.X..X.', '.X..X.', 'XXXXXX'],
    comb:     ['.X.X.X', 'XXXXXX', '.X.X.X', 'XXXXXX', '.X.X.X'],
    comb2:    ['X.X.X.', 'XXXXXX', 'X.X.X.', 'XXXXXX', 'X.X.X.'],
    tower:    ['.X.X.', 'XXXXX', '.X.X.', 'XXXXX', '.X.X.', 'XXXXX', '.X.X.'],
    tower2:   ['X...X', 'XXXXX', 'X...X', 'XXXXX', 'X...X', 'XXXXX', 'X...X'],
    ladder:   ['.X..X.', 'XXXXXX', '.X..X.', 'XXXXXX', '.X..X.', 'XXXXXX', '.X..X.'],
    ladder2:  ['X....X', 'XXXXXX', 'X....X', 'XXXXXX', 'X....X', 'XXXXXX', 'X....X'],
    lattice:  ['.X.X.X', 'XXXXXX', '.X.X.X', 'XXXXXX', '.X.X.X', 'XXXXXX', '.X.X.X'],
    lattice2: ['X.X.X.', 'XXXXXX', 'X.X.X.', 'XXXXXX', 'X.X.X.', 'XXXXXX', 'X.X.X.'],
  };
  // Sunday to Saturday, with the boards taking turns week by week.
  //   keep    tiles that start in place
  //   fewest  the fewest swaps that can finish, proven for every puzzle
  //   spare   swaps given on top of that, which is the most anyone can score.
  //           It stays at three, so it's the job that grows around it
  const WEEK = [
    { boards: ['lattice', 'lattice2'], keep: 3, fewest: 21, spare: 3 },
    { boards: ['wheel', 'wheel2'],     keep: 5, fewest: 9,  spare: 3 },
    { boards: ['wide', 'tall'],        keep: 5, fewest: 11, spare: 3 },
    { boards: ['table', 'stool'],      keep: 5, fewest: 12, spare: 3 },
    { boards: ['comb', 'comb2'],       keep: 4, fewest: 14, spare: 3 },
    { boards: ['tower', 'tower2'],     keep: 4, fewest: 15, spare: 3 },
    { boards: ['ladder', 'ladder2'],   keep: 3, fewest: 18, spare: 3 },
  ];

  // Tiles are numbered in reading order. A word is a list of tile numbers,
  // across words first, each read left to right or top to bottom.
  function layout(rows) {
    const at = rows.map(() => []);
    const cells = [];
    rows.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch === 'X') { at[r][c] = cells.length; cells.push([r, c]); }
    }));
    const words = [];
    const run = (line) => {
      let word = [];
      for (const tile of [...line, undefined]) {
        if (tile !== undefined) { word.push(tile); continue; }
        if (word.length > 1) words.push(word);
        word = [];
      }
    };
    const width = Math.max(...rows.map(r => r.length));
    for (let r = 0; r < rows.length; r++) run(Array.from({ length: width }, (_, c) => at[r][c]));
    for (let c = 0; c < width; c++) run(rows.map((_, r) => at[r][c]));
    const wordsOf = cells.map(() => []);
    words.forEach((word, w) => word.forEach(tile => wordsOf[tile].push(w)));
    return { rows: rows.length, cols: width, cells, words, wordsOf };
  }
  const SHAPES = {};
  for (const day of WEEK) {
    for (const name of day.boards) {
      SHAPES[name] = { name, keep: day.keep, fewest: day.fewest, spare: day.spare, swaps: day.fewest + day.spare, ...layout(BOARDS[name]) };
    }
  }

  // Marks for every tile of a board against the answer, by tile number:
  //
  //   hit   the tile is in its place
  //   near  a word this tile is part of still needs this letter somewhere else
  //   miss  neither
  //
  // Repeated letters: a word lights only as many tiles of a letter as it still
  // has places for that letter. Two Es in a row that wants one more E: one
  // yellow, one grey, as in Hunch. A green E has its place already and asks for
  // nothing, so it doesn't count.
  //
  // Crossings: a tile on a crossing is in two words, and either can light it,
  // so a yellow crossing tile might belong to either. It stands for one missing
  // letter, never two. A row wanting an E and a column wanting an E, crossing at
  // the only E about, light that tile once, and if a second E turns up in the
  // row it lights too, because the two wants are now shared out.
  //
  // That sharing out is a matching of tiles to the places words still have, as
  // large as it can be, so this always holds and is what makes grey safe to
  // trust: a grey tile means every word through it already has all of that
  // letter it needs shown by other tiles, each standing for one place. A letter
  // can't be grey in a word that is still short of it. Which of two equal tiles
  // lights is settled the same way each time: tiles in one word go before tiles
  // on a crossing, because their colour can only mean that word, then reading
  // order.
  function marks(shape, board, answer) {
    const out = board.map((letter, i) => (letter === answer[i] ? 'hit' : 'miss'));
    const places = new Map();   // word and letter -> how many it still needs
    shape.words.forEach((word, w) => {
      for (const i of word) {
        if (out[i] === 'hit') continue;
        const key = w + answer[i];
        places.set(key, (places.get(key) || 0) + 1);
      }
    });
    const held = new Map();     // word and letter -> the tiles standing for it
    function seat(tile, seen) {
      for (const w of shape.wordsOf[tile]) {
        const key = w + board[tile];
        if (!places.get(key) || seen.has(key)) continue;
        seen.add(key);
        const list = held.get(key) || [];
        held.set(key, list);
        if (list.length < places.get(key)) { list.push(tile); return true; }
        for (let k = 0; k < list.length; k++) {
          if (seat(list[k], seen)) { list[k] = tile; return true; }
        }
      }
      return false;
    }
    const waiting = board.map((_, i) => i).filter(i => out[i] !== 'hit');
    for (const order of [1, 2]) {
      for (const i of waiting) {
        if (shape.wordsOf[i].length === order && seat(i, new Set())) out[i] = 'near';
      }
    }
    return out;
  }

  const solved = (board, answer) => board.every((letter, i) => letter === answer[i]);

  // A swap is refused rather than charged when it can't help: green tiles are
  // already right, and trading two of the same letter changes nothing.
  function refusal(board, answer, a, b) {
    if (a === b) return 'same';
    if (board[a] === answer[a] || board[b] === answer[b]) return 'placed';
    if (board[a] === board[b]) return 'equal';
    return null;
  }

  // Where a game stands: `tiles[i]` is the place of tile i, so the page can move
  // the same tile about. Swaps are pairs of places.
  function replay(start, swaps) {
    const board = [...start];
    const here = start.map((_, i) => i);   // which tile sits in each place
    for (const [a, b] of swaps) {
      [board[a], board[b]] = [board[b], board[a]];
      [here[a], here[b]] = [here[b], here[a]];
    }
    const tiles = [];
    here.forEach((tile, place) => { tiles[tile] = place; });
    return { board, tiles };
  }

  // Each tile's place on the answer, for sliding them home after a loss. Equal
  // letters already home stay put, so nothing moves that needn't.
  function homes(board, answer) {
    const place = Array(board.length).fill(-1);
    const free = answer.map((_, i) => i);
    board.forEach((letter, i) => {
      if (letter === answer[i]) { place[i] = i; free.splice(free.indexOf(i), 1); }
    });
    board.forEach((letter, i) => {
      if (place[i] >= 0) return;
      const at = free.findIndex(p => answer[p] === letter);
      place[i] = free[at];
      free.splice(at, 1);
    });
    return place;
  }

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

  function shuffled(list, random) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // The mixed-up board from a seed: `keep` tiles stay and the rest go round in two
  // loops. Repeated letters can undo some of this (a tile may land on its own
  // letter, and they open shorter ways round), so the builder tries seeds until
  // one proves right and stores that. This is a few microseconds' work, with no
  // searching.
  function mix(shape, answer, seed) {
    const random = rng(seed);
    const order = shuffled(answer.map((_, i) => i), random).slice(shape.keep);
    const first = 2 + Math.floor(random() * (order.length - 3));
    const sizes = [first, order.length - first];
    const board = [...answer];
    let at = 0;
    for (const size of sizes) {
      const loop = order.slice(at, at + size);
      loop.forEach((tile, i) => { board[loop[(i + 1) % size]] = answer[tile]; });
      at += size;
    }
    return board;
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

  // Puzzles sit in a list, one a day from the epoch, then some kept for Practice
  // so it never gives away a day to come. `at` is a place in that list. A week's
  // letters always come to the same length, so a puzzle is found by arithmetic.
  const shapeAt = (at, epoch) => {
    const day = WEEK[weekdayOf(at + 1, epoch)];
    return SHAPES[day.boards[Math.floor(at / 7) % day.boards.length]];
  };
  const tilesAt = (at, epoch) => shapeAt(at, epoch).cells.length;
  function lettersBefore(at, epoch) {
    let week = 0, part = 0;
    for (let i = 0; i < 7; i++) {
      const n = tilesAt(i, epoch);
      week += n;
      if (i < at % 7) part += n;
    }
    return Math.floor(at / 7) * week + part;
  }

  function puzzle(at, data) {
    const shape = shapeAt(at, data.epoch);
    const from = lettersBefore(at, data.epoch);
    const answer = [...data.letters.slice(from, from + shape.cells.length)];
    const seed = parseInt(data.seeds.slice(at * 3, at * 3 + 3), 36);
    return { at, shape, answer, start: mix(shape, answer, seed), swaps: shape.swaps };
  }

  // The list goes round at its end. It's a whole number of weeks long, so a repeat
  // lands on its own weekday, and a clock set before the epoch still gets a puzzle.
  function daily(day, data) {
    const n = data.days;
    return puzzle((((day - 1) % n) + n) % n, data);
  }

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

  // How many tiles each swap put right: 0, 1 or 2. A swap can't take away, since
  // green tiles can't be moved.
  function gains(start, answer, swaps) {
    const board = [...start];
    return swaps.map(([a, b]) => {
      [board[a], board[b]] = [board[b], board[a]];
      return (board[a] === answer[a]) + (board[b] === answer[b]);
    });
  }

  // A mark for each swap by how much it put right, which shows how it went and
  // gives no letter away.
  function shareText(day, start, answer, swaps, allowed, { won, gaveUp }) {
    const head = day ? `Mend ${day}` : 'Mend practice';
    const left = allowed - swaps.length;
    const line = gaveUp ? 'Gave up' : won ? `${left} of ${allowed} swaps left` : 'Out of swaps';
    const marksOf = gains(start, answer, swaps).map(n => ['□', '▣', '■'][n]);
    const rows = [];
    for (let i = 0; i < marksOf.length; i += 12) rows.push(marksOf.slice(i, i + 12).join(''));
    return [`${head} · ${line}`, ...rows].join('\n');
  }

  const lib = { BOARDS, WEEK, SHAPES, layout, marks, solved, refusal, replay, homes, rng, shuffled, mix, dayNumber, weekdayOf, shapeAt, puzzle, daily, streak, bestStreak, gains, shareText };
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.MendLib = lib;
})(this);
