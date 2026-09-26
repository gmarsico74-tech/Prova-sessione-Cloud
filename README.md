# Tabellone Basket

Segnapunti per una partita di pallacanestro, da usare nel browser del computer o del telefono.
Una pagina sola, senza installare nulla; la connessione serve solo per i comandi vocali con Chrome.

## Come si apre

- **Dal computer:** scarica il repository e apri [index.html](index.html) con un doppio clic.
- **Online:** [https://gmarsico74-tech.github.io/Prova-sessione-Cloud/](https://gmarsico74-tech.github.io/Prova-sessione-Cloud/),
  pubblicato con GitHub Pages dal ramo main: si aggiorna da solo ogni volta che una modifica entra in main.

## Cosa fa

- **Punti** con +1, +2, +3 per ciascuna squadra; i nomi si cambiano toccandoli.
- **Cronometro** di 10 minuti per quarto e 5 per ogni tempo supplementare, con correzione di un secondo alla volta.
  Nell'ultimo minuto mostra secondi e decimi; a zero lampeggia e suona la sirena.
- **24 secondi**, facoltativi: si accendono in Impostazioni e di base sono spenti, perché nelle giovanili spesso il
  tabellone dei 24 non c'è. Accesi, scorrono e si fermano insieme al cronometro, con i pulsanti 24 e 14 per riportarli
  indietro; allo scadere suona la sirena e il gioco si ferma; alla ripartenza tornano a 24.
- **Falli di squadra** per periodo, con l'avviso BONUS dal quinto fallo.
- **Timeout** rimasti a ciascuna squadra.
- **Cronaca** di tutte le azioni con periodo, tempo e punteggio.
- **Annulla** l'ultima azione, anche con Ctrl+Z; la barra spaziatrice avvia e ferma il cronometro.
- **Correggi**, in ogni squadra: per una sola azione trasforma i pulsanti + in −1, −2, −3 e − Fallo, così si rimedia
  anche a un errore di qualche minuto prima (un +2 che era un +3, un fallo dato alla persona sbagliata).
  I punti non scendono mai sotto zero e un fallo tolto conta nel periodo in cui era stato fischiato.
- **Punti e falli ai giocatori**, da accendere in Impostazioni in fondo alla pagina. Per ogni squadra si inseriscono
  i numeri di maglia, da 0 a 99, al massimo 12 (16 se si spunta «Amichevole»), e se si vuole il nome del giocatore,
  che si può scrivere o cambiare anche dopo. Accanto a ogni numero ci sono +1, +2, +3 e F; i punti dei giocatori
  fanno il punteggio della squadra e i loro falli i falli di squadra. Il pulsante F mostra i falli presi (F1, F2…):
  al quinto diventa rosso, il numero del giocatore si colora di rosso e i suoi pulsanti dei punti si spengono.
  Si toglie dall'elenco solo un giocatore senza punti né falli.
  Spenta l'opzione, il tabellone torna come prima, con gli stessi punti.
- **Squadre salvate**: in Impostazioni ogni squadra ha il campo «Nome squadra» (lo stesso nome che compare in alto
  nel tabellone) e «Salva squadra» conserva nome, numeri e nomi dei giocatori. Nell'elenco «Squadre salvate» ogni
  squadra ha quattro pulsanti: «In casa» e «Ospite» la richiamano, finché i giocatori in campo non hanno ancora
  punti o falli; «Modifica» la apre nel riquadro della squadra di casa, dove si cambiano nome e giocatori e
  «Salva squadra» la aggiorna (se il nome è cambiato chiede se rinominarla o salvarne una copia); «Elimina» la toglie. Le squadre restano salvate nel browser del dispositivo su cui le salvi;
  per portarle su un altro, «Invia squadre» crea un link con tutte le squadre salvate (numeri e nomi compresi):
  aperto sull'altro dispositivo, il tabellone chiede conferma e le aggiunge, sostituendo quelle con lo stesso nome.
  Dalla pagina aperta come file il link punta comunque al sito online.
- **Comandi vocali**, da accendere in Impostazioni (accendono anche i giocatori). In fondo allo schermo restano due
  pulsanti grandi: il cronometro e il microfono. Si tiene premuto il microfono, si parla, si lascia: il tabellone esegue
  il comando e lo conferma con un bip acuto, o con due bip bassi e il motivo scritto se non ha capito, e sul telefono
  Android anche con una vibrazione. Si dicono canestri e falli: «canestro del 25», «canestro da 3 del 25 PC52»,
  «tripla di Rossi», «tiro libero del 7», «2 liberi del 7 ospiti», «fallo del 12», «canestro da 2 ospiti» (alla squadra,
  senza giocatore), «annulla». Il canestro senza valore vale 2; il giocatore si dice con il numero o con il nome.
  La squadra si dice con il suo nome, oppure «casa» e «ospiti», e serve solo se il numero c'è in tutte e due le squadre
  o se non c'è ancora: allora il giocatore viene aggiunto (e «annulla» lo toglie di nuovo). Tiri sbagliati, rimbalzi,
  assist, palle recuperate e perse, stoppate e falli subiti vengono riconosciuti ma non ancora segnati: arriveranno
  con lo scout. Con un telecomando Bluetooth per presentazioni o per selfie il microfono si tiene premuto anche con
  i tasti Invio o Pagina giù, e Pagina su avvia e ferma il cronometro.
  Funziona con Chrome su Android (che capisce la voce via internet) e con Safari su iPhone e iPad;
  la prima volta il browser chiede il permesso di usare il microfono.
- **Tabellino**: i punti di ogni periodo e, per ogni giocatore, punti, tiri liberi segnati (TL), canestri da 2 (T2),
  canestri da 3 (T3) e falli, con una riga per quello segnato alla squadra senza giocatore. «Pubblica tabellino» crea
  un link alla pagina [tabellino.html](tabellino.html) che chiunque può aprire, per esempio dal gruppo WhatsApp:
  mostra il tabellino com'è in quel momento, con giorno e stato della partita («Q3 4:12», «Fine Q2», «Finale»).
- **File per il video**: scarica un file con tutte le azioni, gli avvii e le fermate del cronometro e il tabellino alla
  fine di ogni periodo, ciascuno con l'ora vera, da dare al montatore insieme al video della partita (vedi sotto).
- La partita **resta salvata** nel browser: ricaricando la pagina si riprende da dove si era.
- **Schermo intero** con il pulsante in alto a destra, comodo su un tablet a bordo campo; si esce con lo stesso
  pulsante o con Esc. Sull'iPhone il browser non lo permette e il pulsante non compare.

## Regole applicate (regolamento FIBA)

- I falli di squadra ripartono da zero a ogni quarto; quelli dei supplementari si sommano al quarto quarto.
- Timeout: 2 nel primo tempo, 3 nel secondo, 1 per ogni supplementare; quelli non usati si perdono.
- Al quinto fallo personale il giocatore esce.
- I 24 secondi si spengono quando al periodo restano meno secondi di quelli dell'azione.
  Il 14 serve dopo un rimbalzo offensivo o un fallo nella metà campo d'attacco.

## Il file per il video

«File per il video» scarica `partita_<casa>_<ospiti>_<giorno>.json`, testo in formato JSON con:

- `squadre`: nome e giocatori (numero e nome) di casa e ospiti;
- `cronometro`: ogni avvio e fermata, con il motivo quando c'è (fine periodo, timeout, 24 secondi);
- `azioni`: canestri, falli e timeout con periodo, tempo, squadra, numero e nome del giocatore, punteggio dopo l'azione
  e la `scritta` pronta per la sovrimpressione («Canestro da 2 · #25 Rossi», «Fallo · #7 Bianchi (3°)»).
  Le azioni corrette con «Correggi» non ci sono;
- `fine_periodi`: per ogni periodo finito, l'ora della sirena, il punteggio e il tabellino fino a quel momento;
- `tabellino`: il tabellino al momento in cui si scarica il file.

Ogni voce ha l'ora vera in due forme: `ora` leggibile e `ms`, millisecondi dal 1970, comodi per i calcoli.
Il primo avvio del cronometro è la palla a due: se nel girato la palla a due cade al secondo P, un momento del file
si trova al secondo P + (ms − ms del primo avvio) / 1000. Con i comandi vocali l'ora di un'azione è quella in cui si
è premuto il microfono, quindi un paio di secondi dopo il canestro vero.

## File

| File | Contenuto |
| --- | --- |
| [index.html](index.html) | La pagina |
| [tabellino.html](tabellino.html) | La pagina del tabellino pubblicato con un link |
| [style.css](style.css) | La grafica, anche per il telefono |
| [game.js](game.js) | Le regole e i calcoli, senza grafica: tabellino, file per il video, comandi vocali |
| [app.js](app.js) | Collega i pulsanti della pagina alle regole |
| [voice.js](voice.js) | Il microfono a pulsante: ascolta finché lo si tiene premuto |
| [tabellino.js](tabellino.js) | Disegna il tabellino, nel tabellone e nella pagina pubblicata |
| [tests/game.test.js](tests/game.test.js) | Test automatici delle regole |

## Test

Con Node.js 20 o successivo, dalla cartella del repository:

```
node --test
```
