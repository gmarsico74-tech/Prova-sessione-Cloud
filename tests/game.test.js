const test = require('node:test');
const assert = require('node:assert/strict');
const Game = require('../game.js');

const NAMES = { home: 'PC52', away: 'OSPITI' };

test('il punteggio somma i canestri di ciascuna squadra', () => {
  const state = Game.newGame(NAMES);
  Game.addPoints(state, 0, 'home', 3);
  Game.addPoints(state, 0, 'home', 2);
  Game.addPoints(state, 0, 'away', 1);
  assert.equal(Game.score(state.events, 'home'), 5);
  assert.equal(Game.score(state.events, 'away'), 1);
});

test('annulla toglie solo l\'ultima azione', () => {
  const state = Game.newGame(NAMES);
  Game.addPoints(state, 0, 'home', 2);
  Game.addPoints(state, 0, 'home', 3);
  Game.undo(state);
  assert.equal(Game.score(state.events, 'home'), 2);
  Game.undo(state);
  Game.undo(state);
  assert.equal(state.events.length, 0);
});

test('i falli di squadra ripartono da zero a ogni quarto e il bonus scatta al quinto', () => {
  const state = Game.newGame(NAMES);
  for (let i = 0; i < 5; i++) Game.addFoul(state, 0, 'home');
  assert.equal(Game.teamFouls(state.events, 'home', 1), Game.BONUS_FOULS);
  assert.equal(Game.teamFouls(state.events, 'away', 1), 0);
  Game.goToPeriod(state, 2);
  assert.equal(Game.teamFouls(state.events, 'home', 2), 0);
});

test('i falli dei supplementari si sommano a quelli del quarto quarto', () => {
  const state = Game.newGame(NAMES);
  Game.goToPeriod(state, 4);
  for (let i = 0; i < 3; i++) Game.addFoul(state, 0, 'away');
  Game.goToPeriod(state, 5);
  Game.addFoul(state, 0, 'away');
  Game.goToPeriod(state, 6);
  Game.addFoul(state, 0, 'away');
  assert.equal(Game.teamFouls(state.events, 'away', 6), 5);
});

test('timeout: 2 nel primo tempo, 3 nel secondo, 1 per supplementare', () => {
  const state = Game.newGame(NAMES);
  assert.ok(Game.takeTimeout(state, 0, 'home'));
  Game.goToPeriod(state, 2);
  assert.ok(Game.takeTimeout(state, 0, 'home'));
  assert.equal(Game.takeTimeout(state, 0, 'home'), false);
  assert.equal(Game.timeoutsLeft(state.events, 'away', 2), 2);

  Game.goToPeriod(state, 3);
  assert.equal(Game.timeoutsLeft(state.events, 'home', 3), 3);

  Game.goToPeriod(state, 5);
  assert.ok(Game.takeTimeout(state, 0, 'home'));
  assert.equal(Game.takeTimeout(state, 0, 'home'), false);
  Game.goToPeriod(state, 6);
  assert.equal(Game.timeoutsLeft(state.events, 'home', 6), 1);
});

test('il timeout ferma il cronometro e i 24 secondi', () => {
  const state = Game.newGame(NAMES);
  Game.startClock(state.clock, 1000);
  Game.takeTimeout(state, 4000, 'away');
  assert.equal(state.clock.running, false);
  assert.equal(state.clock.remainingMs, Game.QUARTER_MS - 3000);
  assert.equal(state.clock.shotMs, Game.SHOT_MS - 3000);
});

test('il cronometro scorre, si ferma e riparte senza perdere tempo', () => {
  const clock = Game.newGame(NAMES).clock;
  Game.startClock(clock, 10_000);
  assert.equal(Game.remainingMs(clock, 11_500), Game.QUARTER_MS - 1500);
  Game.pauseClock(clock, 12_000);
  assert.equal(Game.remainingMs(clock, 99_000), Game.QUARTER_MS - 2000);
  Game.startClock(clock, 100_000);
  assert.equal(Game.remainingMs(clock, 101_000), Game.QUARTER_MS - 3000);
});

test('il cronometro non va sotto zero e a zero non riparte', () => {
  const state = Game.newGame(NAMES);
  Game.startClock(state.clock, 0);
  assert.equal(Game.remainingMs(state.clock, Game.QUARTER_MS + 5000), 0);
  Game.pauseClock(state.clock, Game.QUARTER_MS + 5000);
  Game.startClock(state.clock, Game.QUARTER_MS + 6000);
  assert.equal(state.clock.running, false);
});

test('la correzione manuale resta fra zero e la durata del periodo', () => {
  const state = Game.newGame(NAMES);
  Game.adjustClock(state, 1000);
  assert.equal(state.clock.remainingMs, Game.QUARTER_MS);
  Game.adjustClock(state, -1000);
  assert.equal(state.clock.remainingMs, Game.QUARTER_MS - 1000);
  Game.adjustClock(state, -Game.QUARTER_MS);
  assert.equal(state.clock.remainingMs, 0);
});

