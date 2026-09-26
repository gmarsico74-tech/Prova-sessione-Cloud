'use strict';

// Disegna il tabellino: i punti di ogni periodo e, per ogni squadra, minuti, punti, canestri e falli dei giocatori.
// Lo usano sia il tabellone sia la pagina del tabellino pubblicato (tabellino.html).
(function (root) {
  const COLUMNS = [
    ['PT', 'Punti'],
    ['TL', 'Tiri liberi segnati'],
    ['T2', 'Canestri da 2'],
    ['T3', 'Canestri da 3'],
    ['F', 'Falli'],
  ];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function periodsTable(box) {
    const table = el('table', 'box-periods');
    const head = el('tr');
    head.append(el('th'), ...box.periods.map((p) => el('th', '', Game.periodLabel(p.period))), el('th', '', 'Tot'));
    const body = el('tbody');
    for (const team of ['home', 'away']) {
      const tr = el('tr');
      tr.dataset.side = team;
      const scores = box.periods.map((p) => p[team]);
      tr.append(
        el('th', 'box-team-name', box.teams[team].name),
        ...scores.map((n) => el('td', '', String(n))),
        el('td', 'box-tot', String(scores.reduce((a, b) => a + b, 0)))
      );
      body.append(tr);
    }
    table.append(el('thead'), body);
    table.tHead.append(head);
    return table;
  }

  function lineCells(line) {
    return [line.pts, ...line.made, line.fouls].map((n) => el('td', '', String(n)));
  }

  // I minuti ci sono solo se della squadra è stato detto almeno un quintetto.
  function teamTable(side, team) {
    const wrap = el('div', 'box-team');
    wrap.dataset.side = team;
    const totals = Game.boxTotals(side);
    const minutes = side.players.some((p) => p.secs !== null && p.secs !== undefined);
    const minCell = (p) => (minutes ? [el('td', 'min', p && p.secs ? Game.formatMinutes(p.secs) : '')] : []);
    const title = el('h3');
    title.append(el('span', 'box-team-name', side.name), el('span', 'box-team-pts', String(totals.pts)));
    const table = el('table', 'box-table');
    const head = el('tr');
    head.append(el('th', 'num', 'N°'), el('th', 'who', 'Giocatore'));
    if (minutes) {
      const th = el('th', 'min', 'MIN');
      th.title = 'Minuti in campo';
      head.append(th);
    }
    for (const [abbr, meaning] of COLUMNS) {
      const th = el('th', '', abbr);
      th.title = meaning;
      head.append(th);
    }
    const body = el('tbody');
    for (const p of side.players) {
      const tr = el('tr');
      tr.classList.toggle('out', p.fouls >= Game.PLAYER_FOUL_LIMIT);
      tr.append(el('td', 'num', String(p.number)), el('td', 'who', p.name), ...minCell(p), ...lineCells(p));
      body.append(tr);
    }
    // quello segnato senza giocatore; senza giocatori è tutto lì e basta il totale
    if (side.players.length > 0 && [side.team.pts, ...side.team.made, side.team.fouls].some(Boolean)) {
      const tr = el('tr', 'team-line');
      tr.append(el('td', 'num'), el('td', 'who', 'Squadra'), ...minCell(), ...lineCells(side.team));
      body.append(tr);
    }
    const foot = el('tfoot');
    const total = el('tr');
    total.append(el('td', 'num'), el('td', 'who', 'Totale'), ...minCell(), ...lineCells(totals));
    foot.append(total);
    table.append(el('thead'), body, foot);
    table.tHead.append(head);
    const scroll = el('div', 'box-scroll');
    scroll.append(table);
    wrap.append(title, scroll);
    return wrap;
  }

  function render(container, box) {
    container.replaceChildren(periodsTable(box), teamTable(box.teams.home, 'home'), teamTable(box.teams.away, 'away'));
  }

  // «2026-09-27» diventa «sabato 27 settembre 2026».
  function longDate(day) {
    const [y, m, d] = day.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return Number.isNaN(date.getTime())
      ? day
      : date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  // La pagina del tabellino pubblicato: tutto quello che mostra sta nel link.
  function showPublished() {
    const box = Game.decodeBox(location.hash.slice(1));
    const title = document.getElementById('match');
    const when = document.getElementById('when');
    const container = document.getElementById('box');
    if (!box) {
      title.textContent = 'Tabellino';
      when.textContent = 'Questo link del tabellino è rovinato o incompleto: fattelo rimandare.';
      container.replaceChildren();
      return;
    }
    const { home, away } = box.teams;
    const match = `${home.name} ${Game.boxTotals(home).pts} – ${Game.boxTotals(away).pts} ${away.name}`;
    title.textContent = match;
    document.title = `Tabellino ${match}`;
    when.textContent = `${longDate(box.date)} · ${box.status}`;
    render(container, box);
  }

  root.Tabellino = { render };

  if (document.body?.dataset.page === 'tabellino') {
    showPublished();
    root.addEventListener('hashchange', showPublished);
  }
})(window);
