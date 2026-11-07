// After today's game: a link on to the next one not played yet, so a morning's
// games run one into the next. Each game calls showNext() from its result.
(function (root) {
  const GAMES = [['slugle', 'Slugle'], ['hunch', 'Hunch'], ['sorted', 'Sorted'], ['reach', 'Reach'], ['cluey', 'Cluey'], ['mend', 'Mend'], ['dated', 'Dated'], ['overland', 'Overland'], ['splice', 'Splice']];

  function played(id) {
    try {
      const result = JSON.parse(localStorage.getItem('hub.' + id));
      return !!result && result.date === Clock.now().toDateString();
    } catch { return false; }
  }

  root.showNext = (link, here, show = true) => {
    const at = GAMES.findIndex(g => g[0] === here);
    const rest = [...GAMES.slice(at + 1), ...GAMES.slice(0, at)];
    const next = show && rest.find(g => !played(g[0]));
    link.hidden = !next;
    if (!next) return;
    link.href = `../${next[0]}/index.html`;
    link.textContent = `Play ${next[1]} next`;
    // Replacing this page keeps Back going to the home screen, not the last game.
    link.onclick = e => { e.preventDefault(); location.replace(link.href); };
  };
})(this);
