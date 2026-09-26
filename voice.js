'use strict';

// Il microfono a pulsante: finché si tiene premuto (il dito sullo schermo o un tasto) ascolta,
// al rilascio consegna quello che ha capito. Usa il riconoscimento vocale del browser:
// Chrome su Android, Safari su iPhone e iPad; con Chrome la voce viene capita via internet.
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

  function explain(error) {
    return ERRORS[error] ?? 'Non ho sentito bene: riprova.';
  }

  // handlers: onListening() quando il microfono è aperto, onHeard(testo) mentre capisce,
  // onResult({ at, heard, error }) alla fine: at è l'istante della pressione, heard le versioni capite.
  function createTalk(handlers) {
    let rec = null; // il riconoscimento in corso, fino alla sua fine
    let holding = false; // dito o tasto ancora giù
    let waiting = null; // pressione arrivata mentre il comando precedente stava finendo

    function start(at) {
      const current = new Recognition();
      let heard = [];
      let error = null;
      current.lang = 'it-IT';
      current.interimResults = true;
      current.maxAlternatives = 5;
      current.continuous = false;
      current.onstart = () => handlers.onListening();
      current.onresult = (e) => {
        const parts = Array.from(e.results);
        const best = parts.map((r) => r[0].transcript.trim()).join(' ');
        heard = parts.length === 1 ? Array.from(parts[0], (a) => a.transcript.trim()) : [best];
        handlers.onHeard(best);
      };
      current.onerror = (e) => {
        error = e.error;
      };
      current.onend = () => {
        rec = null;
        const said = heard.filter(Boolean);
        handlers.onResult({ at, heard: said, error: said.length ? null : error });
        if (waiting !== null) {
          const next = waiting;
          waiting = null;
          if (holding) start(next);
        }
      };
      rec = current;
      try {
        current.start();
      } catch {
        rec = null;
        handlers.onResult({ at, heard: [], error: 'start' });
      }
    }

    return {
      press(at) {
        if (holding) return;
        holding = true;
        if (rec) waiting = at;
        else start(at);
      },
      release() {
        if (!holding) return;
        holding = false;
        if (waiting !== null) {
          waiting = null;
          handlers.onResult({ at: 0, heard: [], error: 'busy' });
        } else if (rec) {
          rec.stop(); // il riconoscimento consegna quello che ha sentito fin qui
        }
      },
    };
  }

  root.Voice = { supported: Boolean(Recognition), createTalk, explain };
})(window);
