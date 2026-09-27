// Regole e calcoli del tabellone secondo il regolamento FIBA, senza DOM:
// li usano sia la pagina (script classico, espone window.Game) sia i test (node --test).
(function (root) {
  'use strict';

  const QUARTER_MS = 10 * 60 * 1000;
  const OVERTIME_MS = 5 * 60 * 1000;
  const SHOT_MS = 24 * 1000;
  const SHOT_SHORT_MS = 14 * 1000; // dopo un rimbalzo offensivo o un fallo nella metà campo d'attacco
  const BONUS_FOULS = 5; // dal 5° fallo di squadra nel periodo si tirano i liberi
  const PLAYER_FOUL_LIMIT = 5; // al 5° fallo personale il giocatore esce
  const MAX_PLAYERS = 12;
  const MAX_PLAYERS_FRIENDLY = 16;

  function periodLength(period) {
    return period <= 4 ? QUARTER_MS : OVERTIME_MS;
  }

  function periodLabel(period) {
    return period <= 4 ? `Q${period}` : `TS${period - 4}`;
  }

  function freshClock(period) {
    return { remainingMs: periodLength(period), shotMs: SHOT_MS, running: false, startedAt: 0 };
  }

  // Una nuova partita riparte da zero ma tiene impostazioni e numeri di maglia di quella di prima.
  // I 24 secondi sono facoltativi: nelle giovanili spesso il tabellone dell'azione non c'è.
  // timeSource dice da dove prendono il tempo le azioni dette a voce: 'app' dal cronometro del tabellone,
  // 'voice' dal tempo detto nel comando, letto sul tabellone della partita o del video.
  function newGame(names, setup = {}) {
    return {
      names: { ...names },
      // il colore delle maglie: a voce «il 12 bianco» vale come dire la squadra
      colors: { home: setup.colors?.home ?? '', away: setup.colors?.away ?? '' },
      settings: { playerMode: false, friendly: false, shotClock: false, voice: false, timeSource: 'app', ...setup.settings },
      rosters: { home: [...(setup.rosters?.home ?? [])], away: [...(setup.rosters?.away ?? [])] },
      playerNames: { home: { ...setup.playerNames?.home }, away: { ...setup.playerNames?.away } },
      // da quale squadra salvata vengono i giocatori di ciascun lato, per aggiornarla o rinominarla
      origins: { home: setup.origins?.home ?? null, away: setup.origins?.away ?? null },
      period: 1,
      clock: freshClock(1),
      events: [],
      date: null, // il giorno della partita, se non è oggi (per esempio quando la si segna guardando il video)
      notes: [], // i comandi a voce non registrati, perché restino nella cronaca
      video: null, // il video della partita aperto nel tabellone: { name, positionMs }
    };
  }

  // Le correzioni sono canestri con punti negativi: la somma dà sempre il punteggio giusto.
  function score(events, team) {
    return events.reduce((sum, e) => (e.type === 'score' && e.team === team ? sum + e.pts : sum), 0);
  }

  function playerPoints(events, team, player) {
    return events.reduce(
      (sum, e) => (e.type === 'score' && e.team === team && e.player === player ? sum + e.pts : sum),
      0
    );
  }

  // Un fallo vale +1, la sua correzione -1 (n: -1).
  function foulValue(e) {
    return e.n ?? 1;
  }

  // I falli dei tempi supplementari si sommano a quelli del 4° quarto.
  // Un fallo tolto conta nel periodo del fallo che annulla, anche se la correzione arriva dopo.
  function teamFouls(events, team, period) {
    const counts = period <= 4 ? (p) => p === period : (p) => p >= 4;
    return events.reduce(
      (sum, e) =>
        e.type === 'foul' && e.team === team && counts(e.foulPeriod ?? e.period) ? sum + foulValue(e) : sum,
      0
    );
  }

  function playerFouls(events, team, player) {
    return events.reduce(
      (sum, e) => (e.type === 'foul' && e.team === team && e.player === player ? sum + foulValue(e) : sum),
      0
    );
  }

  // Falli ancora validi della squadra, dal più vecchio al più recente, senza quelli già tolti.
  function openFouls(events, team) {
    const open = [];
    for (const e of events) {
      if (e.type !== 'foul' || e.team !== team) continue;
      if (foulValue(e) > 0) {
        open.push({ period: e.period, player: e.player });
      } else {
        let i = open.length - 1;
        while (i >= 0 && !(open[i].player === e.player && open[i].period === e.foulPeriod)) i--;
        if (i >= 0) open.splice(i, 1);
      }
    }
    return open;
  }

  // L'ultimo fallo che si può togliere: quello del giocatore indicato, o della squadra se non c'è giocatore.
  function lastFoul(events, team, player) {
    const open = openFouls(events, team);
    for (let i = open.length - 1; i >= 0; i--) {
      if (player === undefined || open[i].player === player) return open[i];
    }
    return null;
  }

  // 2 timeout nel primo tempo, 3 nel secondo, 1 per ogni supplementare; quelli non usati si perdono.
  function timeoutWindow(period) {
    if (period <= 2) return { from: 1, to: 2, max: 2 };
    if (period <= 4) return { from: 3, to: 4, max: 3 };
    return { from: period, to: period, max: 1 };
  }

  function timeoutsLeft(events, team, period) {
    const { from, to, max } = timeoutWindow(period);
    const used = events.filter(
      (e) => e.type === 'timeout' && e.team === team && e.period >= from && e.period <= to
    ).length;
    return Math.max(0, max - used);
  }

  function remainingMs(clock, now) {
    if (!clock.running) return clock.remainingMs;
    return Math.max(0, clock.remainingMs - (now - clock.startedAt));
  }

  // I 24 secondi scorrono e si fermano insieme al cronometro di gioco.
  function shotRemainingMs(clock, now) {
    if (!clock.running) return clock.shotMs;
    return Math.max(0, clock.shotMs - (now - clock.startedAt));
  }

  // Se al periodo restano meno secondi di quelli dell'azione, i 24 secondi si spengono.
  function shotClockOff(clock, now) {
    return remainingMs(clock, now) < shotRemainingMs(clock, now);
  }

  // Ripartire dopo una violazione dei 24 secondi vuol dire nuovo possesso: si torna a 24.
  function startClock(clock, now) {
    if (clock.running || clock.remainingMs <= 0) return;
    if (clock.shotMs <= 0) clock.shotMs = SHOT_MS;
    clock.running = true;
    clock.startedAt = now;
  }

  function pauseClock(clock, now) {
    if (!clock.running) return;
    clock.remainingMs = remainingMs(clock, now);
    clock.shotMs = shotRemainingMs(clock, now);
    clock.running = false;
  }

  function resetShot(clock, now, ms) {
    if (clock.running) {
      clock.remainingMs = remainingMs(clock, now);
      clock.startedAt = now;
    }
    clock.shotMs = ms;
  }

  // Ferma tutto quando scade il periodo o l'azione e dice quale dei due è scaduto.
  // I 24 secondi fermano il gioco nell'istante esatto della scadenza, non al controllo successivo;
  // con withShot falso (24 secondi spenti) conta solo il periodo.
  function checkExpiry(clock, now, withShot = true) {
    if (!clock.running) return null;
    if (remainingMs(clock, now) === 0) {
      pauseClock(clock, now);
      return 'period';
    }
    if (withShot && !shotClockOff(clock, now) && shotRemainingMs(clock, now) === 0) {
      pauseClock(clock, clock.startedAt + clock.shotMs);
      return 'shot';
    }
    return null;
  }

  function adjustClock(state, deltaMs) {
    if (state.clock.running) return;
    const max = periodLength(state.period);
    state.clock.remainingMs = Math.min(max, Math.max(0, state.clock.remainingMs + deltaMs));
  }

  // Cambiare periodo (o ripartire da capo in quello attuale) ferma e riempie i cronometri.
  function goToPeriod(state, period) {
    if (period < 1) return;
    state.period = period;
    state.clock = freshClock(period);
  }

  // Ogni azione tiene il tempo del tabellone: il periodo e quanto mancava alla fine (clockMs).
  // È il tempo che si legge anche sul tabellone inquadrato nel video. Senza at lo prende dal cronometro.
  function record(state, now, event, at) {
    const time = at ?? { period: state.period, clockMs: remainingMs(state.clock, now) };
    state.events.push({ ...event, period: time.period, clockMs: time.clockMs });
  }

  // Ordina per tempo di gioco: prima i periodi, poi dentro il periodo dal tempo più alto al più basso.
  function byGameTime(a, b) {
    return a.period - b.period || b.clockMs - a.clockMs;
  }

  // Senza giocatore i punti e i falli vanno solo alla squadra.
  function byPlayer(player) {
    return player === undefined ? {} : { player };
  }

  function addPoints(state, now, team, pts, player) {
    record(state, now, { type: 'score', team, pts, ...byPlayer(player) });
  }

  // Una correzione non può togliere più punti di quelli che la squadra o il giocatore hanno.
  function canRemovePoints(events, team, pts, player) {
    const have = player === undefined ? score(events, team) : playerPoints(events, team, player);
    return have >= pts;
  }

  function removePoints(state, now, team, pts, player) {
    if (!canRemovePoints(state.events, team, pts, player)) return false;
    record(state, now, { type: 'score', team, pts: -pts, ...byPlayer(player) });
    return true;
  }

  function addFoul(state, now, team, player) {
    record(state, now, { type: 'foul', team, ...byPlayer(player) });
  }

  function removeFoul(state, now, team, player) {
    const foul = lastFoul(state.events, team, player);
    if (!foul) return false;
    record(state, now, { type: 'foul', team, n: -1, foulPeriod: foul.period, ...byPlayer(foul.player) });
    return true;
  }

  // Il timeout ferma il cronometro; se la squadra non ne ha più non succede nulla.
  function takeTimeout(state, now, team) {
    if (timeoutsLeft(state.events, team, state.period) === 0) return false;
    pauseClock(state.clock, now);
    record(state, now, { type: 'timeout', team });
    return true;
  }

  // Annulla l'ultima azione; se veniva da un comando a voce con più azioni (stesso group), le toglie tutte.
  function undo(state) {
    const last = state.events[state.events.length - 1];
    if (!last) return;
    do undoOne(state);
    while (last.group !== undefined && state.events[state.events.length - 1]?.group === last.group);
  }

  // Se annullare ridà punti o falli a un giocatore tolto dall'elenco, il giocatore ci rientra.
  // Se toglie l'azione con cui la voce aveva aggiunto giocatori nuovi (added) e loro restano a zero, escono.
  function undoOne(state) {
    const e = state.events.pop();
    if (!e) return;
    for (const number of e.added ?? []) removePlayer(state, e.team, number);
    if (e.player === undefined) return;
    const roster = state.rosters[e.team];
    if (!roster.includes(e.player) && !canRemovePlayer(state.events, e.team, e.player)) {
      roster.push(e.player);
      roster.sort((a, b) => a - b);
    }
  }

  function maxPlayers(state) {
    return state.settings.friendly ? MAX_PLAYERS_FRIENDLY : MAX_PLAYERS;
  }

  // Aggiunge un numero di maglia, con il nome se c'è; se non si può, restituisce il motivo da mostrare.
  function addPlayer(state, team, value, name = '') {
    const text = String(value).trim();
    if (!/^\d{1,2}$/.test(text)) return 'Il numero di maglia va da 0 a 99.';
    const number = Number(text);
    const roster = state.rosters[team];
    if (roster.includes(number)) return `Il numero ${number} c'è già.`;
    if (roster.length >= maxPlayers(state)) {
      return state.settings.friendly
        ? `Al massimo ${MAX_PLAYERS_FRIENDLY} giocatori.`
        : `Al massimo ${MAX_PLAYERS} giocatori: in amichevole si arriva a ${MAX_PLAYERS_FRIENDLY}.`;
    }
    roster.push(number);
    roster.sort((a, b) => a - b);
    setPlayerName(state, team, number, name);
    return null;
  }

  function setPlayerName(state, team, number, name) {
    const clean = String(name).trim().slice(0, 20);
    if (clean) state.playerNames[team][number] = clean;
    else delete state.playerNames[team][number];
  }

  // Come il giocatore compare in cronaca: «#7 Rossi», o solo «#7» se non ha nome.
  function playerLabel(state, team, number) {
    const name = state.playerNames[team][number];
    return name ? `#${number} ${name}` : `#${number}`;
  }

  // I giocatori nominati da un'azione: chi segna o fa fallo, chi è nel quintetto, chi entra ed esce.
  function eventPlayers(e) {
    if (e.player !== undefined) return [e.player];
    return [...(e.on ?? []), ...(e.in ?? []), ...(e.out ?? [])];
  }

  // Si toglie solo un giocatore rimasto a zero punti e zero falli e mai in campo, così i totali restano giusti.
  function canRemovePlayer(events, team, player) {
    return (
      playerPoints(events, team, player) === 0 &&
      playerFouls(events, team, player) === 0 &&
      !events.some((e) => e.team === team && e.player === undefined && eventPlayers(e).includes(player))
    );
  }

  function removePlayer(state, team, player) {
    if (!canRemovePlayer(state.events, team, player)) return false;
    state.rosters[team] = state.rosters[team].filter((n) => n !== player);
    delete state.playerNames[team][player];
    return true;
  }

  // Le squadre salvate: nome della squadra e giocatori con numero e nome, pronti da richiamare.
  // Con il colore della maglia, se è stato scritto: richiamando la squadra torna anche quello.
  function teamSnapshot(state, team) {
    const color = state.colors[team];
    return {
      name: state.names[team],
      players: state.rosters[team].map((number) => ({ number, name: state.playerNames[team][number] ?? '' })),
      ...(color ? { color } : {}),
    };
  }

  function setColor(state, team, text) {
    state.colors[team] = String(text).trim().slice(0, 20);
  }

  function sameName(a, b) {
    return a.toLocaleLowerCase('it') === b.toLocaleLowerCase('it');
  }

  // Una squadra salvata con lo stesso nome di un'altra la sostituisce; l'elenco resta in ordine alfabetico.
  function storeTeam(library, snapshot) {
    return [...library.filter((t) => !sameName(t.name, snapshot.name)), snapshot].sort((a, b) =>
      a.name.localeCompare(b.name, 'it')
    );
  }

  function hasStoredTeam(library, name) {
    return library.some((t) => sameName(t.name, name));
  }

  function deleteStoredTeam(library, name) {
    return library.filter((t) => t.name !== name);
  }

  function mergeLibrary(library, incoming) {
    return incoming.reduce(storeTeam, library);
  }

  // Squadre salvate e tabellini viaggiano dentro un link: testo compatto in base64,
  // senza i caratteri che un link o un messaggio potrebbero rovinare.
  const SHARE_VERSION = '1';

  function toLinkText(value) {
    let binary = '';
    for (const byte of new TextEncoder().encode(JSON.stringify(value))) binary += String.fromCharCode(byte);
    const base64 = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${SHARE_VERSION}.${base64}`;
  }

  // Il contenuto del link; se è rovinato o di un'altra versione lancia un errore.
  function fromLinkText(text) {
    const [version, data] = String(text).split('.');
    if (version !== SHARE_VERSION || !data) throw new Error('link non valido');
    const binary = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
  }

  function encodeLibrary(library) {
    return toLinkText(
      library.map((t) => {
        const entry = [t.name, t.players.map((p) => (p.name ? [p.number, p.name] : [p.number]))];
        return t.color ? [...entry, t.color] : entry;
      })
    );
  }

  // Le squadre contenute nel link, oppure null se il link è rovinato o non viene dal tabellone.
  function decodeLibrary(text) {
    try {
      const compact = fromLinkText(text);
      if (!Array.isArray(compact) || compact.length === 0) return null;
      const teams = compact.map(decodeTeam);
      return teams.every(Boolean) ? teams : null;
    } catch {
      return null;
    }
  }

  function decodeTeam(entry) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !Array.isArray(entry[1])) return null;
    const name = entry[0].trim().slice(0, 14);
    const players = entry[1].map(([number, playerName = '']) => ({
      number,
      name: String(playerName).trim().slice(0, 20),
    }));
    const numbers = players.map((p) => p.number);
    const color = typeof entry[2] === 'string' ? entry[2].trim().slice(0, 20) : '';
    const valid =
      name !== '' &&
      players.length <= MAX_PLAYERS_FRIENDLY &&
      numbers.every((n) => Number.isInteger(n) && n >= 0 && n <= 99) &&
      new Set(numbers).size === numbers.length;
    if (!valid) return null;
    return color ? { name, players, color } : { name, players };
  }

  // Richiama una squadra salvata al posto di quella attuale, ma solo finché i suoi giocatori
  // non hanno punti né falli: a partita iniziata cambierebbe i totali.
  function loadTeam(state, team, saved) {
    if (!state.rosters[team].every((n) => canRemovePlayer(state.events, team, n))) {
      return 'I giocatori di questa squadra hanno già punti o falli: richiamala prima di iniziare o dopo «Nuova partita».';
    }
    if (saved.players.length > maxPlayers(state)) {
      return `«${saved.name}» ha ${saved.players.length} giocatori: spunta prima «Amichevole».`;
    }
    state.names[team] = saved.name;
    if (saved.color) state.colors[team] = saved.color;
    state.rosters[team] = saved.players.map((p) => p.number).sort((a, b) => a - b);
    state.playerNames[team] = Object.fromEntries(saved.players.filter((p) => p.name).map((p) => [p.number, p.name]));
    state.origins[team] = saved.name;
    return null;
  }

  // Cosa fa «Salva squadra»: 'new' la aggiunge; 'update' aggiorna la squadra salvata da cui vengono i giocatori;
  // 'rename' vale quando a quella squadra è stato cambiato il nome; 'replace' quando il nome è di un'altra squadra salvata.
  function saveKind(library, state, team) {
    const name = state.names[team];
    const origin = state.origins[team];
    const fromLibrary = origin !== null && hasStoredTeam(library, origin);
    if (fromLibrary && sameName(origin, name)) return 'update';
    if (hasStoredTeam(library, name)) return 'replace';
    return fromLibrary ? 'rename' : 'new';
  }

  // Salva la squadra; con renameFrom toglie la vecchia squadra salvata con quel nome, così è una rinomina.
  function saveTeam(library, state, team, renameFrom = null) {
    const snapshot = teamSnapshot(state, team);
    const rest = renameFrom === null ? library : library.filter((t) => !sameName(t.name, renameFrom));
    state.origins[team] = snapshot.name;
    return storeTeam(rest, snapshot);
  }

  // Si esce dall'amichevole solo se nessuna squadra ha più giocatori di quelli ammessi in campionato.
  function setFriendly(state, friendly) {
    if (!friendly && Object.values(state.rosters).some((r) => r.length > MAX_PLAYERS)) {
      return `Prima togli i giocatori oltre il ${MAX_PLAYERS}°.`;
    }
    state.settings.friendly = friendly;
    return null;
  }

  // ——— In campo: quintetti e cambi ———

  // Quintetti (lineup: chi è in campo) e cambi (sub: chi entra e chi esce) di una squadra, in ordine di tempo.
  function lineupEvents(events, team) {
    return events.filter((e) => e.team === team && (e.type === 'lineup' || e.type === 'sub')).sort(byGameTime);
  }

  function applyLineup(court, e) {
    if (e.type === 'lineup') return new Set(e.on);
    const next = new Set(court);
    for (const n of e.out) next.delete(n);
    for (const n of e.in) next.add(n);
    return next;
  }

  // Chi è in campo in quel momento del tabellone, oppure null se della squadra non è ancora stato detto il quintetto.
  function courtAt(events, team, at) {
    let court = null;
    for (const e of lineupEvents(events, team)) {
      if (byGameTime(e, at) > 0) break;
      if (e.type === 'lineup' || court) court = applyLineup(court, e);
    }
    return court;
  }

  // Il punto della partita a cui è arrivato il tabellone dell'app.
  function boardTime(state, now) {
    return { period: state.period, clockMs: remainingMs(state.clock, now) };
  }

  // Fin dove è arrivata la partita: il tabellone, o l'azione più avanti se ce n'è una oltre.
  function gameEnd(state, now) {
    return state.events.reduce((latest, e) => (byGameTime(e, latest) > 0 ? e : latest), boardTime(state, now));
  }

  // I millisecondi in campo di ogni giocatore, dal primo quintetto fino a end; null se il quintetto non c'è.
  // Chi è in campo alla fine di un periodo si intende in campo anche all'inizio del successivo.
  function minutesPlayed(events, team, end) {
    const changes = lineupEvents(events, team).filter((e) => byGameTime(e, end) <= 0);
    if (changes.length === 0) return null;
    const played = new Map();
    let court = new Set();
    let cursor = { period: 1, clockMs: periodLength(1) };
    const credit = (ms) => {
      if (ms > 0) for (const n of court) played.set(n, (played.get(n) ?? 0) + ms);
    };
    const advance = (to) => {
      while (cursor.period < to.period) {
        credit(cursor.clockMs);
        cursor = { period: cursor.period + 1, clockMs: periodLength(cursor.period + 1) };
      }
      credit(cursor.clockMs - to.clockMs);
      cursor = { period: to.period, clockMs: to.clockMs };
    };
    for (const e of changes) {
      advance(e);
      court = applyLineup(court, e);
    }
    advance(end);
    return played;
  }

  // ——— Tabellino e scout ———

  // Le voci dello scout che non sono canestri né falli, come si scrivono negli eventi (type 'stat', kind).
  // Il tiro sbagliato (miss) ha il suo valore (pts) e, se è stato stoppato, blocked.
  const STAT_NAMES = {
    oreb: 'Rimbalzo in attacco',
    dreb: 'Rimbalzo in difesa',
    ast: 'Assist',
    stl: 'Palla recuperata',
    tov: 'Palla persa',
    blk: 'Stoppata',
    fd: 'Fallo subito',
  };
  const MISS_NAMES = { 1: 'Tiro libero sbagliato', 2: 'Tiro da 2 sbagliato', 3: 'Tripla sbagliata' };
  const SHOT_NAMES = { 1: 'Tiro libero', 2: 'Canestro da 2', 3: 'Tripla' };

  function statName(e) {
    if (e.kind === 'miss') return MISS_NAMES[e.pts] + (e.blocked ? ' (stoppato)' : '');
    return STAT_NAMES[e.kind];
  }

  function emptyLine() {
    return { pts: 0, made: [0, 0, 0], att: [0, 0, 0], fouls: 0, fd: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, tov: 0, blk: 0, blka: 0 };
  }

  // Solo le voci della riga, senza numero, nome, minuti e il resto.
  function pickLine(p) {
    const empty = emptyLine();
    return Object.fromEntries(Object.keys(empty).map((key) => [key, p[key] ?? empty[key]]));
  }

  function addLines(a, b) {
    const sum = {};
    for (const key of Object.keys(a)) sum[key] = Array.isArray(a[key]) ? a[key].map((n, i) => n + b[key][i]) : a[key] + b[key];
    return sum;
  }

  // La riga di un giocatore (o della squadra, senza player): punti; tiri segnati (made) e tentati (att)
  // [liberi, da 2, da 3]; falli fatti e subiti; rimbalzi; assist; palle recuperate e perse; stoppate date e subite.
  // Le correzioni contano in meno.
  function statLine(events, team, player) {
    const line = emptyLine();
    for (const e of events) {
      if (e.team !== team || e.player !== player) continue;
      if (e.type === 'score') {
        const i = Math.abs(e.pts) - 1;
        line.pts += e.pts;
        line.made[i] += Math.sign(e.pts);
        line.att[i] += Math.sign(e.pts);
      } else if (e.type === 'foul') {
        line.fouls += foulValue(e);
      } else if (e.type === 'stat' && e.kind === 'miss') {
        line.att[e.pts - 1] += 1;
        if (e.blocked) line.blka += 1;
      } else if (e.type === 'stat') {
        line[e.kind] += 1;
      }
    }
    return line;
  }

  // La valutazione FIBA: punti − tiri sbagliati (liberi compresi) + rimbalzi + assist − palle perse
  // + palle recuperate + stoppate.
  function efficiency(l) {
    const missed = [0, 1, 2].reduce((sum, i) => sum + l.att[i] - l.made[i], 0);
    return l.pts - missed + l.oreb + l.dreb + l.ast - l.tov + l.stl + l.blk;
  }

  // Chi era in campo quando è successa l'azione e: a parità di tempo contano i cambi detti prima di lei.
  function courtFor(events, team, e) {
    const index = events.indexOf(e);
    let court = null;
    for (const l of lineupEvents(events, team)) {
      const order = byGameTime(l, e);
      if (order > 0) break;
      if (order === 0 && events.indexOf(l) > index) continue;
      if (l.type === 'lineup' || court) court = applyLineup(court, l);
    }
    return court;
  }

  // Il più/meno: per ogni canestro, più punti a chi era in campo nella squadra che ha segnato, meno
  // a chi era in campo nell'altra. Null se della squadra non è stato detto il quintetto.
  function plusMinus(events, team, end) {
    if (!events.some((e) => e.team === team && e.type === 'lineup')) return null;
    const pm = new Map();
    for (const e of events) {
      if (e.type !== 'score' || byGameTime(e, end) > 0) continue;
      const court = courtFor(events, team, e);
      if (!court) continue;
      for (const n of court) pm.set(n, (pm.get(n) ?? 0) + (e.team === team ? e.pts : -e.pts));
    }
    return pm;
  }

  // Il tabellino fino alla fine del periodo upTo (senza, fino a dove è arrivata la partita): i punti di ogni
  // periodo e, per squadra, una riga per giocatore più la riga della squadra per quello fatto senza giocatore.
  // Ogni giocatore ha lo scout (statLine), i secondi in campo (secs), il più/meno (pm) e la valutazione (eff);
  // secs e pm sono null se della squadra non è stato detto il quintetto.
  function boxScore(state, now, upTo = Infinity) {
    const events = state.events.filter((e) => e.period <= upTo);
    const end = Number.isFinite(upTo) ? { period: upTo, clockMs: 0 } : gameEnd(state, now);
    const periods = [];
    for (let period = 1; period <= end.period; period++) {
      const inPeriod = events.filter((e) => e.period === period);
      periods.push({ period, home: score(inPeriod, 'home'), away: score(inPeriod, 'away') });
    }
    const teams = {};
    for (const team of ['home', 'away']) {
      const numbers = new Set(state.rosters[team]);
      for (const e of events) if (e.team === team) eventPlayers(e).forEach((n) => numbers.add(n));
      const minutes = minutesPlayed(events, team, end);
      const plus = plusMinus(events, team, end);
      teams[team] = {
        name: state.names[team],
        players: [...numbers].sort((a, b) => a - b).map((number) => {
          const line = statLine(events, team, number);
          return {
            number,
            name: state.playerNames[team][number] ?? '',
            ...line,
            secs: minutes ? Math.round((minutes.get(number) ?? 0) / 1000) : null,
            pm: plus ? plus.get(number) ?? 0 : null,
            eff: efficiency(line),
          };
        }),
        team: statLine(events, team, undefined),
      };
    }
    return { periods, teams };
  }

  function boxTotals(side) {
    return [...side.players, side.team].map(pickLine).reduce(addLines, emptyLine());
  }

  // Se nella riga c'è qualcosa: un giocatore con una riga vuota e senza minuti non ha giocato.
  function hasStats(line) {
    const l = pickLine(line);
    return Object.values(l).some((v) => (Array.isArray(v) ? v.some(Boolean) : v !== 0));
  }

  // Il punto di un video: 754300 millisecondi diventano «12:34», oltre l'ora «1:02:34».
  function formatVideoTime(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = String(total % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }

  // I secondi in campo come minuti e secondi: 754 diventa «12:34».
  function formatMinutes(secs) {
    const whole = Math.round(secs);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }

  function dayOf(at) {
    const d = new Date(at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Il giorno della partita: quello scritto in Impostazioni, altrimenti oggi.
  function gameDate(state, now) {
    return state.date ?? dayOf(now);
  }

  // Com'è la partita: «Finale» a tempo scaduto dal quarto periodo in poi senza parità,
  // «Fine Q2» a tempo scaduto negli altri casi, altrimenti periodo e tempo («Q3 4:12»).
  function gameStatus(state, now) {
    const ms = remainingMs(state.clock, now);
    const tied = score(state.events, 'home') === score(state.events, 'away');
    if (ms > 0) return `${periodLabel(state.period)} ${formatClock(ms)}`;
    return state.period >= 4 && !tied ? 'Finale' : `Fine ${periodLabel(state.period)}`;
  }

  // Il tabellino viaggia in un link, come le squadre: giorno e stato li aggiunge chi lo pubblica.
  // Nel link vanno punti, canestri, falli e minuti; lo scout completo sta nel file della partita.
  function encodeBox(box, info) {
    const line = (l) => [l.pts, ...l.made, l.fouls];
    return toLinkText([
      info.date,
      info.status,
      box.periods.map((p) => [p.home, p.away]),
      ['home', 'away'].map((team) => {
        const side = box.teams[team];
        return [side.name, side.players.map((p) => [p.number, p.name, ...line(p), p.secs]), line(side.team)];
      }),
    ]);
  }

  // Il tabellino contenuto nel link, oppure null se il link è rovinato o non viene dal tabellone.
  function decodeBox(text) {
    try {
      const [date, status, periods, sides] = fromLinkText(text);
      const whole = (n) => Number.isInteger(n);
      const line = (l) => {
        if (!Array.isArray(l) || l.length !== 5 || !l.every(whole)) throw new Error('riga rovinata');
        return { ...emptyLine(), pts: l[0], made: l.slice(1, 4), att: l.slice(1, 4), fouls: l[4] };
      };
      if (typeof date !== 'string' || typeof status !== 'string' || sides.length !== 2) return null;
      const teams = {};
      ['home', 'away'].forEach((team, i) => {
        const [name, players, own] = sides[i];
        if (typeof name !== 'string' || players.length > 99) throw new Error('squadra rovinata');
        teams[team] = {
          name: name.slice(0, 14),
          players: players.map(([number, playerName, ...rest]) => {
            const secs = rest.pop();
            if (!whole(number) || number < 0 || number > 99 || typeof playerName !== 'string') {
              throw new Error('giocatore rovinato');
            }
            if (secs !== null && !(whole(secs) && secs >= 0)) throw new Error('minuti rovinati');
            return { number, name: playerName.slice(0, 20), ...line(rest), secs };
          }),
          team: line(own),
        };
      });
      return {
        date: date.slice(0, 10),
        status: status.slice(0, 30),
        periods: periods.map(([home, away], i) => {
          if (!whole(home) || !whole(away)) throw new Error('periodo rovinato');
          return { period: i + 1, home, away };
        }),
        teams,
      };
    } catch {
      return null;
    }
  }

  // ——— Il file della partita: per il video e per l'archivio delle statistiche ———

  const SIDES = { home: 'casa', away: 'ospiti' };
  const STAT_TYPES = {
    miss: 'tiro sbagliato',
    oreb: 'rimbalzo in attacco',
    dreb: 'rimbalzo in difesa',
    ast: 'assist',
    stl: 'palla recuperata',
    tov: 'palla persa',
    blk: 'stoppata',
    fd: 'fallo subito',
  };
  const ACTION_TYPES = { foul: 'fallo', timeout: 'timeout', lineup: 'quintetto', sub: 'cambio' };

  // Le azioni rimaste valide dopo le correzioni: un meno toglie l'ultimo canestro uguale dello stesso
  // giocatore, un fallo tolto l'ultimo fallo di quel giocatore in quel periodo. Una correzione che non
  // trova un canestro uguale (un −2 a chi aveva segnato una tripla) resta, così i punteggi tornano.
  function standingEvents(events) {
    const kept = [];
    for (const e of events) {
      const minus = (e.type === 'score' && e.pts < 0) || (e.type === 'foul' && foulValue(e) < 0);
      if (!minus) {
        kept.push(e);
        continue;
      }
      const cancels =
        e.type === 'score'
          ? (k) => k.type === 'score' && k.team === e.team && k.player === e.player && k.pts === -e.pts
          : (k) =>
              k.type === 'foul' && k.team === e.team && k.player === e.player && foulValue(k) > 0 && k.period === e.foulPeriod;
      let i = kept.length - 1;
      while (i >= 0 && !cancels(kept[i])) i--;
      if (i >= 0) kept.splice(i, 1);
      else kept.push(e);
    }
    return kept;
  }

  // Una riga del tabellino con le voci scritte per esteso, per chi leggerà il file.
  function lineForFile(l) {
    return {
      punti: l.pts,
      tl_segnati: l.made[0],
      tl_tentati: l.att[0],
      t2_segnati: l.made[1],
      t2_tentati: l.att[1],
      t3_segnati: l.made[2],
      t3_tentati: l.att[2],
      rimbalzi_attacco: l.oreb,
      rimbalzi_difesa: l.dreb,
      rimbalzi: l.oreb + l.dreb,
      assist: l.ast,
      palle_recuperate: l.stl,
      palle_perse: l.tov,
      stoppate: l.blk,
      stoppate_subite: l.blka,
      falli: l.fouls,
      falli_subiti: l.fd,
      valutazione: efficiency(l),
    };
  }

  function boxForFile(box) {
    const sides = ['home', 'away'].map((team) => {
      const side = box.teams[team];
      return [
        SIDES[team],
        {
          nome: side.name,
          giocatori: side.players.map((p) => ({
            numero: p.number,
            nome: p.name,
            minuti: p.secs === null ? null : formatMinutes(p.secs),
            piu_meno: p.pm,
            ...lineForFile(p),
          })),
          squadra: lineForFile(side.team),
          totale: lineForFile(boxTotals(side)),
        },
      ];
    });
    return Object.fromEntries(sides);
  }

  // Il tempo del tabellone in tre forme: periodo, tempo come si legge («2:26», «45.3») e millisecondi che mancano.
  function gameTime(e) {
    return { periodo: periodLabel(e.period), numero_periodo: e.period, tempo: formatClock(e.clockMs), ms_restanti: e.clockMs };
  }

  // «#25 Rossi», o «#25» se non ha nome.
  function shortLabel(state, team, number) {
    const name = state.playerNames[team][number];
    return name ? `#${number} ${name}` : `#${number}`;
  }

  function actionText(state, e, playerFoulCount) {
    const label = (n) => shortLabel(state, e.team, n);
    const who = e.player === undefined ? state.names[e.team] : label(e.player);
    if (e.type === 'timeout') return `Timeout ${state.names[e.team]}`;
    if (e.type === 'lineup') return `In campo ${state.names[e.team]}: ${e.on.map(label).join(', ')}`;
    if (e.type === 'sub') return `Entra ${e.in.map(label).join(', ')} · esce ${e.out.map(label).join(', ')}`;
    if (e.type === 'foul') return playerFoulCount ? `Fallo · ${who} (${playerFoulCount}°)` : `Fallo · ${who}`;
    if (e.type === 'stat') return `${statName(e)} · ${who}`;
    return e.pts > 0 ? `${SHOT_NAMES[e.pts]} · ${who}` : `Correzione ${e.pts} · ${who}`;
  }

  // I dati grezzi della partita, da cui si ricalcola tutto: li usano il file e l'archivio delle statistiche.
  function gameData(state, now) {
    return {
      names: { ...state.names },
      colors: { ...state.colors },
      rosters: { home: [...state.rosters.home], away: [...state.rosters.away] },
      playerNames: { home: { ...state.playerNames.home }, away: { ...state.playerNames.away } },
      date: gameDate(state, now),
      period: state.period,
      clockMs: remainingMs(state.clock, now),
      events: state.events.map((e) => ({ ...e })),
    };
  }

  // Tutto quello che serve al montatore per scrivere in sovrimpressione chi segna e chi fa fallo, alla fine
  // di ogni periodo il tabellino, e all'archivio per le statistiche della stagione. Ogni voce è agganciata
  // al tempo del tabellone, non all'ora: nel video si ritrova leggendo il tabellone inquadrato.
  function gameFile(state, now) {
    const running = { home: 0, away: 0 };
    const fouls = {};
    const players = (team, numbers) => numbers.map((n) => ({ numero: n, nome: state.playerNames[team][n] ?? '' }));
    const actions = standingEvents(state.events)
      .sort(byGameTime)
      .map((e) => {
        let type = ACTION_TYPES[e.type];
        if (e.type === 'score') type = e.pts > 0 ? 'canestro' : 'correzione';
        if (e.type === 'stat') type = STAT_TYPES[e.kind];
        const action = { ...gameTime(e), tipo: type, squadra: SIDES[e.team], nome_squadra: state.names[e.team] };
        if (e.videoMs !== undefined) action.secondi_video = Math.round(e.videoMs / 100) / 10;
        if (e.player !== undefined) {
          action.numero = e.player;
          action.giocatore = state.playerNames[e.team][e.player] ?? '';
        }
        if (e.type === 'score') {
          running[e.team] += e.pts;
          action.punti = e.pts;
        }
        if (e.type === 'stat' && e.kind === 'miss') {
          action.punti = e.pts;
          if (e.blocked) action.stoppato = true;
        }
        if (e.type === 'foul' && e.player !== undefined) {
          const key = `${e.team} ${e.player}`;
          fouls[key] = (fouls[key] ?? 0) + 1;
          action.falli_giocatore = fouls[key];
        }
        if (e.type === 'lineup') action.in_campo = players(e.team, e.on);
        if (e.type === 'sub') {
          action.entrano = players(e.team, e.in);
          action.escono = players(e.team, e.out);
        }
        action.punteggio = { casa: running.home, ospiti: running.away };
        action.scritta = actionText(state, e, action.falli_giocatore);
        return action;
      });
    const end = gameEnd(state, now);
    const periodEnds = [];
    for (let period = 1; period <= end.period; period++) {
      if (period === end.period && end.clockMs > 0) break; // periodo ancora in corso
      const upTo = state.events.filter((e) => e.period <= period);
      periodEnds.push({
        periodo: periodLabel(period),
        numero_periodo: period,
        punteggio: { casa: score(upTo, 'home'), ospiti: score(upTo, 'away') },
        tabellino: boxForFile(boxScore(state, now, period)),
      });
    }
    const roster = (team) => ({
      nome: state.names[team],
      colore: state.colors[team],
      giocatori: players(team, state.rosters[team]),
    });
    return {
      formato: 'tabellone-basket-partita',
      versione: 1,
      data_partita: gameDate(state, now),
      aggancio:
        'Ogni voce è agganciata al tempo del tabellone: il periodo e il tempo che manca alla sua fine ' +
        '(tempo, ms_restanti). Nel video si ritrova leggendo il tabellone inquadrato; ogni periodo finisce a 0:00. ' +
        'Se la partita è stata segnata guardando il video nel tabellone, secondi_video è il punto del file indicato ' +
        'in video in cui l\'azione è stata detta.',
      squadre: { casa: roster('home'), ospiti: roster('away') },
      azioni: actions,
      fine_periodi: periodEnds,
      tabellino: boxForFile(boxScore(state, now)),
      video: state.video ? { file: state.video.name } : null,
      non_registrati: (state.notes ?? []).map((n) => ({
        ...gameTime(n),
        ...(n.videoMs !== undefined ? { secondi_video: Math.round(n.videoMs / 100) / 10 } : {}),
        frase: n.heard,
        motivo: n.reason,
      })),
      dati: gameData(state, now),
    };
  }

  function slug(name) {
    const plain = String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return plain.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'squadra';
  }

  function gameFileName(state, now) {
    return `partita_${slug(state.names.home)}_${slug(state.names.away)}_${gameDate(state, now)}.json`;
  }

  // ——— L'archivio delle partite, per le statistiche della stagione ———

  // La partita come la conserva l'archivio: un nome unico (giorno e squadre) e i dati grezzi.
  function archiveEntry(state, now) {
    const dati = gameData(state, now);
    return { id: `${dati.date}_${slug(dati.names.home)}_${slug(dati.names.away)}`, dati };
  }

  // Dai dati grezzi torna una partita su cui fare i calcoli, ferma dove era arrivata.
  function gameFromData(dati) {
    const state = newGame(dati.names, { rosters: dati.rosters, playerNames: dati.playerNames, colors: dati.colors });
    state.date = dati.date;
    state.period = dati.period;
    state.clock = { ...freshClock(dati.period), remainingMs: dati.clockMs };
    state.events = dati.events;
    return state;
  }

  // Una partita nuova nell'archivio sostituisce quella con lo stesso nome; l'elenco resta in ordine di giorno.
  function storeGame(archive, entry) {
    return [...archive.filter((g) => g.id !== entry.id), entry].sort(
      (a, b) => a.dati.date.localeCompare(b.dati.date) || a.id.localeCompare(b.id)
    );
  }

  const EVENT_TYPES = ['score', 'foul', 'timeout', 'lineup', 'sub', 'stat'];

  // Controlla che i dati letti da un file siano davvero una partita del tabellone.
  function validData(d) {
    const whole = (n) => Number.isInteger(n);
    const numbers = (list) => Array.isArray(list) && list.every((n) => whole(n) && n >= 0 && n <= 99);
    return (
      d &&
      typeof d.names?.home === 'string' &&
      typeof d.names?.away === 'string' &&
      (d.colors === undefined || (typeof d.colors?.home === 'string' && typeof d.colors?.away === 'string')) &&
      numbers(d.rosters?.home) &&
      numbers(d.rosters?.away) &&
      typeof d.playerNames?.home === 'object' &&
      typeof d.playerNames?.away === 'object' &&
      /^\d{4}-\d{2}-\d{2}$/.test(d.date) &&
      whole(d.period) &&
      d.period >= 1 &&
      whole(d.clockMs) &&
      Array.isArray(d.events) &&
      d.events.every(
        (e) =>
          e &&
          EVENT_TYPES.includes(e.type) &&
          (e.team === 'home' || e.team === 'away') &&
          whole(e.period) &&
          e.period >= 1 &&
          typeof e.clockMs === 'number'
      )
    );
  }

  // Le partite contenute in un file: un file della partita o un archivio intero. Null se non è del tabellone.
  function readGameFile(json) {
    const entries =
      json?.formato === 'tabellone-basket-archivio' && Array.isArray(json.partite)
        ? json.partite
        : json?.formato === 'tabellone-basket-partita' && json.dati
          ? [{ dati: json.dati }]
          : null;
    if (!entries || !entries.every((g) => validData(g?.dati))) return null;
    return entries.map((g) => ({
      id: `${g.dati.date}_${slug(g.dati.names.home)}_${slug(g.dati.names.away)}`,
      dati: g.dati,
    }));
  }

  function archiveFile(archive) {
    return { formato: 'tabellone-basket-archivio', versione: 1, partite: archive };
  }

  // I nomi delle squadre presenti nell'archivio, dalla più presente.
  function archiveTeams(archive) {
    const seen = new Map();
    for (const { dati } of archive) {
      for (const name of [dati.names.home, dati.names.away]) {
        const key = slug(name);
        seen.set(key, { name, games: (seen.get(key)?.games ?? 0) + 1 });
      }
    }
    return [...seen.values()].sort((a, b) => b.games - a.games || a.name.localeCompare(b.name, 'it')).map((t) => t.name);
  }

  // Le statistiche di una squadra su più partite (per esempio quelle di un periodo della stagione): per ogni
  // giocatore partite giocate e totali, da cui si fanno medie e percentuali; per la squadra vinte, perse,
  // punti fatti e subiti e i totali. Il giocatore si riconosce dal numero di maglia; il nome è l'ultimo usato.
  function seasonStats(archive, teamName) {
    const key = slug(teamName);
    const players = new Map();
    const record = { games: 0, won: 0, lost: 0, tied: 0, pointsFor: 0, pointsAgainst: 0, totals: emptyLine() };
    for (const { dati } of archive) {
      const side = ['home', 'away'].find((t) => slug(dati.names[t]) === key);
      if (!side) continue;
      const state = gameFromData(dati);
      const box = boxScore(state, 0);
      const mine = score(state.events, side);
      const theirs = score(state.events, side === 'home' ? 'away' : 'home');
      record.games += 1;
      record.pointsFor += mine;
      record.pointsAgainst += theirs;
      if (mine > theirs) record.won += 1;
      else if (mine < theirs) record.lost += 1;
      else record.tied += 1;
      record.totals = addLines(record.totals, boxTotals(box.teams[side]));
      for (const p of box.teams[side].players) {
        if (!(p.secs > 0) && !hasStats(p)) continue; // non ha giocato
        const acc = players.get(p.number) ?? {
          number: p.number,
          name: '',
          games: 0,
          line: emptyLine(),
          secs: 0,
          secsGames: 0,
          pm: 0,
          pmGames: 0,
          eff: 0,
        };
        acc.name = p.name || acc.name;
        acc.games += 1;
        acc.line = addLines(acc.line, pickLine(p));
        acc.eff += p.eff;
        if (p.secs !== null) {
          acc.secs += p.secs;
          acc.secsGames += 1;
        }
        if (p.pm !== null) {
          acc.pm += p.pm;
          acc.pmGames += 1;
        }
        players.set(p.number, acc);
      }
    }
    return { team: teamName, record, players: [...players.values()].sort((a, b) => a.number - b.number) };
  }

  // ——— Comandi a voce ———
  // Il riconoscimento della voce consegna una frase («canestro da 2 del 25 PC52»): qui diventa un'azione.

  const UNIT_WORDS = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci',
    'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
  const TEN_WORDS = ['venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];

  // I numeri detti a parole, da «zero» a «novantanove»: davanti a uno e otto le decine perdono la vocale.
  const NUMBER_WORDS = new Map(UNIT_WORDS.map((w, n) => [w, n]));
  TEN_WORDS.forEach((ten, i) => {
    const tens = (i + 2) * 10;
    NUMBER_WORDS.set(ten, tens);
    for (let unit = 1; unit <= 9; unit++) {
      NUMBER_WORDS.set((unit === 1 || unit === 8 ? ten.slice(0, -1) : ten) + UNIT_WORDS[unit], tens + unit);
    }
  });

  // Il riconoscimento a volte scrive i tempi come un orologio: «2:26» diventa «al 2 e 26»,
  // e i decimi dell'ultimo minuto («45.3») diventano «45 secondi».
  function clockWords(text) {
    return String(text)
      .replace(/(\d{1,2})[:.,](\d{2})(?!\d)/g, ' al $1 e $2 ')
      .replace(/(\d{1,2})[.,](\d)(?!\d)/g, ' $1 secondi ');
  }

  // La frase in minuscolo, senza accenti né punteggiatura, con i numeri in cifre
  // e le cifre staccate dalle lettere: «PC52, ventitré!» diventa «pc 52 23».
  function speechWords(text) {
    return String(text)
      .toLocaleLowerCase('it')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/([a-z])(\d)/g, '$1 $2')
      .replace(/(\d)([a-z])/g, '$1 $2')
      .trim()
      .split(' ')
      .map((w) => (NUMBER_WORDS.has(w) ? String(NUMBER_WORDS.get(w)) : /^\d+$/.test(w) ? String(Number(w)) : w))
      .join(' ');
  }

  // Le frasi si confrontano con uno spazio prima e dopo ogni parola: « canestro da 2 del 25 ».
  const words = (pattern, flags) => new RegExp(` (?:${pattern})(?= )`, flags);

  // Il nome della squadra si riconosce anche se il riconoscimento lo spezza o lo unisce: «pc 52», «p c 52», «pc52».
  function teamPattern(name) {
    const letters = speechWords(name).replace(/ /g, '');
    return letters.length < 2 ? null : new RegExp(` ${[...letters].join(' ?')}(?= )`, 'g');
  }

  // Le parole del nome che l'altra squadra non ha: «Virtus Padova» si riconosce anche solo da «Virtus».
  function distinctiveWords(state, team) {
    const other = speechWords(state.names[team === 'home' ? 'away' : 'home']).split(' ');
    return speechWords(state.names[team])
      .split(' ')
      .filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !other.includes(w));
  }

  const SIDE_WORDS = { home: words('casa|locali', 'g'), away: words('ospiti|ospite|avversari|avversario', 'g') };
  const UNDO_WORDS = words('annulla|cancella');
  const LINEUP_WORDS = words('quintett[oi]');
  const IN_WORD = /^(entra|entrano|entrato|entrati|dentro)$/;
  const OUT_WORD = /^(esce|escono|uscito|usciti|fuori)$/;
  const SUB_WORDS = words('entra|entrano|entrato|entrati|dentro|esce|escono|uscito|usciti|fuori');
  const ORDINALS = { primo: 1, secondo: 2, terzo: 3, quarto: 4, 1: 1, 2: 2, 3: 3, 4: 4 };

  // Il tempo del tabellone detto nel comando: «2 minuti e 26 secondi del terzo quarto», «2 e 26», «al 2 e 26»,
  // «45 secondi», «inizio del terzo quarto». Senza periodo vale quello del tabellone dell'app. Senza tempo:
  // con il tempo dal cronometro vale il cronometro; con il tempo detto a voce manca, e lo si chiede.
  // loose permette «2 e 26» senza altre parole; nei quintetti e nei cambi no, perché «12 e 25» sono giocatori.
  function takeTime(state, text, now, loose) {
    let period;
    let ms;
    let start = false;
    let badSeconds = false;
    const cut = (pattern, found) => {
      text = text.replace(pattern, (...m) => {
        found(m);
        return ' ';
      });
    };
    const clock = (min, sec = 0) => {
      badSeconds = Number(sec) > 59;
      ms = (Number(min) * 60 + Number(sec)) * 1000;
    };
    cut(/ (primo|secondo|terzo|quarto|[1-4]) (?:quarto|periodo)(?= )/, (m) => {
      period = ORDINALS[m[1]];
    });
    if (period === undefined) {
      cut(/ (?:(primo|secondo|terzo|[1-3]) )?(?:tempo )?supplementar[ei](?= )/, (m) => {
        period = 4 + (m[1] ? ORDINALS[m[1]] : 1);
      });
    }
    cut(/ (?:inizio|iniziale)(?= )/, () => {
      start = true;
    });
    cut(/ (\d+) (?:minut[oi]|min)(?: e)?(?: (\d+)(?: second[oi])?)?(?= )/, (m) => clock(m[1], m[2]));
    if (ms === undefined) cut(/ (\d+) second[oi](?= )/, (m) => clock(0, m[1]));
    if (ms === undefined) cut(/ (?:al|a|alle|tempo) (\d+)(?: e)? (\d+)(?= )/, (m) => clock(m[1], m[2]));
    if (ms === undefined && loose) {
      const found = [...text.matchAll(/ (\d+) e (\d+)(?= )/g)].filter((m) => Number(m[1]) <= 10 && Number(m[2]) <= 59);
      const last = found[found.length - 1];
      if (last) {
        clock(last[1], last[2]);
        text = `${text.slice(0, last.index)} ${text.slice(last.index + last[0].length)}`;
      }
    }

    const at = { period: period ?? state.period };
    if (start) ms = periodLength(at.period);
    if (ms === undefined) {
      if (state.settings.timeSource === 'voice') {
        return { error: "Manca il tempo: di' anche il tempo del tabellone, per esempio «2 e 26 del terzo quarto»." };
      }
      if (period !== undefined) return { error: "Hai detto il periodo ma non il tempo: di' anche minuti e secondi." };
      return { text, at: boardTime(state, now) };
    }
    if (badSeconds) return { error: 'I secondi vanno da 0 a 59.' };
    if (ms > periodLength(at.period)) {
      return { error: `Nel ${periodLabel(at.period)} il tempo va da ${formatClock(periodLength(at.period))} a 0:00.` };
    }
    at.clockMs = ms;
    return { text, at };
  }

  function numbersIn(text) {
    return text
      .trim()
      .split(/\s+/)
      .filter((w) => /^\d+$/.test(w))
      .map(Number);
  }

  // La squadra di un gruppo di numeri (quintetto o cambio): quella detta, o l'unica che li ha tutti.
  function groupTeam(state, side, numbers) {
    if (side) return { team: side };
    const found = ['home', 'away'].filter((team) => numbers.every((n) => state.rosters[team].includes(n)));
    if (found.length === 1) return { team: found[0] };
    return {
      error: found.length
        ? "Quei numeri ci sono in tutte e due le squadre: di' anche la squadra."
        : "Non tutti quei numeri sono in squadra: di' anche la squadra e li aggiungo.",
    };
  }

  // I controlli comuni a quintetti e cambi: numeri validi, posto in squadra per i nuovi, nessuno con 5 falli in campo.
  function checkGroup(state, team, entering, all) {
    const tooBig = all.find((n) => n > 99);
    if (tooBig !== undefined) return { error: `Il ${tooBig} non è un numero di maglia.` };
    const added = entering.filter((n) => !state.rosters[team].includes(n));
    if (state.rosters[team].length + added.length > maxPlayers(state)) {
      return { error: `${state.names[team]} ha già ${maxPlayers(state)} giocatori: non posso aggiungerne.` };
    }
    const out = entering.find((n) => playerFouls(state.events, team, n) >= PLAYER_FOUL_LIMIT);
    if (out !== undefined) return { error: `${playerLabel(state, team, out)} ha già ${PLAYER_FOUL_LIMIT} falli: non può essere in campo.` };
    return { added };
  }

  // «quintetto 4 7 9 12 25»: i cinque in campo da quel momento.
  function parseLineup(state, text, side) {
    const numbers = [...new Set(numbersIn(text))];
    if (numbers.length !== 5) return { error: `Il quintetto è di 5 giocatori: ho sentito ${numbers.length} numeri.` };
    const where = groupTeam(state, side, numbers);
    if (where.error) return where;
    const check = checkGroup(state, where.team, numbers, numbers);
    if (check.error) return check;
    return { type: 'lineup', team: where.team, on: numbers.sort((a, b) => a - b), added: check.added };
  }

  // «entra il 12, esce il 7», anche con più giocatori: «entrano 12 e 14, escono 7 e 9».
  function parseSub(state, text, side, at) {
    const ins = [];
    const outs = [];
    let list = null;
    for (const w of text.trim().split(/\s+/)) {
      if (IN_WORD.test(w)) list = ins;
      else if (OUT_WORD.test(w)) list = outs;
      else if (/^\d+$/.test(w)) {
        if (!list) return { error: "Non ho capito chi entra e chi esce: «entra il 12, esce il 7»." };
        list.push(Number(w));
      }
    }
    if (!ins.length || !outs.length) return { error: "Di' chi entra e chi esce: «entra il 12, esce il 7»." };
    if (ins.length !== outs.length) return { error: `Entrano ${ins.length} ed escono ${outs.length}: ripeti il cambio.` };
    // la squadra si capisce da chi esce: è quella che li ha in campo; chi entra può anche essere nuovo
    const onCourt = ['home', 'away'].filter((t) => outs.every((n) => courtAt(state.events, t, at)?.has(n)));
    const where = side || onCourt.length !== 1 ? groupTeam(state, side, outs) : { team: onCourt[0] };
    if (where.error) return where;
    const { team } = where;
    const check = checkGroup(state, team, ins, [...ins, ...outs]);
    if (check.error) return check;
    const court = courtAt(state.events, team, at);
    if (!court) return { error: `Prima dimmi il quintetto in campo di ${state.names[team]}.` };
    const away = outs.find((n) => !court.has(n));
    if (away !== undefined) return { error: `Il ${away} non è in campo: non può uscire.` };
    const already = ins.find((n) => court.has(n));
    if (already !== undefined) return { error: `Il ${already} è già in campo.` };
    return { type: 'sub', team, in: ins, out: outs, added: check.added };
  }

  // ——— Canestri, falli e scout detti a voce, anche più azioni in un comando ———
  // «palla persa del 23, recuperata dal 32», «canestro del 12, assist del 7», «fallo del 5 sul 12»:
  // ogni azione (head) prende il giocatore detto subito dopo di lei, o se dopo non c'è quello detto prima.

  const HEAD_WORDS = [
    ['score', /^(canestr\w*|segn\w*|tripl\w*|bomb\w*|schiacciat\w*|punt[oi]|liber[oi])$/],
    ['miss', /^(sbagli\w*|errat\w*|errore|padella)$/],
    ['foul', /^fall[oi]$/],
    ['reb', /^rimbalz\w*$/],
    ['ast', /^assist\w*$/],
    ['stl', /^(recuper\w*|rubat\w*|ruba)$/],
    ['tov', /^(pers[aeo]|perde)$/],
    ['blk', /^(stoppat[ae]|stoppa)$/],
    ['blka', /^stoppat[oi]$/],
  ];
  const DRAWN_WORD = /^(subit[oai]|subisce)$/; // fallo subito, stoppata subita
  const OFF_WORD = /^(offensiv\w*|attacco)$/;
  const DEF_WORD = /^(difensiv\w*|difesa)$/;
  const ON_WORD = /^(su|sul|sulla|sullo)$/; // «fallo del 5 sul 12»: il 12 subisce
  const SHOTS = ['score', 'miss', 'blka'];

  // Le azioni legate fra loro: se la squadra di una non si capisce, la si ricava dall'altra.
  const SAME_TEAM = { ast: ['score'], score: ['ast'], oreb: ['miss', 'blka'] };
  const OTHER_TEAM = {
    stl: ['tov'],
    tov: ['stl'],
    fd: ['foul'],
    foul: ['fd'],
    blka: ['blk'],
    blk: ['blka', 'miss'],
    dreb: ['miss', 'blka'],
  };

  // L'azione di chi subisce: il fallo subito, la stoppata subita (con il tiro sbagliato), la palla recuperata.
  const PASSIVE = { foul: 'fd', blk: 'blka', fd: 'foul', blka: 'blk', tov: 'stl' };

  const headValue = (word) => (/^(tripl|bomb)/.test(word) ? 3 : /^liber/.test(word) ? 1 : undefined);

  // Le parole dei nomi dei giocatori: «Rossi» porta al #25 di casa, «Luca» al #12 ospite.
  function nameIndex(state) {
    const index = new Map();
    for (const team of ['home', 'away']) {
      for (const n of state.rosters[team]) {
        const name = state.playerNames[team][n];
        if (!name) continue;
        for (const w of speechWords(name).split(' ')) {
          if (w.length >= 3) index.set(w, [...(index.get(w) ?? []), { team, player: n }]);
        }
      }
    }
    return index;
  }

  function otherSide(team) {
    return team === 'home' ? 'away' : 'home';
  }

  // Il giocatore dal numero, cercato nella squadra detta o in tutte e due; un numero nuovo entra in squadra
  // solo se la squadra è nota. needsTeam segna gli errori che si risolvono sapendo la squadra.
  function playerByNumber(state, side, number) {
    if (number > 99) return { error: `Il ${number} non è un numero di maglia.` };
    const sides = side ? [side] : ['home', 'away'];
    const found = sides.filter((team) => state.rosters[team].includes(number));
    if (found.length === 1) return { team: found[0], player: number };
    if (found.length > 1) {
      const or = state.colors?.home || state.colors?.away ? ' o il colore della maglia' : '';
      return { error: `Il ${number} c'è in tutte e due le squadre: di' anche la squadra${or}.`, needsTeam: true };
    }
    if (!side) return { error: `Il ${number} non è in squadra: di' anche la squadra e lo aggiungo.`, needsTeam: true };
    if (state.rosters[side].length >= maxPlayers(state)) {
      return { error: `${state.names[side]} ha già ${maxPlayers(state)} giocatori: il ${number} non c'è.` };
    }
    return { team: side, player: number, newPlayer: true };
  }

  function playerByName(state, side, word, names) {
    const matches = (names.get(word) ?? []).filter((m) => !side || m.team === side);
    if (matches.length === 1) return matches[0];
    if (matches.length === 0) return { error: `${word} non è in ${state.names[side]}.` };
    return { error: "Più giocatori con quel nome: di' il numero.", needsTeam: !side };
  }

  // I falli del giocatore fino a quel momento della partita (compreso: nello stesso secondo il fallo viene
  // prima di quello che si dice dopo): con 5 è già fuori. Quelli fischiati più avanti non contano.
  function foulsBefore(events, team, player, at) {
    return events.reduce(
      (sum, e) =>
        e.type === 'foul' && e.team === team && e.player === player && byGameTime(e, at) <= 0 ? sum + foulValue(e) : sum,
      0
    );
  }

  // L'ultimo tiro sbagliato prima di quel momento: serve a capire se un rimbalzo è in attacco o in difesa.
  function lastMiss(events, at) {
    let found = null;
    for (const e of events) {
      if (e.type === 'stat' && e.kind === 'miss' && byGameTime(e, at) <= 0 && (!found || byGameTime(e, found) >= 0)) found = e;
    }
    return found;
  }

  const WHAT = {
    score: 'chi ha segnato',
    miss: 'chi ha sbagliato',
    blka: 'chi è stato stoppato',
    foul: 'chi ha fatto fallo',
    fd: 'chi ha subito il fallo',
    reb: 'chi ha preso il rimbalzo',
    ast: "chi ha fatto l'assist",
    stl: 'chi ha recuperato',
    tov: 'chi ha perso palla',
    blk: 'chi ha stoppato',
  };

  function parseActions(state, text, at) {
    text = text
      .replace(/ ([123]) liber[oi](?= )/g, (m, n) => ` x${n} libero`)
      .replace(/ un punto(?= )/g, ' v1 punto')
      .replace(/ da ([123])(?= )/g, (m, n) => ` v${n}`)
      .replace(/ ([123]) punt[oi](?= )/g, (m, n) => ` v${n} punti`);
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    const names = nameIndex(state);

    // 1. le parole che dicono un'azione
    let heads = [];
    tokens.forEach((w, i) => {
      const found = HEAD_WORDS.find(([, re]) => re.test(w));
      if (found) heads.push({ kind: found[0], index: i, value: headValue(w) });
    });
    // «tripla sbagliata», «tiro libero sbagliato»: la parola del canestro dice solo il valore del tiro sbagliato
    for (const miss of heads.filter((h) => h.kind === 'miss')) {
      for (const shot of heads.filter((h) => h.kind === 'score' && Math.abs(h.index - miss.index) <= 2)) {
        miss.value ??= shot.value;
        shot.gone = true;
      }
    }
    heads = heads.filter((h) => !h.gone);
    // «fallo subito», «stoppata subita»
    tokens.forEach((w, i) => {
      if (!DRAWN_WORD.test(w)) return;
      const near = heads
        .filter((h) => (h.kind === 'foul' || h.kind === 'blk') && Math.abs(h.index - i) <= 2)
        .sort((a, b) => Math.abs(a.index - i) - Math.abs(b.index - i))[0];
      if (near) near.kind = near.kind === 'foul' ? 'fd' : 'blka';
    });
    // «rimbalzo in attacco», «rimbalzo difensivo»
    tokens.forEach((w, i) => {
      if (!OFF_WORD.test(w) && !DEF_WORD.test(w)) return;
      const near = heads.filter((h) => h.kind === 'reb' && Math.abs(h.index - i) <= 3)[0];
      if (near) near.side = OFF_WORD.test(w) ? 'oreb' : 'dreb';
    });

    const isName = (w) => names.has(w);
    const isNumber = (w) => /^\d+$/.test(w);
    // «fallo del 5 sul 12», «stoppata del 7 sul 12»: chi è dopo «su» subisce
    tokens.forEach((w, i) => {
      if (!ON_WORD.test(w)) return;
      // «sul 12», «sul numero 12», «sul tiro del numero 3»: il giocatore entro poche parole, prima di un'altra azione
      let next = null;
      for (const t of tokens.slice(i + 1, i + 6)) {
        if (HEAD_WORDS.some(([, re]) => re.test(t))) break;
        if (isNumber(t) || isName(t) || /^v\d$/.test(t)) {
          next = t;
          break;
        }
      }
      const before = heads.filter((h) => h.index < i).pop();
      if (!next || !before || !PASSIVE[before.kind]) return;
      heads.push({ kind: PASSIVE[before.kind], index: i });
      before.paired = true;
    });
    // «il 24 stoppa il tiro del 15», «il 4 subisce fallo dal 6», «il 24 stoppato dal 15»: senza «su», se all'inizio
    // della frase c'è un giocatore prima dell'azione e uno dopo, il primo è quello del verbo e l'altro fa la parte
    // opposta (chi fa il fallo e chi lo subisce, chi stoppa e chi è stoppato)
    const first = heads.reduce((a, b) => (b.index < a.index ? b : a), heads[0] ?? { index: Infinity });
    if (first && PASSIVE[first.kind] && !first.paired) {
      const nextHead = Math.min(tokens.length, ...heads.filter((h) => h.index > first.index).map((h) => h.index));
      const people = (from, to) => {
        const found = [];
        for (let i = from; i < to; i++) if (isNumber(tokens[i]) || isName(tokens[i])) found.push(i);
        return found;
      };
      const before = people(0, first.index);
      const after = people(first.index + 1, nextHead);
      if (before.length === 1 && after.length === 1) {
        first.own = before[0];
        heads.push({ kind: PASSIVE[first.kind], index: first.index, own: after[0] });
      }
    }
    heads.sort((a, b) => a.index - b.index);
    // «segna un canestro», «tiro libero segnato»: due parole per la stessa azione
    heads = heads.filter((h, k) => {
      const prev = heads[k - 1];
      if (!prev || prev.kind !== h.kind || h.kind === 'fd' || h.kind === 'blka') return true;
      const between = tokens.slice(prev.index + 1, h.index);
      if (between.some((t) => isNumber(t) || isName(t))) return true;
      prev.value ??= h.value;
      return false;
    });
    if (heads.length === 0) {
      return { error: 'Non ho capito cosa è successo: canestro, tiro sbagliato, fallo, rimbalzo, assist, palla persa…' };
    }

    // 2. il valore dei tiri («da 3», «2 punti») e quante volte («2 liberi») vanno al tiro più vicino;
    // senza tiri, «da 2» era un giocatore («recuperata da 2»)
    const shotHeads = heads.filter((h) => SHOTS.includes(h.kind));
    const valueAt = new Set();
    tokens.forEach((w, i) => {
      const m = /^([vx])(\d)$/.exec(w);
      if (!m || shotHeads.length === 0) return;
      const near = [...shotHeads].sort((a, b) => Math.abs(a.index - i) - Math.abs(b.index - i))[0];
      if (m[1] === 'v') near.value = Number(m[2]);
      else near.count = Number(m[2]);
      valueAt.add(i);
    });
    const isPlayer = (i) => !valueAt.has(i) && (isNumber(tokens[i]) || isName(tokens[i]) || /^v\d$/.test(tokens[i]));
    const isTeam = (i) => /^@(home|away)$/.test(tokens[i]);

    // 3. a ogni azione il suo pezzo di frase, con il suo giocatore e la sua squadra
    let start = 0;
    const claimed = new Set();
    const clauses = heads.map((h, k) => {
      const next = heads[k + 1]?.index ?? tokens.length;
      const last = k === heads.length - 1;
      let player = -1;
      let end;
      if (h.own !== undefined && h.own < h.index) {
        // il giocatore del verbo, detto prima: il pezzo di frase finisce con l'azione
        player = h.own;
        claimed.add(player);
        const region = [start, h.index];
        start = h.index + 1;
        const teams = new Set();
        for (let i = region[0]; i <= region[1]; i++) if (isTeam(i)) teams.add(tokens[i].slice(1));
        return { ...h, token: tokens[player], teams };
      }
      if (h.own !== undefined) player = h.own;
      for (let i = h.index + 1; i < next && player < 0; i++) {
        if (isPlayer(i)) {
          player = i;
          break;
        }
      }
      if (player >= 0) {
        end = player;
        for (let i = player + 1; i < next && !isPlayer(i); i++) if (isTeam(i)) end = i;
      } else {
        for (let i = h.index - 1; i >= start; i--) {
          if (isPlayer(i) && !claimed.has(i)) {
            player = i;
            break;
          }
        }
        end = h.index;
      }
      if (player >= 0) claimed.add(player);
      const region = [start, last ? tokens.length - 1 : end];
      start = end + 1;
      const teams = new Set();
      for (let i = region[0]; i <= region[1]; i++) if (isTeam(i)) teams.add(tokens[i].slice(1));
      return { ...h, token: player >= 0 ? tokens[player] : null, teams };
    });
    const loose = tokens.findIndex((w, i) => isPlayer(i) && !claimed.has(i));
    if (loose >= 0) return { error: `Non ho capito a chi va il ${tokens[loose].replace(/^v/, '')}: un'azione per ogni giocatore.` };

    // 4. chi è il giocatore di ogni azione; la squadra che non si capisce si ricava dalle azioni legate
    const resolve = (c, side) => {
      if (c.token === null) return side ? { team: side } : { error: `Non ho capito ${WHAT[c.kind]}: di' il numero o il nome.`, needsTeam: true };
      if (isName(c.token)) return playerByName(state, side, c.token, names);
      return playerByNumber(state, side, Number(c.token.replace(/^v/, '')));
    };
    for (const c of clauses) {
      if (c.teams.size > 1) return { error: 'Ho sentito tutte e due le squadre per la stessa azione.' };
      c.who = resolve(c, [...c.teams][0]);
    }
    const kindOf = (c) => (c.kind === 'reb' ? c.side ?? 'reb' : c.kind);
    for (const c of clauses) {
      if (!c.who.needsTeam) continue;
      for (const other of clauses) {
        if (other === c || other.who.error) continue;
        const k = kindOf(c);
        const o = kindOf(other);
        if (SAME_TEAM[k]?.includes(o)) c.who = resolve(c, other.who.team);
        else if (OTHER_TEAM[k]?.includes(o)) c.who = resolve(c, otherSide(other.who.team));
        if (!c.who.needsTeam) break;
      }
    }
    const failed = clauses.find((c) => c.who.error);
    if (failed) return { error: failed.who.error, needsTeam: failed.who.needsTeam };
    // chi fa il fallo e chi lo subisce, chi stoppa e chi è stoppato, chi perde palla e chi la recupera
    // sono sempre di squadre diverse
    for (const c of clauses) {
      const pair = clauses.find((o) => o !== c && PASSIVE[c.kind] === o.kind);
      if (pair && pair.who.team === c.who.team && (c.kind === 'foul' || c.kind === 'blk' || c.kind === 'tov')) {
        return { error: 'Le due parti della stessa azione sono della stessa squadra: controlla numeri e colori.' };
      }
    }

    // 5. le azioni pronte, con i controlli: rimbalzo in attacco o in difesa, nessuno con 5 falli
    const items = [];
    for (const c of clauses) {
      const { team, player, newPlayer } = c.who;
      let kind = kindOf(c);
      if (kind === 'reb') {
        const shot = clauses.find((o) => (o.kind === 'miss' || o.kind === 'blka') && !o.who.error)?.who ?? lastMiss(state.events, at);
        if (!shot) return { error: "Il rimbalzo è in attacco o in difesa? Dillo nel comando." };
        kind = shot.team === team ? 'oreb' : 'dreb';
      }
      if (player !== undefined && !newPlayer && foulsBefore(state.events, team, player, at) >= PLAYER_FOUL_LIMIT) {
        return { error: `${playerLabel(state, team, player)} ${state.names[team]} ha già ${PLAYER_FOUL_LIMIT} falli.` };
      }
      const base = { team, ...byPlayer(player), ...(newPlayer ? { newPlayer } : {}) };
      if (kind === 'score') items.push({ type: 'score', ...base, pts: c.value ?? 2, count: c.count ?? 1 });
      else if (kind === 'foul') items.push({ type: 'foul', ...base, count: 1 });
      else if (kind === 'miss' || kind === 'blka') {
        items.push({ type: 'stat', kind: 'miss', ...base, pts: c.value ?? 2, count: c.count ?? 1, ...(kind === 'blka' ? { blocked: true } : {}) });
      } else items.push({ type: 'stat', kind, ...base, count: 1 });
    }
    return { type: 'actions', items };
  }

  // Una frase detta diventa un comando già controllato, con il suo tempo del tabellone (at),
  // oppure { error } con il motivo da mostrare.
  function parseCommand(state, heard, now) {
    let text = ` ${speechWords(clockWords(heard))} `;
    if (!text.trim()) return { error: 'Non ho sentito niente.' };
    if (UNDO_WORDS.test(text)) return { type: 'undo' };
    text = markTeams(state, text);
    const lineup = LINEUP_WORDS.test(text);
    const sub = !lineup && SUB_WORDS.test(text);
    const action = lineup || sub || text.trim().split(/\s+/).some((w) => HEAD_WORDS.some(([, re]) => re.test(w)));
    if (!action) return { error: 'Non ho capito cosa è successo: canestro, tiro sbagliato, fallo, rimbalzo, assist, palla persa…' };
    const time = takeTime(state, text, now, !lineup && !sub);
    if (time.error) return time;
    text = time.text;
    let cmd;
    if (lineup || sub) {
      const words = text.trim().split(/\s+/);
      if (words.some((w) => HEAD_WORDS.some(([, re]) => re.test(w)))) {
        return { error: 'Un comando per volta: il quintetto e i cambi da soli.' };
      }
      const sides = new Set(words.filter((w) => /^@(home|away)$/.test(w)).map((w) => w.slice(1)));
      if (sides.size > 1) return { error: 'Ho sentito tutte e due le squadre: una per comando.' };
      const plain = ` ${words.filter((w) => !w.startsWith('@')).join(' ')} `;
      const side = [...sides][0];
      cmd = lineup ? parseLineup(state, plain, side) : parseSub(state, plain, side, time.at);
    } else {
      cmd = parseActions(state, text, time.at);
    }
    // è stato detto un colore che non è quello di nessuna delle due maglie (e non è il nome di un giocatore):
    // meglio dirlo che indovinare la squadra
    const names = nameIndex(state);
    const unknown = text
      .trim()
      .split(/\s+/)
      .find((w) => !names.has(w) && COMMON_COLORS.some((c) => new RegExp(`^${colorStem(c)}(?:h?[aeio]+)?$`).test(w)));
    if (unknown && !cmd.error?.startsWith('Non ho capito cosa')) {
      return { error: `«${unknown}» non è il colore di nessuna squadra: scrivilo in Impostazioni, in «Colore maglia».` };
    }
    return cmd.error ? { error: cmd.error } : { ...cmd, at: time.at };
  }

  const COLOR_FILLER = ['maglia', 'maglie', 'divisa', 'con', 'colore'];
  // I colori delle maglie più comuni: se se ne dice uno che non è di nessuna squadra, si spiega dove scriverlo.
  const COMMON_COLORS = ['bianco', 'nero', 'blu', 'rosso', 'verde', 'giallo', 'azzurro', 'arancione', 'arancio', 'viola',
    'grigio', 'rosa', 'celeste', 'granata', 'amaranto', 'oro', 'argento', 'bordeaux', 'fucsia', 'marrone'];

  // La radice di un colore, uguale per maschile, femminile, singolare e plurale: bianco, bianca, bianchi,
  // bianche diventano tutti «bianc»; grigio e grigi «grig»; blu resta blu.
  function colorStem(word) {
    const stem = word.replace(/h?[aeio]+$/, '');
    return stem.length >= 3 ? stem : word;
  }

  // Le radici delle parole del colore scritto in Impostazioni («maglia bianca», «bianco e rosso»), senza le parole
  // di contorno e senza quelle che ha anche il colore dell'altra squadra.
  function colorStems(state, team) {
    const stems = (text) =>
      speechWords(text)
        .split(' ')
        .filter((w) => w.length >= 3 && !COLOR_FILLER.includes(w) && !/^\d+$/.test(w))
        .map(colorStem);
    const other = stems(state.colors?.[team === 'home' ? 'away' : 'home'] ?? '');
    return [...new Set(stems(state.colors?.[team] ?? ''))].filter((stem) => !other.includes(stem));
  }

  // Il colore detto a voce si riconosce in tutte le sue forme: «bianco» scritto vale per bianca, bianchi, bianche,
  // e viceversa.
  function colorPattern(state, team) {
    const stems = colorStems(state, team);
    if (stems.length === 0) return null;
    return new RegExp(` (?:${stems.map((st) => `${st}(?:h?[aeio]+)?`).join('|')})(?= )`, 'g');
  }

  // I nomi delle squadre, «casa» e «ospiti» e i colori delle maglie diventano segnaposti (@home, @away),
  // così ogni pezzo della frase sa di quale squadra parla.
  function markTeams(state, text) {
    let found = false;
    for (const team of ['home', 'away']) {
      const mark = () => {
        found = true;
        return ` @${team}`;
      };
      const pattern = teamPattern(state.names[team]);
      if (pattern) text = text.replace(pattern, mark);
      text = text.replace(SIDE_WORDS[team], mark);
    }
    // un colore che è anche un cognome in squadra («Bianchi», «Rossi») vale come colore solo accanto a un numero:
    // «il 12 dei bianchi» è la squadra, «assist di Bianchi» è il giocatore
    const names = nameIndex(state);
    for (const team of ['home', 'away']) {
      const pattern = colorPattern(state, team);
      if (!pattern) continue;
      text = text.replace(pattern, (m, offset, whole) => {
        // accanto vuol dire subito prima o subito dopo, o prima con una parola in mezzo («il 12 dei bianchi»)
        const near = [...whole.slice(0, offset).trim().split(' ').slice(-2), whole.slice(offset + m.length).trim().split(' ')[0]];
        if (m.trim().split(' ').some((w) => names.has(w)) && !near.some((w) => /^\d+$/.test(w))) return m;
        found = true;
        return ` @${team}`;
      });
    }
    if (!found) {
      for (const team of ['home', 'away']) {
        for (const w of distinctiveWords(state, team)) text = text.replace(words(w, 'g'), ` @${team}`);
      }
    }
    return text;
  }

  function describeEvent(state, e) {
    const who = e.player === undefined ? state.names[e.team] : `${playerLabel(state, e.team, e.player)} ${state.names[e.team]}`;
    if (e.type === 'score') return `${e.pts > 0 ? '+' : '−'}${Math.abs(e.pts)} ${who}`;
    if (e.type === 'foul') return `${foulValue(e) < 0 ? 'fallo tolto' : 'fallo'} ${who}`;
    if (e.type === 'stat') return `${statName(e).toLowerCase()} ${who}`;
    if (e.type === 'lineup') return `quintetto ${state.names[e.team]}`;
    if (e.type === 'sub') return `cambio ${state.names[e.team]}`;
    return `timeout ${state.names[e.team]}`;
  }

  // Con il tempo detto a voce il cronometro dell'app non corre: mostra il punto più avanti a cui è arrivata
  // la partita, così falli di squadra, bonus e timeout restano quelli del periodo giusto.
  function followVoice(state, now, at) {
    if (state.settings.timeSource !== 'voice' || byGameTime(at, boardTime(state, now)) <= 0) return;
    state.period = at.period;
    state.clock = { ...freshClock(at.period), remainingMs: at.clockMs };
  }

  // Le azioni di un comando hanno lo stesso gruppo: «annulla» le toglie tutte insieme.
  function nextGroup(events) {
    return events.reduce((max, e) => Math.max(max, e.group ?? 0), 0) + 1;
  }

  // Esegue un comando già controllato e restituisce la frase di conferma da mostrare.
  // stamp si aggiunge a ogni azione registrata: per esempio { videoMs }, il punto del video in cui è stata detta.
  function applyCommand(state, now, cmd, stamp = {}) {
    if (cmd.type === 'undo') {
      const last = state.events[state.events.length - 1];
      if (!last) return 'Niente da annullare.';
      const same = last.group === undefined ? [last] : state.events.filter((e) => e.group === last.group);
      const what = same.map((e) => describeEvent(state, e)).join(' + ');
      undo(state);
      return `Annullato: ${what}`;
    }
    const { at } = cmd;
    const group = nextGroup(state.events);
    const when = `${periodLabel(at.period)} ${formatClock(at.clockMs)}`;
    let message;
    if (cmd.type === 'lineup' || cmd.type === 'sub') {
      const { team } = cmd;
      for (const n of cmd.added) addPlayer(state, team, n);
      const extra = { group, ...stamp, ...(cmd.added.length ? { added: cmd.added } : {}) };
      const labels = (numbers) => numbers.map((n) => playerLabel(state, team, n)).join(', ');
      const news = cmd.added.length ? ` (${cmd.added.length === 1 ? 'nuovo' : 'nuovi'} in squadra)` : '';
      if (cmd.type === 'lineup') {
        record(state, now, { type: 'lineup', team, on: cmd.on, ...extra }, at);
        message = `Quintetto ${state.names[team]}: ${cmd.on.join(' ')}${news}`;
      } else {
        record(state, now, { type: 'sub', team, in: cmd.in, out: cmd.out, ...extra }, at);
        message = `Cambio ${state.names[team]}: entra ${labels(cmd.in)}, esce ${labels(cmd.out)}${news}`;
      }
    } else {
      const added = new Set();
      const parts = cmd.items.map((item) => {
        const { team, player } = item;
        const isNew = item.newPlayer && !added.has(`${team} ${player}`);
        if (isNew) {
          addPlayer(state, team, player);
          added.add(`${team} ${player}`);
        }
        const extra = { group, ...stamp, ...(isNew ? { added: [player] } : {}) };
        for (let i = 0; i < item.count; i++) {
          const event =
            item.type === 'score'
              ? { type: 'score', team, pts: item.pts }
              : item.type === 'foul'
                ? { type: 'foul', team }
                : { type: 'stat', kind: item.kind, team, ...(item.kind === 'miss' ? { pts: item.pts } : {}), ...(item.blocked ? { blocked: true } : {}) };
          record(state, now, { ...event, ...byPlayer(player), ...(i === 0 ? extra : { group, ...stamp }) }, at);
        }
        const who = player === undefined ? state.names[team] : `${playerLabel(state, team, player)} ${state.names[team]}`;
        const news = isNew ? ' (nuovo in squadra)' : '';
        if (item.type === 'foul') {
          const n = player === undefined ? teamFouls(state.events, team, at.period) : playerFouls(state.events, team, player);
          return `Fallo · ${who}${news} (${n}° ${player === undefined ? 'di squadra' : 'personale'})`;
        }
        if (item.type === 'score') return `${item.count > 1 ? `${item.count} tiri liberi` : SHOT_NAMES[item.pts]} · ${who}${news}`;
        const name = item.kind === 'miss' ? MISS_NAMES[item.pts] + (item.blocked ? ' (stoppato)' : '') : STAT_NAMES[item.kind];
        return `${item.count > 1 ? `${item.count} × ` : ''}${name} · ${who}${news}`;
      });
      message = `${parts.join(' + ')} · ${score(state.events, 'home')}–${score(state.events, 'away')}`;
    }
    followVoice(state, now, at);
    return `${message} · ${when}`;
  }

  // Il riconoscimento propone più versioni di quello che ha sentito, dalla più probabile:
  // vale la prima che è un comando valido. Se nessuna lo è, niente cambia, si dice perché e la frase
  // resta nella cronaca fra i comandi non registrati, così non si perde.
  // now è l'istante in cui si è premuto il microfono: con il tempo dal cronometro, è lì che si legge.
  function voiceCommand(state, now, alternatives, stamp = {}) {
    let failed = null;
    for (const heard of alternatives) {
      const cmd = parseCommand(state, heard, now);
      if (!cmd.error) return { ok: true, heard, message: applyCommand(state, now, cmd, stamp) };
      failed ??= { ok: false, heard, message: cmd.error };
    }
    if (!failed) return { ok: false, heard: '', message: 'Non ho sentito niente.' };
    const time = takeTime(state, markTeams(state, ` ${speechWords(clockWords(failed.heard))} `), now, true);
    const at = time.error ? boardTime(state, now) : time.at;
    state.notes.push({
      after: state.events.length,
      heard: failed.heard,
      reason: failed.message,
      period: at.period,
      clockMs: at.clockMs,
      ...stamp,
    });
    return failed;
  }

  function tenths(ms) {
    const t = Math.floor(ms / 100);
    return `${Math.floor(t / 10)}.${t % 10}`;
  }

  // Sopra il minuto m:ss; nell'ultimo minuto secondi e decimi, come sui tabelloni FIBA.
  function formatClock(ms) {
    if (ms < 60000) return tenths(ms);
    const seconds = Math.floor(ms / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  // I 24 secondi mostrano i decimi solo negli ultimi 5 secondi.
  function formatShot(ms) {
    return ms < 5000 ? tenths(ms) : String(Math.floor(ms / 1000));
  }

  const Game = {
    QUARTER_MS,
    OVERTIME_MS,
    SHOT_MS,
    SHOT_SHORT_MS,
    BONUS_FOULS,
    PLAYER_FOUL_LIMIT,
    MAX_PLAYERS,
    MAX_PLAYERS_FRIENDLY,
    periodLength,
    periodLabel,
    newGame,
    score,
    playerPoints,
    teamFouls,
    playerFouls,
    lastFoul,
    timeoutWindow,
    timeoutsLeft,
    remainingMs,
    shotRemainingMs,
    shotClockOff,
    startClock,
    pauseClock,
    resetShot,
    checkExpiry,
    adjustClock,
    goToPeriod,
    addPoints,
    canRemovePoints,
    removePoints,
    addFoul,
    removeFoul,
    takeTimeout,
    undo,
    maxPlayers,
    addPlayer,
    setPlayerName,
    setColor,
    playerLabel,
    canRemovePlayer,
    removePlayer,
    setFriendly,
    teamSnapshot,
    storeTeam,
    hasStoredTeam,
    deleteStoredTeam,
    mergeLibrary,
    encodeLibrary,
    decodeLibrary,
    loadTeam,
    saveKind,
    saveTeam,
    byGameTime,
    courtAt,
    boardTime,
    boxScore,
    boxTotals,
    formatMinutes,
    formatVideoTime,
    gameDate,
    gameStatus,
    encodeBox,
    decodeBox,
    efficiency,
    statName,
    gameFile,
    gameFileName,
    archiveEntry,
    gameFromData,
    storeGame,
    readGameFile,
    archiveFile,
    archiveTeams,
    seasonStats,
    speechWords,
    parseCommand,
    applyCommand,
    voiceCommand,
    formatClock,
    formatShot,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Game;
  else root.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);
