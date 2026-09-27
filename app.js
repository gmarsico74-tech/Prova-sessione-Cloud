'use strict';

// Collega il tabellone alla pagina: legge i clic, aggiorna lo stato con Game e ridisegna.

const STORAGE_KEY = 'tabellone-basket';
const LIBRARY_KEY = 'tabellone-squadre'; // le squadre salvate restano anche dopo «Nuova partita»
const ARCHIVE_KEY = 'tabellone-archivio'; // le partite per le statistiche della stagione (le legge statistiche.html)
const SITE_URL = 'https://gmarsico74-tech.github.io/Prova-sessione-Cloud/';
const SHARE_PREFIX = '#squadre=';
const TEAMS = ['home', 'away'];
const DEFAULT_NAMES = { home: 'PC52', away: 'OSPITI' };

const $ = (selector, el = document) => el.querySelector(selector);
const clockEl = $('#clock');
const shotEl = $('#shot');
const talkBtn = $('#talk');
const voiceStatus = $('#voice-status');
const videoEl = $('#video');

// Con i comandi vocali accesi: sulla tastiera del Mac il tasto Option (alt) tenuto giù apre il microfono
// (il tasto fn il Mac non lo passa alle pagine web) e la barra spaziatrice avvia e ferma il cronometro.
// Un telecomando Bluetooth per presentazioni o volta pagina manda Pagina giù/su o le frecce, un telecomando
// per selfie Invio: un tasto apre il microfono, l'altro avvia e ferma il cronometro.
const TALK_KEYS = ['Alt', 'Enter', 'PageDown', 'ArrowRight', 'ArrowDown'];
const CLOCK_KEYS = ['PageUp', 'ArrowLeft', 'ArrowUp'];
// Un tasto premuto e lasciato subito (molti telecomandi fanno così) apre il microfono finché non lo si ripreme.
const TAP_MS = 300;

let state = load();
let videoUrl = null; // il video della partita aperto in questa pagina
let talkVideo = null; // quando si preme il microfono: { ms } il punto del video, resume se va fatto ripartire
let videoSavedAt = 0;
let clockHeld = false; // il cronometro fermo perché è fermo il video: riparte quando riparte il video
let videoMark = { s: 0, at: 0 }; // dove era il video (secondi) e quando lo si è visto, per misurare i salti
let keyTalk = null; // il tasto del microfono: { since, latched } finché il microfono è aperto da tastiera
let wakeLock = null; // con i comandi vocali lo schermo resta acceso
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
      saved.settings.shotClock ??= false; // e prima che i 24 secondi fossero facoltativi
      saved.settings.voice ??= false; // e prima dei comandi vocali
      saved.settings.timeSource ??= 'app'; // e prima del tempo detto a voce
      saved.settings.youtubeDelay ??= Game.YOUTUBE_DELAY_S; // e prima del video della diretta
      saved.date ??= null; // e prima del giorno della partita
      saved.notes ??= []; // e prima dei comandi non registrati
      saved.colors ??= { home: '', away: '' }; // e prima del colore delle maglie
      saved.video ??= null; // e prima del video dentro il tabellone
      saved.live ??= null; // e prima della diretta
      saved.youtube ??= null;
      saved.rosters ??= { home: [], away: [] };
      saved.playerNames ??= { home: {}, away: {} }; // e prima dei nomi
      saved.origins ??= { home: null, away: null }; // e prima di «Modifica»
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
  Live.changed();
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
  keepAwake();
}

