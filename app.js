'use strict';

// Collega il tabellone alla pagina: legge i clic, aggiorna lo stato con Game e ridisegna.

const STORAGE_KEY = 'tabellone-basket';
const LIBRARY_KEY = 'tabellone-squadre'; // le squadre salvate restano anche dopo «Nuova partita»
const TEAMS = ['home', 'away'];
const DEFAULT_NAMES = { home: 'PC52', away: 'OSPITI' };

const $ = (selector, el = document) => el.querySelector(selector);
const clockEl = $('#clock');
const shotEl = $('#shot');

let state = load();
let library = loadLibrary();
let audioCtx = null;

// Con «Correggi» acceso i pulsanti della squadra tolgono invece di aggiungere, per una sola azione.
const correcting = { home: false, away: false };

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.events) && saved.clock && saved.names) {
      saved.clock.shotMs ??= Game.SHOT_MS; // partite salvate prima dei 24 secondi
      saved.settings ??= { playerMode: false, friendly: false }; // e prima dei giocatori
      saved.rosters ??= { home: [], away: [] };
      saved.playerNames ??= { home: {}, away: {} }; // e prima dei nomi
      return saved;
    }
  } catch {
    // storage non disponibile o dati illeggibili: si riparte da una partita nuova
  }
  return Game.newGame(DEFAULT_NAMES);
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // senza storage il tabellone funziona lo stesso, solo non sopravvive a un ricaricamento
  }
}

function loadLibrary() {
  try {
    const saved = JSON.parse(localStorage.getItem(LIBRARY_KEY));
    if (Array.isArray(saved)) return saved;
  } catch {
    // nessuna squadra salvata leggibile: si parte da un elenco vuoto
  }
  return [];
}

function saveLibrary() {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
  } catch {
    // senza storage le squadre restano salvate solo finché la pagina è aperta
  }
}

function update() {
  save();
  render();
}

function render() {
  const { events, period } = state;
  document.body.classList.toggle('player-mode', state.settings.playerMode);
  for (const team of TEAMS) {
    const panel = $(`[data-team="${team}"]`);
    const fix = correcting[team];
    const fouls = Game.teamFouls(events, team, period);
    const timeouts = Game.timeoutsLeft(events, team, period);
    const maxTimeouts = Game.timeoutWindow(period).max;
    const input = $('.team-name', panel);
    if (document.activeElement !== input) input.value = state.names[team];
    fitName(input);
    $('[data-role="score"]', panel).textContent = Game.score(events, team);
    $('[data-role="fouls"]', panel).textContent = fouls;
    $('[data-role="bonus"]', panel).hidden = fouls < Game.BONUS_FOULS;
    $('[data-role="timeouts"]', panel).textContent = '●'.repeat(timeouts) + '○'.repeat(maxTimeouts - timeouts);
    $('[data-action="timeout"]', panel).disabled = timeouts === 0;
    panel.classList.toggle('correcting', fix);
    $('[data-action="correct"]', panel).setAttribute('aria-pressed', String(fix));
    for (const btn of panel.querySelectorAll('.btn-row.team-only button')) {
      const pts = Number(btn.dataset.pts);
      btn.textContent = `${fix ? '−' : '+'}${pts}`;
      btn.disabled = fix && !Game.canRemovePoints(events, team, pts);
    }
    const teamFoul = $('button.team-only[data-action="foul"]', panel);
    teamFoul.textContent = fix ? '− Fallo' : '+ Fallo';
    teamFoul.disabled = fix && !Game.lastFoul(events, team);
    renderPlayers(panel, team);
  }
  $('#period').textContent = Game.periodLabel(period);
  $('[data-action="prev-period"]').disabled = period === 1;
  $('[data-action="undo"]').disabled = events.length === 0;
  renderClock();
  renderLog();
  renderSettings();
}

// I nomi lunghi rimpiccioliscono finché stanno nel riquadro, invece di venire tagliati.
function fitName(input) {
  input.style.fontSize = '';
  let size = parseFloat(getComputedStyle(input).fontSize);
  while (input.scrollWidth > input.clientWidth && size > 10) {
    size -= 1;
    input.style.fontSize = `${size}px`;
  }
}

