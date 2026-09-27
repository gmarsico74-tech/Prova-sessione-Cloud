'use strict';

// Il microfono a pulsante: finché si tiene premuto (il dito sullo schermo o un tasto) ascolta,
// anche se si fanno pause; al rilascio consegna tutto quello che ha capito. Usa il riconoscimento vocale
// del browser: Chrome su Android, Safari su iPhone e iPad; con Chrome la voce viene capita via internet.
// Espone window.Voice nella pagina e module.exports per i test (node --test).
(function (root) {
  const Recognition = root.SpeechRecognition || root.webkitSpeechRecognition;

  // Gli errori del riconoscimento spiegati a chi sta guardando la partita.
  const ERRORS = {
    'not-allowed': 'Il microfono non è permesso: consentilo a questo sito nelle impostazioni del browser.',
    'service-not-allowed': 'Il riconoscimento vocale non è permesso: su iPhone e iPad accendi Siri e Dettatura.',
    'audio-capture': 'Non trovo il microfono.',
    network: 'Per capire la voce serve internet: controlla la connessione.',
    'no-speech': 'Non ho sentito niente: tieni premuto mentre parli.',
    'language-not-supported': "Su questo dispositivo il riconoscimento non conosce l'italiano.",
    busy: 'Il comando di prima non era finito: riprova.',
  };

  // Dopo questi errori riprovare non serve: il dito può restare giù, ma si chiude e si spiega perché.
  const FATAL = ['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'language-not-supported', 'start'];

  // Un tetto alle ripartenze di una sola pressione, perché un riconoscimento che non parte non giri a vuoto.
  const MAX_RESTARTS = 30;

  function explain(error) {
    return ERRORS[error] ?? 'Non ho sentito bene: riprova.';
  }

  // Aggiunge un pezzo di frase a quello che c'era. Su alcuni Android ogni pezzo ripete anche il testo
  // di prima («canestro», poi «canestro del 25»): in quel caso vale il pezzo nuovo, senza doppioni.
  function merge(before, next) {
    const a = before.trim();
    const b = next.trim();
    if (!a) return b;
    if (b.toLowerCase().startsWith(a.toLowerCase())) return b;
    return `${a} ${b}`;
  }

  // Le versioni della frase capita in un ascolto: tutti i pezzi nella versione più probabile,
  // l'ultimo in ciascuna delle versioni proposte.
  function sessionAlternatives(results) {
    const parts = Array.from(results);
    if (parts.length === 0) return [];
    let prefix = '';
    for (const r of parts.slice(0, -1)) prefix = merge(prefix, r[0].transcript);
    return Array.from(parts[parts.length - 1], (a) => merge(prefix, a.transcript));
  }

  // Più ascolti di fila (il riconoscimento si ferma da solo e riparte finché il dito è giù)
  // diventano una frase sola, con le sue versioni.
  function combine(segments) {
    const heard = segments.filter((s) => s.length > 0);
    if (heard.length === 0) return [];
    const most = Math.max(...heard.map((s) => s.length));
    const versions = [];
    for (let i = 0; i < most; i++) versions.push(heard.reduce((text, s) => merge(text, s[i] ?? s[0]), ''));
    return [...new Set(versions)].filter(Boolean);
  }

  // handlers: onListening() quando il microfono è aperto, onHeard(testo) mentre capisce,
  // onResult({ at, heard, error }) al rilascio: at è l'istante della pressione, heard le versioni capite.
  function createTalk(handlers, Impl = Recognition) {
    let rec = null; // l'ascolto in corso
    let take = null; // la pressione in corso: { at, segments, error, restarts }
    let holding = false; // dito o tasto ancora giù
    let waiting = null; // pressione arrivata mentre la precedente stava finendo

    function listen() {
      const current = new Impl();
      let heard = [];
      current.lang = 'it-IT';
      current.continuous = true; // non si chiude alla prima pausa
      current.interimResults = true;
      current.maxAlternatives = 5;
      current.onstart = () => {
        const before = combine(take.segments)[0];
        if (before) handlers.onHeard(before);
        else handlers.onListening();
      };
      current.onresult = (e) => {
        heard = sessionAlternatives(e.results);
        handlers.onHeard(combine([...take.segments, heard])[0] ?? '');
      };
      current.onerror = (e) => {
        take.error = e.error;
      };
      current.onend = () => {
        rec = null;
        take.segments.push(heard);
        // il dito è ancora giù: il riconoscimento si è fermato da solo, si riparte e si continua ad ascoltare
        if (holding && !FATAL.includes(take.error) && take.restarts < MAX_RESTARTS) {
          take.restarts += 1;
          listen();
          return;
        }
        finish();
      };
      rec = current;
      try {
        current.start();
      } catch {
        rec = null;
        take.error = 'start';
        finish();
      }
    }

    function begin(at) {
      take = { at, segments: [], error: null, restarts: 0 };
      listen();
    }

    function finish() {
      const done = take;
      take = null;
      const heard = combine(done.segments);
      handlers.onResult({ at: done.at, heard, error: heard.length ? null : done.error });
      if (waiting !== null) {
        const next = waiting;
        waiting = null;
        if (holding) begin(next);
      }
    }

    return {
      press(at) {
        if (holding) return;
        holding = true;
        if (take) waiting = at;
        else begin(at);
      },
      release() {
        if (!holding) return;
        holding = false;
        if (waiting !== null) {
          waiting = null;
          handlers.onResult({ at: 0, heard: [], error: 'busy' });
        } else if (rec) {
          rec.stop(); // il riconoscimento consegna quello che ha sentito fin qui, poi finisce
        }
      },
    };
  }

  const Voice = { supported: Boolean(Recognition), createTalk, explain, sessionAlternatives, combine };

  if (typeof module !== 'undefined' && module.exports) module.exports = Voice;
  else root.Voice = Voice;
})(typeof window !== 'undefined' ? window : globalThis);