function render() {
  const { events, period } = state;
  renderVideo();
  document.body.classList.toggle('player-mode', state.settings.playerMode);
  document.body.classList.toggle('voice-mode', state.settings.voice);
  document.body.classList.toggle('voice-time', state.settings.voice && state.settings.timeSource === 'voice');
  $('.shot-row').hidden = !state.settings.shotClock;
  $('#voice-dock').hidden = !state.settings.voice;
  $('#dock-score').textContent =
    `${state.names.home} ${Game.score(events, 'home')} – ${Game.score(events, 'away')} ${state.names.away}`;
  for (const team of TEAMS) {
    const panel = $(`[data-team="${team}"]`);
    const fix = correcting[team];
    const fouls = Game.teamFouls(events, team, period);
    const timeouts = Game.timeoutsLeft(events, team, period);
    const maxTimeouts = Game.timeoutWindow(period).max;
    const color = $('[data-role="color"]', panel);
    color.textContent = state.colors[team] ? `maglia ${state.colors[team]}` : '';
    color.hidden = !state.colors[team];
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
  Tabellino.render($('#box'), Game.boxScore(state, Date.now()));
  renderLive();
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
  const court = Game.courtAt(state.events, team, Game.boardTime(state, Date.now()));
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
    li.classList.toggle('on-court', court?.has(number) ?? false);
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
  $('#shot-clock').checked = settings.shotClock;
  $('#player-mode').checked = settings.playerMode;
  $('#voice-mode').checked = settings.voice;
  $('#voice-help').hidden = !settings.voice;
  for (const radio of document.querySelectorAll('[name="time-source"]')) radio.checked = radio.value === settings.timeSource;
  const dateField = $('#game-date');
  if (document.activeElement !== dateField) dateField.value = Game.gameDate(state, Date.now());
  $('#voice-support').textContent = Voice.supported
    ? ''
    : 'Questo browser non capisce la voce: su Android usa Chrome, su iPhone e iPad Safari.';
  $('#friendly').checked = settings.friendly;
  $('#roster-editor').hidden = !settings.playerMode;
  const max = Game.maxPlayers(state);
  for (const team of TEAMS) {
    const box = $(`[data-roster="${team}"]`);
    const colorField = $('.roster-team-color', box);
    if (document.activeElement !== colorField) colorField.value = state.colors[team];
    const nameField = $('.roster-team-name', box);
    if (document.activeElement !== nameField) nameField.value = state.names[team];
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
  $('[data-action="share-teams"]').disabled = library.length === 0;
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
    const count = saved.players.length;
    who.append(cell('lib-name', saved.name), cell('lib-count', `${count} ${count === 1 ? 'giocatore' : 'giocatori'}`));
    const actions = document.createElement('div');
    actions.className = 'lib-actions';
    actions.append(
      libraryButton('load-team', 'In casa', `Richiama in casa: ${saved.name}`, 'home'),
      libraryButton('load-team', 'Ospite', `Richiama come ospite: ${saved.name}`, 'away'),
      libraryButton('edit-team', 'Modifica', `Modifica la squadra salvata ${saved.name}`),
      libraryButton('delete-team', 'Elimina', `Elimina la squadra salvata ${saved.name}`)
    );
    li.append(who, actions);
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

// Il link porta le squadre salvate su un altro dispositivo. Dalla pagina aperta come file
// punta al sito online, perché un indirizzo del computer sul telefono non si aprirebbe.
function shareLink() {
  const base = location.protocol.startsWith('http') ? location.origin + location.pathname : SITE_URL;
  return `${base}${SHARE_PREFIX}${Game.encodeLibrary(library)}`;
}

// Manda un link con la condivisione del telefono; dove non c'è lo copia, e se non si può lo mostra da copiare.
async function shareUrl(url, { title, text, note, copied, ask }) {
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      note.textContent = '';
      return;
    }
    await navigator.clipboard.writeText(url);
    note.textContent = copied;
  } catch (err) {
    if (err?.name === 'AbortError') return; // condivisione annullata
    prompt(ask, url);
  }
}

function shareTeams() {
  shareUrl(shareLink(), {
    title: 'Squadre del tabellone',
    text: 'Apri il link per aggiungere le squadre al tabellone.',
    note: $('#share-note'),
    copied: "Link copiato: incollalo in un messaggio a te stesso e aprilo sull'altro dispositivo.",
    ask: "Copia questo link e aprilo sull'altro dispositivo:",
  });
}

// Il tabellino com'è adesso, dentro un link alla pagina tabellino.html che chiunque può aprire.
function publishBox() {
  const now = Date.now();
  const status = Game.gameStatus(state, now);
  const code = Game.encodeBox(Game.boxScore(state, now), { date: Game.gameDate(state, now), status });
  const page = location.protocol.startsWith('http') ? new URL('tabellino.html', location.href) : new URL('tabellino.html', SITE_URL);
  page.hash = code;
  const { home, away } = state.names;
  const result = `${home} ${Game.score(state.events, 'home')} – ${Game.score(state.events, 'away')} ${away}`;
  shareUrl(page.href, {
    title: `Tabellino ${result}`,
    text: `${result} · ${status}`,
    note: $('#box-note'),
    copied: 'Link del tabellino copiato: incollalo dove vuoi pubblicarlo, per esempio nel gruppo della squadra.',
    ask: 'Copia il link del tabellino:',
  });
}

// ——— La diretta ———
// «Avvia diretta» dà il link di diretta.html, dove chiunque segue la partita mentre la segni: punteggio,
// tempo, cronaca e tabellino arrivano da Firebase (live.js). Scrive solo chi entra con l'account autorizzato.

let liveStatus = { connected: false };

const LIVE_ERRORS = {
  'auth/popup-blocked': 'Il browser ha bloccato la finestra di Google: premi di nuovo «Avvia diretta».',
  'auth/popup-closed-by-user': 'Accesso con Google annullato: la diretta non è partita.',
  'auth/cancelled-popup-request': 'Accesso con Google annullato: la diretta non è partita.',
  'auth/network-request-failed': 'Senza rete la diretta non parte: riprova quando sei collegato.',
  'auth/unauthorized-domain': 'Questo indirizzo non è fra i domini autorizzati del progetto Firebase.',
  'auth/operation-not-allowed': 'Nel progetto Firebase l\'accesso con Google non è attivo.',
};

async function startLive() {
  const note = $('#box-note');
  if (!Live.available()) {
    if (!location.protocol.startsWith('http')) {
      const site = document.createElement('a');
      site.href = SITE_URL;
      site.textContent = 'tabellone online';
      note.replaceChildren('La diretta parte dal ', site, ': aperto come file il tabellone non può entrare con Google.');
    } else {
      note.textContent = 'La diretta non è ancora collegata al progetto Firebase.';
    }
    return;
  }
  note.textContent = 'Avvio la diretta…';
  try {
    const live = await Live.start();
    state.live ??= live; // «Riprendi diretta» tiene il link di prima
    update();
    // se l'accesso era già fatto il clic vale ancora e il link si manda subito; se no si manda con il pulsante
    if (navigator.userActivation?.isActive) shareLive();
    else note.textContent = 'Diretta avviata: con «Link della diretta» lo mandi nel gruppo della squadra.';
  } catch (err) {
    note.textContent = LIVE_ERRORS[err?.code] ?? 'Non riesco ad avviare la diretta: controlla la rete e riprova.';
  }
}

function shareLive() {
  if (!state.live) return;
  const { home, away } = state.names;
  shareUrl(Live.link(state.live.id), {
    title: `Diretta ${home} – ${away}`,
    text: `${home} – ${away} in diretta: ${state.youtube ? 'video, ' : ''}punteggio, tempo e cronaca.`,
    note: $('#box-note'),
    copied: 'Link della diretta copiato: incollalo nel gruppo della squadra.',
    ask: 'Copia il link della diretta:',
  });
}

function stopLive() {
  if (!confirm('Fermo la diretta? Chi la segue vede il punteggio di adesso, con la scritta «Diretta chiusa».')) return;
  state.live = null;
  update();
  $('#box-note').textContent = 'Diretta chiusa: il link mostra la partita fino a qui.';
}

// Il segnale DIRETTA: rosso se arriva a chi guarda, grigio senza rete (Firebase manda tutto quando la rete torna)
// o se bisogna rientrare con Google per riprenderla.
function renderLive() {
  const on = Boolean(state.live);
  const stopped = on && liveStatus.signedOut;
  const badge = $('#live-badge');
  badge.hidden = !on;
  badge.classList.toggle('offline', stopped || !liveStatus.connected);
  badge.textContent = stopped ? '● DIRETTA FERMA' : liveStatus.connected ? '● DIRETTA' : '● DIRETTA · SENZA RETE';
  badge.title = liveStatus.email ? `Diretta di ${liveStatus.email}: tocca per mandare il link` : 'Tocca per mandare il link';
  const startBtn = $('[data-action="live-start"]');
  startBtn.hidden = on && !stopped;
  startBtn.textContent = stopped ? 'Riprendi diretta' : 'Avvia diretta';
  $('.live-actions [data-action="live-share"]').hidden = !on;
  $('[data-action="live-stop"]').hidden = !on;
  // un link sbagliato resta scritto finché non lo si corregge
  const link = $('#live-youtube');
  if (document.activeElement !== link && link.getAttribute('aria-invalid') !== 'true') {
    link.value = state.youtube ? `https://youtu.be/${state.youtube}` : '';
  }
  const delay = $('#live-delay');
  if (document.activeElement !== delay) delay.value = state.settings.youtubeDelay;
}

// Il video della diretta: si incolla il link che YouTube dà con «Condividi»; vuoto, la diretta è senza video.
$('#live-youtube').addEventListener('change', (e) => {
  const field = e.target;
  const note = $('#box-note');
  const text = field.value.trim();
  const id = Game.youtubeId(text);
  field.setAttribute('aria-invalid', String(Boolean(text) && !id));
  if (text && !id) {
    note.textContent = 'Questo non è il link di un video di YouTube: nella diretta di YouTube premi «Condividi» e copia il link.';
    return;
  }
  if (id === state.youtube) {
    note.textContent = '';
    return;
  }
  state.youtube = id;
  update();
  if (!id) note.textContent = 'Video tolto: la diretta mostra solo punteggio, tempo e cronaca.';
  else if (state.live) note.textContent = 'Video aggiunto: chi segue la diretta lo vede sopra il punteggio.';
  else note.textContent = 'Video pronto: con «Avvia diretta» chi la segue lo vede sopra il punteggio.';
});

$('#live-delay').addEventListener('change', (e) => {
  const seconds = Game.youtubeDelay(e.target.value);
  if (seconds !== null) state.settings.youtubeDelay = seconds;
  e.target.value = state.settings.youtubeDelay;
  update();
});

Live.init({
  getState: () => state,
  onStatus(status) {
    liveStatus = status;
    if (status.denied && state.live?.id === status.id) {
      state.live = null;
      save();
      $('#box-note').textContent =
        `L'account ${status.denied} non può scrivere la diretta: premi «Avvia diretta» e scegli il tuo account.`;
    }
    renderLive();
  },
});

// Il file della partita: azioni, scout e tabellini agganciati al tempo del tabellone, per il montatore
// e per l'archivio delle statistiche su un altro dispositivo.
function downloadGameFile() {
  const now = Date.now();
  const name = Game.gameFileName(state, now);
  const blob = new Blob([JSON.stringify(Game.gameFile(state, now), null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60000);
  $('#box-note').textContent =
    state.events.length === 0
      ? `Scaricato «${name}», ma non ci sono ancora azioni.`
      : `Scaricato «${name}»: serve al montatore insieme al video, e alle statistiche su un altro dispositivo.`;
}

// Salva la partita nell'archivio di questo dispositivo, da cui la pagina delle statistiche fa tabellini e medie.
// Salvarla di nuovo (stesso giorno e stesse squadre) la aggiorna.
function saveToArchive() {
  const note = $('#box-note');
  let archive = [];
  try {
    const saved = JSON.parse(localStorage.getItem(ARCHIVE_KEY));
    if (Array.isArray(saved)) archive = saved;
  } catch {
    // archivio illeggibile: si riparte da uno vuoto
  }
  const entry = Game.archiveEntry(state, Date.now());
  const again = archive.some((g) => g.id === entry.id);
  try {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(Game.storeGame(archive, entry)));
  } catch {
    note.textContent = 'Non riesco a salvare nell\'archivio: scarica il «File della partita» e aggiungilo dalle statistiche.';
    return;
  }
  note.textContent = again
    ? 'Partita aggiornata nell\'archivio: la trovi in Statistiche.'
    : 'Partita salvata nell\'archivio: la trovi in Statistiche.';
}

// Aperto un link con le squadre, le aggiunge a quelle salvate dopo averlo chiesto.
function importFromLink() {
  if (!location.hash.startsWith(SHARE_PREFIX)) return;
  const incoming = Game.decodeLibrary(location.hash.slice(SHARE_PREFIX.length));
  try {
    history.replaceState(null, '', location.pathname + location.search);
  } catch {
    // se il browser non lo permette, il link resta nella barra degli indirizzi: nessun danno
  }
  if (!incoming) {
    alert('Questo link delle squadre è rovinato o incompleto: fattelo rimandare.');
    return;
  }
  const what = incoming.length === 1 ? 'la squadra' : `${incoming.length} squadre`;
  const where = state.settings.playerMode
    ? 'in Impostazioni, sotto «Squadre salvate»'
    : 'in Impostazioni, accendendo «Punti e falli ai giocatori»';
  const ask =
    `Aggiungo ${what}: ${incoming.map((t) => t.name).join(', ')}?\n` +
    `Quelle con lo stesso nome vengono sostituite. Le trovi ${where}.`;
  if (!confirm(ask)) return;
  library = Game.mergeLibrary(library, incoming);
  saveLibrary();
}

function showNote(box, text) {
  $('[data-role="note"]', box).textContent = text;
}

function renderClock() {
  const now = Date.now();
  const ms = Game.remainingMs(state.clock, now);
  const running = state.clock.running || clockHeld;
  clockEl.textContent = Game.formatClock(ms);
  clockEl.classList.toggle('held', clockHeld);
  const inVideo = videoUrl !== null ? ` · ▶ ${Game.formatVideoTime(videoEl.currentTime * 1000)}` : '';
  $('#dock-clock').textContent = `${Game.periodLabel(state.period)} ${Game.formatClock(ms)}${inVideo}`;
  clockEl.classList.toggle('last-minute', ms < 60000);
  clockEl.classList.toggle('expired', ms === 0);
  const shotMs = Game.shotRemainingMs(state.clock, now);
  const shotOff = Game.shotClockOff(state.clock, now);
  shotEl.textContent = shotOff ? '—' : Game.formatShot(shotMs);
  shotEl.classList.toggle('off', shotOff);
  shotEl.classList.toggle('expired', !shotOff && shotMs === 0);
  for (const toggle of document.querySelectorAll('[data-action="toggle-clock"]')) {
    toggle.textContent = running ? '⏸ Pausa' : '▶ Avvia';
    toggle.classList.toggle('running', running);
    toggle.disabled = !running && ms === 0;
  }
  for (const btn of document.querySelectorAll('[data-action="adjust"]')) btn.disabled = state.clock.running;
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
    } else if (e.type === 'lineup') {
      what = `in campo ${e.on.join(' ')}`;
    } else if (e.type === 'sub') {
      what = `entra ${e.in.join(' ')}, esce ${e.out.join(' ')}`;
    } else if (e.type === 'stat') {
      what = Game.statName(e).toLowerCase();
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
    if (e.videoMs !== undefined) {
      // toccando la riga il video torna a qualche secondo prima dell'azione
      li.dataset.videoMs = e.videoMs;
      li.classList.toggle('seekable', videoUrl !== null);
      li.title = `Nel video a ${Game.formatVideoTime(e.videoMs)}`;
    }
    return li;
  });
  // i comandi a voce non registrati, in grigio, al punto della cronaca in cui sono stati detti
  const notes = state.notes.map((n) => {
    const li = document.createElement('li');
    li.className = 'unheard';
    li.title = n.reason;
    li.append(
      cell('when', `${Game.periodLabel(n.period)} ${Game.formatClock(n.clockMs)}`),
      cell('who', `non registrato: «${n.heard}» · ${n.reason}`),
      cell('result', '')
    );
    return { after: n.after, li };
  });
  const rows = [];
  for (let i = 0; i <= items.length; i++) {
    for (const n of notes) if (Math.min(n.after, items.length) === i) rows.push(n.li);
    if (i < items.length) rows.push(items[i]);
  }
  $('#log').replaceChildren(...rows.reverse());
}

