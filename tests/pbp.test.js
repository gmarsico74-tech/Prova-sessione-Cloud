// Il play-by-play di FIPSTATS: lettura e controllo del file, importazione e reimportazione, modalità completamento
// dello scout a voce, minuti in campo con l'errore del tavolo, file della partita. Le prove usano il file vero
// della partita Valdobasket – PC52 61-72 del 07/11/2026.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Game = require('../game.js');

const EXAMPLE = path.join(__dirname, '..', 'esempi', '2026-11-08-tabellone-pbp-esempio-valdobasket-pc52.json');
const example = () => JSON.parse(fs.readFileSync(EXAMPLE, 'utf8'));

function imported(json = example()) {
  const state = Game.newGame({ home: 'PC52', away: 'OSPITI' });
  const read = Game.readPlayByPlay(json);
  assert.equal(read.error, undefined, read.error);
  const result = Game.importPlayByPlay(state, [], read.pbp);
  assert.equal(result.error, undefined, result.error);
  return { state, result };
}

const say = (state, heard, now = 0) => Game.voiceCommand(state, now, [heard]);
const at = (period, clock) => {
  const [m, s] = clock.split(':').map(Number);
  return { period, clockMs: (m * 60 + s) * 1000 };
};

test('il play-by-play si legge: dati, squadre, 211 azioni nell\'ordine del file, avvisi', () => {
  const { pbp, error } = Game.readPlayByPlay(example());
  assert.equal(error, undefined);
  assert.equal(pbp.sheet.date, '2026-11-07');
  assert.equal(pbp.sheet.match.league, 'DR1');
  assert.equal(pbp.sheet.match.number, '728');
  assert.equal(pbp.sheet.teams.home.name, 'Valdobasket');
  assert.equal(pbp.sheet.teams.away.name, 'PC52');
  assert.equal(pbp.sheet.teams.home.color, 'bianca');
  assert.equal(pbp.events.length, 211);
  assert.ok(pbp.events.every((e) => e.origin === 'fipstats'));
  assert.equal(pbp.video, 'MONTATO_07nov26_Valdobasket_vs_PC52_DR1.mp4');
  assert.deepEqual(pbp.warnings, ['Q4 3:50 casa: esce [3] che non risulta in campo; dopo il cambio in campo risultano 6: [1, 6, 7, 9, 16, 21]']);
  // a parità di tempo resta l'ordine del file: a Q1 8:58 fallo, fallo subito, libero sbagliato, libero segnato
  assert.deepEqual(
    pbp.events.slice(3, 7).map((e) => [e.type, e.kind ?? e.pts, e.clockMs]),
    [['foul', undefined, 538_000], ['stat', 'fd', 538_000], ['stat', 'miss', 538_000], ['score', 1, 538_000]].map(([t, k, ms]) => [t, k, ms])
  );
  assert.deepEqual(pbp.events[0], { team: 'home', type: 'lineup', on: [1, 9, 12, 19, 21], period: 1, clockMs: 600_000, origin: 'fipstats' });
  const technical = pbp.events.filter((e) => e.technical);
  assert.equal(technical.length, 1);
  assert.deepEqual([technical[0].team, technical[0].player, technical[0].period, technical[0].clockMs], ['home', 7, 4, 53_000]);
  assert.match(pbp.events.find((e) => e.warning).warning, /esce \[3\]/);
});

