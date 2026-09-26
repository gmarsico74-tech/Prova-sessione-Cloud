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

function playerGame() {
  const state = Game.newGame(NAMES);
  state.settings.playerMode = true;
  for (const n of ['4', '7', '11']) Game.addPlayer(state, 'home', n);
  return state;
}

test('i punti dei giocatori si sommano al punteggio della squadra', () => {
  const state = playerGame();
  Game.addPoints(state, 0, 'home', 3, 7);
  Game.addPoints(state, 0, 'home', 2, 4);
  Game.addPoints(state, 0, 'home', 2, 7);
  assert.equal(Game.playerPoints(state.events, 'home', 7), 5);
  assert.equal(Game.playerPoints(state.events, 'home', 4), 2);
  assert.equal(Game.score(state.events, 'home'), 7);
});

test('la correzione dei punti non scende sotto zero, né per la squadra né per il giocatore', () => {
  const state = playerGame();
  Game.addPoints(state, 0, 'home', 2, 7);
  assert.equal(Game.removePoints(state, 0, 'home', 3, 7), false);
  assert.equal(Game.removePoints(state, 0, 'home', 2, 4), false);
  assert.ok(Game.removePoints(state, 0, 'home', 1, 7)); // era un +1, non un +2
  assert.equal(Game.playerPoints(state.events, 'home', 7), 1);
  assert.equal(Game.score(state.events, 'home'), 1);

  const team = Game.newGame(NAMES);
  assert.equal(Game.removePoints(team, 0, 'away', 1), false);
  Game.addPoints(team, 0, 'away', 2);
  assert.ok(Game.removePoints(team, 0, 'away', 2));
  assert.equal(Game.score(team.events, 'away'), 0);
});

test('i falli dei giocatori contano nei falli di squadra e al quinto il giocatore esce', () => {
  const state = playerGame();
  for (let i = 0; i < 5; i++) Game.addFoul(state, 0, 'home', 11);
  assert.equal(Game.playerFouls(state.events, 'home', 11), Game.PLAYER_FOUL_LIMIT);
  assert.equal(Game.teamFouls(state.events, 'home', 1), 5);
});

test('togliere un fallo lo toglie dal periodo in cui era stato fischiato', () => {
  const state = playerGame();
  Game.addFoul(state, 0, 'home', 4);
  Game.goToPeriod(state, 2);
  Game.addFoul(state, 0, 'home', 7);
  assert.ok(Game.removeFoul(state, 0, 'home', 4)); // errore del primo quarto scoperto nel secondo
  assert.equal(Game.teamFouls(state.events, 'home', 1), 0);
  assert.equal(Game.teamFouls(state.events, 'home', 2), 1);
  assert.equal(Game.playerFouls(state.events, 'home', 4), 0);
  assert.equal(Game.removeFoul(state, 0, 'home', 4), false);
});

test('senza giocatori il meno fallo toglie l\'ultimo fallo della squadra', () => {
  const state = Game.newGame(NAMES);
  assert.equal(Game.removeFoul(state, 0, 'away'), false);
  Game.addFoul(state, 0, 'away');
  Game.addFoul(state, 0, 'away');
  assert.ok(Game.removeFoul(state, 0, 'away'));
  assert.equal(Game.teamFouls(state.events, 'away', 1), 1);
});

test('annulla toglie anche una correzione', () => {
  const state = playerGame();
  Game.addPoints(state, 0, 'home', 3, 7);
  Game.removePoints(state, 0, 'home', 1, 7);
  Game.undo(state);
  assert.equal(Game.playerPoints(state.events, 'home', 7), 3);
});