function cell(className, text) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

// Con il video aperto il cronometro segue il video: a video fermo Avvia lo fa partire insieme al video,
// e Pausa lo lascia fermo anche quando il video riparte.
function toggleClock(now) {
  if (clockHeld) {
    clockHeld = false;
  } else if (state.clock.running) {
    Game.pauseClock(state.clock, now);
  } else if (videoUrl !== null && videoEl.paused) {
    unlockAudio();
    clockHeld = Game.remainingMs(state.clock, now) > 0;
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

function tone(frequency, delay, seconds) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.value = frequency;
  gain.gain.value = 0.15;
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(audioCtx.currentTime + delay);
  osc.stop(audioCtx.currentTime + delay + seconds);
}

function buzzer(seconds) {
  tone(220, 0, seconds);
}

// ——— Comandi vocali ———
// Si guarda la partita, non lo schermo: l'esito arriva con un suono (acuto se capito, due bassi se no)
// e, dove il telefono lo permette, con una vibrazione.

const talk = Voice.supported
  ? Voice.createTalk({
      onListening: () => showVoice('listening', 'Ti ascolto…'),
      onHeard: (text) => showVoice('listening', `«${text}»`),
      onResult: voiceResult,
    })
  : null;

function showVoice(kind, message, heard) {
  voiceStatus.className = `voice-status ${kind}`;
  const lines = [cell('voice-message', message)];
  if (heard) lines.push(cell('voice-heard', `Ho sentito «${heard}»`));
  voiceStatus.replaceChildren(...lines);
}

function voiceResult({ at, heard, error }) {
  talkBtn.classList.remove('listening');
  if (keyTalk) {
    keyTalk = null; // il microfono si è chiuso da solo (per esempio senza permesso): il tasto riparte da capo
    talk?.release();
  }
  const stamp = talkVideo ? { videoMs: talkVideo.ms } : {};
  if (talkVideo?.resume) videoEl.play().catch(() => {});
  talkVideo = null;
  const outcome = heard.length
    ? Game.voiceCommand(state, at, heard, stamp)
    : { ok: false, message: Voice.explain(error), heard: '' };
  showVoice(outcome.ok ? 'ok' : 'ko', `${outcome.ok ? '✓' : '✗'} ${outcome.message}`, outcome.ok ? '' : outcome.heard);
  if (outcome.ok) {
    tone(880, 0, 0.08);
    navigator.vibrate?.(40);
    correcting.home = correcting.away = false;
  } else {
    tone(196, 0, 0.12);
    tone(196, 0.2, 0.12);
    navigator.vibrate?.([80, 60, 80]);
  }
  update(); // anche un comando non capito resta nella cronaca
}

function pressTalk() {
  if (!state.settings.voice) return;
  unlockAudio();
  if (!talk) {
    showVoice('ko', '✗ Questo browser non capisce la voce: su Android usa Chrome, su iPhone e iPad Safari.');
    return;
  }
  talkBtn.classList.add('listening');
  showVoice('listening', 'Apro il microfono…');
  if (videoUrl !== null && !talkVideo) {
    // il punto del video in cui si comincia a parlare; il video si ferma, così la voce non si mescola al suo audio
    const resume = $('#video-pause').checked && !videoEl.paused;
    talkVideo = { ms: Math.round(videoEl.currentTime * 1000), resume };
    if (resume) videoEl.pause();
  }
  talk.press(Date.now());
}

function releaseTalk() {
  talk?.release();
}

talkBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  talkBtn.setPointerCapture?.(e.pointerId);
  pressTalk();
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) talkBtn.addEventListener(type, releaseTalk);
talkBtn.addEventListener('contextmenu', (e) => e.preventDefault());

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
  const expired = Game.checkExpiry(state.clock, Date.now(), state.settings.shotClock);
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
  const before = state.events.length;
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
      clockHeld = false;
      break;
    case 'prev-period':
      Game.goToPeriod(state, state.period - 1);
      clockHeld = false;
      break;
    case 'next-period':
      Game.goToPeriod(state, state.period + 1);
      clockHeld = false;
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
      const side = box.dataset.roster;
      const name = state.names[side];
      const origin = state.origins[side];
      if (state.rosters[side].length === 0) {
        showNote(box, 'Aggiungi prima almeno un giocatore.');
        return;
      }
      const kind = Game.saveKind(library, state, side);
      if (kind === 'replace' && !confirm(`C'è già una squadra salvata «${name}»: la sostituisco con questa?`)) return;
      let renameFrom = null;
      if (kind === 'rename') {
        const ask =
          `Hai cambiato il nome da «${origin}» a «${name}».\n\n` +
          `OK = rinomina: «${origin}» diventa «${name}».\n` +
          `Annulla = copia: tieni «${origin}» e salvi anche «${name}».`;
        if (confirm(ask)) renameFrom = origin;
      }
      library = Game.saveTeam(library, state, side, renameFrom);
      saveLibrary();
      if (kind === 'update') showNote(box, `Squadra «${name}» aggiornata.`);
      else if (renameFrom) showNote(box, `Squadra rinominata in «${name}».`);
      else showNote(box, `Squadra salvata come «${name}».`);
      break;
    }
    case 'edit-team': {
      // si modifica nel riquadro della squadra di casa: poi «Salva squadra» la aggiorna
      const saved = library.find((t) => t.name === btn.closest('[data-saved]').dataset.saved);
      if (!saved) break;
      const box = $('[data-roster="home"]');
      const error = Game.loadTeam(state, 'home', saved);
      $('[data-role="error"]', box).textContent = error ?? '';
      showNote(box, error ? '' : `Stai modificando «${saved.name}»: cambia nome e giocatori, poi premi «Salva squadra».`);
      update();
      if (!error) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
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
    case 'share-teams':
      shareTeams();
      return;
    case 'publish-box':
      publishBox();
      return;
    case 'live-start':
      startLive();
      return;
    case 'live-share':
      shareLive();
      return;
    case 'live-stop':
      stopLive();
      return;
    case 'game-file':
      downloadGameFile();
      return;
    case 'archive-game':
      saveToArchive();
      return;
    case 'delete-team': {
      const name = btn.closest('[data-saved]').dataset.saved;
      if (!confirm(`Elimino la squadra salvata «${name}»? La partita in corso non cambia.`)) return;
      library = Game.deleteStoredTeam(library, name);
      saveLibrary();
      break;
    }
    case 'new-game': {
      if (!confirm('Nuova partita? Punteggio, falli, timeout e cronaca verranno azzerati.')) return;
      const video = videoUrl !== null ? state.video : null; // il video aperto resta aperto
      const wasLive = Boolean(state.live);
      const hadYoutube = Boolean(state.youtube);
      state = Game.newGame(state.names, state); // la diretta e il suo video sono di una partita: la nuova ne ha di suoi
      state.video = video;
      clockHeld = false;
      correcting.home = correcting.away = false;
      $('#live-youtube').removeAttribute('aria-invalid');
      if (wasLive) {
        $('#box-note').textContent =
          `La diretta della partita di prima è chiusa: per questa premi «Avvia diretta»${hadYoutube ? ' e incolla il link del nuovo video' : ''}.`;
      } else if (hadYoutube) {
        $('#box-note').textContent = 'Il video di YouTube era della partita di prima: per questa incolla il link nuovo.';
      }
      break;
    }
    case 'close-video':
      closeVideo();
      return;
  }
  // Una correzione alla volta: dopo il meno la squadra torna ai pulsanti normali.
  if (fix && (action === 'score' || action === 'foul')) correcting[team] = false;
  // anche le azioni segnate con i pulsanti ricordano il punto del video
  if (videoUrl !== null) {
    for (const e of state.events.slice(before)) e.videoMs ??= Math.round(videoEl.currentTime * 1000);
  }
  update();
});