test('importato, il tabellone dà i numeri del referto: 61-72, parziali, liberi, falli', () => {
  const { state, result } = imported();
  assert.equal(result.imported, 211);
  assert.equal(result.replaced, 0);
  assert.equal(Game.score(state.events, 'home'), 61);
  assert.equal(Game.score(state.events, 'away'), 72);
  const box = Game.boxScore(state, 0);
  assert.deepEqual(box.periods.map((p) => [p.home, p.away]), [[15, 19], [14, 11], [21, 21], [11, 21]]);
  const home = Game.boxTotals(box.teams.home);
  const away = Game.boxTotals(box.teams.away);
  assert.deepEqual([home.made[0], home.att[0]], [12, 20]);
  assert.deepEqual([away.made[0], away.att[0]], [24, 33]);
  assert.equal(home.fouls, 25);
  assert.equal(away.fouls, 16);
  assert.equal(home.fd, 10);
  assert.equal(away.fd, 14);
  const ramirez = box.teams.home.players.find((p) => p.number === 1);
  assert.equal(ramirez.name, 'Ramirez Henry Ernest'); // il nome del referto, tagliato a 20 caratteri come sempre
  assert.equal(ramirez.fouls, 5);
  assert.deepEqual(
    box.teams.away.players.filter((p) => p.fouls).map((p) => [p.number, p.fouls]),
    [[0, 1], [5, 2], [8, 2], [13, 2], [21, 4], [22, 2], [33, 3]]
  );
  // il fallo tecnico conta come un fallo normale, personale e di squadra
  assert.equal(box.teams.home.players.find((p) => p.number === 7).fouls, 3);
  assert.deepEqual([1, 2, 3, 4].map((p) => Game.teamFouls(state.events, 'home', p)), [6, 5, 4, 10]);
  // dati, squadre e giocatori come «Importa partita», e le squadre fra le salvate
  assert.equal(state.date, '2026-11-07');
  assert.equal(state.names.home, 'Valdobasket');
  assert.equal(state.colors.away, 'blu');
  assert.equal(state.settings.playerMode, true);
  assert.deepEqual(result.library.map((t) => t.name), ['PC52', 'Valdobasket']);
  assert.equal(Game.hasImported(state), true);
  // la partita è finita: lo stato è «Finale», e Q4 arriva a 0:00
  assert.equal(Game.gameStatus(state, 0), 'Finale');
});

test('se un totale del controllo non torna non si importa niente, e si dice quale', () => {
  const json = example();
  json.controllo.falli.casa = 24;
  const read = Game.readPlayByPlay(json);
  assert.match(read.error, /non tornano/);
  assert.match(read.error, /«falli»: nel controllo casa 24, ospiti 16, contando le azioni casa 25, ospiti 16/);
  assert.doesNotMatch(read.error, /punti/);
  const other = example();
  other.controllo.tiri_liberi_sbagliati.ospiti = 8;
  assert.match(Game.readPlayByPlay(other).error, /«tiri_liberi_sbagliati»/);
  const noCheck = example();
  delete noCheck.controllo;
  assert.match(Game.readPlayByPlay(noCheck).error, /manca il «controllo»/);
});

