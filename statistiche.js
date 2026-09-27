'use strict';

// La pagina delle statistiche: l'archivio delle partite (salvate dal tabellone o aggiunte da file),
// il tabellino completo di scout di una partita e le statistiche di una squadra in un periodo della stagione.
// I calcoli sono tutti in game.js; qui si leggono i file, si salva l'archivio e si disegnano le tabelle.

const ARCHIVE_KEY = 'tabellone-archivio'; // lo stesso del tabellone
const $ = (selector, el = document) => el.querySelector(selector);

let archive = loadArchive();
let selected = null; // la partita di cui si vede il tabellino
let seasonTable = null; // la tabella della stagione com'è a schermo, per scaricarla

function loadArchive() {
  try {
    const saved = JSON.parse(localStorage.getItem(ARCHIVE_KEY));
    if (Array.isArray(saved)) return saved.filter((g) => Game.readGameFile(Game.archiveFile([g])));
  } catch {
    // archivio illeggibile: si parte da uno vuoto
  }
  return [];
}

function saveArchive() {
  try {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive));
    return true;
  } catch {
    $('#archive-note').textContent = "Non riesco a salvare l'archivio in questo browser: scaricalo per non perderlo.";
    return false;
  }
}

// ——— Numeri scritti all'italiana ———

const one = (n) => n.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const signedOne = (n) => (n > 0 ? `+${one(n)}` : n < 0 ? `−${one(-n)}` : '0,0');
const percent = (made, att) => (att ? `${Math.round((made / att) * 100)}%` : '–');

