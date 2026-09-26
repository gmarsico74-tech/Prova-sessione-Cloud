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
  function newGame(names, setup = {}) {
    return {
      names: { ...names },
      settings: { playerMode: false, friendly: false, ...setup.settings },
      rosters: { home: [...(setup.rosters?.home ?? [])], away: [...(setup.rosters?.away ?? [])] },
      period: 1,
      clock: freshClock(1),
      events: [],
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
  // I 24 secondi fermano il gioco nell'istante esatto della scadenza, non al controllo successivo.
  function checkExpiry(clock, now) {
    if (!clock.running) return null;
    if (remainingMs(clock, now) === 0) {
      pauseClock(clock, now);
      return 'period';
    }
    if (!shotClockOff(clock, now) && shotRemainingMs(clock, now) === 0) {
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

  function record(state, now, event) {
    state.events.push({ ...event, period: state.period, clockMs: remainingMs(state.clock, now) });
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

  // Se annullare ridà punti o falli a un giocatore tolto dall'elenco, il giocatore ci rientra.
  function undo(state) {
    const e = state.events.pop();
    if (e?.player === undefined) return;
    const roster = state.rosters[e.team];
    if (!roster.includes(e.player) && !canRemovePlayer(state.events, e.team, e.player)) {
      roster.push(e.player);
      roster.sort((a, b) => a - b);
    }
  }

  function maxPlayers(state) {
    return state.settings.friendly ? MAX_PLAYERS_FRIENDLY : MAX_PLAYERS;
  }

  // Aggiunge un numero di maglia; se non si può, restituisce il motivo da mostrare.
  function addPlayer(state, team, value) {
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
    return null;
  }

  // Si toglie solo un giocatore rimasto a zero punti e zero falli, così i totali restano giusti.
  function canRemovePlayer(events, team, player) {
    return playerPoints(events, team, player) === 0 && playerFouls(events, team, player) === 0;
  }

  function removePlayer(state, team, player) {
    if (!canRemovePlayer(state.events, team, player)) return false;
    state.rosters[team] = state.rosters[team].filter((n) => n !== player);
    return true;
  }

  // Si esce dall'amichevole solo se nessuna squadra ha più giocatori di quelli ammessi in campionato.
  function setFriendly(state, friendly) {
    if (!friendly && Object.values(state.rosters).some((r) => r.length > MAX_PLAYERS)) {
      return `Prima togli i giocatori oltre il ${MAX_PLAYERS}°.`;
    }
    state.settings.friendly = friendly;
    return null;
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
    canRemovePlayer,
    removePlayer,
    setFriendly,
    formatClock,
    formatShot,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Game;
  else root.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);