test('cambiare periodo riempie i cronometri e conserva la cronaca', () => {
  const state = Game.newGame(NAMES);
  Game.addPoints(state, 0, 'home', 2);
  Game.resetShot(state.clock, 0, Game.SHOT_SHORT_MS);
  Game.goToPeriod(state, 4);
  assert.equal(state.clock.remainingMs, Game.QUARTER_MS);
  assert.equal(state.clock.shotMs, Game.SHOT_MS);
  Game.goToPeriod(state, 5);
  assert.equal(state.clock.remainingMs, Game.OVERTIME_MS);
  assert.equal(Game.periodLabel(5), 'TS1');
  assert.equal(Game.score(state.events, 'home'), 2);
  Game.goToPeriod(state, 0);
  assert.equal(state.period, 5);
});

test('i 24 secondi scorrono e si fermano con il cronometro di gioco', () => {
  const clock = Game.newGame(NAMES).clock;
  assert.equal(clock.shotMs, Game.SHOT_MS);
  Game.startClock(clock, 0);
  assert.equal(Game.shotRemainingMs(clock, 4000), 20_000);
  Game.pauseClock(clock, 4000);
  assert.equal(Game.shotRemainingMs(clock, 50_000), 20_000);
  assert.equal(Game.remainingMs(clock, 50_000), Game.QUARTER_MS - 4000);
});

test('riportare i 24 secondi a 24 o a 14 non tocca il cronometro di gioco', () => {
  const clock = Game.newGame(NAMES).clock;
  Game.startClock(clock, 0);
  Game.resetShot(clock, 10_000, Game.SHOT_MS);
  assert.equal(Game.shotRemainingMs(clock, 10_000), Game.SHOT_MS);
  assert.equal(Game.remainingMs(clock, 10_000), Game.QUARTER_MS - 10_000);
  Game.resetShot(clock, 12_000, Game.SHOT_SHORT_MS);
  assert.equal(Game.shotRemainingMs(clock, 13_000), 13_000);
  assert.equal(Game.remainingMs(clock, 13_000), Game.QUARTER_MS - 13_000);
});

test('la violazione dei 24 secondi ferma il gioco nell\'istante della scadenza', () => {
  const clock = Game.newGame(NAMES).clock;
  Game.startClock(clock, 0);
  assert.equal(Game.checkExpiry(clock, 23_900), null);
  assert.equal(Game.checkExpiry(clock, 24_080), 'shot');
  assert.equal(clock.running, false);
  assert.equal(clock.shotMs, 0);
  assert.equal(clock.remainingMs, Game.QUARTER_MS - 24_000);
});

test('dopo la violazione il cronometro riparte con 24 secondi nuovi', () => {
  const clock = Game.newGame(NAMES).clock;
  Game.startClock(clock, 0);
  Game.checkExpiry(clock, 24_000);
  Game.startClock(clock, 30_000);
  assert.equal(clock.running, true);
  assert.equal(Game.shotRemainingMs(clock, 30_000), Game.SHOT_MS);
});

test('i 24 secondi si spengono quando al periodo resta meno tempo dell\'azione', () => {
  const state = Game.newGame(NAMES);
  Game.adjustClock(state, -(Game.QUARTER_MS - 20_000)); // restano 20 secondi
  assert.equal(Game.shotClockOff(state.clock, 0), true);
  Game.resetShot(state.clock, 0, Game.SHOT_SHORT_MS);
  assert.equal(Game.shotClockOff(state.clock, 0), false);
  Game.startClock(state.clock, 0);
  assert.equal(Game.checkExpiry(state.clock, 14_000), 'shot');
});

test('a fine periodo scatta la sirena del periodo, non quella dei 24 secondi', () => {
  const state = Game.newGame(NAMES);
  Game.adjustClock(state, -(Game.QUARTER_MS - 10_000)); // restano 10 secondi, 24 spenti
  Game.startClock(state.clock, 0);
  assert.equal(Game.checkExpiry(state.clock, 9_900), null);
  assert.equal(Game.checkExpiry(state.clock, 10_050), 'period');
  assert.equal(state.clock.remainingMs, 0);
});

test('formato del cronometro: minuti sopra il minuto, decimi nell\'ultimo', () => {
  assert.equal(Game.formatClock(Game.QUARTER_MS), '10:00');
  assert.equal(Game.formatClock(61_000), '1:01');
  assert.equal(Game.formatClock(60_999), '1:00');
  assert.equal(Game.formatClock(60_000), '1:00');
  assert.equal(Game.formatClock(59_999), '59.9');
  assert.equal(Game.formatClock(5_000), '5.0');
  assert.equal(Game.formatClock(0), '0.0');
});

test('formato dei 24 secondi: secondi interi, decimi negli ultimi cinque', () => {
  assert.equal(Game.formatShot(Game.SHOT_MS), '24');
  assert.equal(Game.formatShot(23_999), '23');
  assert.equal(Game.formatShot(5_000), '5');
  assert.equal(Game.formatShot(4_999), '4.9');
  assert.equal(Game.formatShot(0), '0.0');
});
