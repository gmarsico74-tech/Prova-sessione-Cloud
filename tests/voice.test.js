const test = require('node:test');
const assert = require('node:assert/strict');
const Voice = require('../voice.js');

// Un riconoscimento finto, guidato dal test: ogni ascolto aperto finisce in heard.all.
function fakeRecognition() {
  const all = [];
  class Fake {
    constructor() {
      all.push(this);
    }
    start() {
      this.started = true;
      this.onstart?.();
    }
    stop() {
      this.stopped = true;
      this.onend?.();
    }
    // il riconoscimento consegna quello che ha capito finora in questo ascolto: un elenco di pezzi,
    // ogni pezzo con le sue versioni
    hear(...parts) {
      this.onresult?.({ results: parts.map((versions) => versions.map((transcript) => ({ transcript }))) });
    }
    // il riconoscimento si ferma da solo, come fa dopo una pausa
    endByItself(error) {
      if (error) this.onerror?.({ error });
      this.onend?.();
    }
  }
  return { Fake, all };
}

function talkWith(Fake) {
  const results = [];
  const heard = [];
  const talk = Voice.createTalk(
    { onListening() {}, onHeard: (text) => heard.push(text), onResult: (r) => results.push(r) },
    Fake
  );
  return { talk, results, heard };
}

test('finché il dito è giù il microfono resta aperto, anche se il riconoscimento si ferma dopo una pausa', () => {
  const { Fake, all } = fakeRecognition();
  const { talk, results, heard } = talkWith(Fake);
  talk.press(1_000);
  all[0].hear(['canestro del 25']);
  all[0].endByItself(); // la pausa prima di dire il tempo
  assert.equal(results.length, 0, 'niente è stato ancora consegnato');
  assert.equal(all.length, 2, 'il microfono si è riaperto da solo');
  all[1].hear(['al 2 e 26 del terzo quarto']);
  assert.equal(heard[heard.length - 1], 'canestro del 25 al 2 e 26 del terzo quarto', 'mentre parla mostra tutta la frase');
  talk.release();
  assert.equal(all[1].stopped, true);
  assert.equal(results.length, 1);
  assert.equal(results[0].at, 1_000, 'l\'istante è quello della pressione');
  assert.equal(results[0].heard[0], 'canestro del 25 al 2 e 26 del terzo quarto');
});

test('il microfono si apre in modo continuo, per non chiudersi alla prima pausa', () => {
  const { Fake, all } = fakeRecognition();
  const { talk } = talkWith(Fake);
  talk.press(0);
  assert.equal(all[0].continuous, true);
  assert.equal(all[0].lang, 'it-IT');
});

test('se si tiene premuto senza parlare, il microfono aspetta; al rilascio dice che non ha sentito niente', () => {
  const { Fake, all } = fakeRecognition();
  const { talk, results } = talkWith(Fake);
  talk.press(0);
  all[0].endByItself('no-speech');
  all[1].endByItself('no-speech');
  assert.equal(all.length, 3, 'riparte ancora');
  talk.release();
  assert.deepEqual(results, [{ at: 0, heard: [], error: 'no-speech' }]);
});

test('i pezzi ripetuti da alcuni Android non si raddoppiano', () => {
  assert.deepEqual(Voice.sessionAlternatives([[{ transcript: 'canestro' }], [{ transcript: 'canestro del 25' }]]), [
    'canestro del 25',
  ]);
  assert.deepEqual(Voice.sessionAlternatives([[{ transcript: 'canestro' }], [{ transcript: ' del 25' }]]), [
    'canestro del 25',
  ]);
});

test('le versioni proposte restano, anche su più ascolti', () => {
  const { Fake, all } = fakeRecognition();
  const { talk, results } = talkWith(Fake);
  talk.press(0);
  all[0].hear(['fallo del 12', 'fallo del 2']);
  all[0].endByItself();
  all[1].hear(['al 5 e 10']);
  talk.release();
  assert.deepEqual(results[0].heard, ['fallo del 12 al 5 e 10', 'fallo del 2 al 5 e 10']);
});

test('se il microfono non è permesso non riprova all\'infinito: si ferma e lo dice', () => {
  const { Fake, all } = fakeRecognition();
  const { talk, results } = talkWith(Fake);
  talk.press(0);
  all[0].endByItself('not-allowed');
  assert.equal(all.length, 1);
  assert.deepEqual(results, [{ at: 0, heard: [], error: 'not-allowed' }]);
  assert.match(Voice.explain('not-allowed'), /microfono non è permesso/);
});
