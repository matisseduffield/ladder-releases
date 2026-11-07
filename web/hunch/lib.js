// Hunch's pure logic: marking a guess, the day's word, streaks and the
// shareable result. No DOM and no app state, so the same file runs in the
// page and under `node --test`.
//
// There's a hidden five-letter word and six tries. Each guess comes back with
// every letter marked: in place, in the word but elsewhere, or not in it.
(function (root) {
  const LEN = 5;
  const TRIES = 6;
  const split = s => { const out = []; for (let i = 0; i < s.length; i += LEN) out.push(s.slice(i, i + LEN)); return out; };

  function dictionary(data) {
    const answers = split(data.answers);
    return { answers, all: new Set([...answers, ...split(data.extra)]) };
  }

  // 'hit' in place, 'near' elsewhere in the word, 'miss' not in it. A letter
  // only counts as often as the word has it, and places are settled first.
  function marks(guess, answer) {
    const out = Array(LEN).fill('miss');
    const left = {};
    for (let i = 0; i < LEN; i++) {
      if (guess[i] === answer[i]) out[i] = 'hit';
      else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < LEN; i++) {
      if (out[i] !== 'hit' && left[guess[i]] > 0) { out[i] = 'near'; left[guess[i]]--; }
    }
    return out;
  }

  // The best that's known about each letter so far, for the keyboard.
  function letters(guesses, answer) {
    const rank = { miss: 1, near: 2, hit: 3 };
    const known = {};
    for (const g of guesses) {
      marks(g, answer).forEach((m, i) => { if (!known[g[i]] || rank[m] > rank[known[g[i]]]) known[g[i]] = m; });
    }
    return known;
  }

  // Hard mode: what a guess leaves out of the clues so far, or null. Letters
  // in place have to stay there, and every letter found has to be used, as
  // many times as it's been found in one guess.
  function missedClue(guess, guesses, answer) {
    const big = c => c.toUpperCase();
    for (const g of guesses) {
      const m = marks(g, answer);
      for (let i = 0; i < LEN; i++) {
        if (m[i] === 'hit' && guess[i] !== g[i]) return `Keep ${big(g[i])} in spot ${i + 1}`;
      }
      const found = {};
      for (let i = 0; i < LEN; i++) if (m[i] !== 'miss') found[g[i]] = (found[g[i]] || 0) + 1;
      for (const [c, n] of Object.entries(found)) {
        if ([...guess].filter(x => x === c).length < n) return n > 1 ? `Use ${n} ${big(c)}s` : `Use the ${big(c)} you found`;
      }
    }
    return null;
  }

  // Seeded randomness, for the fixed order of the answers.
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

  // Days count in the player's own calendar, so a new word arrives at their
  // midnight. Day 1 is the epoch.
  function dayNumber(date, epoch) {
    const [y, m, d] = epoch.split('-').map(Number);
    return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(y, m - 1, d)) / 864e5) + 1;
  }
  // Each day takes the next word in the list, going round again at its end.
  const daily = (day, dict) => { const n = dict.answers.length; return dict.answers[(((day - 1) % n) + n) % n]; };

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

  // A spoiler-free picture of the game, a row for each guess.
  function shareText(day, guesses, answer, hard = false) {
    const mark = { hit: '■', near: '▣', miss: '□' };
    const won = guesses[guesses.length - 1] === answer;
    const rows = guesses.map(g => marks(g, answer).map(m => mark[m]).join(''));
    return `${day ? `Hunch ${day}` : 'Hunch practice'} · ${won ? guesses.length : 'X'}/${TRIES}${hard ? ' · Hard' : ''}\n${rows.join('\n')}`;
  }

  const lib = { LEN, TRIES, split, dictionary, marks, letters, missedClue, rng, dayNumber, daily, streak, bestStreak, shareText };
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.HunchLib = lib;
})(this);