test('numeri di maglia: da 0 a 99, senza doppioni, in ordine', () => {
  const state = Game.newGame(NAMES);
  assert.equal(Game.addPlayer(state, 'home', '23'), null);
  assert.equal(Game.addPlayer(state, 'home', '0'), null);
  assert.equal(Game.addPlayer(state, 'home', '5'), null);
  assert.deepEqual(state.rosters.home, [0, 5, 23]);
  assert.match(Game.addPlayer(state, 'home', '23'), /c'è già/);
  for (const bad of ['100', '-1', '7.5', '', 'abc']) {
    assert.match(Game.addPlayer(state, 'home', bad), /da 0 a 99/, bad);
  }
  assert.equal(Game.addPlayer(state, 'away', '23'), null, 'lo stesso numero va bene nell\'altra squadra');
});

test('al massimo 12 giocatori, 16 in amichevole', () => {
  const state = Game.newGame(NAMES);
  for (let n = 0; n < 12; n++) assert.equal(Game.addPlayer(state, 'home', String(n)), null);
  assert.match(Game.addPlayer(state, 'home', '50'), /12 giocatori.*16/);
  assert.equal(Game.setFriendly(state, true), null);
  for (let n = 12; n < 16; n++) assert.equal(Game.addPlayer(state, 'home', String(n)), null);
  assert.match(Game.addPlayer(state, 'home', '50'), /16 giocatori/);
  assert.match(Game.setFriendly(state, false), /togli/);
  assert.equal(state.settings.friendly, true);
});

test('si toglie solo un giocatore senza punti né falli', () => {
  const state = playerGame();
  Game.addPoints(state, 0, 'home', 2, 7);
  assert.equal(Game.removePlayer(state, 'home', 7), false);
  Game.removePoints(state, 0, 'home', 2, 7);
  assert.ok(Game.removePlayer(state, 'home', 7));
  assert.deepEqual(state.rosters.home, [4, 11]);
});

test('una nuova partita tiene impostazioni e numeri di maglia', () => {
  const state = playerGame();
  Game.addPoints(state, 0, 'home', 2, 4);
  const next = Game.newGame(state.names, state);
  assert.equal(next.settings.playerMode, true);
  assert.deepEqual(next.rosters.home, [4, 7, 11]);
  assert.equal(next.events.length, 0);
  next.rosters.home.push(99);
  assert.deepEqual(state.rosters.home, [4, 7, 11], 'le due partite non condividono la lista');
});

test('annullare la correzione di un giocatore tolto dall\'elenco lo fa rientrare', () => {
  const state = playerGame();
  Game.addPoints(state, 0, 'home', 2, 7);
  Game.removePoints(state, 0, 'home', 2, 7);
  assert.ok(Game.removePlayer(state, 'home', 7));
  Game.undo(state);
  assert.deepEqual(state.rosters.home, [4, 7, 11]);
  assert.equal(Game.playerPoints(state.events, 'home', 7), 2);
});

test('i nomi dei giocatori: facoltativi, ripuliti e tolti insieme al giocatore', () => {
  const state = Game.newGame(NAMES);
  assert.equal(Game.addPlayer(state, 'home', '7', '  Mario Rossi '), null);
  assert.equal(Game.addPlayer(state, 'home', '4'), null);
  assert.equal(Game.playerLabel(state, 'home', 7), '#7 Mario Rossi');
  assert.equal(Game.playerLabel(state, 'home', 4), '#4');
  Game.setPlayerName(state, 'home', 4, 'Luca');
  assert.equal(Game.playerLabel(state, 'home', 4), '#4 Luca');
  Game.setPlayerName(state, 'home', 4, '   ');
  assert.equal(Game.playerLabel(state, 'home', 4), '#4');
  Game.removePlayer(state, 'home', 7);
  assert.equal(state.playerNames.home[7], undefined);
});

test('salvare una squadra: stesso nome la sostituisce, elenco in ordine alfabetico', () => {
  const state = Game.newGame({ home: 'PC52 U19', away: 'Virtus' });
  Game.addPlayer(state, 'home', '7', 'Rossi');
  Game.addPlayer(state, 'home', '4');
  Game.addPlayer(state, 'away', '10', 'Neri');
  let library = [];
  library = Game.storeTeam(library, Game.teamSnapshot(state, 'home'));
  library = Game.storeTeam(library, Game.teamSnapshot(state, 'away'));
  assert.deepEqual(library.map((t) => t.name), ['PC52 U19', 'Virtus']);
  assert.deepEqual(library[0].players, [{ number: 4, name: '' }, { number: 7, name: 'Rossi' }]);
  Game.addPlayer(state, 'home', '9', 'Bianchi');
  state.names.home = 'pc52 u19';
  library = Game.storeTeam(library, Game.teamSnapshot(state, 'home'));
  assert.equal(library.length, 2, 'stesso nome anche con maiuscole diverse: sostituita');
  assert.ok(Game.hasStoredTeam(library, 'PC52 U19'));
  assert.equal(Game.deleteStoredTeam(library, 'Virtus').length, 1);
});

test('richiamare una squadra salvata mette nome, numeri e nomi dei giocatori', () => {
  const saved = { name: 'PC52 U19', players: [{ number: 9, name: 'Bianchi' }, { number: 4, name: '' }] };
  const state = Game.newGame(NAMES);
  Game.addPlayer(state, 'home', '55', 'Vecchio');
  assert.equal(Game.loadTeam(state, 'home', saved), null);
  assert.equal(state.names.home, 'PC52 U19');
  assert.deepEqual(state.rosters.home, [4, 9]);
  assert.deepEqual(state.playerNames.home, { 9: 'Bianchi' });
});

test('una squadra non si richiama se i suoi giocatori hanno già punti o se è troppo lunga', () => {
  const saved = { name: 'PC52 U19', players: [{ number: 9, name: '' }] };
  const state = Game.newGame(NAMES);
  Game.addPlayer(state, 'home', '5');
  Game.addPoints(state, 0, 'home', 2, 5);
  assert.match(Game.loadTeam(state, 'home', saved), /punti o falli/);
  assert.deepEqual(state.rosters.home, [5]);

  const big = { name: 'Amici', players: Array.from({ length: 14 }, (_, i) => ({ number: i, name: '' })) };
  assert.match(Game.loadTeam(state, 'away', big), /14 giocatori.*Amichevole/);
  Game.setFriendly(state, true);
  assert.equal(Game.loadTeam(state, 'away', big), null);
});

test('una nuova partita tiene anche i nomi dei giocatori, senza condividerli', () => {
  const state = Game.newGame(NAMES);
  Game.addPlayer(state, 'home', '7', 'Rossi');
  const next = Game.newGame(state.names, state);
  assert.deepEqual(next.playerNames.home, { 7: 'Rossi' });
  next.playerNames.home[7] = 'Verdi';
  assert.equal(state.playerNames.home[7], 'Rossi');
});

const LIBRARY = [
  { name: 'PC52 U19', players: [{ number: 4, name: 'Rossi' }, { number: 7, name: '' }, { number: 23, name: 'Nicolò D\'Amico' }] },
  { name: 'Virtus 🏀', players: [{ number: 0, name: '' }] },
];

test('il link delle squadre porta nomi, numeri e nomi dei giocatori, accenti compresi', () => {
  const text = Game.encodeLibrary(LIBRARY);
  assert.match(text, /^1\.[A-Za-z0-9_-]+$/, 'solo caratteri sicuri in un link');
  assert.deepEqual(Game.decodeLibrary(text), LIBRARY);
});

test('un link rovinato o non del tabellone viene rifiutato', () => {
  const good = Game.encodeLibrary(LIBRARY);
  const pack = (value) => `1.${Buffer.from(JSON.stringify(value)).toString('base64url')}`;
  for (const bad of [
    '',
    'ciao',
    '2' + good.slice(1),
    good.slice(0, 20),
    pack([]),
    pack({ name: 'x' }),
    pack([['', [[4]]]]),
    pack([['A', [[100]]]]),
    pack([['A', [[4], [4]]]]),
    pack([['A', [[1.5]]]]),
    pack([['A', Array.from({ length: 17 }, (_, i) => [i])]]),
    pack([['A', ['4']]]),
  ]) {
    assert.equal(Game.decodeLibrary(bad), null, bad);
  }
});

test('le squadre del link si aggiungono a quelle salvate e sostituiscono quelle con lo stesso nome', () => {
  const mine = [
    { name: 'pc52 u19', players: [{ number: 99, name: 'Vecchio' }] },
    { name: 'Amici', players: [] },
  ];
  const merged = Game.mergeLibrary(mine, LIBRARY);
  assert.deepEqual(merged.map((t) => t.name), ['Amici', 'PC52 U19', 'Virtus 🏀']);
  assert.equal(merged[1].players.length, 3);
});

test('salva squadra: nuova, aggiornamento della squadra richiamata, rinomina o copia, sostituzione', () => {
  const state = Game.newGame({ home: 'PC52 U19', away: 'Virtus' });
  Game.addPlayer(state, 'home', '4', 'Rossi');
  let library = [];
  assert.equal(Game.saveKind(library, state, 'home'), 'new');
  library = Game.saveTeam(library, state, 'home');
  assert.equal(state.origins.home, 'PC52 U19');

  // richiamata e cambiata senza toccare il nome: si aggiorna
  Game.addPlayer(state, 'home', '9', 'Bianchi');
  assert.equal(Game.saveKind(library, state, 'home'), 'update');
  library = Game.saveTeam(library, state, 'home');
  assert.equal(library.length, 1);
  assert.equal(library[0].players.length, 2);

  // nome cambiato: rinomina (la vecchia sparisce) ...
  state.names.home = 'PC52 Under 19';
  assert.equal(Game.saveKind(library, state, 'home'), 'rename');
  library = Game.saveTeam(library, state, 'home', 'PC52 U19');
  assert.deepEqual(library.map((t) => t.name), ['PC52 Under 19']);
  assert.equal(state.origins.home, 'PC52 Under 19');

  // ... oppure copia (restano tutte e due)
  state.names.home = 'PC52 U17';
  assert.equal(Game.saveKind(library, state, 'home'), 'rename');
  library = Game.saveTeam(library, state, 'home');
  assert.deepEqual(library.map((t) => t.name), ['PC52 U17', 'PC52 Under 19']);

  // il nome è quello di un'altra squadra salvata: si chiede se sostituirla
  Game.addPlayer(state, 'away', '5');
  state.names.away = 'pc52 u17';
  assert.equal(Game.saveKind(library, state, 'away'), 'replace');
});

test('richiamare una squadra ricorda da quale squadra salvata vengono i giocatori', () => {
  const state = Game.newGame(NAMES);
  const library = [{ name: 'PC52 U19', players: [{ number: 4, name: '' }] }];
  Game.loadTeam(state, 'away', library[0]);
  assert.equal(state.origins.away, 'PC52 U19');
  assert.equal(Game.saveKind(library, state, 'away'), 'update');
  assert.equal(Game.newGame(state.names, state).origins.away, 'PC52 U19', 'resta dopo «Nuova partita»');
  assert.equal(Game.saveKind([], state, 'away'), 'new', 'se la squadra salvata è stata eliminata, è nuova');
});

// ——— 24 secondi facoltativi ———

test('i 24 secondi sono spenti in una partita nuova e, spenti, non fermano il gioco', () => {
  const state = Game.newGame(NAMES);
  assert.equal(state.settings.shotClock, false);
  Game.startClock(state.clock, 0);
  assert.equal(Game.checkExpiry(state.clock, 30_000, state.settings.shotClock), null, 'dopo 30 secondi corre ancora');
  assert.equal(Game.checkExpiry(state.clock, 30_000), 'shot', 'con i 24 secondi accesi si sarebbe fermato');
});

// ——— Il tempo del tabellone ———

test('ogni azione tiene il tempo del tabellone: periodo e tempo che manca', () => {
  const state = Game.newGame(NAMES);
  Game.goToPeriod(state, 2);
  Game.startClock(state.clock, 0);
  Game.addPoints(state, 60_000, 'home', 3);
  assert.equal(state.events[0].period, 2);
  assert.equal(state.events[0].clockMs, 540_000);
  assert.equal(state.events[0].at, undefined, 'nessuna ora del giorno');
});

function gameWithPlayers() {
  const state = Game.newGame(NAMES);
  state.settings.playerMode = true;
  Game.addPlayer(state, 'home', 25, 'Rossi');
  Game.addPlayer(state, 'home', 7, 'Bianchi');
  Game.addPlayer(state, 'away', 7);
  Game.addPlayer(state, 'away', 12, 'De Luca');
  return state;
}

function voiceGame() {
  const state = gameWithPlayers();
  state.settings.voice = true;
  state.settings.timeSource = 'voice';
  return state;
}

const at = (period, min, sec) => ({ period, clockMs: (min * 60 + sec) * 1000 });

// ——— Tabellino ———

test('il tabellino conta punti, canestri da 1, 2 e 3 e falli di ogni giocatore, con i parziali', () => {
  const state = gameWithPlayers();
  Game.addPoints(state, 0, 'home', 3, 25);
  Game.addPoints(state, 0, 'home', 2, 25);
  Game.addPoints(state, 0, 'home', 1, 7);
  Game.addFoul(state, 0, 'away', 12);
  Game.goToPeriod(state, 2);
  Game.addPoints(state, 0, 'away', 2);
  Game.addPoints(state, 0, 'home', 2, 25);
  Game.removePoints(state, 0, 'home', 2, 25); // correzione: quel canestro non c'era
  const box = Game.boxScore(state, 0);
  assert.deepEqual(box.periods, [
    { period: 1, home: 6, away: 0 },
    { period: 2, home: 0, away: 2 },
  ]);
  const rossi = box.teams.home.players.find((p) => p.number === 25);
  assert.deepEqual(rossi, { number: 25, name: 'Rossi', pts: 5, made: [0, 1, 1], fouls: 0, secs: null });
  assert.deepEqual(box.teams.away.team, { pts: 2, made: [0, 1, 0], fouls: 0 }, 'i punti senza giocatore');
  assert.deepEqual(Game.boxTotals(box.teams.away), { pts: 2, made: [0, 1, 0], fouls: 1 });
  assert.deepEqual(Game.boxScore(state, 0, 1).periods, [{ period: 1, home: 6, away: 0 }], 'fino alla fine del Q1');
});

test('il tabellino passa dentro un link e torna uguale; un link rovinato non si apre', () => {
  const state = voiceGame();
  Game.voiceCommand(state, 0, ['quintetto 25 7 1 2 3 PC52 inizio primo quarto']);
  Game.voiceCommand(state, 0, ['tripla del 25 al 9 e 30']);
  Game.addFoul(state, 0, 'away', 7);
  const box = Game.boxScore(state, 0);
  const text = Game.encodeBox(box, { date: '2026-09-27', status: 'Finale' });
  assert.match(text, /^[\w.-]+$/, 'solo caratteri sicuri in un link');
  const back = Game.decodeBox(text);
  assert.equal(back.date, '2026-09-27');
  assert.equal(back.status, 'Finale');
  assert.deepEqual(back.periods, box.periods);
  assert.deepEqual(back.teams, box.teams);
  assert.equal(back.teams.home.players.find((p) => p.number === 25).secs, 30);
  assert.equal(Game.decodeBox('1.bm9uIMOoIHVuIHRhYmVsbGlubw'), null);
  assert.equal(Game.decodeBox('rovinato'), null);
});

test('lo stato della partita: periodo e tempo, fine periodo, finale', () => {
  const state = Game.newGame(NAMES);
  assert.equal(Game.gameStatus(state, 0), 'Q1 10:00');
  state.clock.remainingMs = 0;
  assert.equal(Game.gameStatus(state, 0), 'Fine Q1');
  Game.goToPeriod(state, 4);
  state.clock.remainingMs = 0;
  assert.equal(Game.gameStatus(state, 0), 'Fine Q4', 'in parità si va ai supplementari');
  Game.addPoints(state, 0, 'home', 2);
  assert.equal(Game.gameStatus(state, 0), 'Finale');
});

test('il giorno della partita è quello scritto, altrimenti oggi', () => {
  const state = Game.newGame(NAMES);
  assert.equal(Game.gameDate(state, new Date(2026, 8, 27, 18).getTime()), '2026-09-27');
  state.date = '2026-09-20';
  assert.equal(Game.gameDate(state, new Date(2026, 8, 27, 18).getTime()), '2026-09-20');
});

// ——— Minuti in campo ———

test('i minuti in campo si contano dal quintetto, con i cambi, e passano da un periodo all\'altro', () => {
  const state = voiceGame();
  const say = (text) => Game.voiceCommand(state, 0, [text]);
  assert.equal(say('quintetto 25 7 1 2 3 PC52 inizio del primo quarto').ok, true);
  assert.equal(say('entra il 4 esce il 7 al 6 e 00').ok, true);
  assert.equal(say('entra il 7 esce il 25, 5 minuti del secondo quarto').ok, true);
  Game.goToPeriod(state, 3); // fine del secondo quarto
  const secs = (n) => Game.boxScore(state, 0).teams.home.players.find((p) => p.number === n).secs;
  assert.equal(secs(25), 15 * 60, 'tutto il Q1 e metà del Q2');
  assert.equal(secs(7), 4 * 60 + 5 * 60, '4 minuti nel Q1 e 5 nel Q2');
  assert.equal(secs(4), 6 * 60 + 10 * 60, 'dal 6:00 del Q1 in poi');
  assert.equal(secs(1), 20 * 60);
  assert.equal(Game.boxScore(state, 0, 1).teams.home.players.find((p) => p.number === 25).secs, 600, 'a fine Q1');
  assert.equal(Game.boxScore(state, 0).teams.away.players[0].secs, null, 'degli ospiti non c\'è il quintetto');
});

test('chi è in campo in un momento della partita', () => {
  const state = voiceGame();
  Game.voiceCommand(state, 0, ['quintetto 25 7 1 2 3 PC52 inizio primo quarto']);
  Game.voiceCommand(state, 0, ['entrano 4 e 5 escono 1 e 2 al 3 e 20']);
  assert.deepEqual([...Game.courtAt(state.events, 'home', at(1, 5, 0))].sort((a, b) => a - b), [1, 2, 3, 7, 25]);
  assert.deepEqual([...Game.courtAt(state.events, 'home', at(1, 3, 0))].sort((a, b) => a - b), [3, 4, 5, 7, 25]);
  assert.equal(Game.courtAt(state.events, 'away', at(1, 3, 0)), null);
});

test('un giocatore mai in campo e senza punti né falli si può togliere; uno che è stato in campo no', () => {
  const state = voiceGame();
  Game.voiceCommand(state, 0, ['quintetto 25 7 1 2 3 PC52 inizio primo quarto']);
  assert.equal(Game.canRemovePlayer(state.events, 'home', 1), false);
  Game.addPlayer(state, 'home', 30);
  assert.equal(Game.canRemovePlayer(state.events, 'home', 30), true);
});

// ——— Il file per il video ———

test('il file per il video aggancia le azioni al tempo del tabellone, in ordine e senza quelle corrette', () => {
  const state = gameWithPlayers();
  Game.goToPeriod(state, 2);
  Game.startClock(state.clock, 0);
  Game.addPoints(state, 20_000, 'home', 2, 25);
  Game.addPoints(state, 30_000, 'home', 2, 7);
  Game.removePoints(state, 40_000, 'home', 2, 7); // era del 7 per sbaglio
  Game.addPoints(state, 40_000, 'home', 2, 25);
  Game.addFoul(state, 50_000, 'away', 12);
  Game.addFoul(state, 60_000, 'away', 12);
  const file = Game.videoFile(state, 70_000);
  assert.equal(file.cronometro, undefined, 'niente ore del giorno');
  assert.deepEqual(
    file.azioni.map((a) => [a.periodo, a.tempo, a.ms_restanti, a.tipo, a.numero, a.scritta]),
    [
      ['Q2', '9:40', 580_000, 'canestro', 25, 'Canestro da 2 · #25 Rossi'],
      ['Q2', '9:20', 560_000, 'canestro', 25, 'Canestro da 2 · #25 Rossi'],
      ['Q2', '9:10', 550_000, 'fallo', 12, 'Fallo · #12 De Luca (1°)'],
      ['Q2', '9:00', 540_000, 'fallo', 12, 'Fallo · #12 De Luca (2°)'],
    ]
  );
  assert.deepEqual(file.azioni[1].punteggio, { casa: 4, ospiti: 0 });
  assert.equal(file.tabellino.casa.totale.punti, 4);
  assert.equal(file.squadre.ospiti.giocatori.find((g) => g.numero === 12).nome, 'De Luca');
});

test('nel file per il video le azioni dette fuori ordine tornano in ordine di tempo', () => {
  const state = voiceGame();
  Game.voiceCommand(state, 0, ['canestro del 25 al 5 e 00 del terzo quarto']);
  Game.voiceCommand(state, 0, ['tripla del 25 al 8 e 10 del terzo quarto']); // detta dopo, avvenuta prima
  const file = Game.videoFile(state, 0);
  assert.deepEqual(file.azioni.map((a) => [a.tempo, a.punti, a.punteggio.casa]), [['8:10', 3, 3], ['5:00', 2, 5]]);
});

test('il file per il video ha il tabellino alla fine di ogni periodo finito, con i minuti', () => {
  const state = voiceGame();
  Game.voiceCommand(state, 0, ['quintetto 25 7 1 2 3 PC52 inizio primo quarto']);
  Game.voiceCommand(state, 0, ['tripla del 25 al 5 e 00']);
  Game.voiceCommand(state, 0, ['canestro del 12 al 9 e 00 del secondo quarto']);
  const file = Game.videoFile(state, 0);
  assert.equal(file.fine_periodi.length, 1, 'il Q2 non è finito');
  const q1 = file.fine_periodi[0];
  assert.equal(q1.periodo, 'Q1');
  assert.deepEqual(q1.punteggio, { casa: 3, ospiti: 0 });
  const rossi = q1.tabellino.casa.giocatori.find((g) => g.numero === 25);
  assert.equal(rossi.da3, 1);
  assert.equal(rossi.minuti, '10:00');
  assert.equal(file.azioni[0].tipo, 'quintetto');
  assert.equal(file.azioni[0].in_campo.length, 5);
  assert.match(Game.videoFileName({ ...state, names: { home: 'PC52 Under 19', away: 'Città' } }, 0), /^partita_pc52-under-19_citta_\d{4}-\d{2}-\d{2}\.json$/);
});

// ——— Comandi vocali ———

test('le parole della voce diventano minuscole, senza accenti, con i numeri in cifre', () => {
  assert.equal(Game.speechWords('Canestro del numero Venticinque, PC52!'), 'canestro del numero 25 pc 52');
  assert.equal(Game.speechWords('ventitré ventuno ventotto novantanove zero'), '23 21 28 99 0');
  assert.equal(Game.speechWords('fallo del 07'), 'fallo del 7');
});

test('i comandi vocali capiscono canestri, liberi, triple e falli', () => {
  const state = gameWithPlayers();
  const now = at(1, 10, 0);
  const cases = [
    ['Canestro del numero 25 della PC52', { type: 'score', team: 'home', player: 25, pts: 2, count: 1 }],
    ['canestro da tre del 25', { type: 'score', team: 'home', player: 25, pts: 3, count: 1 }],
    ['25 canestro da 2', { type: 'score', team: 'home', player: 25, pts: 2, count: 1 }],
    ['tripla di Rossi', { type: 'score', team: 'home', player: 25, pts: 3, count: 1 }],
    ['3 punti del 3 ospiti', { type: 'score', team: 'away', player: 3, pts: 3, count: 1, newPlayer: true }],
    ['tiro libero del 25 pc cinquantadue', { type: 'score', team: 'home', player: 25, pts: 1, count: 1 }],
    ['un punto del 25', { type: 'score', team: 'home', player: 25, pts: 1, count: 1 }],
    ['2 liberi segnati del 12', { type: 'score', team: 'away', player: 12, pts: 1, count: 2 }],
    ['canestro di De Luca', { type: 'score', team: 'away', player: 12, pts: 2, count: 1 }],
    ['canestro da 2 ospiti', { type: 'score', team: 'away', pts: 2, count: 1 }],
    ['fallo del 7 ospiti', { type: 'foul', team: 'away', player: 7, count: 1 }],
    ['fallo del numero sette PC 52', { type: 'foul', team: 'home', player: 7, count: 1 }],
    ['fallo 12', { type: 'foul', team: 'away', player: 12, count: 1 }],
  ];
  for (const [heard, expected] of cases) {
    assert.deepEqual(Game.parseCommand(state, heard, 0), { ...expected, at: now }, heard);
  }
  assert.deepEqual(Game.parseCommand(state, 'annulla', 0), { type: 'undo' });
});

test('il tempo del tabellone detto a voce, in tanti modi', () => {
  const state = voiceGame();
  const cases = [
    ['tripla di Rossi 2 minuti e 26 secondi del terzo quarto', at(3, 2, 26)],
    ['canestro del 25, terzo quarto, 2 e 26', at(3, 2, 26)],
    ['terzo quarto due e ventisei canestro del 25', at(3, 2, 26)],
    ['canestro del 25 alle 2:26 del 3° quarto', at(3, 2, 26)],
    ['canestro del 25 a 45 secondi dal quarto quarto', at(4, 0, 45)],
    ['canestro del 25 45.3 del quarto quarto', at(4, 0, 45)],
    ['canestro del 25 8 minuti del primo quarto', at(1, 8, 0)],
    ['canestro del 25 al 3 e 10 del primo supplementare', at(5, 3, 10)],
    ['canestro del 25 al 1 e 5', at(1, 1, 5)],
    ['quintetto 25 7 1 2 3 PC52 inizio del secondo quarto', at(2, 10, 0)],
    ['quintetto 25 7 12 2 3 PC52 al 4 e 30 del secondo quarto', at(2, 4, 30)],
  ];
  for (const [heard, time] of cases) {
    const cmd = Game.parseCommand(state, heard, 0);
    assert.deepEqual(cmd.at, time, `${heard} → ${cmd.error}`);
  }
  assert.deepEqual(Game.parseCommand(state, 'quintetto 25 7 1 2 e 3 PC52 al 4 e 30', 0).on, [1, 2, 3, 7, 25], 'nel quintetto «2 e 3» sono giocatori');
});

test('con il tempo detto a voce il tempo va sempre detto e deve esistere', () => {
  const state = voiceGame();
  const cases = [
    ['canestro del 25', /Manca il tempo/],
    ['canestro del 25 al 12 e 30', /Nel Q1 il tempo va da 10:00 a 0:00/],
    ['canestro del 25 al 6 e 20 del primo supplementare', /Nel TS1 il tempo va da 5:00/],
    ['canestro del 25 2 minuti e 75 secondi', /I secondi vanno da 0 a 59/],
  ];
  for (const [heard, error] of cases) assert.match(Game.parseCommand(state, heard, 0).error, error, heard);
  state.settings.timeSource = 'app';
  assert.match(Game.parseCommand(state, 'canestro del 25 del terzo quarto', 0).error, /periodo ma non il tempo/);
});

test('con il tempo detto a voce il tabellone dell\'app segue il punto più avanti della partita', () => {
  const state = voiceGame();
  Game.voiceCommand(state, 0, ['canestro del 25 al 2 e 26 del terzo quarto']);
  assert.equal(state.period, 3);
  assert.equal(state.clock.remainingMs, 146_000);
  assert.equal(state.clock.running, false);
  Game.voiceCommand(state, 0, ['fallo del 12 al 5 e 00']); // senza periodo: il terzo, prima del 2:26
  assert.deepEqual([state.events[1].period, state.events[1].clockMs], [3, 300_000]);
  assert.equal(state.clock.remainingMs, 146_000, 'un\'azione di prima non riporta indietro il tabellone');
  assert.equal(Game.teamFouls(state.events, 'away', 3), 1);
});

test('con il tempo dal cronometro vale il cronometro al momento in cui si preme il microfono', () => {
  const state = gameWithPlayers();
  Game.startClock(state.clock, 0);
  const outcome = Game.voiceCommand(state, 150_000, ['canestro del 25']);
  assert.equal(outcome.message, 'Canestro da 2 · #25 Rossi PC52 · 2–0 · Q1 7:30');
  assert.equal(state.events[0].clockMs, 450_000);
  Game.voiceCommand(state, 160_000, ['fallo del 12 al 9 e 00']); // un tempo detto vale anche qui
  assert.equal(state.events[1].clockMs, 540_000);
  assert.equal(state.clock.running, true, 'il cronometro continua a correre');
});

test('i comandi vocali non segnano niente se manca qualcosa o è ambiguo', () => {
  const state = gameWithPlayers();
  const cases = [
    ['fallo del 7', /tutte e due le squadre/],
    ['canestro del 14', /non è in squadra/],
    ['canestro del 25 e del 7', /più numeri/],
    ['canestro del 25 PC52 ospiti', /tutte e due le squadre/],
    ['il 25 ha fatto', /canestro, fallo, cambio o quintetto/],
    ['canestro e fallo del 25', /Un comando per volta/],
    ['tiro sbagliato da 2 del 25', /tiri sbagliati non si segnano ancora/],
    ['rimbalzo in difesa del 25', /rimbalzi/],
    ['fallo subito dal 25', /falli subiti/],
    ['canestro', /Non ho capito chi/],
    ['', /Non ho sentito/],
  ];
  for (const [heard, error] of cases) assert.match(Game.parseCommand(state, heard, 0).error, error, heard);
  for (let i = 0; i < 5; i++) Game.addFoul(state, 0, 'home', 7);
  assert.match(Game.parseCommand(state, 'canestro del 7 PC52', 0).error, /ha già 5 falli/);
});

test('quintetti e cambi: i controlli', () => {
  const state = voiceGame();
  const cases = [
    ['quintetto 25 7 1 2 PC52 inizio primo quarto', /ho sentito 4 numeri/],
    ['quintetto 25 7 1 2 3 inizio primo quarto', /di' anche la squadra/],
    ['entra il 1 esce il 25 PC52 al 5 e 00', /Prima dimmi il quintetto/],
  ];
  for (const [heard, error] of cases) assert.match(Game.parseCommand(state, heard, 0).error, error, heard);
  Game.voiceCommand(state, 0, ['quintetto 25 7 1 2 3 PC52 inizio primo quarto']);
  const later = [
    ['entra il 4 esce il 9 PC52 al 5 e 00', /Il 9 non è in campo/],
    ['entra il 1 esce il 25 al 5 e 00', /Il 1 è già in campo/],
    ['entrano 4 e 5 esce il 25 al 5 e 00', /Entrano 2 ed escono 1/],
    ['entra il 4 al 5 e 00', /chi entra e chi esce/],
  ];
  for (const [heard, error] of later) assert.match(Game.parseCommand(state, heard, 0).error, error, heard);
  for (let i = 0; i < 5; i++) Game.addFoul(state, 0, 'home', 7);
  assert.match(Game.parseCommand(state, 'quintetto 25 7 1 2 3 PC52 al 4 e 00', 0).error, /ha già 5 falli/);
});

test('un comando vocale si esegue, un numero nuovo entra in squadra e «annulla» lo toglie', () => {
  const state = gameWithPlayers();
  const scored = Game.voiceCommand(state, 0, ['canestro da 2 del 14 ospiti']);
  assert.equal(scored.ok, true);
  assert.equal(scored.message, 'Canestro da 2 · #14 OSPITI (nuovo in squadra) · 0–2 · Q1 10:00');
  assert.deepEqual(state.rosters.away, [7, 12, 14]);
  const undone = Game.voiceCommand(state, 0, ['annulla']);
  assert.equal(undone.message, 'Annullato: +2 #14 OSPITI');
  assert.deepEqual(state.rosters.away, [7, 12], 'il 14 esce di nuovo');
  assert.equal(Game.score(state.events, 'away'), 0);
});

test('un quintetto con numeri nuovi li aggiunge, e «annulla» li toglie', () => {
  const state = voiceGame();
  const outcome = Game.voiceCommand(state, 0, ['quintetto 4 5 6 7 12 ospiti inizio primo quarto']);
  assert.equal(outcome.message, 'Quintetto OSPITI: 4 5 6 7 12 (nuovi in squadra) · Q1 10:00');
  assert.deepEqual(state.rosters.away, [4, 5, 6, 7, 12]);
  Game.voiceCommand(state, 0, ['annulla']);
  assert.deepEqual(state.rosters.away, [7, 12]);
});

test('se la prima versione capita non è un comando, vale la prima che lo è', () => {
  const state = gameWithPlayers();
  const outcome = Game.voiceCommand(state, 0, ['cane stro del 25', 'canestro del 25']);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.heard, 'canestro del 25');
  const failed = Game.voiceCommand(state, 0, ['ciao', 'buongiorno']);
  assert.deepEqual(failed, { ok: false, heard: 'ciao', message: 'Non ho capito cosa è successo: canestro, fallo, cambio o quintetto?' });
  assert.equal(state.events.length, 1);
});

test('due liberi detti insieme sono due azioni da un punto', () => {
  const state = gameWithPlayers();
  const outcome = Game.voiceCommand(state, 0, ['due liberi del 25']);
  assert.equal(outcome.message, '2 tiri liberi · #25 Rossi PC52 · 2–0 · Q1 10:00');
  assert.equal(state.events.length, 2);
});

test('la squadra si riconosce anche da una parola sola del suo nome', () => {
  const state = gameWithPlayers();
  state.names.away = 'Virtus Padova';
  state.names.home = 'Basket PC52';
  const foul7 = (team) => ({ type: 'foul', team, player: 7, count: 1, at: at(1, 10, 0) });
  assert.deepEqual(Game.parseCommand(state, 'fallo del 7 Virtus', 0), foul7('away'));
  assert.deepEqual(Game.parseCommand(state, 'fallo del 7 virtus padova', 0), foul7('away'));
  assert.deepEqual(Game.parseCommand(state, 'fallo del 7 basket pc 52', 0), foul7('home'));
  state.names.away = 'Basket Treviso';
  assert.match(Game.parseCommand(state, 'fallo del 7 basket', 0).error, /tutte e due le squadre: di' anche la squadra/, 'Basket è in tutte e due');
});