// Una riga per giocatore: numero e nome, punti e pulsanti. Il pulsante F mostra i falli presi;
// al quinto diventa rosso, il numero si colora di rosso e il giocatore non può più segnare.
function renderPlayers(panel, team) {
  const list = $('[data-role="players"]', panel);
  if (!state.settings.playerMode) {
    list.replaceChildren();
    return;
  }
  const roster = state.rosters[team];
  if (roster.length === 0) {
    const hint = document.createElement('li');
    hint.className = 'players-hint';
    hint.textContent = 'Aggiungi i numeri di maglia in fondo alla pagina, in Impostazioni.';
    list.replaceChildren(hint);
    return;
  }
  const fix = correcting[team];
  const head = document.createElement('li');
  head.className = 'player head';
  head.setAttribute('aria-hidden', 'true');
  head.append(cell('p-who', 'N°'), cell('p-pts', 'PT'));
  const rows = roster.map((number) => {
    const fouls = Game.playerFouls(state.events, team, number);
    const out = fouls >= Game.PLAYER_FOUL_LIMIT;
    const name = state.playerNames[team][number] ?? '';
    const li = document.createElement('li');
    li.className = 'player';
    li.classList.toggle('out', out);
    li.dataset.player = number;
    const who = document.createElement('span');
    who.className = 'p-who';
    who.title = name;
    who.append(cell('p-num', `#${number}`), cell('p-name', name));
    li.append(who, cell('p-pts', String(Game.playerPoints(state.events, team, number))));
    for (const pts of [1, 2, 3]) {
      const text = `${fix ? '−' : '+'}${pts}`;
      const disabled = fix ? !Game.canRemovePoints(state.events, team, pts, number) : out;
      li.append(playerButton('score', text, `${text} al numero ${number}`, disabled, pts));
    }
    const foul = fix
      ? playerButton('foul', '−F', `−F al numero ${number}`, !Game.lastFoul(state.events, team, number))
      : playerButton('foul', fouls > 0 ? `F${fouls}` : 'F', `+F al numero ${number}`, out);
    foul.classList.add('foul-btn');
    foul.classList.toggle('full', out && !fix);
    li.append(foul);
    return li;
  });
  list.replaceChildren(head, ...rows);
}

function playerButton(action, text, label, disabled, pts) {
  const btn = document.createElement('button');
  btn.dataset.action = action;
  if (pts !== undefined) btn.dataset.pts = pts;
  btn.textContent = text;
  btn.setAttribute('aria-label', label);
  btn.disabled = disabled;
  return btn;
}

function renderSettings() {
  const { settings, rosters } = state;
  $('#player-mode').checked = settings.playerMode;
  $('#friendly').checked = settings.friendly;
  $('#roster-editor').hidden = !settings.playerMode;
  const max = Game.maxPlayers(state);
  for (const team of TEAMS) {
    const box = $(`[data-roster="${team}"]`);
    $('[data-role="roster-name"]', box).textContent = state.names[team];
    $('[data-role="roster-count"]', box).textContent = `${rosters[team].length} su ${max}`;
    renderRosterList($('[data-role="roster-list"]', box), team);
  }
  renderLibrary();
}

// Le righe si ricreano solo quando cambiano i numeri, così mentre si scrive un nome il campo non si chiude.
function renderRosterList(list, team) {
  const numbers = state.rosters[team];
  const key = numbers.join(',');
  if (list.dataset.key !== key) {
    list.dataset.key = key;
    list.replaceChildren(...numbers.map((number) => rosterRow(team, number)));
  }
  for (const row of list.children) {
    const number = Number(row.dataset.number);
    const input = $('input', row);
    if (document.activeElement !== input) input.value = state.playerNames[team][number] ?? '';
    const remove = $('button', row);
    remove.disabled = !Game.canRemovePlayer(state.events, team, number);
    remove.title = remove.disabled ? 'Ha già punti o falli' : '';
  }
}

function rosterRow(team, number) {
  const name = document.createElement('input');
  name.type = 'text';
  name.maxLength = 20;
  name.placeholder = 'Nome';
  name.setAttribute('aria-label', `Nome del numero ${number}`);
  name.addEventListener('input', () => {
    Game.setPlayerName(state, team, number, name.value);
    save();
    renderPlayers($(`[data-team="${team}"]`), team);
    renderLog();
  });
  name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') name.blur();
  });
  const remove = document.createElement('button');
  remove.dataset.action = 'remove-player';
  remove.dataset.number = number;
  remove.textContent = '✕';
  remove.setAttribute('aria-label', `Togli il numero ${number}`);
  const li = document.createElement('li');
  li.dataset.number = number;
  li.append(cell('chip-num', `#${number}`), name, remove);
  return li;
}