// ——— Il video della partita ———
// Si apre un file dal dispositivo e si guarda dentro il tabellone: tasti e microfono funzionano anche mentre il
// video è grande (o la pagina è a schermo intero), perché la finestra in primo piano è sempre questa.

function openVideo(file) {
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = URL.createObjectURL(file);
  // lo stesso video riaperto riparte da dove si era arrivati
  const from = state.video?.name === file.name ? state.video.positionMs : 0;
  state.video = { name: file.name, positionMs: from };
  videoEl.src = videoUrl;
  videoMark = { s: from / 1000, at: performance.now() }; // riprendere da lì non è un salto del cronometro
  videoEl.addEventListener(
    'loadedmetadata',
    () => {
      if (from) videoEl.currentTime = from / 1000;
    },
    { once: true }
  );
  update();
}

function closeVideo() {
  clockHeld = false;
  videoEl.pause();
  videoEl.removeAttribute('src');
  videoEl.load();
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = null;
  state.video = null;
  update();
}

function renderVideo() {
  const loaded = videoUrl !== null;
  $('#video-panel').hidden = !state.video;
  document.body.classList.toggle('video-shown', loaded);
  if (!state.video) return;
  videoEl.hidden = !loaded;
  $('#video-name').textContent = state.video.name;
  const reopen = $('#video-reopen');
  reopen.hidden = loaded;
  reopen.textContent = loaded
    ? ''
    : `Per continuare riapri il video «${state.video.name}» con il pulsante «▶ Video»: ripartirà da ` +
      `${Game.formatVideoTime(state.video.positionMs)}.`;
}

