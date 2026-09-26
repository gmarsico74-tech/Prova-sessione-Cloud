'use strict';

// Collega il tabellone alla pagina: legge i clic, aggiorna lo stato con Game e ridisegna.

const STORAGE_KEY = 'tabellone-basket';
const TEAMS = ['home', 'away'];
const DEFAULT_NAMES = { home: 'PC52', away: 'OSPITI' };

const $ = (selector, el = document) => el.querySelector(selector);
const clockEl = $('#clock');
const shotEl = $('#shot');

let state = load();
let audioCtx = null;

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.events) && saved.clock && saved.names) {
      saved.clock.shotMs ??= Game.SHOT_MS; // partite salvate prima dei 24 secondi
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

function update() {
  save();
  render();
}

function render() {
  const { events, period } = state;
  for (const team of TEAMS) {
    const panel = $(`[data-team="${team}"]`);
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
  }
  $('#period').textContent = Game.periodLabel(period);
  $('[data-action="prev-period"]').disabled = period === 1;
  $('[data-action="undo"]').disabled = events.length === 0;
  renderClock();
  renderLog();
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
      what = `+${e.pts}`;
    } else {
      what = e.type === 'foul' ? 'fallo' : 'timeout';
    }
    const li = document.createElement('li');
    li.append(
      cell('when', `${Game.periodLabel(e.period)} ${Game.formatClock(e.clockMs)}`),
      cell('who', `${state.names[e.team]} ${what}`),
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
  const team = btn.closest('[data-team]')?.dataset.team;
  const now = Date.now();
  switch (btn.dataset.action) {
    case 'score':
      Game.addPoints(state, now, team, Number(btn.dataset.pts));
      break;
    case 'foul':
      Game.addFoul(state, now, team);
      break;
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
    case 'new-game':
      if (!confirm('Nuova partita? Punteggio, falli, timeout e cronaca verranno azzerati.')) return;
      state = Game.newGame(state.names);
      break;
  }
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

// Sull'iPhone il browser non permette lo schermo intero: lì il pulsante non compare.
$('[data-action="fullscreen"]').hidden = !document.fullscreenEnabled;

window.addEventListener('resize', render);
render();
setInterval(tick, 100);