function renderLibrary() {
  const list = $('#library');
  if (library.length === 0) {
    const hint = document.createElement('li');
    hint.className = 'library-hint';
    hint.textContent = 'Nessuna squadra salvata: scrivi il nome della squadra, aggiungi i giocatori e premi «Salva squadra».';
    list.replaceChildren(hint);
    return;
  }
  const items = library.map((saved) => {
    const li = document.createElement('li');
    li.dataset.saved = saved.name;
    const who = document.createElement('span');
    who.className = 'lib-who';
    who.append(cell('lib-name', saved.name), cell('lib-count', `${saved.players.length} giocatori`));
    li.append(
      who,
      libraryButton('load-team', 'In casa', `Richiama in casa: ${saved.name}`, 'home'),
      libraryButton('load-team', 'Ospite', `Richiama come ospite: ${saved.name}`, 'away'),
      libraryButton('delete-team', '✕', `Elimina la squadra salvata ${saved.name}`)
    );
    return li;
  });
  list.replaceChildren(...items);
}

function libraryButton(action, text, label, target) {
  const btn = document.createElement('button');
  btn.dataset.action = action;
  if (target) btn.dataset.target = target;
  btn.textContent = text;
  btn.setAttribute('aria-label', label);
  return btn;
}

function showNote(box, text) {
  $('[data-role="note"]', box).textContent = text;
}

function renderClock() {
  const now = Date.now();
  const ms = Game.remainingMs(state.clock, now);
  const running = state.clock.running;
  clockEl.textContent = Game.formatClock(ms);
  clockEl.classList.toggle('last-minute', ms < 60000);
  clockEl.classList.toggle('expired', ms === 0);
  const shotMs = Game.shotRemainingMs(state.clock, now);
  const shotOff = Game.shotClockOff(state.clock, now);
  shotEl.textContent = shotOff ? '—' : Game.formatShot(shotMs);
  shotEl.classList.toggle('off', shotOff);
  shotEl.classList.toggle('expired', !shotOff && shotMs === 0);
  const toggle = $('[data-action="toggle-clock"]');
  toggle.textContent = running ? '⏸ Pausa' : '▶ Avvia';
  toggle.classList.toggle('running', running);
  toggle.disabled = !running && ms === 0;
  for (const btn of document.querySelectorAll('[data-action="adjust"]')) btn.disabled = running;
}

function renderLog() {
  const totals = { home: 0, away: 0 };
  const items = state.events.map((e) => {
    let what;
    if (e.type === 'score') {
      totals[e.team] += e.pts;
      what = e.pts > 0 ? `+${e.pts}` : `−${-e.pts} correzione`;
    } else if (e.type === 'foul') {
      what = e.n < 0 ? 'fallo tolto' : 'fallo';
    } else {
      what = 'timeout';
    }
    const who = e.player === undefined
      ? state.names[e.team]
      : `${state.names[e.team]} ${Game.playerLabel(state, e.team, e.player)}`;
    const li = document.createElement('li');
    li.append(
      cell('when', `${Game.periodLabel(e.period)} ${Game.formatClock(e.clockMs)}`),
      cell('who', `${who} ${what}`),
      cell('result', `${totals.home}–${totals.away}`)
    );
    return li;
  });
  $('#log').replaceChildren(...items.reverse());
}

function cell(className, text) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function toggleClock(now) {
  if (state.clock.running) {
    Game.pauseClock(state.clock, now);
  } else {
    unlockAudio();
    Game.startClock(state.clock, now);
  }
}

// I browser suonano solo dopo un gesto dell'utente: l'audio si prepara al clic su Avvia.
function unlockAudio() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

function buzzer(seconds) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.value = 220;
  gain.gain.value = 0.15;
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + seconds);
}

// A schermo intero il tabellone si legge da lontano, per esempio da un tablet a bordo campo.
function toggleFullscreen() {
  const request = document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen();
  request.catch(() => {
    // il browser ha rifiutato: il tabellone resta com'è
  });
}