$('#video-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) openVideo(file);
});

// Il punto del video visto per ultimo. Durante un salto currentTime è già la destinazione: non si segna.
function markVideo() {
  if (!videoEl.seeking) videoMark = { s: videoEl.currentTime, at: performance.now() };
}

// Dove era il video un attimo prima di un salto: l'ultimo punto visto, più il tempo passato se stava andando.
function videoBeforeSeek() {
  if (videoEl.paused) return videoMark.s;
  return videoMark.s + ((performance.now() - videoMark.at) / 1000) * videoEl.playbackRate;
}

// Ogni spostamento del video (frecce, un'azione toccata nella cronaca, la barra del video) sposta dello stesso
// tempo il cronometro in gioco, anche se è fermo solo perché è fermo il video. Fermato a mano non si tocca.
videoEl.addEventListener('seeking', () => {
  const jumpMs = Math.round((videoEl.currentTime - videoBeforeSeek()) * 1000);
  videoMark = { s: videoEl.currentTime, at: performance.now() };
  if (videoUrl === null || !(state.clock.running || clockHeld) || jumpMs === 0) return;
  Game.moveClock(state, Date.now(), jumpMs);
  update();
});

videoEl.addEventListener('seeked', () => markVideo());

// il punto a cui si è arrivati resta salvato, per riprendere da lì dopo aver chiuso la pagina
videoEl.addEventListener('timeupdate', () => {
  markVideo();
  if (!state.video || videoUrl === null) return;
  state.video.positionMs = Math.round(videoEl.currentTime * 1000);
  if (Date.now() - videoSavedAt > 2000) {
    videoSavedAt = Date.now();
    save();
  }
});

