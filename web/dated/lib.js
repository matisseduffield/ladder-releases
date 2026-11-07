// Dated's pure logic: finding a day's cards, placing them on the timeline,
// streaks and the shareable result. No DOM and no app state, so the same file runs
// in the page, in scripts/build-dated.mjs and under `node --test`.
//
// A game is a list of cards. The first is on the timeline to start with, and the
// rest are dealt in turn. A move is the slot a card was put in: 0 is before
// everything, and the last slot is after everything. The timeline is always in
// year order, because a wrong card slides to its true place.
(function (root) {
  const LIVES = 3;
  const PRACTICE = { cards: 10, gap: 2 };

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

  // Names in a card's text. Two cards sharing one are about the same thing, and
  // the order of "Apple is founded" and "Apple launches the iPad" is no puzzle.
  const COMMON = new Set(('First The Its His Her Their This Australia Australian Australians America American Britain British England ' +
    'English Japan Sydney Melbourne Brisbane Adelaide Perth London Paris New York World North South West East Great Royal Olympic Olympics ' +
    'Grand Prix Cup Open Prize Nobel Oscar Best Picture Summer Winter Games Day Street Park Bridge Tower House Road Station Gold Coast Big ' +
    'Man Men Woman Women Red Blue Black White Green Brown Young Old Hot Mr Dr Sir Saint Mount Lake Lady Queen King Prince Christmas Santa ' +
    'Bay River Canada Germany France Spain Italy Russia China India Sweden Switzerland Vermont Virginia Texas Kansas Ohio Illinois Florida ' +
    'California Boston Dallas Chicago Philadelphia Oklahoma Bathurst Tokyo Berlin Rome Dublin Geneva Moscow Birmingham Bendigo Coffs Harbour ' +
    'Australasian Internet Network Seven Ten Nine ABC SBS US UK BBC Disney').split(' '));
  function names(text) {
    const words = text.replace(/['’]s\b/g, '').match(/[\p{Lu}][\p{L}\p{N}-]{2,}/gu) || [];
    return [...new Set(words.filter(w => !COMMON.has(w)))];
  }
  const clash = (a, b) => a.some(n => b.includes(n));

  // A day's list of cards, as places in the bank. Two base-36 characters each.
  function unpack(text) {
    const ids = [];
    for (let i = 0; i < text.length; i += 2) ids.push(parseInt(text.slice(i, i + 2), 36));
    return ids;
  }
  const pack = ids => ids.map(id => id.toString(36).padStart(2, '0')).join('');

  const card = (id, data) => ({ id, year: data.years[id], text: data.texts[id] });

  // The list goes round at its end, and it's a whole number of weeks long, so a
  // day stays on its weekday. A clock set before the epoch still gets a puzzle.
  function daily(day, data) {
    const n = data.days.length;
    const at = (((day - 1) % n) + n) % n;
    return { cards: unpack(data.days[at]).map(id => card(id, data)) };
  }

  // Practice: dealing another game is free. Same rules as a midweek day, no two
  // cards on the same subject, and cards at least `gap` years apart.
  function practice(seed, data) {
    const random = rng(seed);
    const order = shuffled(data.years.map((_, i) => i), random);
    const cards = [], taken = [];
    for (const id of order) {
      const year = data.years[id];
      const keys = names(data.texts[id]);
      if (cards.some(c => Math.abs(c.year - year) < PRACTICE.gap) || taken.some(k => clash(k, keys))) continue;
      cards.push(card(id, data));
      taken.push(keys);
      if (cards.length === PRACTICE.cards) break;
    }
    return { cards };
  }

  // The one slot a card belongs in. Years in a game are never equal.
  function rightSlot(line, year) {
    let slot = 0;
    while (slot < line.length && line[slot].year < year) slot++;
    return slot;
  }

  // Where a game stands after its moves. `line` is the timeline, oldest first, and
  // each entry says how its card got there: 'start', 'right' or 'wrong'.
  function replay(cards, moves) {
    const line = [{ ...cards[0], mark: 'start' }];
    let lives = LIVES, placed = 0;
    const results = [];
    let played = 0;
    for (const slot of moves) {
      const next = cards[played + 1];
      if (!next || lives === 0) break;
      const at = rightSlot(line, next.year);
      const right = slot === at;
      line.splice(at, 0, { ...next, mark: right ? 'right' : 'wrong' });
      results.push(right);
      if (right) placed++; else lives--;
      played++;
    }
    const total = cards.length - 1;
    const over = lives === 0 || played === total;
    return {
      line, lives, placed, played, total, results, over,
      won: over && lives > 0,
      next: over ? null : cards[played + 1],
    };
  }

  // After the game: everything on the timeline, the cards never played included.
  function finalLine(cards, moves) {
    const { line, played } = replay(cards, moves);
    for (const c of cards.slice(played + 1)) line.splice(rightSlot(line, c.year), 0, { ...c, mark: 'unseen' });
    return line;
  }

  // Keeps only the moves that make sense, so a damaged save can't break a game.
  function cleanMoves(cards, moves) {
    const out = [];
    for (const slot of Array.isArray(moves) ? moves : []) {
      const now = replay(cards, out);
      if (now.over || !Number.isInteger(slot) || slot < 0 || slot > now.line.length) break;
      out.push(slot);
    }
    return out;
  }

  // Days finished with a life left, in a row, up to today (or yesterday, if today
  // isn't done yet).
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

  const livesText = n => (n === 1 ? '1 life left' : `${n} lives left`);

  // Each card as a right or wrong mark, in the order dealt. No events, no years.
  function shareText(day, state) {
    const head = day ? `Dated ${day}` : 'Dated practice';
    const tail = state.won ? livesText(state.lives) : 'Out of lives';
    const marks = state.results.map(r => (r ? '■' : '□')).join('');
    return `${head} · ${state.placed} of ${state.total} placed, ${tail}\n${marks}`;
  }

  const lib = { LIVES, PRACTICE, rng, shuffled, dayNumber, weekdayOf, names, clash, unpack, pack, daily, practice, rightSlot, replay, finalLine, cleanMoves, streak, bestStreak, livesText, shareText };
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.DatedLib = lib;
})(this);