function tick() {
  const expired = Game.checkExpiry(state.clock, Date.now());
  if (expired) {
    buzzer(expired === 'period' ? 1.2 : 0.6);
    update();
    return;
  }
  renderClock();
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn || btn.disabled) return;
  const action = btn.dataset.action;
  const team = btn.closest('[data-team]')?.dataset.team;
  const row = btn.closest('[data-player]');
  const player = row ? Number(row.dataset.player) : undefined;
  const fix = team !== undefined && correcting[team];
  const now = Date.now();
  switch (action) {
    case 'score':
      if (fix) Game.removePoints(state, now, team, Number(btn.dataset.pts), player);
      else Game.addPoints(state, now, team, Number(btn.dataset.pts), player);
      break;
    case 'foul':
      if (fix) Game.removeFoul(state, now, team, player);
      else Game.addFoul(state, now, team, player);
      break;
    case 'correct':
      correcting[team] = !correcting[team];
      render();
      return;
    case 'timeout':
      Game.takeTimeout(state, now, team);
      break;
    case 'undo':
      Game.undo(state);
      break;
    case 'toggle-clock':
      toggleClock(now);
      break;
    case 'adjust':
      Game.adjustClock(state, Number(btn.dataset.ms));
      break;
    case 'shot':
      Game.resetShot(state.clock, now, Number(btn.dataset.ms));
      break;
    case 'fullscreen':
      toggleFullscreen();
      break;
    case 'reset-clock':
      Game.goToPeriod(state, state.period);
      break;
    case 'prev-period':
      Game.goToPeriod(state, state.period - 1);
      break;
    case 'next-period':
      Game.goToPeriod(state, state.period + 1);
      break;
    case 'remove-player': {
      const box = btn.closest('[data-roster]');
      Game.removePlayer(state, box.dataset.roster, Number(btn.dataset.number));
      $('[data-role="error"]', box).textContent = '';
      showNote(box, '');
      break;
    }
    case 'save-team': {
      const box = btn.closest('[data-roster]');
      const snapshot = Game.teamSnapshot(state, box.dataset.roster);
      if (snapshot.players.length === 0) {
        showNote(box, 'Aggiungi prima almeno un giocatore.');
        return;
      }
      const replace = `C'è già una squadra salvata «${snapshot.name}»: la sostituisco con questa?`;
      if (Game.hasStoredTeam(library, snapshot.name) && !confirm(replace)) return;
      library = Game.storeTeam(library, snapshot);
      saveLibrary();
      showNote(box, `Squadra salvata come «${snapshot.name}».`);
      break;
    }
    case 'load-team': {
      const saved = library.find((t) => t.name === btn.closest('[data-saved]').dataset.saved);
      if (!saved) break; // eliminata nel frattempo da un'altra scheda
      const box = $(`[data-roster="${btn.dataset.target}"]`);
      const error = Game.loadTeam(state, btn.dataset.target, saved);
      $('[data-role="error"]', box).textContent = error ?? '';
      showNote(box, error ? '' : `Richiamata «${saved.name}».`);
      break;
    }
    case 'delete-team': {
      const name = btn.closest('[data-saved]').dataset.saved;
      if (!confirm(`Elimino la squadra salvata «${name}»? La partita in corso non cambia.`)) return;
      library = Game.deleteStoredTeam(library, name);
      saveLibrary();
      break;
    }
    case 'new-game':
      if (!confirm('Nuova partita? Punteggio, falli, timeout e cronaca verranno azzerati.')) return;
      state = Game.newGame(state.names, state);
      correcting.home = correcting.away = false;
      break;
  }
  // Una correzione alla volta: dopo il meno la squadra torna ai pulsanti normali.
  if (fix && (action === 'score' || action === 'foul')) correcting[team] = false;
  update();
});

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    toggleClock(Date.now());
    update();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    Game.undo(state);
    update();
  }
});

for (const input of document.querySelectorAll('.team-name')) {
  const team = input.closest('[data-team]').dataset.team;
  input.addEventListener('input', () => {
    state.names[team] = input.value.trim() || DEFAULT_NAMES[team];
    save();
    fitName(input);
    renderLog();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
  });
  input.addEventListener('blur', render);
}

$('#player-mode').addEventListener('change', (e) => {
  state.settings.playerMode = e.target.checked;
  correcting.home = correcting.away = false;
  update();
});

$('#friendly').addEventListener('change', (e) => {
  $('#friendly-error').textContent = Game.setFriendly(state, e.target.checked) ?? '';
  update();
});

for (const form of document.querySelectorAll('.add-player')) {
  const box = form.closest('[data-roster]');
  const number = $('.add-number', form);
  const name = $('.add-name', form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const error = Game.addPlayer(state, box.dataset.roster, number.value, name.value);
    $('[data-role="error"]', box).textContent = error ?? '';
    if (!error) {
      number.value = '';
      name.value = '';
    }
    number.focus();
    update();
  });
}

// Sull'iPhone il browser non permette lo schermo intero: lì il pulsante non compare.
$('[data-action="fullscreen"]').hidden = !document.fullscreenEnabled;

window.addEventListener('resize', render);
render();
setInterval(tick, 100);