function dateOf(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function shortDate(day) {
  return dateOf(day).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function longDate(day) {
  return dateOf(day).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(action, text) {
  const btn = el('button', '', text);
  btn.type = 'button';
  btn.dataset.action = action;
  return btn;
}

// Una tabella: columns sono [sigla, significato, classe], rows elenchi di celle [testo, classe].
function table(columns, rows, foot) {
  const node = el('table');
  const head = el('tr');
  for (const [label, meaning, className] of columns) {
    const th = el('th', className ?? '', label);
    if (meaning) th.title = meaning;
    head.append(th);
  }
  const row = (cells, className) => {
    const tr = el('tr', className ?? '');
    for (const [text, cls] of cells) tr.append(el('td', cls ?? '', String(text)));
    return tr;
  };
  const thead = el('thead');
  thead.append(head);
  const tbody = el('tbody');
  for (const r of rows) tbody.append(row(r.cells, r.className));
  node.append(thead, tbody);
  if (foot) {
    const tfoot = el('tfoot');
    tfoot.append(row(foot.cells));
    node.append(tfoot);
  }
  const scroll = el('div', 'box-scroll');
  scroll.append(node);
  return scroll;
}

function match(dati) {
  const state = Game.gameFromData(dati);
  return `${dati.names.home} ${Game.score(state.events, 'home')} – ${Game.score(state.events, 'away')} ${dati.names.away}`;
}

// ——— L'archivio ———

function renderGames() {
  const list = $('#games');
  if (archive.length === 0) {
    list.replaceChildren(
      el('li', 'hint', "Ancora nessuna partita: nel tabellone premi «Salva nell'archivio», oppure aggiungi un file.")
    );
    return;
  }
  const items = [...archive].reverse().map((g) => {
    const li = el('li');
    li.dataset.id = g.id;
    li.classList.toggle('selected', g.id === selected);
    const who = el('span', 'game-who');
    who.append(el('span', 'game-date', shortDate(g.dati.date)), el('span', 'game-match', match(g.dati)));
    const actions = el('div', 'game-actions');
    actions.append(button('show-game', 'Tabellino'), button('remove-game', 'Togli'));
    li.append(who, actions);
    return li;
  });
  list.replaceChildren(...items);
}

// ——— Il tabellino completo di una partita ———

const SCOUT = [
  ['MIN', 'Minuti in campo', (p) => (p.secs == null ? '' : Game.formatMinutes(p.secs))],
  ['PT', 'Punti', (p) => p.pts],
  ['T2', 'Tiri da 2 segnati/tentati', (p) => `${p.made[1]}/${p.att[1]}`],
  ['T3', 'Tiri da 3 segnati/tentati', (p) => `${p.made[2]}/${p.att[2]}`],
  ['TL', 'Tiri liberi segnati/tentati', (p) => `${p.made[0]}/${p.att[0]}`],
  ['RO', 'Rimbalzi in attacco', (p) => p.oreb],
  ['RD', 'Rimbalzi in difesa', (p) => p.dreb],
  ['RT', 'Rimbalzi totali', (p) => p.oreb + p.dreb],
  ['AS', 'Assist', (p) => p.ast],
  ['PR', 'Palle recuperate', (p) => p.stl],
  ['PP', 'Palle perse', (p) => p.tov],
  ['ST', 'Stoppate date', (p) => p.blk],
  ['SS', 'Stoppate subite', (p) => p.blka],
  ['FF', 'Falli fatti', (p) => p.fouls],
  ['FS', 'Falli subiti', (p) => p.fd],
  ['+/−', 'Più/meno', (p) => (p.pm == null ? '' : signed(p.pm))],
  ['VAL', 'Valutazione FIBA', (p) => Game.efficiency(p)],
];

function scoutTable(side, team) {
  const wrap = el('div', 'box-team');
  wrap.dataset.side = team;
  const totals = Game.boxTotals(side);
  const title = el('h3');
  title.append(el('span', 'box-team-name', side.name), el('span', 'box-team-pts', String(totals.pts)));
  const columns = [['N°', '', 'num'], ['Giocatore', '', 'who'], ...SCOUT.map(([label, meaning]) => [label, meaning])];
  const cells = (p) => SCOUT.map(([, , value]) => [value(p)]);
  const rows = side.players.map((p) => ({
    cells: [[p.number, 'num'], [p.name, 'who'], ...cells(p)],
    className: p.fouls >= Game.PLAYER_FOUL_LIMIT ? 'out' : '',
  }));
  // quello fatto alla squadra senza giocatore; senza giocatori è tutto lì e basta il totale
  const teamDid = Object.values(side.team).some((v) => (Array.isArray(v) ? v.some(Boolean) : v !== 0));
  if (side.players.length > 0 && teamDid) {
    rows.push({ cells: [['', 'num'], ['Squadra', 'who'], ...cells(side.team)], className: 'team-line' });
  }
  wrap.append(title, table(columns, rows, { cells: [['', 'num'], ['Totale', 'who'], ...cells(totals)] }));
  return wrap;
}

function renderGame() {
  const game = archive.find((g) => g.id === selected);
  $('#game-panel').hidden = !game;
  if (!game) return;
  const state = Game.gameFromData(game.dati);
  const box = Game.boxScore(state, 0);
  const periods = box.periods.map((p) => `${Game.periodLabel(p.period)} ${p.home}–${p.away}`).join(' · ');
  $('#game-title').textContent = `${match(game.dati)} · ${longDate(game.dati.date)}${periods ? ` · ${periods}` : ''}`;
  $('#game-box').replaceChildren(scoutTable(box.teams.home, 'home'), scoutTable(box.teams.away, 'away'));
}

// ——— Le statistiche della stagione ———

const SEASON = [
  ['PG', 'Partite giocate'],
  ['MIN', 'Minuti in campo'],
  ['PT', 'Punti'],
  ['T2', 'Tiri da 2 segnati/tentati'],
  ['T2%', 'Percentuale da 2'],
  ['T3', 'Tiri da 3 segnati/tentati'],
  ['T3%', 'Percentuale da 3'],
  ['TL', 'Tiri liberi segnati/tentati'],
  ['TL%', 'Percentuale ai liberi'],
  ['RO', 'Rimbalzi in attacco'],
  ['RD', 'Rimbalzi in difesa'],
  ['RT', 'Rimbalzi totali'],
  ['AS', 'Assist'],
  ['PR', 'Palle recuperate'],
  ['PP', 'Palle perse'],
  ['ST', 'Stoppate date'],
  ['SS', 'Stoppate subite'],
  ['FF', 'Falli fatti'],
  ['FS', 'Falli subiti'],
  ['+/−', 'Più/meno'],
  ['VAL', 'Valutazione FIBA'],
];

// Una riga della stagione: con le medie ogni voce è divisa per le partite giocate, le percentuali sono sui totali.
function seasonCells(games, line, eff, secs, secsGames, pm, pmGames, averages) {
  const v = (n) => (averages ? one(n / games) : String(n));
  const minutes = secsGames ? Game.formatMinutes(averages ? secs / secsGames : secs) : '';
  const plus = pmGames ? (averages ? signedOne(pm / pmGames) : signed(pm)) : '';
  return [
    games,
    minutes,
    v(line.pts),
    `${v(line.made[1])}/${v(line.att[1])}`,
    percent(line.made[1], line.att[1]),
    `${v(line.made[2])}/${v(line.att[2])}`,
    percent(line.made[2], line.att[2]),
    `${v(line.made[0])}/${v(line.att[0])}`,
    percent(line.made[0], line.att[0]),
    v(line.oreb),
    v(line.dreb),
    v(line.oreb + line.dreb),
    v(line.ast),
    v(line.stl),
    v(line.tov),
    v(line.blk),
    v(line.blka),
    v(line.fouls),
    v(line.fd),
    plus,
    averages ? one(eff / games) : String(eff),
  ];
}

function renderSeason() {
  const teams = Game.archiveTeams(archive);
  const select = $('#team');
  const current = teams.includes(select.value) ? select.value : teams[0];
  select.replaceChildren(
    ...teams.map((name) => {
      const option = el('option', '', name);
      option.value = name;
      return option;
    })
  );
  if (!current) {
    $('#record').textContent = 'Ancora nessuna partita nell\'archivio.';
    $('#season').replaceChildren();
    seasonTable = null;
    return;
  }
  select.value = current;
  const from = $('#from').value;
  const to = $('#to').value;
  const games = archive.filter((g) => (!from || g.dati.date >= from) && (!to || g.dati.date <= to));
  const season = Game.seasonStats(games, current);
  const r = season.record;
  const averages = $('#averages').checked;
  if (r.games === 0) {
    $('#record').textContent = `Nessuna partita di ${current} nel periodo scelto.`;
    $('#season').replaceChildren();
    seasonTable = null;
    return;
  }
  const ties = r.tied ? `, ${r.tied} pari` : '';
  const played = r.games === 1 ? '1 partita' : `${r.games} partite`;
  $('#record').textContent = averages
    ? `${played}: ${r.won} vinte, ${r.lost} perse${ties} · punti fatti ${one(r.pointsFor / r.games)}, subiti ${one(r.pointsAgainst / r.games)} di media`
    : `${played}: ${r.won} vinte, ${r.lost} perse${ties} · punti fatti ${r.pointsFor}, subiti ${r.pointsAgainst}`;
  const columns = [['N°', '', 'num'], ['Giocatore', '', 'who'], ...SEASON];
  const rows = season.players.map((p) => [
    p.number,
    p.name,
    ...seasonCells(p.games, p.line, p.eff, p.secs, p.secsGames, p.pm, p.pmGames, averages),
  ]);
  const teamRow = ['', 'Squadra', ...seasonCells(r.games, r.totals, Game.efficiency(r.totals), 0, 0, 0, 0, averages)];
  seasonTable = { team: current, from, to, averages, headers: columns.map(([label]) => label), rows: [...rows, teamRow] };
  $('#season').replaceChildren(
    table(
      columns,
      rows.map((cells) => ({ cells: cells.map((text, i) => [text, i === 0 ? 'num' : i === 1 ? 'who' : '']) })),
      { cells: teamRow.map((text, i) => [text, i === 0 ? 'num' : i === 1 ? 'who' : '']) }
    )
  );
}

// ——— File ———

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60000);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Per Excel in italiano: punto e virgola fra le colonne, virgola nei decimali, e i caratteri accentati giusti.
function exportCsv() {
  if (!seasonTable) return;
  const quote = (text) => `"${String(text).replace(/"/g, '""')}"`;
  const lines = [seasonTable.headers, ...seasonTable.rows].map((row) => row.map(quote).join(';'));
  const period = `${seasonTable.from || 'inizio'}_${seasonTable.to || today()}`;
  const kind = seasonTable.averages ? 'medie' : 'totali';
  const name = `statistiche_${seasonTable.team.replace(/[^\w]+/g, '-')}_${kind}_${period}.csv`;
  download(name, `﻿${lines.join('\r\n')}`, 'text/csv;charset=utf-8');
}

async function addFiles(files) {
  let added = 0;
  const bad = [];
  for (const file of files) {
    try {
      const entries = Game.readGameFile(JSON.parse(await file.text()));
      if (!entries) {
        bad.push(file.name);
        continue;
      }
      for (const entry of entries) archive = Game.storeGame(archive, entry);
      added += entries.length;
    } catch {
      bad.push(file.name);
    }
  }
  const saved = saveArchive();
  const what = added === 1 ? 'Aggiunta 1 partita.' : `Aggiunte ${added} partite.`;
  const wrong = bad.length ? ` Questi file non sono partite del tabellone: ${bad.join(', ')}.` : '';
  if (saved) $('#archive-note').textContent = what + wrong;
  render();
}

function render() {
  renderGames();
  renderGame();
  renderSeason();
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.closest('[data-id]')?.dataset.id;
  switch (btn.dataset.action) {
    case 'show-game':
      selected = id;
      render();
      $('#game-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      break;
    case 'remove-game': {
      const game = archive.find((g) => g.id === id);
      if (!game || !confirm(`Tolgo dall'archivio ${match(game.dati)} del ${longDate(game.dati.date)}?`)) return;
      archive = archive.filter((g) => g.id !== id);
      if (selected === id) selected = null;
      saveArchive();
      render();
      break;
    }
    case 'export-archive':
      download(`archivio-tabellone_${today()}.json`, JSON.stringify(Game.archiveFile(archive), null, 2), 'application/json');
      $('#archive-note').textContent = "Archivio scaricato: con «Aggiungi file» lo porti su un altro dispositivo.";
      break;
    case 'export-csv':
      exportCsv();
      break;
  }
});

$('#add-files').addEventListener('change', (e) => {
  addFiles([...e.target.files]);
  e.target.value = '';
});

for (const id of ['#team', '#from', '#to', '#averages']) $(id).addEventListener('change', renderSeason);

// Se il tabellone salva una partita in un'altra scheda, l'elenco si aggiorna da solo.
window.addEventListener('storage', (e) => {
  if (e.key !== ARCHIVE_KEY) return;
  archive = loadArchive();
  render();
});

render();
