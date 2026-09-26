# Tabellone Basket

Segnapunti per una partita di pallacanestro, da usare nel browser del computer o del telefono.
Una pagina sola, senza installare nulla e senza connessione.

## Come si apre

- **Dal computer:** scarica il repository e apri [index.html](index.html) con un doppio clic.
- **Online:** [https://gmarsico74-tech.github.io/Prova-sessione-Cloud/](https://gmarsico74-tech.github.io/Prova-sessione-Cloud/),
  pubblicato con GitHub Pages dal ramo main: si aggiorna da solo ogni volta che una modifica entra in main.

## Cosa fa

- **Punti** con +1, +2, +3 per ciascuna squadra; i nomi si cambiano toccandoli.
- **Cronometro** di 10 minuti per quarto e 5 per ogni tempo supplementare, con correzione di un secondo alla volta.
  Nell'ultimo minuto mostra secondi e decimi; a zero lampeggia e suona la sirena.
- **24 secondi** che scorrono e si fermano insieme al cronometro, con i pulsanti 24 e 14 per riportarli indietro.
  Allo scadere suona la sirena e il gioco si ferma; alla ripartenza tornano a 24.
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
- La partita **resta salvata** nel browser: ricaricando la pagina si riprende da dove si era.
- **Schermo intero** con il pulsante in alto a destra, comodo su un tablet a bordo campo; si esce con lo stesso
  pulsante o con Esc. Sull'iPhone il browser non lo permette e il pulsante non compare.

## Regole applicate (regolamento FIBA)

- I falli di squadra ripartono da zero a ogni quarto; quelli dei supplementari si sommano al quarto quarto.
- Timeout: 2 nel primo tempo, 3 nel secondo, 1 per ogni supplementare; quelli non usati si perdono.
- Al quinto fallo personale il giocatore esce.
- I 24 secondi si spengono quando al periodo restano meno secondi di quelli dell'azione.
  Il 14 serve dopo un rimbalzo offensivo o un fallo nella metà campo d'attacco.

## File

| File | Contenuto |
| --- | --- |
| [index.html](index.html) | La pagina |
| [style.css](style.css) | La grafica, anche per il telefono |
| [game.js](game.js) | Le regole e i calcoli, senza grafica |
| [app.js](app.js) | Collega i pulsanti della pagina alle regole |
| [tests/game.test.js](tests/game.test.js) | Test automatici delle regole |

## Test

Con Node.js 20 o successivo, dalla cartella del repository:

```
node --test
```
