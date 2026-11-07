// Splice's pure logic: the day's tree, its starting order, checks, proof that a
// tree has one answer, streaks and the shareable result. No DOM and no app
// state, so the same file runs in the page, in scripts/build-splice.mjs and
// under `node --test`.
//
// Words sit in a tree, one at the top branching down. Every word followed by a
// word under it makes a joined word or a familiar phrase: FIRE over WORK makes
// firework, FIRE over ALARM makes fire alarm. The words
// start out of place; the player swaps them, then checks. A check marks every
// link right or wrong, and right links lock in place. A few checks, then it's over.
//
// A tree is a list of parents: parent[k] is the node above node k (-1 for the
// top). Nodes are numbered row by row, left to right.
(function (root) {
  // Sunday to Saturday: rows and the checks you get. Each row's nodes hang from
  // the row above in order; `under` says how many each node above holds.
  const SHAPES = {
    six: [[2], [2, 1]],
    seven: [[2], [2, 2]],
    eight: [[3], [2, 1, 1]],
    nine: [[2], [2, 1], [1, 1, 1]],
    ten: [[2], [2, 1], [2, 1, 1]],
  };
  // Every word with nothing under it sits on the bottom row, so a tree always
  // looks finished: the weekend's is a full pyramid of one, two, three and four.
  // Four checks Monday to Thursday, three from Friday, when the trees are biggest.
  const WEEK = [['ten', 3], ['six', 4], ['seven', 4], ['eight', 4], ['nine', 4], ['nine', 3], ['ten', 3]];

  // A shape's parents and rows from its counts.
  function tree(name) {
    const parent = [-1], rows = [[0]];
    for (const under of SHAPES[name]) {
      const row = [];
      rows[rows.length - 1].forEach((p, i) => {
        for (let c = 0; c < (under[i] || 0); c++) { row.push(parent.length); parent.push(p); }
      });
      rows.push(row);
    }
    return { parent, rows };
  }
  // Every link as [upper, lower], in node order of the lower word.
  const linksOf = parent => parent.map((p, k) => [p, k]).filter(([p]) => p >= 0);

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

  // Words that hang from the same word can swap places along with everything
  // under them, when what's under them has the same shape: FIRE over WORK and
  // PLACE is the same answer as FIRE over PLACE and WORK. These say which nodes
  // are alike in that way.
  const childrenOf = parent => parent.map((_, k) => parent.map((p, j) => (p === k ? j : -1)).filter(j => j >= 0));
  function shapeKeys(parent) {
    const kids = childrenOf(parent), key = [];
    for (let k = parent.length - 1; k >= 0; k--) key[k] = `(${kids[k].map(j => key[j]).sort().join('')})`;
    return key;
  }
  // For each node, the sibling before it with the same shape, or -1. A count of
  // answers only takes the alike siblings in word order, so swaps aren't counted twice.
  function alikeBefore(parent) {
    const key = shapeKeys(parent);
    return parent.map((p, k) => { for (let j = k - 1; j >= 0; j--) if (parent[j] === p && key[j] === key[k]) return j; return -1; });
  }
  // Every way of writing the answer with alike siblings swapped. Each is a full
  // board, node by node.
  function variants(parent, answer) {
    const kids = childrenOf(parent), key = shapeKeys(parent);
    const order = k => [k, ...kids[k].flatMap(order)];           // a subtree's nodes, top down
    const sub = k => {                                            // its word lists, in that order
      let out = [[answer[k]]];
      const perms = permsOf(kids[k], key);
      const lists = [];
      for (const perm of perms) {
        let acc = [[]];
        for (const j of perm) acc = acc.flatMap(a => sub(j).map(b => [...a, ...b]));
        lists.push(...acc);
      }
      return lists.length ? lists.map(l => [answer[k], ...l]) : out;
    };
    const nodes = order(0);
    const seen = new Set(), out = [];
    for (const list of sub(0)) {
      const board = Array(parent.length);
      nodes.forEach((k, i) => { board[k] = list[i]; });
      const id = board.join(' ');
      if (!seen.has(id)) { seen.add(id); out.push(board); }
    }
    return out;
  }
  // Orders of a node's children that only move alike ones among themselves.
  function permsOf(list, key) {
    if (!list.length) return [[]];
    const out = [];
    const go = (left, acc) => {
      if (!left.length) return out.push(acc);
      const slot = list[acc.length];
      left.forEach((j, i) => { if (key[j] === key[slot]) go([...left.slice(0, i), ...left.slice(i + 1)], [...acc, j]); });
    };
    go(list, []);
    return out;
  }

  // How many different answers fill the tree so that every link joins, stopping
  // at `limit`. `joins(a, b)` says whether a followed by b is a word. Nodes are
  // filled top down, so each new word only has to join the one above it.
  function solutions(parent, words, joins, limit = 2) {
    const alike = alikeBefore(parent);
    const placed = Array(parent.length).fill(null);
    const used = Array(words.length).fill(false);
    let found = 0;
    const answers = [];
    function fill(k) {
      if (found >= limit) return;
      if (k === parent.length) { found++; answers.push([...placed]); return; }
      const seen = new Set();
      for (let w = 0; w < words.length; w++) {
        if (used[w] || seen.has(words[w])) continue;
        if (parent[k] >= 0 && !joins(placed[parent[k]], words[w])) continue;
        if (alike[k] >= 0 && words[w] < placed[alike[k]]) continue;
        seen.add(words[w]);
        used[w] = true; placed[k] = words[w];
        fill(k + 1);
        used[w] = false; placed[k] = null;
        if (found >= limit) return;
      }
    }
    fill(0);
    return { count: found, answers };
  }

  // Which links are right: both words where the answer has them, reading the
  // answer whichever way its alike siblings fit the board best. A right link
  // locks, so it has to be right in place, not only a word somewhere else in the
  // tree. In link order.
  function check(parent, board, answer) {
    let best = null, most = -1;
    for (const v of variants(parent, answer)) {
      const marks = linksOf(parent).map(([p, k]) => board[p] === v[p] && board[k] === v[k]);
      const n = marks.filter(Boolean).length;
      if (n > most) { most = n; best = marks; }
    }
    return best;
  }

  // The day's starting order: the answer shuffled, with no more than one link
  // already right and the top word moved, so there's always work to do.
  function scramble(answer, parent, seed) {
    const random = rng(seed);
    const right = new Set(linksOf(parent).map(([p, k]) => answer[p] + answer[k]));
    for (let tries = 0; tries < 500; tries++) {
      const board = shuffled(answer, random);
      const joined = linksOf(parent).filter(([p, k]) => right.has(board[p] + board[k])).length;
      const placed = check(parent, board, answer).filter(Boolean).length;
      if (board[0] !== answer[0] && joined <= 1 && placed === 0) return board;
    }
    return [...answer.slice(1), answer[0]];
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
  const shapeForDay = (day, epoch) => WEEK[weekdayOf(day, epoch)];

  // The puzzle for a day. The list goes round at its end; a repeat keeps the
  // shape it was built for.
  function daily(day, data) {
    const n = data.days.length;
    const at = (((day - 1) % n) + n) % n + 1;   // a clock set before the epoch still gets a puzzle
    const [name, checks] = shapeForDay(at, data.epoch);
    const { parent, rows } = tree(name);
    const answer = data.days[at - 1].split(' ');
    return { day: at, parent, rows, answer, checks, start: scramble(answer, parent, at * 7919) };
  }
  // How a link is written once found: firework, ice-cold, fire alarm.
  const reads = (a, b, data) => (data.written && data.written[`${a} ${b}`]) || a + b;

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

  // Marked pairs. A player can mark a link they're sure of; marks belong to the
  // two words, written 'upper>lower', so they travel with them. Marked words
  // move together: the group is every node joined to this one by marked links.
  const pairOf = (upper, lower) => `${upper}>${lower}`;
  function groupOf(parent, board, marks, node) {
    const marked = new Set(marks);
    const group = new Set([node]), queue = [node];
    while (queue.length) {
      const x = queue.pop();
      parent.forEach((p, k) => {
        if (p < 0) return;
        const join = (p === x && !group.has(k)) ? k : (k === x && !group.has(p)) ? p : -1;
        if (join >= 0 && marked.has(pairOf(board[p], board[k]))) { group.add(join); queue.push(join); }
      });
    }
    return [...group];
  }
  // Where a group lands if `from` goes to `to`: each node keeps its place
  // relative to `from` (its parent, or its first or second child, and so on).
  // Null if the tree has no room for that shape there.
  function relocate(parent, group, from, to) {
    const kids = childrenOf(parent), inGroup = new Set(group);
    const where = new Map([[from, to]]), queue = [from];
    while (queue.length) {
      const x = queue.shift(), t = where.get(x);
      const up = parent[x];
      if (up >= 0 && inGroup.has(up) && !where.has(up)) {
        if (parent[t] < 0) return null;
        where.set(up, parent[t]); queue.push(up);
      }
      kids[x].forEach((c, i) => {
        if (!inGroup.has(c) || where.has(c)) return;
        if (kids[t][i] === undefined) return where.set(c, null);
        where.set(c, kids[t][i]); queue.push(c);
      });
    }
    return [...where.values()].includes(null) ? null : where;
  }
  // A swap of the words at a and b, taking marked groups along. Returns the new
  // board, or why it can't be done. Locked nodes never move.
  function swap(parent, board, marks, a, b, locked = new Set()) {
    let ga = groupOf(parent, board, marks, a), gb = groupOf(parent, board, marks, b);
    if (ga.includes(b)) return { refused: 'Those words are marked together' };
    // The bigger group leads; the other has to fit inside where it lands.
    let [g, from, to, other] = ga.length >= gb.length ? [ga, a, b, gb] : [gb, b, a, ga];
    const where = relocate(parent, g, from, to);
    if (!where) return { refused: 'That pair doesn’t fit there' };
    const targets = [...where.values()];
    if (targets.some(t => g.includes(t))) return { refused: 'That pair doesn’t fit there' };
    if (!other.every(x => targets.includes(x))) return { refused: 'Those pairs don’t fit each other' };
    if ([...g, ...targets].some(x => locked.has(x))) return { refused: 'Green words stay put' };
    const next = [...board];
    for (const [x, t] of where) [next[x], next[t]] = [board[t], board[x]];
    return { board: next };
  }

  // Each check as a line of marks, one per link. No words.
  function shareText(day, checks, won) {
    const head = day ? `Splice ${day}` : 'Splice practice';
    const title = won ? `${head} · ${checks.length} ${checks.length === 1 ? 'check' : 'checks'}` : `${head} · Not this time`;
    return [title, ...checks.map(c => c.map(ok => (ok ? '●' : '○')).join(''))].join('\n');
  }

  const lib = { SHAPES, WEEK, tree, linksOf, rng, shuffled, shapeKeys, alikeBefore, variants, solutions, check, scramble, dayNumber, weekdayOf, shapeForDay, daily, reads, pairOf, groupOf, relocate, swap, streak, bestStreak, shareText };
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.SpliceLib = lib;
})(this);
