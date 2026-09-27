'use strict';

// La pagina di chi segue la partita: legge la diretta da Firebase (live.js) e la ridisegna a ogni cambiamento.
// Il cronometro scorre qui, dal tempo restante pubblicato dal tabellone e dall'istante in cui lo ha pubblicato.
// Con il video di YouTube la partita qui si vede qualche secondo dopo il campo: punteggio, tempo e cronaca
// aspettano lo stesso ritardo, perché non cambino prima del canestro.

const $ = (selector, el = document) => el.querySelector(selector);
const SIDES = { home: 'casa', away: 'ospiti' };
const DELAY_KEY = 'tabellone-ritardo'; // la correzione del ritardo fatta da chi guarda, per l'ultima diretta aperta

let latest; // l'ultima diretta arrivata; undefined finché non arriva, null se non c'è
let live; // la diretta che si mostra: con il video quella di qualche secondo fa
let versions = []; // le versioni arrivate, in ordine: { at, doc }, con l'ora del server in cui sono arrivate
let liveId = '';
let myDelay = 0; // i secondi che chi guarda aggiunge o toglie al ritardo scritto nel tabellone
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

// Il video della diretta, se il tabellone ne ha scritto uno valido.
function youtube() {
  return latest ? Game.youtubeId(latest.video?.youtube) : null;
}

// Il ritardo con cui si mostra la diretta: quello del tabellone più la correzione di chi guarda; senza video nessuno.
function delaySeconds() {
  if (!youtube()) return 0;
  const base = Game.youtubeDelay(latest.video.ritardo) ?? Game.YOUTUBE_DELAY_S;
  return Math.min(Game.MAX_YOUTUBE_DELAY_S, Math.max(0, base + myDelay));
}

// Sceglie la versione da mostrare adesso e scarta quelle più vecchie; true se è cambiata.
function pick() {
  if (versions.length === 0) return false;
  versions.splice(0, Game.liveDelayedIndex(versions, serverNow(), delaySeconds() * 1000));
  if (live === versions[0].doc) return false;
  live = versions[0].doc;
  return true;
}

function loadMyDelay() {
  try {
    const saved = JSON.parse(localStorage.getItem(DELAY_KEY));
    return saved?.id === liveId && Number.isFinite(saved.s) ? saved.s : 0;
  } catch {
    return 0;
  }
}

function saveMyDelay() {
  try {
    localStorage.setItem(DELAY_KEY, JSON.stringify({ id: liveId, s: myDelay }));
  } catch {
    // senza storage la correzione vale finché la pagina è aperta
  }
}

function changeDelay(step) {
  if (!youtube()) return;
  const base = delaySeconds() - myDelay;
  myDelay = Math.min(Game.MAX_YOUTUBE_DELAY_S, Math.max(0, delaySeconds() + step)) - base;
  saveMyDelay();
  pick();
  render();
}

function player(id) {
  const frame = document.createElement('iframe');
  frame.src = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&playsinline=1&rel=0`;
  frame.title = 'Il video della partita';
  frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin'; // YouTube vuole sapere da quale sito si guarda
  return frame;
}

// Il video sopra il punteggio: il riquadro si ricrea solo quando cambia il video, non a ogni aggiornamento.
function renderVideo() {
  const id = youtube();
  $('#live-video').hidden = !id;
  $('.live-board').classList.toggle('with-video', Boolean(id));
  const frame = $('#video-frame');
  if (frame.dataset.id !== (id ?? '')) {
    frame.dataset.id = id ?? '';
    frame.replaceChildren(...(id ? [player(id)] : []));
    if (id) $('#youtube-link').href = `https://www.youtube.com/watch?v=${id}`;
  }
  $('#delay').textContent = `${delaySeconds()}\u00a0s`;
}

function renderClock() {
  if (!live) return;
  const { stato } = live;
  const ms = Game.liveClockMs(stato.cronometro, serverNow() - delaySeconds() * 1000);
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
  renderVideo();
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
  // condividendo, il telefono attacca al link il testo del messaggio: conta solo il codice della diretta
  const id = location.hash.slice(1).split(/[^a-z0-9]/)[0];
  if (!Live.ID_PATTERN.test(id)) {
    showState('Questo link della diretta è rovinato o incompleto: fattelo rimandare.', 'error');
    return;
  }
  if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
  liveId = id;
  myDelay = loadMyDelay();
  try {
    serverNow = await Live.watch(id, {
      onData(doc) {
        latest = doc && doc.stato ? doc : null;
        if (latest) {
          versions.push({ at: serverNow(), doc: latest });
          pick();
        } else {
          versions = [];
          live = null;
        }
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

// Con il ritardo le versioni arrivate si mostrano quando è il loro momento, anche se non arriva niente di nuovo.
setInterval(() => {
  if (pick()) render();
  else renderClock();
}, 100);
for (const btn of document.querySelectorAll('[data-delay]')) {
  btn.addEventListener('click', () => changeDelay(Number(btn.dataset.delay)));
}
window.addEventListener('hashchange', () => location.reload());
start();
