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
  function newGame(names, setup = {}) {
    return {
      names: { ...names },
      settings: { playerMode: false, friendly: false, shotClock: false, voice: false, ...setup.settings },
      rosters: { home: [...(setup.rosters?.home ?? [])], away: [...(setup.rosters?.away ?? [])] },
      playerNames: { home: { ...setup.playerNames?.home }, away: { ...setup.playerNames?.away } },
      // da quale squadra salvata vengono i giocatori di ciascun lato, per aggiornarla o rinominarla
      origins: { home: setup.origins?.home ?? null, away: setup.origins?.away ?? null },
      period: 1,
      clock: freshClock(1),
      events: [],
      clockLog: [], // avvii e fermate del cronometro con l'ora vera, per ritrovare le azioni nel video
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

  // Ogni avvio e fermata del cronometro finisce nel registro con l'ora vera: il primo avvio è la palla a due,
  // e da lì si ritrova nel video il momento di ogni azione.
  function logClock(state, at, type, reason) {
    const entry = { type, at, period: state.period, clockMs: state.clock.remainingMs };
    if (reason) entry.reason = reason;
    state.clockLog.push(entry);
  }

  function toggleClock(state, now) {
    if (state.clock.running) {
      pauseClock(state.clock, now);
      logClock(state, now, 'stop');
      return;
    }
    startClock(state.clock, now);
    if (state.clock.running) logClock(state, now, 'start');
  }

  // Il controllo di ogni decimo di secondo: se è scaduto qualcosa annota l'istante esatto della scadenza.
  function expire(state, now) {
    const { startedAt, remainingMs: left, shotMs } = state.clock;
    const reason = checkExpiry(state.clock, now, state.settings.shotClock);
    if (reason) logClock(state, startedAt + (reason === 'period' ? left : shotMs), 'stop', reason);
    return reason;
  }

  function adjustClock(state, deltaMs) {
    if (state.clock.running) return;
    const max = periodLength(state.period);
    state.clock.remainingMs = Math.min(max, Math.max(0, state.clock.remainingMs + deltaMs));
  }

  // Cambiare periodo (o ripartire da capo in quello attuale) ferma e riempie i cronometri.
  function goToPeriod(state, period, now) {
    if (period < 1) return;
    if (state.clock.running && now !== undefined) {
      pauseClock(state.clock, now);
      logClock(state, now, 'stop');
    }
    state.period = period;
    state.clock = freshClock(period);
  }

  // Ogni azione tiene periodo e tempo del cronometro, e l'ora vera (at) per metterla al punto giusto del video.
  function record(state, now, event) {
    state.events.push({ ...event, period: state.period, clockMs: remainingMs(state.clock, now), at: now });
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
    if (state.clock.running) {
      pauseClock(state.clock, now);
      logClock(state, now, 'stop', 'timeout');
    }
    record(state, now, { type: 'timeout', team });
    return true;
  }

  // Se annullare ridà punti o falli a un giocatore tolto dall'elenco, il giocatore ci rientra.
  // Se toglie l'azione con cui la voce aveva aggiunto un giocatore nuovo (added) e lui resta a zero, esce.
  function undo(state) {
    const e = state.events.pop();
    if (e?.player === undefined) return;
    const roster = state.rosters[e.team];
    const empty = canRemovePlayer(state.events, e.team, e.player);
    if (e.added && empty) {
      removePlayer(state, e.team, e.player);
    } else if (!roster.includes(e.player) && !empty) {
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

  // Si toglie solo un giocatore rimasto a zero punti e zero falli, così i totali restano giusti.
  function canRemovePlayer(events, team, player) {
    return playerPoints(events, team, player) === 0 && playerFouls(events, team, player) === 0;
  }

  function removePlayer(state, team, player) {
    if (!canRemovePlayer(state.events, team, player)) return false;
    state.rosters[team] = state.rosters[team].filter((n) => n !== player);
    delete state.playerNames[team][player];
    return true;
  }

  // Le squadre salvate: nome della squadra e giocatori con numero e nome, pronti da richiamare.
  function teamSnapshot(state, team) {
    return {
      name: state.names[team],
      players: state.rosters[team].map((number) => ({ number, name: state.playerNames[team][number] ?? '' })),
    };
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
    return toLinkText(library.map((t) => [t.name, t.players.map((p) => (p.name ? [p.number, p.name] : [p.number]))]));
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
    const valid =
      name !== '' &&
      players.length <= MAX_PLAYERS_FRIENDLY &&
      numbers.every((n) => Number.isInteger(n) && n >= 0 && n <= 99) &&
      new Set(numbers).size === numbers.length;
    return valid ? { name, players } : null;
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

  // ——— Tabellino ———

  // La riga di un giocatore (o della squadra, senza player): punti, canestri segnati
  // [tiri liberi, da 2, da 3] e falli. Le correzioni contano in meno.
  function statLine(events, team, player) {
    const line = { pts: 0, made: [0, 0, 0], fouls: 0 };
    for (const e of events) {
      if (e.team !== team || e.player !== player) continue;
      if (e.type === 'score') {
        line.pts += e.pts;
        line.made[Math.abs(e.pts) - 1] += Math.sign(e.pts);
      } else if (e.type === 'foul') {
        line.fouls += foulValue(e);
      }
    }
    return line;
  }

  // Il tabellino fino alla fine del periodo upTo (senza, fino a ora): i punti di ogni periodo e, per squadra,
  // una riga per giocatore più la riga della squadra per quello che è stato segnato senza giocatore.
  function boxScore(state, upTo = Infinity) {
    const events = state.events.filter((e) => e.period <= upTo);
    const last = Math.min(upTo, Math.max(state.period, ...events.map((e) => e.period)));
    const periods = [];
    for (let period = 1; period <= last; period++) {
      const inPeriod = events.filter((e) => e.period === period);
      periods.push({ period, home: score(inPeriod, 'home'), away: score(inPeriod, 'away') });
    }
    const teams = {};
    for (const team of ['home', 'away']) {
      const numbers = new Set(state.rosters[team]);
      for (const e of events) if (e.team === team && e.player !== undefined) numbers.add(e.player);
      teams[team] = {
        name: state.names[team],
        players: [...numbers]
          .sort((a, b) => a - b)
          .map((number) => ({ number, name: state.playerNames[team][number] ?? '', ...statLine(events, team, number) })),
        team: statLine(events, team, undefined),
      };
    }
    return { periods, teams };
  }

  function boxTotals(side) {
    return [...side.players, side.team].reduce(
      (sum, line) => ({
        pts: sum.pts + line.pts,
        made: sum.made.map((n, i) => n + line.made[i]),
        fouls: sum.fouls + line.fouls,
      }),
      { pts: 0, made: [0, 0, 0], fouls: 0 }
    );
  }

  function dayOf(at) {
    const d = new Date(at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Il giorno della partita: quello della palla a due, o della prima azione, o di oggi.
  function gameDate(state, now) {
    return dayOf(state.clockLog[0]?.at ?? state.events.find((e) => e.at !== undefined)?.at ?? now);
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
  function encodeBox(box, info) {
    const line = (l) => [l.pts, ...l.made, l.fouls];
    return toLinkText([
      info.date,
      info.status,
      box.periods.map((p) => [p.home, p.away]),
      ['home', 'away'].map((team) => {
        const side = box.teams[team];
        return [side.name, side.players.map((p) => [p.number, p.name, ...line(p)]), line(side.team)];
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
        return { pts: l[0], made: l.slice(1, 4), fouls: l[4] };
      };
      if (typeof date !== 'string' || typeof status !== 'string' || sides.length !== 2) return null;
      const teams = {};
      ['home', 'away'].forEach((team, i) => {
        const [name, players, own] = sides[i];
        if (typeof name !== 'string' || players.length > 99) throw new Error('squadra rovinata');
        teams[team] = {
          name: name.slice(0, 14),
          players: players.map(([number, playerName, ...rest]) => {
            if (!whole(number) || number < 0 || number > 99 || typeof playerName !== 'string') {
              throw new Error('giocatore rovinato');
            }
            return { number, name: playerName.slice(0, 20), ...line(rest) };
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

  // ——— Il file per il video ———

  const SIDES = { home: 'casa', away: 'ospiti' };
  const SHOT_NAMES = { 1: 'Tiro libero', 2: 'Canestro da 2', 3: 'Tripla' };
  const STOP_REASONS = { period: 'fine periodo', shot: '24 secondi', timeout: 'timeout' };

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

  function boxForVideo(box) {
    const line = (l) => ({ punti: l.pts, liberi: l.made[0], da2: l.made[1], da3: l.made[2], falli: l.fouls });
    const sides = ['home', 'away'].map((team) => {
      const side = box.teams[team];
      return [
        SIDES[team],
        {
          nome: side.name,
          giocatori: side.players.map((p) => ({ numero: p.number, nome: p.name, ...line(p) })),
          squadra: line(side.team),
          totale: line(boxTotals(side)),
        },
      ];
    });
    return Object.fromEntries(sides);
  }

  // L'ora vera in due forme: leggibile (ora) e in millisecondi dal 1970 (ms), comoda per i calcoli.
  function when(at) {
    return at === undefined ? { ora: null, ms: null } : { ora: new Date(at).toISOString(), ms: at };
  }

  function actionText(e, who, playerFoulCount) {
    if (e.type === 'timeout') return `Timeout ${who}`;
    if (e.type === 'foul') return playerFoulCount ? `Fallo · ${who} (${playerFoulCount}°)` : `Fallo · ${who}`;
    return e.pts > 0 ? `${SHOT_NAMES[e.pts]} · ${who}` : `Correzione ${e.pts} · ${who}`;
  }

  // Tutto quello che serve al montatore per scrivere in sovrimpressione chi segna e chi fa fallo, e alla fine
  // di ogni periodo il tabellino. Ogni voce ha l'ora vera; il primo avvio del cronometro è la palla a due.
  function videoFile(state, now) {
    const standing = new Set(standingEvents(state.events));
    const running = { home: 0, away: 0 };
    const fouls = {};
    const actions = [];
    for (const e of state.events) {
      const key = `${e.team} ${e.player}`;
      if (e.type === 'score') running[e.team] += e.pts;
      if (e.type === 'foul') fouls[key] = (fouls[key] ?? 0) + foulValue(e);
      if (!standing.has(e)) continue;
      const name = e.player === undefined ? '' : state.playerNames[e.team][e.player] ?? '';
      const who = e.player === undefined ? state.names[e.team] : `#${e.player}${name ? ` ${name}` : ''}`;
      const type = e.type === 'score' ? (e.pts > 0 ? 'canestro' : 'correzione') : e.type === 'foul' ? 'fallo' : 'timeout';
      const action = {
        ...when(e.at),
        periodo: periodLabel(e.period),
        tempo: formatClock(e.clockMs),
        tipo: type,
        squadra: SIDES[e.team],
        nome_squadra: state.names[e.team],
        numero: e.player ?? null,
        giocatore: name,
      };
      if (e.type === 'score') action.punti = e.pts;
      if (e.type === 'foul' && e.player !== undefined) action.falli_giocatore = fouls[key];
      action.punteggio = { casa: running.home, ospiti: running.away };
      action.scritta = actionText(e, who, action.falli_giocatore);
      actions.push(action);
    }
    const periodEnds = [];
    for (let period = 1; period <= state.period; period++) {
      const stops = state.clockLog.filter((c) => c.period === period && c.type === 'stop');
      const expired = stops.filter((c) => c.reason === 'period');
      const end = expired[expired.length - 1] ?? (period < state.period ? stops[stops.length - 1] : undefined);
      if (!end) continue;
      const upTo = state.events.filter((e) => e.period <= period);
      periodEnds.push({
        periodo: periodLabel(period),
        ...when(end.at),
        punteggio: { casa: score(upTo, 'home'), ospiti: score(upTo, 'away') },
        tabellino: boxForVideo(boxScore(state, period)),
      });
    }
    const roster = (team) => ({
      nome: state.names[team],
      giocatori: state.rosters[team].map((number) => ({ numero: number, nome: state.playerNames[team][number] ?? '' })),
    });
    return {
      formato: 'tabellone-basket-video',
      versione: 1,
      creato: new Date(now).toISOString(),
      data_partita: gameDate(state, now),
      sincronia:
        'Il primo avvio del cronometro è la palla a due. Un momento del file si ritrova nel girato così: ' +
        'secondi nel girato = palla a due nel girato + (ms − ms del primo avvio) / 1000.',
      squadre: { casa: roster('home'), ospiti: roster('away') },
      cronometro: state.clockLog.map((c) => ({
        evento: c.type === 'start' ? 'avvio' : 'stop',
        ...(c.reason ? { motivo: STOP_REASONS[c.reason] } : {}),
        ...when(c.at),
        periodo: periodLabel(c.period),
        tempo: formatClock(c.clockMs),
      })),
      azioni: actions,
      fine_periodi: periodEnds,
      tabellino: boxForVideo(boxScore(state)),
    };
  }

  function slug(name) {
    const plain = String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return plain.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'squadra';
  }

  function videoFileName(state, now) {
    return `partita_${slug(state.names.home)}_${slug(state.names.away)}_${gameDate(state, now)}.json`;
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

  // La frase in minuscolo, senza accenti né punteggiatura, con i numeri in cifre
  // e le cifre staccate dalle lettere: «PC52, ventitré!» diventa «pc 52 23».
  function speechWords(text) {
    return String(text)
      .toLocaleLowerCase('it')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
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
  const FOUL_WORDS = words('fall[oi]');
  const SCORE_WORDS = words('canestr\\w*|segn\\w*|tripl\\w*|bomb\\w*|liber[oi]|punt[oi]|schiacciat\\w*');
  const NUMBER_MARK = /^(numero|n|nr|maglia)$/;

  // Le voci dello scout che arriveranno dopo: intanto la voce le riconosce e non segna niente di sbagliato.
  const LATER = [
    [words('sbagli\\w*|errat\\w*|errore|padella'), 'I tiri sbagliati'],
    [words('rimbalz\\w*'), 'I rimbalzi'],
    [words('assist\\w*'), 'Gli assist'],
    [words('recuper\\w*|rubat\\w*'), 'Le palle recuperate'],
    [words('pers[aeo]'), 'Le palle perse'],
    [words('stopp\\w*'), 'Le stoppate'],
    [words('subit[oi]'), 'I falli subiti'],
  ];

  // Chi ha fatto l'azione: dal numero, cercato nella squadra detta o in tutte e due; un numero nuovo
  // entra in squadra solo se la squadra è stata detta. Senza numero si cerca il nome; con la sola squadra
  // l'azione va alla squadra, come i pulsanti senza giocatori.
  function findPlayer(state, side, number, heard) {
    const sides = side ? [side] : ['home', 'away'];
    if (number !== undefined) {
      const found = sides.filter((team) => state.rosters[team].includes(number));
      if (found.length === 1) return { team: found[0], player: number };
      if (found.length > 1) return { error: `Il ${number} c'è in tutte e due le squadre: di' anche la squadra.` };
      if (!side) return { error: `Il ${number} non è in squadra: di' anche la squadra e lo aggiungo.` };
      if (state.rosters[side].length >= maxPlayers(state)) {
        return { error: `${state.names[side]} ha già ${maxPlayers(state)} giocatori: il ${number} non c'è.` };
      }
      return { team: side, player: number, newPlayer: true };
    }
    const said = new Set(heard.filter((w) => w.length >= 3));
    const matches = [];
    for (const team of sides) {
      for (const n of state.rosters[team]) {
        const name = state.playerNames[team][n];
        if (name && speechWords(name).split(' ').some((w) => w.length >= 3 && said.has(w))) matches.push({ team, player: n });
      }
    }
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return { error: "Più giocatori con quel nome: di' il numero." };
    if (side) return { team: side };
    return { error: "Non ho capito chi: di' il numero o il nome del giocatore." };
  }

  // Una frase detta diventa un comando già controllato, oppure { error } con il motivo da mostrare.
  function parseCommand(state, heard) {
    let text = ` ${speechWords(heard)} `;
    if (!text.trim()) return { error: 'Non ho sentito niente.' };
    if (UNDO_WORDS.test(text)) return { type: 'undo' };
    const sides = new Set();
    for (const team of ['home', 'away']) {
      const mark = () => {
        sides.add(team);
        return ' ';
      };
      const pattern = teamPattern(state.names[team]);
      if (pattern) text = text.replace(pattern, mark);
      text = text.replace(SIDE_WORDS[team], mark);
    }
    if (sides.size === 0) {
      for (const team of ['home', 'away']) {
        for (const w of distinctiveWords(state, team)) {
          text = text.replace(words(w, 'g'), () => {
            sides.add(team);
            return ' ';
          });
        }
      }
    }
    if (sides.size > 1) return { error: 'Ho sentito tutte e due le squadre: una per comando.' };
    for (const [pattern, what] of LATER) {
      if (pattern.test(text)) return { error: `${what} non si segnano ancora: arriveranno con lo scout.` };
    }
    const foul = FOUL_WORDS.test(text);
    const scored = SCORE_WORDS.test(text);
    if (foul && scored) return { error: 'Un comando per volta: prima il canestro, poi il fallo.' };
    if (!foul && !scored) return { error: 'Non ho capito se è un canestro o un fallo.' };

    let pts = 2;
    let count = 1;
    text = text.replace(/ ([123]) liber[oi](?= )/, (m, n) => {
      count = Number(n);
      return ' libero';
    });
    if (words('liber[oi]').test(text)) pts = 1;
    if (words('tripl\\w*|bomb\\w*').test(text)) pts = 3;
    text = text.replace(/ un punto(?= )/, () => {
      pts = 1;
      return ' ';
    });
    const value = (m, n) => {
      pts = Number(n);
      return ' ';
    };
    text = text.replace(/ da ([123])(?= )/, value).replace(/ ([123]) punt[oi](?= )/, value);

    const tokens = text.trim().split(/\s+/);
    const numbers = [];
    tokens.forEach((w, i) => {
      if (/^\d+$/.test(w)) numbers.push({ value: Number(w), marked: i > 0 && NUMBER_MARK.test(tokens[i - 1]) });
    });
    const marked = numbers.filter((n) => n.marked);
    const picked = marked.length === 1 ? marked : numbers;
    if (picked.length > 1) return { error: 'Ho sentito più numeri: un giocatore per comando.' };
    const number = picked[0]?.value;
    if (number > 99) return { error: `Il ${number} non è un numero di maglia.` };

    const who = findPlayer(state, [...sides][0], number, tokens);
    if (who.error) return who;
    if (who.player !== undefined && playerFouls(state.events, who.team, who.player) >= PLAYER_FOUL_LIMIT) {
      return { error: `${playerLabel(state, who.team, who.player)} ${state.names[who.team]} ha già ${PLAYER_FOUL_LIMIT} falli.` };
    }
    return foul ? { type: 'foul', ...who, count: 1 } : { type: 'score', ...who, pts, count };
  }

  function describeEvent(state, e) {
    const who = e.player === undefined ? state.names[e.team] : `${playerLabel(state, e.team, e.player)} ${state.names[e.team]}`;
    if (e.type === 'score') return `${e.pts > 0 ? '+' : '−'}${Math.abs(e.pts)} ${who}`;
    if (e.type === 'foul') return `${foulValue(e) < 0 ? 'fallo tolto' : 'fallo'} ${who}`;
    return `timeout ${state.names[e.team]}`;
  }

  // Esegue un comando già controllato e restituisce la frase di conferma da mostrare.
  function applyCommand(state, now, cmd) {
    if (cmd.type === 'undo') {
      const last = state.events[state.events.length - 1];
      if (!last) return 'Niente da annullare.';
      const what = describeEvent(state, last);
      undo(state);
      return `Annullato: ${what}`;
    }
    const { team, player } = cmd;
    if (cmd.newPlayer) addPlayer(state, team, player);
    const extra = { ...byPlayer(player), ...(cmd.newPlayer ? { added: true } : {}) };
    for (let i = 0; i < cmd.count; i++) {
      record(state, now, cmd.type === 'score' ? { type: 'score', team, pts: cmd.pts, ...extra } : { type: 'foul', team, ...extra });
    }
    const who = player === undefined ? state.names[team] : `${playerLabel(state, team, player)} ${state.names[team]}`;
    const added = cmd.newPlayer ? ' (nuovo in squadra)' : '';
    if (cmd.type === 'foul') {
      const n = player === undefined ? teamFouls(state.events, team, state.period) : playerFouls(state.events, team, player);
      return `Fallo · ${who}${added} · ${n}° ${player === undefined ? 'di squadra' : 'personale'}`;
    }
    const what = cmd.count > 1 ? `${cmd.count} tiri liberi` : SHOT_NAMES[cmd.pts];
    return `${what} · ${who}${added} · ${score(state.events, 'home')}–${score(state.events, 'away')}`;
  }

  // Il riconoscimento propone più versioni di quello che ha sentito, dalla più probabile:
  // vale la prima che è un comando valido. Se nessuna lo è, niente cambia e si dice perché.
  function voiceCommand(state, now, alternatives) {
    let failed = null;
    for (const heard of alternatives) {
      const cmd = parseCommand(state, heard);
      if (!cmd.error) return { ok: true, heard, message: applyCommand(state, now, cmd) };
      failed ??= { ok: false, heard, message: cmd.error };
    }
    return failed ?? { ok: false, heard: '', message: 'Non ho sentito niente.' };
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
    toggleClock,
    expire,
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
    boxScore,
    boxTotals,
    gameDate,
    gameStatus,
    encodeBox,
    decodeBox,
    videoFile,
    videoFileName,
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
