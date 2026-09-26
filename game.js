// Regole e calcoli del tabellone secondo il regolamento FIBA, senza DOM:
// li usano sia la pagina (script classico, espone window.Game) sia i test (node --test).
(function (root) {
  'use strict';

  const QUARTER_MS = 10 * 60 * 1000;
  const OVERTIME_MS = 5 * 60 * 1000;
  const BONUS_FOULS = 5; // dal 5° fallo di squadra nel periodo si tirano i liberi

  function periodLength(period) {
    return period <= 4 ? QUARTER_MS : OVERTIME_MS;
  }

  function periodLabel(period) {
    return period <= 4 ? `Q${period}` : `TS${period - 4}`;
  }

  function newGame(names) {
    return {
      names: { ...names },
      period: 1,
      clock: { remainingMs: QUARTER_MS, running: false, startedAt: 0 },
      events: [],
    };
  }

  function score(events, team) {
    return events.reduce((sum, e) => (e.type === 'score' && e.team === team ? sum + e.pts : sum), 0);
  }

  // I falli dei tempi supplementari si sommano a quelli del 4° quarto.
  function teamFouls(events, team, period) {
    const counts = period <= 4 ? (p) => p === period : (p) => p >= 4;
    return events.filter((e) => e.type === 'foul' && e.team === team && counts(e.period)).length;
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

  function startClock(clock, now) {
    if (clock.running || clock.remainingMs <= 0) return;
    clock.running = true;
    clock.startedAt = now;
  }

  function pauseClock(clock, now) {
    if (!clock.running) return;
    clock.remainingMs = remainingMs(clock, now);
    clock.running = false;
  }

  function adjustClock(state, deltaMs) {
    if (state.clock.running) return;
    const max = periodLength(state.period);
    state.clock.remainingMs = Math.min(max, Math.max(0, state.clock.remainingMs + deltaMs));
  }

  // Cambiare periodo (o ripartire da capo in quello attuale) ferma e riempie il cronometro.
  function goToPeriod(state, period) {
    if (period < 1) return;
    state.period = period;
    state.clock = { remainingMs: periodLength(period), running: false, startedAt: 0 };
  }

  function record(state, now, event) {
    state.events.push({ ...event, period: state.period, clockMs: remainingMs(state.clock, now) });
  }

  function addPoints(state, now, team, pts) {
    record(state, now, { type: 'score', team, pts });
  }

  function addFoul(state, now, team) {
    record(state, now, { type: 'foul', team });
  }

  // Il timeout ferma il cronometro; se la squadra non ne ha più non succede nulla.
  function takeTimeout(state, now, team) {
    if (timeoutsLeft(state.events, team, state.period) === 0) return false;
    pauseClock(state.clock, now);
    record(state, now, { type: 'timeout', team });
    return true;
  }

  function undo(state) {
    state.events.pop();
  }

  // Sopra il minuto m:ss; nell'ultimo minuto secondi e decimi, come sui tabelloni FIBA.
  function formatClock(ms) {
    if (ms < 60000) {
      const tenths = Math.floor(ms / 100);
      return `${Math.floor(tenths / 10)}.${tenths % 10}`;
    }
    const seconds = Math.floor(ms / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  const Game = {
    QUARTER_MS,
    OVERTIME_MS,
    BONUS_FOULS,
    periodLength,
    periodLabel,
    newGame,
    score,
    teamFouls,
    timeoutWindow,
    timeoutsLeft,
    remainingMs,
    startClock,
    pauseClock,
    adjustClock,
    goToPeriod,
    addPoints,
    addFoul,
    takeTimeout,
    undo,
    formatClock,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Game;
  else root.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);