// Il cronometro del tabellone si ferma quando si ferma il video (con lo spazio, con i suoi comandi o perché
// si parla al microfono) e riparte con lui: così resta al passo con il tabellone inquadrato.
videoEl.addEventListener('pause', () => {
  markVideo();
  if (videoUrl === null || !state.clock.running) {
    save();
    return;
  }
  Game.pauseClock(state.clock, Date.now());
  clockHeld = true;
  update();
});
videoEl.addEventListener('play', () => {
  markVideo();
  if (!clockHeld || videoUrl === null) return;
  clockHeld = false;
  Game.startClock(state.clock, Date.now());
  update();
});

// Con il video aperto: spazio avvia e ferma il video, le frecce destra e sinistra lo spostano di 5 secondi
// (1 con Maiusc). Si ascolta prima di tutto il resto, così il video e il cronometro non reagiscono due volte.
document.addEventListener(
  'keydown',
  (e) => {
    if (videoUrl === null || e.target.closest('input, select, textarea')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) (videoEl.paused ? videoEl.play() : Promise.resolve(videoEl.pause())).catch(() => {});
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      const step = (e.shiftKey ? 1 : 5) * (e.key === 'ArrowLeft' ? -1 : 1);
      videoEl.currentTime = Math.max(0, videoEl.currentTime + step);
    }
  },
  true
);

