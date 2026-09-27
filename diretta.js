'use strict';

// La pagina di chi segue la partita: legge la diretta da Firebase (live.js) e la ridisegna a ogni cambiamento.
// Il cronometro scorre qui, dal tempo restante pubblicato dal tabellone e dall'istante in cui lo ha pubblicato.

const $ = (selector, el = document) => el.querySelector(selector);
const SIDES = { home: 'casa', away: 'ospiti' };

let live; // la diretta come l'ha scritta il tabellone; null se non c'è
let serverNow = () => Date.now();
let online = false;
let everOnline = false;

function showState(text, kind = '') {
  const state = $('#live-state');
  state.textContent = text;
  state.dataset.kind = kind;
}

function timeOfDay(at) {
  return new Date(at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

// La riga in alto: se la diretta corre, se è chiusa, se il tabellone o chi guarda hanno perso la rete.
function renderState() {
  if (live === undefined) return showState('Collegamento alla diretta…');
  if (live === null) return showState('Questa diretta non c\'è: controlla il link o fattelo rimandare.', 'error');
  const day = Tabellino.longDate(live.stato.giorno);
  if (!online && everOnline) return showState('Sei senza rete: la diretta riprende da sola quando torna.', 'offline');
  if (live.chiusa) return showState(`Diretta chiusa · ${day}`, 'closed');
  if (!live.collegato) {
    const since = live.aggiornata ? ` dalle ${timeOfDay(live.aggiornata)}` : '';
    return showState(`Il tabellone non è collegato${since}: il punteggio è quello di quel momento.`, 'offline');
  }
  showState(`● In diretta · ${day}`, 'live');
}

function renderClock() {
  if (!live) return;
  const { stato } = live;
  const ms = Game.liveClockMs(stato.cronometro, serverNow());
  const running = stato.cronometro.in_corsa && ms > 0;
  const clock = $('#clock');
  clock.textContent = Game.formatClock(ms);
  clock.classList.toggle('last-minute', ms < 60000);
  clock.classList.toggle('held', !running);
  let status = '';
  if (ms === 0) status = Game.statusText(stato.numero_periodo, 0, stato.casa.punti === stato.ospiti.punti);
  else if (stato.tempo_a_voce) status = 'Tempo dell\'ultima azione';
  else if (!running) status = 'Cronometro fermo';
  $('#status').textContent = status;
}

function renderTeam(team) {
  const side = live.stato[SIDES[team]];
  const panel = $(`.team[data-side="${team}"]`);
  $('[data-role="name"]', panel).textContent = side.nome;
  const color = $('[data-role="color"]', panel);
  color.textContent = side.colore ? `maglia ${side.colore}` : '';
  color.hidden = !side.colore;
  $('[data-role="score"]', panel).textContent = side.punti;
  $('[data-role="fouls"]', panel).textContent = side.falli;
  $('[data-role="bonus"]', panel).hidden = side.falli < Game.BONUS_FOULS;
  $('[data-role="timeouts"]', panel).textContent =
    '●'.repeat(side.timeout) + '○'.repeat(Math.max(0, side.timeout_max - side.timeout));
}

function cell(className, text) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

// La cronaca, dall'ultima azione in giù.
function renderFeed() {
  const items = Game.liveFeed(live.cronaca).map((a) => {
    const li = document.createElement('li');
    li.dataset.side = a.squadra;
    li.classList.toggle('basket', a.tipo === 'canestro');
    li.append(
      cell('when', `${Game.periodLabel(a.numero_periodo)} ${Game.formatClock(a.ms_restanti)}`),
      cell('who', a.scritta),
      cell('result', `${a.punteggio.casa}–${a.punteggio.ospiti}`)
    );
    return li;
  });
  $('#feed').replaceChildren(...items.reverse());
}

function render() {
  renderState();
  const board = $('.live-board');
  board.hidden = !live;
  if (!live) return;
  const { casa, ospiti, numero_periodo: period } = live.stato;
  document.title = `${casa.nome} ${casa.punti} – ${ospiti.punti} ${ospiti.nome}`;
  $('#period').textContent = Game.periodLabel(period);
  renderTeam('home');
  renderTeam('away');
  renderClock();
  renderFeed();
  const box = Game.decodeBox(live.tabellino ?? '');
  $('.box-panel').hidden = !box;
  if (box) Tabellino.render($('#box'), box);
}

async function start() {
  const id = location.hash.slice(1);
  if (!Live.ID_PATTERN.test(id)) {
    showState('Questo link della diretta è rovinato o incompleto: fattelo rimandare.', 'error');
    return;
  }
  try {
    serverNow = await Live.watch(id, {
      onData(doc) {
        live = doc && doc.stato ? doc : null;
        render();
      },
      onConnection(connected) {
        online = connected;
        everOnline ||= connected;
        renderState();
      },
      onError() {
        showState('Non riesco a leggere questa diretta: controlla il link o fattelo rimandare.', 'error');
      },
    });
  } catch {
    showState('Non riesco a collegarmi alla diretta: controlla la rete e ricarica la pagina.', 'error');
  }
}

setInterval(renderClock, 100);
window.addEventListener('hashchange', () => location.reload());
start();
