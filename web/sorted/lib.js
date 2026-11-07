// Sorted's pure logic: reading the puzzles, checking a guess, the day's puzzle,
// streaks and the shareable result. No DOM and no app state, so the same file
// runs in the page and under `node --test`.
//
// There are sixteen words in four hidden groups of four. A guess is four words;
// a wrong one costs one of four mistakes.
(function (root) {
  const SIZE = 4;
  const MISTAKES = 4;

  // The puzzles are plain text: a line for each group, easiest first, as
  // "Name: One, Two, Three, Four", with a blank line between puzzles.
  function parse(text) {
    return text.trim().split(/\n\s*\n/).map(block => block.trim().split('\n').map((line, level) => {
      const at = line.indexOf(':');
      return { name: line.slice(0, at).trim(), words: line.slice(at + 1).split(',').map(w => w.trim()), level };
    }));
  }

  const wordsOf = puzzle => puzzle.flatMap(g => g.words);
  const groupOf = (word, puzzle) => puzzle.findIndex(g => g.words.includes(word));

  // A group's index if all four belong to it, or -1, and whether three did.
  function check(guess, puzzle) {
    const counts = puzzle.map(g => guess.filter(w => g.words.includes(w)).length);
    const best = Math.max(...counts);
    return { group: best === SIZE ? counts.indexOf(best) : -1, near: best === SIZE - 1 };
  }

  const tried = (guess, guesses) => guesses.some(g => guess.every(w => g.includes(w)));

  // Everything about a game follows from its guesses.
  function progress(guesses, puzzle) {
    const solved = [];
    let mistakes = 0;
    for (const g of guesses) {
      const { group } = check(g, puzzle);
      if (group < 0) mistakes++;
      else solved.push(group);
    }
    const won = solved.length === puzzle.length;
    return { solved, mistakes, won, done: won || mistakes >= MISTAKES };
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

  function shuffled(list, random = Math.random) {
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
  // Each day takes the next puzzle, going round again at the end of the list.
  const daily = (day, puzzles) => { const n = puzzles.length; return puzzles[(((day - 1) % n) + n) % n]; };
  // The day sets the deal, so everyone starts from the same board.
  const deal = (day, puzzle) => shuffled(wordsOf(puzzle), rng(day * 7919));

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

  const mistakeText = n => (n ? `${n} ${n === 1 ? 'mistake' : 'mistakes'}` : 'No mistakes');

  // A spoiler-free picture of the game: a row for each guess, and the harder a
  // word's group, the fuller its square.
  function shareText(day, guesses, puzzle) {
    const shade = ['□', '▤', '▦', '■'];
    const { won, solved, mistakes } = progress(guesses, puzzle);
    const rows = guesses.map(g => g.map(w => shade[puzzle[groupOf(w, puzzle)].level]).join(''));
    return `Sorted ${day} · ${won ? mistakeText(mistakes) : `${solved.length} of ${puzzle.length}`}\n${rows.join('\n')}`;
  }

  const lib = { SIZE, MISTAKES, parse, wordsOf, groupOf, check, tried, progress, rng, shuffled, dayNumber, daily, deal, streak, bestStreak, mistakeText, shareText };
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.SortedLib = lib;
})(this);