// toccando un'azione della cronaca il video torna a 3 secondi prima, per rivederla (e il cronometro in gioco
// con lui: tornando avanti dov'eri, con le frecce o la barra del video, torna anche lui dov'era)
$('#log').addEventListener('click', (e) => {
  const row = e.target.closest('li[data-video-ms]');
  if (!row || videoUrl === null) return;
  videoEl.currentTime = Math.max(0, Number(row.dataset.videoMs) / 1000 - 3);
  videoEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select')) return;
  if (state.settings.voice && TALK_KEYS.includes(e.key)) {
    e.preventDefault();
    if (e.repeat) return;
    if (keyTalk?.latched) {
      keyTalk = null;
      releaseTalk();
      return;
    }
    keyTalk = { since: performance.now(), latched: false };
    pressTalk();
  } else if (state.settings.voice && CLOCK_KEYS.includes(e.key)) {
    e.preventDefault();
    if (e.repeat) return;
    toggleClock(Date.now());
    update();
  } else if (e.code === 'Space') {
    e.preventDefault();
    if (e.repeat) return;
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

for (const input of document.querySelectorAll('.roster-team-color')) {
  const team = input.closest('[data-roster]').dataset.roster;
  input.addEventListener('input', () => {
    Game.setColor(state, team, input.value);
    save();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
  });
  input.addEventListener('blur', render);
}

for (const input of document.querySelectorAll('.roster-team-name')) {
  const team = input.closest('[data-roster]').dataset.roster;
  input.addEventListener('input', () => {
    state.names[team] = input.value.trim() || DEFAULT_NAMES[team];
    save();
    const board = $(`[data-team="${team}"] .team-name`);
    board.value = state.names[team];
    fitName(board);
    renderLog();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
  });
  input.addEventListener('blur', render);
}

document.addEventListener('keyup', (e) => {
  if (!state.settings.voice || !TALK_KEYS.includes(e.key) || !keyTalk) return;
  e.preventDefault();
  if (performance.now() - keyTalk.since < TAP_MS) {
    keyTalk.latched = true; // premuto e lasciato subito: il microfono resta aperto fino alla prossima pressione
    showVoice('listening', 'Ti ascolto: premi di nuovo il tasto quando hai finito.');
    return;
  }
  keyTalk = null;
  releaseTalk();
});

// Con i comandi vocali lo schermo non si spegne da solo: il telefono resta pronto in mano o sul tavolo.
async function keepAwake() {
  const want = state.settings.voice && document.visibilityState === 'visible';
  if (!want) {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
    return;
  }
  if (wakeLock || !navigator.wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch {
    // il browser non lo permette: lo schermo si spegne con le sue regole
  }
}

document.addEventListener('visibilitychange', keepAwake);

$('#shot-clock').addEventListener('change', (e) => {
  state.settings.shotClock = e.target.checked;
  if (e.target.checked) Game.resetShot(state.clock, Date.now(), Game.SHOT_MS);
  update();
});

// I comandi vocali lavorano sui numeri di maglia: accenderli accende anche i giocatori, spegnere i giocatori li spegne.
$('#player-mode').addEventListener('change', (e) => {
  state.settings.playerMode = e.target.checked;
  if (!e.target.checked) state.settings.voice = false;
  correcting.home = correcting.away = false;
  update();
});

$('#voice-mode').addEventListener('change', (e) => {
  state.settings.voice = e.target.checked;
  if (e.target.checked) state.settings.playerMode = true;
  correcting.home = correcting.away = false;
  update();
});

// Con il tempo detto a voce il cronometro dell'app non corre: si ferma e segue i tempi detti.
for (const radio of document.querySelectorAll('[name="time-source"]')) {
  radio.addEventListener('change', () => {
    state.settings.timeSource = radio.value;
    if (radio.value === 'voice') Game.pauseClock(state.clock, Date.now());
    update();
  });
}

$('#game-date').addEventListener('change', (e) => {
  state.date = /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) ? e.target.value : null;
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

window.addEventListener('hashchange', () => {
  importFromLink();
  render();
});

window.addEventListener('resize', render);
importFromLink();
render();
setInterval(tick, 100);
Live.changed(); // riprende la diretta dopo un ricaricamento della pagina
setTimeout(Live.preload, 2000); // così la finestra di Google si apre subito al clic su «Avvia diretta»