test('un\'azione sbagliata nel file dice quale e dove: punteggio, numero, ordine, tempo', () => {
  const cases = [
    [(j) => (j.azioni[2].punteggio = { casa: 0, ospiti: 3 }), /azione 3 \(Q1 9:38 ospiti\): il punteggio scritto è 0-3, ma contando i canestri fin qui è 0-2/],
    [(j) => delete j.azioni[3].numero, /azione 4 \(Q1 8:58 casa\): manca il numero del giocatore/],
    [(j) => (j.azioni[3].numero = 44), /il numero 44 non è fra i giocatori di Valdobasket/],
    [(j) => (j.azioni[7].tempo = '9:50'), /azione 8 .*viene dopo Q1 8:58: le azioni vanno nell'ordine della partita/],
    [(j) => (j.azioni[2].tempo = '10:01'), /«10:01» non è un tempo del Q1/],
    [(j) => (j.azioni[2].squadra = 'Valdobasket'), /«casa» o «ospiti»/],
    [(j) => (j.azioni[2].tipo = 'stoppata'), /«stoppata» non è un tipo di azione/],
    [(j) => (j.azioni[11].esce = [19, 44]), /in «entra» ed «esce»/],
    [(j) => (j.versione = 2), /versione più nuova/],
  ];
  for (const [spoil, error] of cases) {
    const json = example();
    spoil(json);
    assert.match(Game.readPlayByPlay(json).error ?? '', error, String(error));
  }
});

test('nel play-by-play il 00 resta diverso dallo 0', () => {
  const json = example();
  json.ospiti.giocatori.push({ numero: '00', nome: 'Doppio Zero' });
  // un fallo del 00 al posto di quello dello 0 di Q1 (stesso totale di falli)
  const foul = json.azioni.find((a) => a.tipo === 'fallo' && a.squadra === 'ospiti' && a.numero === 0);
  foul.numero = '00';
  const { state } = imported(json);
  assert.deepEqual(state.rosters.away.slice(0, 2), [0, '00']);
  assert.equal(Game.playerFouls(state.events, 'away', '00'), 1);
  assert.equal(Game.playerFouls(state.events, 'away', 0), 0);
});

test('l\'avviso del referto si mostra con il punto della partita, e chi risulta in campo', () => {
  const { state, result } = imported();
  assert.equal(result.warnings.length, 1);
  const [warning] = Game.pbpWarnings(state);
  assert.deepEqual(warning.at, at(4, '3:50'));
  assert.equal(warning.team, 'home');
  assert.deepEqual(warning.court, [1, 6, 7, 9, 16, 21]);
});

test('con sei giocatori in campo i minuti non si rompono; il quintetto detto a mano corregge da lì in avanti', () => {
  const { state } = imported();
  const secs = (side) => Game.boxScore(state, 0).teams[side].players.reduce((sum, p) => sum + p.secs, 0);
  assert.equal(secs('away'), 4 * 600 * 5, 'ospiti: 40 minuti per 5, fino a 0:00 del Q4');
  // il sesto in campo per 3:50: tutti i numeri restano veri, nessuno NaN
  assert.equal(secs('home'), 4 * 600 * 5 + 230);
  assert.ok(Game.boxScore(state, 0).teams.home.players.every((p) => Number.isInteger(p.secs) && Number.isInteger(p.pm)));
  // il #1 ha il 5° fallo a Q4 4:07: a 3:50 non può essere nel quintetto
  Game.alignClock(state, 0, at(4, '3:50'));
  const refused = say(state, 'quintetto 1 6 7 9 21 bianco');
  assert.equal(refused.ok, false);
  assert.match(refused.message, /ha già 5 falli/);
  const fixed = say(state, 'quintetto 6 7 9 16 21 bianco');
  assert.equal(fixed.ok, true, fixed.message);
  assert.equal(secs('home'), 4 * 600 * 5);
  const box = Game.boxScore(state, 0);
  assert.equal(box.teams.home.players.find((p) => p.number === 1).secs, Game.boxScore(imported().state, 0).teams.home.players.find((p) => p.number === 1).secs - 230);
  const [warning] = Game.pbpWarnings(state);
  assert.deepEqual(warning.court, [6, 7, 9, 16, 21], 'dopo la correzione in campo sono 5');
  // il quintetto detto a mano non si tocca reimportando
  Game.importPlayByPlay(state, [], Game.readPlayByPlay(example()).pbp);
  assert.equal(secs('home'), 4 * 600 * 5);
});

test('modalità completamento: lo scout a voce si somma, quello che è nel referto non si registra', () => {
  const { state } = imported();
  const before = state.events.length;
  Game.alignClock(state, 0, at(2, '5:00'));
  const miss = say(state, 'tiro da 3 sbagliato 22 blu');
  assert.equal(miss.ok, true, miss.message);
  const reb = say(state, 'rimbalzo difesa 12 bianco');
  assert.equal(reb.ok, true, reb.message);
  assert.equal(state.events.length, before + 2);
  const box = Game.boxScore(state, 0);
  const scapinello = box.teams.away.players.find((p) => p.number === 22);
  assert.deepEqual([scapinello.made[2], scapinello.att[2]], [1, 2], 'tentati = segnati dal referto + sbagliati dallo scout');
  assert.equal(box.teams.home.players.find((p) => p.number === 12).dreb, 1);
  assert.equal(Game.score(state.events, 'away'), 72, 'il punteggio non cambia');

  for (const heard of ['canestro da 2 del 5', 'tiro libero del 5 PC52', 'fallo del 12 bianco', 'fallo subito dal 25',
    'tiro libero sbagliato del 21 blu', 'fallo del 12 bianco sul 22 blu', 'entra il 5 esce il 22 blu', 'timeout PC52']) {
    const outcome = say(state, heard);
    assert.equal(outcome.ok, false, heard);
    assert.match(outcome.message, /^Già nel referto/, heard);
  }
  assert.equal(state.events.length, before + 2, 'niente di registrato');
  assert.equal(state.notes.length, 0, 'e niente fra i comandi non capiti');
  assert.match(say(state, 'canestro da 2 del 5').message, /Già nel referto: canestro\./);

  // detti insieme, si registra quello che manca e si dice il resto
  const mixed = say(state, 'canestro del 12 bianco, assist del 9');
  assert.equal(mixed.ok, true, mixed.message);
  assert.match(mixed.message, /^Assist · #9 Piccinini Matteo Valdobasket .*già nel referto: canestro/);
  assert.equal(state.events.length, before + 3);
  // stoppata e stoppato restano scout: il tiro stoppato è un tiro da 2 sbagliato
  assert.equal(say(state, 'stoppata del 12 bianco sul 22 blu').ok, true);
});

test('l\'assist con un numero di tutte e due le squadre va alla squadra dell\'ultimo canestro', () => {
  const { state } = imported();
  // Q1 2:34: tripla del 22 ospite; il 21 c'è in tutte e due le squadre
  Game.alignClock(state, 0, at(1, '2:30'));
  const outcome = say(state, 'assist del 21');
  assert.equal(outcome.ok, true, outcome.message);
  assert.equal(state.events.at(-1).team, 'away');
  // e il rimbalzo si capisce anche da un tiro libero sbagliato importato
  Game.alignClock(state, 0, at(1, '8:58'));
  assert.equal(say(state, 'rimbalzo del 12 bianco').ok, true);
  assert.equal(state.events.at(-1).kind, 'dreb');
});

test('«Annulla» non tocca le azioni importate', () => {
  const { state } = imported();
  assert.equal(Game.canUndo(state), false);
  Game.undo(state);
  assert.equal(state.events.length, 211);
  assert.match(say(state, 'annulla').message, /si correggono reimportando il file/);
  assert.equal(state.events.length, 211);
  Game.alignClock(state, 0, at(3, '6:00'));
  say(state, 'palla persa del 22 blu, recuperata dal 12 bianco');
  assert.equal(Game.canUndo(state), true);
  say(state, 'annulla');
  assert.equal(state.events.length, 211);
  Game.undo(state);
  assert.equal(state.events.length, 211);
});

test('reimportare sostituisce solo le azioni importate, anche con un file corretto', () => {
  const { state } = imported();
  Game.alignClock(state, 0, at(1, '7:00'));
  say(state, 'rimbalzo in attacco del 12 bianco');
  say(state, 'palla persa del 22 blu');
  const manual = state.events.filter((e) => !Game.isImported(e));
  assert.equal(manual.length, 2);
  // il file corretto: il canestro di Q1 7:54 era del 9 e non del 12
  const json = example();
  json.azioni[7].numero = 9;
  const read = Game.readPlayByPlay(json);
  const check = Game.playByPlayCheck(state, read.pbp);
  assert.deepEqual(check, { replaced: 211, kept: 2, otherTeams: false });
  const result = Game.importPlayByPlay(state, [], read.pbp);
  assert.equal(result.replaced, 211);
  assert.equal(result.kept, 2);
  assert.equal(state.events.length, 213);
  assert.deepEqual(state.events.filter((e) => !Game.isImported(e)), manual, 'le azioni a mano restano com\'erano');
  assert.equal(Game.playerPoints(state.events, 'home', 9), Game.playerPoints(imported().state.events, 'home', 9) + 2);
  assert.equal(Game.score(state.events, 'home'), 61);
});

test('si importa anche a scout cominciato; non se a mano ci sono già canestri, falli, timeout o cambi', () => {
  const state = Game.newGame({ home: 'PC52', away: 'OSPITI' });
  const { pbp } = Game.readPlayByPlay(example());
  // le squadre giuste, e un rimbalzo già segnato a mano
  Game.importMatch(state, [], { date: null, match: Game.emptyMatch(), teams: pbp.sheet.teams });
  Game.voiceCommand(state, 0, ['rimbalzo in difesa del 12 Valdobasket']);
  assert.deepEqual(Game.playByPlayCheck(state, pbp), { replaced: 0, kept: 1, otherTeams: false });
  assert.equal(Game.importPlayByPlay(state, [], pbp).error, undefined);
  assert.equal(state.events.length, 212);
  assert.equal(state.events.at(-1).kind, 'dreb');

  const scored = Game.newGame({ home: 'PC52', away: 'OSPITI' });
  Game.importMatch(scored, [], { date: null, match: Game.emptyMatch(), teams: pbp.sheet.teams });
  Game.voiceCommand(scored, 0, ['canestro del 12 Valdobasket']);
  assert.match(Game.importPlayByPlay(scored, [], pbp).error, /già, segnato a mano, \+2 #12 Gallina Giosue' Valdobasket .*due volte/);
  assert.equal(scored.events.length, 1, 'non importa niente');
});

test('squadre diverse da quelle della partita: si chiede prima; con azioni a mano non si importa', () => {
  const { pbp } = Game.readPlayByPlay(example());
  const fresh = Game.newGame({ home: 'PC52', away: 'OSPITI' });
  assert.equal(Game.playByPlayCheck(fresh, pbp).otherTeams, false, 'senza giocatori i nomi sono solo segnaposti');
  const other = Game.newGame({ home: 'PC52', away: 'Mogliano' });
  Game.addPlayer(other, 'home', 6, 'Viero');
  assert.equal(Game.playByPlayCheck(other, pbp).otherTeams, true);
  Game.voiceCommand(other, 0, ['rimbalzo in difesa del 6 PC52']);
  assert.match(Game.playByPlayCheck(other, pbp).error, /sono di PC52 – Mogliano, il play-by-play è di Valdobasket – PC52/);
});

test('cliccando un\'azione importata il cronometro va a quel momento, e se andava continua da lì', () => {
  const state = Game.newGame({ home: 'A', away: 'B' });
  Game.alignClock(state, 0, at(3, '4:12'));
  assert.equal(state.period, 3);
  assert.equal(Game.remainingMs(state.clock, 5000), 252_000);
  Game.startClock(state.clock, 0);
  Game.alignClock(state, 1000, at(2, '9:00'));
  assert.equal(state.clock.running, true);
  assert.equal(Game.remainingMs(state.clock, 3000), 538_000);
});

test('secondi_video diventa il punto del video dell\'azione', () => {
  const json = example();
  json.azioni[2].secondi_video = 83.4;
  const { state } = imported(json);
  assert.equal(state.events[2].videoMs, 83_400);
  const file = Game.gameFile(state, 0);
  assert.equal(file.azioni.find((a) => a.tempo === '9:38').secondi_video, 83.4);
  json.azioni[2].secondi_video = -1;
  assert.match(Game.readPlayByPlay(json).error, /secondi_video/);
});

test('il File della partita ha tutte le azioni, le importate con "fonte": "fipstats", e le statistiche lo leggono', () => {
  const { state } = imported();
  Game.alignClock(state, 0, at(2, '5:00'));
  say(state, 'tiro da 3 sbagliato 22 blu');
  const file = Game.gameFile(state, 0);
  assert.equal(file.formato, 'tabellone-basket-partita');
  assert.equal(file.versione, 1);
  assert.equal(file.azioni.length, 212);
  assert.equal(file.azioni.filter((a) => a.fonte === 'fipstats').length, 211);
  const scout = file.azioni.filter((a) => a.fonte === undefined);
  assert.equal(scout.length, 1);
  assert.equal(scout[0].tipo, 'tiro sbagliato');
  // nient'altro cambia nelle azioni importate: gli stessi campi di quelle segnate a mano
  const basket = file.azioni.find((a) => a.tipo === 'canestro');
  assert.deepEqual(Object.keys(basket), ['periodo', 'numero_periodo', 'tempo', 'ms_restanti', 'tipo', 'squadra', 'nome_squadra', 'fonte', 'numero', 'giocatore', 'punti', 'punteggio', 'scritta']);
  assert.equal(file.fine_periodi.length, 4);
  assert.deepEqual(file.fine_periodi[3].punteggio, { casa: 61, ospiti: 72 });
  assert.equal(file.tabellino.ospiti.totale.t3_tentati, 9);
  assert.equal(file.tabellino.ospiti.totale.tl_tentati, 33);
  // il file passa da JSON e l'archivio delle statistiche lo accetta come sempre
  const [entry] = Game.readGameFile(JSON.parse(JSON.stringify(file)));
  assert.equal(entry.id, '2026-11-07_valdobasket_pc52');
  const stats = Game.seasonStats([entry], 'PC52');
  assert.equal(stats.record.won, 1);
  assert.equal(stats.record.pointsFor, 72);
  assert.deepEqual([stats.record.totals.made[0], stats.record.totals.att[0]], [24, 33]);
});
