'use strict';

// La diretta con Firebase: il tabellone scrive la partita nel database, la pagina diretta.html la mostra a chi
// guarda. Il programma di Firebase si scarica solo sulle pagine online e solo se serve: senza rete, o aperto
// come file, il tabellone funziona come sempre, solo senza diretta.
(function (root) {
  const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
  // Il progetto Firebase della diretta. Questi dati non sono segreti, stanno in ogni pagina che usa Firebase:
  // chi può scrivere lo decidono le regole del database (database.rules.json), che accettano solo il proprietario.
  const CONFIG = {
    apiKey: 'AIzaSyA0Lr3_i2JC7u6w7IbHVxSzXbTnTA49I1o',
    authDomain: 'tabellone-pc52.firebaseapp.com',
    databaseURL: 'https://tabellone-pc52-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'tabellone-pc52',
    appId: '1:619214042060:web:0dc7bb4e835db1f361a369',
  };
  // Le prove sul computer usano l'emulatore di Firebase invece del progetto vero (vedi il README):
  // basta aprire la pagina da localhost con ?emulatore nell'indirizzo.
  const EMULATOR =
    ['localhost', '127.0.0.1'].includes(root.location.hostname) && new URLSearchParams(root.location.search).has('emulatore');
  const EMULATOR_CONFIG = {
    apiKey: 'emulatore',
    authDomain: 'demo-tabellone.firebaseapp.com',
    projectId: 'demo-tabellone',
    databaseURL: 'http://127.0.0.1:9000/?ns=demo-tabellone-default-rtdb',
  };
  const FLUSH_MS = 500; // le modifiche ravvicinate partono insieme
  const ID_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789'; // senza l, o, 0 e 1, che si confondono
  const ID_PATTERN = /^[a-z0-9]{12}$/;

  // La diretta si può usare dalla pagina online, con il progetto Firebase configurato.
  function available() {
    return EMULATOR || (Boolean(CONFIG.databaseURL) && /^https?:$/.test(root.location.protocol));
  }

  let loaded = null;
  function firebase() {
    loaded ??= (async () => {
      const [appSdk, db] = await Promise.all([import(`${SDK}firebase-app.js`), import(`${SDK}firebase-database.js`)]);
      const app = appSdk.initializeApp(EMULATOR ? EMULATOR_CONFIG : CONFIG);
      const database = db.getDatabase(app);
      if (EMULATOR) db.connectDatabaseEmulator(database, '127.0.0.1', 9000);
      return { app, db, database, ref: (path) => db.ref(database, path) };
    })();
    loaded.catch(() => {
      loaded = null; // senza rete: si riprova la volta dopo
    });
    return loaded;
  }

  // L'accesso con Google serve solo a chi scrive, e Firebase lo ricorda: sullo stesso dispositivo si entra una volta.
  let signedIn = null;
  function withAuth() {
    signedIn ??= (async () => {
      const [fb, auth] = await Promise.all([firebase(), import(`${SDK}firebase-auth.js`)]);
      const session = auth.getAuth(fb.app);
      if (EMULATOR) auth.connectAuthEmulator(session, 'http://127.0.0.1:9099', { disableWarnings: true });
      await session.authStateReady();
      return { ...fb, auth, session };
    })();
    signedIn.catch(() => {
      signedIn = null;
    });
    return signedIn;
  }

  function newId() {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join('');
  }

  function denied(err) {
    return /permission.denied/i.test(`${err?.code} ${err?.message}`);
  }

  // ——— Chi scrive: il tabellone ———

  const pub = {
    getState: null, // lo stato della partita del tabellone
    onStatus: null, // per mostrare nel tabellone com'è la diretta
    id: null, // la diretta che si sta aggiornando
    sent: null, // i pezzi già mandati, per mandare solo quelli che cambiano; null: la diretta va scritta tutta
    timer: 0,
    queue: Promise.resolve(), // una scrittura alla volta, nell'ordine
    connected: false,
    email: null, // l'account Google con cui si scrive
    signedOut: false, // c'è una diretta ma nessuno è entrato con Google: va ripresa con «Riprendi diretta»
    offset: 0, // quanto l'orologio del server è avanti rispetto a quello del dispositivo
    watching: false,
  };

  function report(extra = {}) {
    pub.onStatus?.({ connected: pub.connected, email: pub.email, signedOut: pub.signedOut, ...extra });
  }

  function init({ getState, onStatus }) {
    pub.getState = getState;
    pub.onStatus = onStatus;
  }

  // Scarica Firebase in anticipo, perché la finestra di Google si apra subito al clic su «Avvia diretta».
  function preload() {
    if (available()) withAuth().catch(() => {});
  }

  // Entra con Google, se non si è già entrati, e dà una diretta nuova. Il browser apre la finestra di Google
  // solo subito dopo un clic: va chiamata dal clic su «Avvia diretta».
  async function start() {
    const fb = await withAuth();
    if (!fb.session.currentUser) await fb.auth.signInWithPopup(fb.session, new fb.auth.GoogleAuthProvider());
    return { id: newId(), creata: Date.now() };
  }

  function link(id) {
    const page = new URL('diretta.html', root.location.href);
    if (EMULATOR) page.search = root.location.search;
    page.hash = id;
    return page.href;
  }

  // Da chiamare dopo ogni modifica della partita: le modifiche ravvicinate partono insieme.
  function changed() {
    if (!available() || !pub.getState || pub.timer) return;
    if (!pub.getState().live && !pub.id) return;
    pub.timer = setTimeout(() => {
      pub.timer = 0;
      pub.queue = pub.queue.then(flush, flush);
    }, FLUSH_MS);
  }

  // Segue la connessione del tabellone: il segnale DIRETTA diventa grigio senza rete, e chi guarda sa se il
  // tabellone è collegato (collegato torna false da solo quando la connessione cade o la pagina si chiude).
  function watchConnection(fb) {
    if (pub.watching) return;
    pub.watching = true;
    fb.db.onValue(fb.ref('.info/serverTimeOffset'), (snap) => {
      const offset = snap.val() ?? 0;
      const moved = Math.abs(offset - pub.offset) > 250;
      pub.offset = offset;
      if (moved) changed(); // il cronometro che corre va ripubblicato con l'ora giusta del server
    });
    fb.db.onValue(fb.ref('.info/connected'), (snap) => {
      pub.connected = snap.val() === true;
      if (pub.connected && pub.id && pub.sent) markConnected(fb, pub.id);
      report();
    });
  }

  function markConnected(fb, id) {
    const flag = fb.ref(`dirette/${id}/collegato`);
    fb.db.onDisconnect(flag).set(false).catch(() => {});
    fb.db.set(flag, true).catch(() => {});
  }

  // Chiude la diretta: chi guarda vede che è finita, con l'ultimo punteggio.
  function close(fb, id) {
    fb.db.onDisconnect(fb.ref(`dirette/${id}/collegato`)).cancel().catch(() => {});
    fb.db
      .update(fb.ref(`dirette/${id}`), { collegato: false, chiusa: true, aggiornata: fb.db.serverTimestamp() })
      .catch(() => {});
  }

  // La diretta intera, per la prima scrittura: toglie anche quello che nel database non c'è più.
  function wholeDocument(parts, creata, stamp) {
    const doc = { creata, aggiornata: stamp, collegato: true, chiusa: false, cronaca: {} };
    for (const [path, value] of Object.entries(parts)) {
      if (path.startsWith('cronaca/')) doc.cronaca[path.slice('cronaca/'.length)] = value;
      else doc[path] = value;
    }
    return doc;
  }

  async function flush() {
    const state = pub.getState();
    const id = state.live?.id ?? null;
    let fb;
    try {
      fb = await withAuth();
    } catch {
      return report(); // Firebase non si è scaricato: si riprova alla prossima modifica
    }
    watchConnection(fb);
    if (id !== pub.id) {
      if (pub.id) close(fb, pub.id);
      pub.id = id;
      pub.sent = null;
    }
    const user = fb.session.currentUser;
    pub.email = user?.email ?? null;
    pub.signedOut = Boolean(id) && !user;
    if (!id || !user) return report();
    const parts = Game.liveData(state, Date.now(), pub.offset);
    const stamp = fb.db.serverTimestamp();
    let write;
    if (!pub.sent) {
      write = fb.db.set(fb.ref(`dirette/${id}`), wholeDocument(parts, state.live.creata, stamp));
      write.then(() => pub.id === id && markConnected(fb, id), () => {});
    } else {
      const changes = Game.liveChanges(pub.sent, parts);
      if (Object.keys(changes).length === 0) return;
      write = fb.db.update(fb.ref(`dirette/${id}`), { ...changes, aggiornata: stamp });
    }
    pub.sent = parts;
    // senza rete la scrittura aspetta, e Firebase la manda da solo quando la rete torna
    write.catch(async (err) => {
      pub.sent = null;
      if (!denied(err)) return;
      const email = user.email;
      pub.id = null;
      await fb.auth.signOut(fb.session).catch(() => {});
      report({ denied: email, id });
    });
    report();
  }

  // ——— Chi guarda: la pagina diretta.html ———

  // Segue una diretta: onData riceve la diretta a ogni cambiamento (null se non c'è), onConnection la rete.
  // Dà la funzione con l'ora del server, per far scorrere il cronometro.
  async function watch(id, { onData, onConnection, onError }) {
    const fb = await firebase();
    let offset = 0;
    fb.db.onValue(fb.ref('.info/serverTimeOffset'), (snap) => {
      offset = snap.val() ?? 0;
    });
    fb.db.onValue(fb.ref('.info/connected'), (snap) => onConnection(snap.val() === true));
    fb.db.onValue(fb.ref(`dirette/${id}`), (snap) => onData(snap.val()), onError);
    return () => Date.now() + offset;
  }

  root.Live = { available, preload, start, link, init, changed, watch, ID_PATTERN };
})(window);
