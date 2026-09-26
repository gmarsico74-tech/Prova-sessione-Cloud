# Tabellone Basket

Segnapunti per una partita di pallacanestro, da usare nel browser del computer o del telefono.
Una pagina sola, senza installare nulla e senza connessione.

## Come si apre

- **Dal computer:** scarica il repository e apri [index.html](index.html) con un doppio clic.
- **Online:** attiva GitHub Pages nelle impostazioni del repository (Settings → Pages → branch principale, cartella `/`)
  e la pagina sarà raggiungibile all'indirizzo che GitHub indica lì.

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
- La partita **resta salvata** nel browser: ricaricando la pagina si riprende da dove si era.
- **Schermo intero** con il pulsante in alto a destra, comodo su un tablet a bordo campo; si esce con lo stesso
  pulsante o con Esc. Sull'iPhone il browser non lo permette e il pulsante non compare.

## Regole applicate (regolamento FIBA)

- I falli di squadra ripartono da zero a ogni quarto; quelli dei supplementari si sommano al quarto quarto.
- Timeout: 2 nel primo tempo, 3 nel secondo, 1 per ogni supplementare; quelli non usati si perdono.
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
