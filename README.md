# Tabellone Basket

Segnapunti per una partita di pallacanestro, da usare nel browser del computer o del telefono.
Una pagina sola, senza installare nulla; la connessione serve solo per i comandi vocali con Chrome e per la diretta.

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
- **Annulla** l'ultima azione (o tutte quelle dell'ultimo comando a voce), anche con Ctrl+Z; la barra spaziatrice
  avvia e ferma il cronometro.
- **Correggi**, in ogni squadra: per una sola azione trasforma i pulsanti + in −1, −2, −3 e − Fallo, così si rimedia
  anche a un errore di qualche minuto prima (un +2 che era un +3, un fallo dato alla persona sbagliata).
  I punti non scendono mai sotto zero e un fallo tolto conta nel periodo in cui era stato fischiato.
- **Punti e falli ai giocatori**, da accendere in Impostazioni in fondo alla pagina. Per ogni squadra si inseriscono
  i numeri di maglia, da 0 a 99 e 00 (che resta diverso da 0; a voce «doppio zero»), al massimo 12 (16 se si spunta «Amichevole»), e se si vuole il nome del giocatore,
  che si può scrivere o cambiare anche dopo. Accanto a ogni numero ci sono +1, +2, +3 e F; i punti dei giocatori
  fanno il punteggio della squadra e i loro falli i falli di squadra. Il pulsante F mostra i falli presi (F1, F2…):
  al quinto diventa rosso, il numero del giocatore si colora di rosso e i suoi pulsanti dei punti si spengono.
  Si toglie dall'elenco solo un giocatore senza punti né falli.
  Spenta l'opzione, il tabellone torna come prima, con gli stessi punti.
- **Colore delle maglie**: in Impostazioni ogni squadra ha il campo «Colore maglia», che compare sotto il nome nel
  tabellone. Nei comandi vocali il colore vale come il nome della squadra in tutte le sue forme: scritto «bianco»,
  «bianchi» o «maglia bianca», a voce vale bianco, bianca, bianchi e bianche; con due colori («bianco e rosso») basta
  dirne uno. Se si dice un colore che non è di nessuna squadra, il tabellone lo dice e spiega dove scriverlo. Se il colore è anche il cognome di un giocatore (Bianchi, Rossi), vale come
  colore solo accanto a un numero: «il 12 dei bianchi» è la squadra, «assist di Bianchi» è il giocatore.
- **Squadre salvate**: in Impostazioni ogni squadra ha il campo «Nome squadra» (lo stesso nome che compare in alto
  nel tabellone) e «Salva squadra» conserva nome, colore della maglia, numeri e nomi dei giocatori. Nell'elenco «Squadre salvate» ogni
  squadra ha quattro pulsanti: «In casa» e «Ospite» la richiamano, finché i giocatori in campo non hanno ancora
  punti o falli; «Modifica» la apre nel riquadro della squadra di casa, dove si cambiano nome e giocatori e
  «Salva squadra» la aggiorna (se il nome è cambiato chiede se rinominarla o salvarne una copia); «Elimina» la toglie. Le squadre restano salvate nel browser del dispositivo su cui le salvi;
  per portarle su un altro, «Invia squadre» crea un link con tutte le squadre salvate (numeri e nomi compresi):
  aperto sull'altro dispositivo, il tabellone chiede conferma e le aggiunge, sostituendo quelle con lo stesso nome.
  Dalla pagina aperta come file il link punta comunque al sito online.
- **Importa partita**, in cima alle Impostazioni: prima di cominciare a segnare legge un file e precompila la
  partita. Prende il giorno, i dati della gara (campionato, giornata, numero gara, campo, orario), le due squadre
  con il colore della maglia e tutti i giocatori con numero e nome, e accende «Punti e falli ai giocatori». Le due
  squadre finiscono anche fra le «Squadre salvate», per richiamarle nelle partite dopo; una squadra salvata con lo
  stesso nome viene aggiornata con i giocatori del file (il tabellone lo dice prima di farlo). Con più di 12
  giocatori in una squadra spunta da solo «Amichevole» (al massimo 16). Legge la scheda della partita, il file
  che Claude prepara dal referto o dalla convocazione (vedi [La scheda della partita](#la-scheda-della-partita)),
  oppure un «File della partita» già scaricato, di cui prende squadre, giocatori e dati e lascia le azioni. Se
  nella partita ci sono già azioni non importa niente: prima si preme «Nuova partita».
- **Dati della partita**, in Impostazioni sotto «Importa partita»: giorno, orario, campionato, giornata, numero gara
  e campo, che si scrivono anche a mano. Finiscono nel file della partita e nell'archivio; «Nuova partita» li svuota,
  perché ogni partita ha i suoi.
- **Comandi vocali**, da accendere in Impostazioni (accendono anche i giocatori). In fondo allo schermo restano due
  pulsanti grandi: il cronometro e il microfono. Si tiene premuto il microfono, si parla, si lascia: finché il dito è giù
  il microfono ascolta, anche con le pause (se il riconoscimento si ferma da solo, riparte e la frase resta una).
  Il tabellone esegue il comando e lo conferma con un bip acuto, o con due bip bassi e il motivo scritto se non ha
  capito, e sul telefono Android anche con una vibrazione. Si dicono:
  - canestri: «canestro del 25», «canestro da 3 del 25 PC52», «tripla di Rossi», «tiro libero del 7», «2 liberi del 7
    ospiti», «canestro da 2 ospiti» (alla squadra, senza giocatore);
  - lo scout: «tiro sbagliato del 25», «tripla sbagliata del 4», «tiro libero sbagliato del 7», «rimbalzo in difesa del
    12», «rimbalzo offensivo del 4», «assist del 9», «palla recuperata dal 32», «palla persa del 23», «stoppata del 12»,
    «4 stoppato», «fallo del 12», «fallo subito dal 25»;
  - più azioni in un comando, con un tempo solo: «palla persa del 23, recuperata dal 32», «canestro del 4, assist del
    25», «fallo del 12 sul 25» (il 25 subisce), «stoppata del 12 sul 4» o «sul tiro del 4» (il 4 è stoppato),
    «tiro sbagliato del 25, rimbalzo del 12». Ogni azione prende il giocatore detto subito dopo di lei, o quello
    detto prima se dopo non c'è. Fallo e stoppata contano per tutti e due: falli fatti e subiti, stoppate date e
    subite (la stoppata subita è anche un tiro sbagliato, da 2 se non si dice «da 3»);
  - con il colore della maglia al posto del nome della squadra: «numero 12 bianco, tiro da 3 sbagliato», «fallo del 15
    bianco sul 12 blu», «stoppata del 24 bianco sul tiro del 3 blu»;
  - con il verbo, quando la frase comincia con un giocatore: «il 24 bianco stoppa il tiro del 15 blu», «il 15 blu
    stoppato dal 24 bianco», «il 6 blu subisce fallo dal 4 bianco»: il giocatore detto prima è quello del verbo,
    l'altro fa la parte opposta. Se le due parti risultano della stessa squadra, o se si dice un colore che non è
    di nessuna squadra, il comando non si registra e il tabellone dice perché;
  - chi è in campo: «quintetto 4 7 9 12 25 PC52 inizio del primo quarto», e i cambi «entra il 12, esce il 7», anche più
    di uno insieme: «entrano 12 e 14, escono 7 e 9»;
  - «annulla», che toglie tutte le azioni dell'ultimo comando.

  Il canestro e il tiro sbagliato senza valore sono da 2; il giocatore si dice con il numero o con il nome. La squadra
  si dice con il suo nome (basta anche una parola che l'altra non ha), con il colore della maglia, oppure «casa» e
  «ospiti», e serve solo se il
  numero c'è in tutte e due le squadre o se non c'è ancora: allora il giocatore viene aggiunto, e «annulla» lo toglie
  di nuovo. Nei comandi con più azioni la squadra si ricava da sola: chi recupera, chi subisce il fallo e chi è stoppato
  sono dell'altra squadra, chi fa assist della stessa di chi segna. In un cambio la squadra si capisce da chi esce.
  Il rimbalzo senza «attacco» o «difesa» si capisce dal tiro sbagliato di prima. Chi ha 5 falli non può più fare
  niente. Un comando non capito resta nella cronaca, in grigio, con la frase sentita e il motivo, e finisce anche nel
  file della partita: così non si perde niente.

  Funziona con Chrome su Android (che capisce la voce via internet), con Safari su iPhone e iPad e con Chrome o Safari
  sul Mac; la prima volta il browser chiede il permesso di usare il microfono. Con i comandi vocali lo schermo del
  telefono resta acceso.
- **Tasti e telecomandi**, con i comandi vocali accesi. Sul Mac il tasto Option (alt) tenuto giù apre il microfono e la
  barra spaziatrice avvia e ferma il cronometro; il tasto fn non si può usare, perché il Mac non lo passa alle pagine
  web, e i tasti arrivano solo alla finestra in primo piano. Con un telecomando Bluetooth per presentazioni o volta
  pagina un tasto apre il microfono (Pagina giù, freccia destra o giù, Invio) e l'altro avvia e ferma il cronometro
  (Pagina su, freccia sinistra o su). Se il telecomando non tiene il tasto premuto ma lo manda e lo lascia subito,
  si preme una volta per aprire il microfono e una volta per chiuderlo.
- **Video della partita dentro il tabellone**, per segnare una partita guardando il video: il pulsante «▶ Video» in
  alto apre un file dal dispositivo (per esempio il girato della telecamera) e lo mostra grande sopra il tabellone.
  Tutto sta in una finestra sola, quindi i tasti funzionano sempre: la barra spaziatrice avvia e ferma il video (il
  cronometro del tabellone si comanda con il suo pulsante), le frecce destra e sinistra lo spostano di 5 secondi
  (1 con Maiusc), Option tenuto giù apre il microfono. Per vederlo più grande si usa lo schermo intero del tabellone,
  il pulsante in alto a destra, e non quello del video, che nasconderebbe la barra del microfono. Con «Pausa mentre
  parli» il video si ferma mentre si tiene premuto il microfono e riparte al rilascio, così la voce non si mescola
  al suo audio. Il cronometro del tabellone segue il video: quando il video si ferma (con la barra spaziatrice, con
  i suoi comandi o mentre si parla) si ferma anche il cronometro, che riparte da solo quando riparte il video; nel
  frattempo le cifre restano più chiare. Il cronometro in gioco si sposta anche come il video, con le frecce, toccando
  un'azione nella cronaca o con la barra del video: 5 secondi indietro nel video sono 5 secondi in più sul
  cronometro, senza passare l'inizio del periodo; tornando avanti dove si era, torna anche lui dov'era. I 24 secondi
  si spostano solo se restano fra 0 e 24. Ai fischi il cronometro si ferma a mano, come in partita, e da fermo
  nessuno spostamento del video lo tocca; a video fermo «Avvia» lo prepara a partire insieme al video. Ogni azione, detta o segnata con i pulsanti, ricorda anche il punto del video: nella cronaca basta
  toccarla per rivederla (il video torna a 3 secondi prima), e nel file della partita c'è `secondi_video`, che il
  montatore può usare senza leggere il tabellone inquadrato. Chiusa la pagina, il tabellone ricorda il video e il
  punto a cui si era arrivati: riaprendo lo stesso file si riparte da lì. Con Chrome i video .MOV dell'iPhone a volte
  non si vedono: in quel caso si usa Safari.
- **Il tempo delle azioni** è sempre quello del tabellone, periodo e minuti, mai l'ora del giorno. In Impostazioni
  si sceglie da dove viene:
  - **dal cronometro di questo tabellone**: si avvia e si ferma il cronometro, e ogni azione prende il tempo che
    segnava quando si è premuto il microfono;
  - **detto a voce**, leggendo il tabellone della partita o del video: il cronometro qui resta fermo e ogni comando
    dice anche il tempo, per esempio «tiro da 3 di Marsico, 2 minuti e 26 secondi del terzo quarto». Serve per le
    partite segnate dal vivo senza cronometro e per quelle segnate a casa guardando il video. Il tabellone mostra il
    punto più avanti a cui si è arrivati, così falli di squadra, bonus e timeout sono quelli del periodo giusto.

  Il tempo si dice così: «2 minuti e 26 secondi del terzo quarto», «terzo quarto, 2 e 26», «al 2 e 26», «45 secondi»,
  «inizio del secondo quarto», «primo supplementare». Il periodo si può lasciare fuori: vale quello del tabellone.
  Anche con il tempo dal cronometro si può dire un tempo, e allora vale quello detto.
- **Minuti in campo**: si contano dal primo quintetto detto, con i cambi; chi è in campo alla fine di un periodo si
  intende in campo anche all'inizio del successivo, finché non si dice un cambio o un nuovo quintetto. Chi è in campo
  ha il numero in verde.
- **Tabellino**: i punti di ogni periodo e, per ogni giocatore, minuti (MIN, se è stato detto il quintetto), punti
  (PT), tiri liberi segnati (TL), canestri da 2 (T2), canestri da 3 (T3) e falli (F), con una riga per quello segnato
  alla squadra senza giocatore. «Pubblica tabellino» crea un link alla pagina [tabellino.html](tabellino.html) che
  chiunque può aprire, per esempio dal gruppo WhatsApp: mostra il tabellino com'è in quel momento, con il giorno della
  partita (si cambia in Impostazioni, se non è oggi) e il punto della partita («Q3 4:12», «Fine Q2», «Finale»).
- **Archivio e statistiche**: «Salva nell'archivio» conserva la partita su questo dispositivo (salvarla di nuovo la
  aggiorna); il pulsante «Statistiche» apre la pagina [statistiche.html](statistiche.html), dove ci sono:
  - l'elenco delle partite dell'archivio, con giorno, campionato, giornata, numero gara e campo, «Aggiungi file» per quelle scaricate su un altro dispositivo e
    «Scarica l'archivio» per portarlo altrove o tenerne una copia;
  - il tabellino di una partita con tutto lo scout: minuti, punti, tiri da 2, da 3 e liberi segnati/tentati, rimbalzi
    in attacco, in difesa e totali, assist, palle recuperate e perse, stoppate date e subite, falli fatti e subiti,
    più/meno e valutazione FIBA;
  - le statistiche di una squadra in un periodo a scelta (dal giorno… al giorno…) e, se si vuole, di un solo
    campionato (quello scritto nei dati della partita; le partite senza campionato compaiono solo con «Tutti»): vinte e perse, punti fatti e
    subiti, e per ogni giocatore partite giocate, medie a partita o totali, percentuali di tiro; «Scarica per Excel»
    salva la tabella in un file che Excel apre direttamente.

  La valutazione è quella FIBA: punti − tiri sbagliati (liberi compresi) + rimbalzi + assist − palle perse + palle
  recuperate + stoppate. Il più/meno e i minuti si contano dal primo quintetto detto. Nelle statistiche un giocatore
  si riconosce dal numero di maglia dentro la sua squadra, e il nome è l'ultimo usato.
- **File della partita**: scarica un file con tutte le azioni, lo scout, i quintetti e i cambi, il tabellino alla fine
  di ogni periodo e i comandi non registrati, tutto agganciato al tempo del tabellone: serve al montatore insieme al
  video della partita e alle statistiche su un altro dispositivo (vedi sotto).
- **Diretta online**: «Avvia diretta», sotto il tabellino, crea il link di una pagina ([diretta.html](diretta.html))
  che chiunque apre dal telefono per seguire la partita mentre la segni: punteggio, periodo, tempo che scorre,
  falli di squadra con il BONUS, timeout rimasti, la cronaca (canestri, falli, timeout, quintetti e cambi, con
  numeri e nomi) e il tabellino dei giocatori. Il link lo mandi nel gruppo con «Link della diretta» o toccando il
  segnale «● DIRETTA» sopra il cronometro; ogni partita ha il suo, che a fine partita resta con il risultato.
  La prima volta il tabellone chiede di entrare con Google, e la diretta la scrive solo l'account autorizzato;
  funziona dal tabellone online, non da quello aperto come file. Senza rete il segnale diventa grigio e chi guarda
  legge che il tabellone non è collegato: quello che segni intanto arriva appena la rete torna. «Ferma diretta» la
  chiude, e «Nuova partita» chiude quella della partita di prima. Con il tempo detto a voce la pagina mostra il
  tempo dell'ultima azione.
- **Video della diretta con YouTube Live**: se riprendi la partita con il telefono in diretta su YouTube (anche «Non
  in elenco»), incolla il link del video, quello che dà «Condividi», nel campo «Video della diretta» sotto i pulsanti
  della diretta. La pagina della diretta mostra il video sopra il punteggio, e punteggio, tempo e cronaca aspettano i
  secondi scritti in «Ritardo del video», perché non cambino prima che nel video si veda il canestro. Chi guarda
  può aggiustare il ritardo sul suo telefono con «−1 s» e «+1 s»; se il video nella pagina non parte, c'è il link
  per aprirlo su YouTube. Dal telefono YouTube va sempre a bassa latenza, di solito meno di 10 secondi: per
  misurarla, apri la diretta di YouTube su un altro telefono a bordo campo e conta i secondi fra un fischio e lo
  stesso fischio nel video. «Nuova partita» toglie il link, perché ogni partita ha la sua diretta su YouTube, e
  tiene i secondi di ritardo.
- **Schermo intero** con il pulsante in alto a destra, comodo su un tablet a bordo campo; si esce con lo stesso
  pulsante o con Esc. Sull'iPhone il browser non lo permette e il pulsante non compare.

## Regole applicate (regolamento FIBA)

- I falli di squadra ripartono da zero a ogni quarto; quelli dei supplementari si sommano al quarto quarto.
- Timeout: 2 nel primo tempo, 3 nel secondo, 1 per ogni supplementare; quelli non usati si perdono.
- Al quinto fallo personale il giocatore esce.
- I 24 secondi si spengono quando al periodo restano meno secondi di quelli dell'azione.
  Il 14 serve dopo un rimbalzo offensivo o un fallo nella metà campo d'attacco.

## Il file della partita

«File della partita» scarica `partita_<casa>_<ospiti>_<giorno>.json`, testo in formato JSON con:

- `partita`, solo se sono stati scritti: i dati della gara, con gli stessi nomi della scheda della partita
  (`campionato`, `giornata`, `gara`, `campo`, `ora`), così il file si reimporta com'è con «Importa partita»;
- `squadre`: nome, colore e giocatori (numero e nome) di casa e ospiti. Il numero è un numero, tranne «00», che
  è scritto come testo (`"00"`) per restare diverso da `0`, anche nelle azioni e nel tabellino;
- `azioni`, in ordine di tempo: canestri, tiri sbagliati, rimbalzi, assist, palle recuperate e perse, stoppate, falli
  fatti e subiti, timeout, quintetti e cambi, con squadra, numero e nome del giocatore, punteggio dopo l'azione e la
  `scritta` pronta per la sovrimpressione («Canestro da 2 · #25 Rossi», «Fallo · #7 Bianchi (3°)»,
  «Entra #14 Gialli · esce #7 Bianchi»). Le azioni corrette con «Correggi» non ci sono;
- `fine_periodi`: per ogni periodo finito, il punteggio e il tabellino completo fino a quel momento;
- `tabellino`: il tabellino completo al momento in cui si scarica il file, con minuti, più/meno e valutazione;
- `non_registrati`: i comandi a voce non capiti, con la frase sentita e il motivo;
- `video`: il nome del file del video aperto nel tabellone, se la partita è stata segnata guardandolo; in quel caso
  ogni azione ha anche `secondi_video`, il punto del video in cui è stata detta o segnata;
- `dati`: i dati grezzi della partita, da cui la pagina delle statistiche ricalcola tutto; i dati della gara
  sono in `dati.match` (`league`, `round`, `number`, `venue`, `time`), da cui le statistiche filtrano il campionato.

I campi `partita` e `dati.match` sono facoltativi: un file senza, come quelli scaricati prima, si legge come sempre.

Ogni voce è agganciata al tempo del tabellone, non all'ora: `periodo` («Q3»), `numero_periodo` (3), `tempo` come si
legge sul tabellone («2:26», e nell'ultimo minuto «45.3») e `ms_restanti`, i millisecondi che mancano alla fine del
periodo. Nel video un'azione si ritrova leggendo il tabellone inquadrato; la fine di ogni periodo è a 0:00.

## La scheda della partita

È il file che «Importa partita» legge per precompilare la partita: un JSON semplice, da scrivere con qualsiasi
editor di testo e salvare con estensione `.json`. Lo prepara Claude dal referto elettronico FIP (PDF) o dalla
convocazione; si può anche scrivere a mano.

```json
{
 "formato": "tabellone-basket-scheda", "versione": 1,
 "partita": {"giorno": "2026-10-04", "ora": "18:00", "campionato": "DR1", "giornata": "1a andata", "gara": "693", "campo": "Castelfranco Veneto"},
 "casa":   {"nome": "PC52", "colore": "blu", "giocatori": [{"numero": 6, "nome": "Viero Alessandro"}]},
 "ospiti": {"nome": "Mogliano", "colore": "bianca", "giocatori": [{"numero": 34, "nome": "Prencipe"}]}
}
```

Come si compila:

- `formato` e `versione` vanno scritti così, sempre uguali;
- `partita`: tutti i campi sono facoltativi. `giorno` come `2026-10-04` (va bene anche `4/10/2026`), `ora` come
  `18:00` (anche `18.00`), `campionato` com'è nel referto («DR1»: è il nome con cui le statistiche filtrano, quindi
  conviene scriverlo sempre uguale), `giornata` («1a giornata andata»), `gara` il numero di gara del referto, `campo`
  la palestra o il paese. Senza `giorno` resta quello scritto in Impostazioni;
- `casa` e `ospiti`: `nome` è il nome corto che compare sul tabellone (al massimo 14 caratteri, per esempio
  «Mogliano» e non «Pol. Mogliano Veneto»; con lo stesso nome la squadra salvata viene aggiornata), `colore` il
  colore della maglia (facoltativo, vale anche nei comandi vocali), `giocatori` l'elenco con `numero` e `nome`;
- `numero` da 0 a 99, scritto come numero (`6`) o come testo (`"6"`); il doppio zero si scrive `"00"`, fra
  virgolette, e resta diverso da `0`. Ogni numero una volta sola per squadra. Al massimo 16 giocatori per squadra;
  oltre i 12 il tabellone spunta «Amichevole»;
- `nome` al massimo 20 caratteri, quello che si vuole vedere nella cronaca e nelle scritte del video: nel referto FIP
  è «Cognome Nome» e così si può lasciare. Per i comandi vocali conta che il cognome sia una parola che si dice
  (con due giocatori dallo stesso cognome a voce si usa il numero). Il nome si può lasciare vuoto (`""`).

Dal referto elettronico FIP: in alto ci sono campionato, giornata, numero gara, data, ora e campo; nelle due
tabelle delle squadre, per ogni giocatore, numero di maglia e «Cognome Nome». Il capitano («(cap.)») e gli
allenatori non servono. Il colore delle maglie nel referto non c'è: si prende dalla convocazione o lo si chiede.

L'esempio vero, la partita PC52 – Mogliano 80-70 del 4 ottobre 2026, è nel file
[esempi/scheda_pc52_mogliano_2026-10-04.json](esempi/scheda_pc52_mogliano_2026-10-04.json):

```json
{
 "formato": "tabellone-basket-scheda",
 "versione": 1,
 "partita": {
  "giorno": "2026-10-04",
  "campionato": "DR1",
  "giornata": "1a giornata andata",
  "gara": "693",
  "campo": "Castelfranco Veneto"
 },
 "casa": {
  "nome": "PC52",
  "colore": "blu",
  "giocatori": [
   {"numero": 0, "nome": "Cappelletto Marco"},
   {"numero": 5, "nome": "Brustolon Marco"},
   {"numero": 6, "nome": "Viero Alessandro"},
   {"numero": 8, "nome": "Sabetta Giulio"},
   {"numero": 9, "nome": "Cuzzit Gianluca"},
   {"numero": 13, "nome": "Marino Andrea"},
   {"numero": 20, "nome": "Toniato Luca"},
   {"numero": 21, "nome": "Marcon Michele"},
   {"numero": 22, "nome": "Scapinello Pietro"},
   {"numero": 25, "nome": "Sartor Mario"},
   {"numero": 31, "nome": "Garatti Gabriele"},
   {"numero": 33, "nome": "Ferrara Edoardo"}
  ]
 },
 "ospiti": {
  "nome": "Mogliano",
  "colore": "bianca",
  "giocatori": [
   {"numero": 0, "nome": "Manente"},
   {"numero": 5, "nome": "R. Gambato"},
   {"numero": 9, "nome": "Bertotto"},
   {"numero": 10, "nome": "Scaramuzza"},
   {"numero": 11, "nome": "Negrin"},
   {"numero": 14, "nome": "Pavan"},
   {"numero": 18, "nome": "De Cicco"},
   {"numero": 21, "nome": "Rinaldi"},
   {"numero": 23, "nome": "Pellegrinon"},
   {"numero": 33, "nome": "Pranzo"},
   {"numero": 34, "nome": "Prencipe"},
   {"numero": 77, "nome": "A. Gambato"}
  ]
 }
}
```

## La diretta con Firebase

La diretta sta in un database Realtime Database di Firebase, piano gratuito Spark: fino a 100 persone collegate
insieme e 10 GB scaricati al mese (una partita seguita da 100 persone ne usa circa 10 MB). Il tabellone manda solo
quello che cambia, a pezzi, sotto `dirette/<codice della diretta>`:

- `stato`: nomi e colori delle squadre, punti, falli del periodo, timeout rimasti, periodo e cronometro. Il
  cronometro viaggia come tempo che resta (`ms`), se corre (`in_corsa`) e l'istante in cui lo si è letto (`alle`,
  nell'ora del server Firebase): la pagina di chi guarda lo fa scorrere da sola;
- `cronaca`: un'azione per chiave (`a0`, `a1`…, la sua posizione fra le azioni del tabellone), con periodo, tempo,
  squadra, la stessa `scritta` del file della partita e il punteggio dopo l'azione;
- `tabellino`: il tabellino nel formato del link di [tabellino.html](tabellino.html);
- `video`, solo se nel tabellone c'è il link di YouTube: il codice del video (`youtube`) e i secondi di ritardo
  (`ritardo`). La pagina di chi guarda tiene le versioni della diretta arrivate negli ultimi secondi e mostra
  quella di `ritardo` secondi fa, cronometro compreso;
- `collegato` (falso da solo quando il tabellone perde la rete o si chiude), `chiusa`, `creata` e `aggiornata`.

Chi può scrivere lo decidono le regole in [database.rules.json](database.rules.json): ogni diretta si legge solo
conoscendone il codice (l'elenco non si legge) e la scrive solo l'account Google autorizzato. I dati del progetto
in [live.js](live.js) non sono segreti: stanno in ogni pagina che usa Firebase.

**Prova sul computer, con l'emulatore di Firebase** (serve Java e `npm i -g firebase-tools`): dalla cartella del
repository `firebase emulators:start --only auth,database --project demo-tabellone` e, in un'altra finestra,
`python3 -m http.server 8000`; poi si apre il tabellone su
[http://localhost:8000/?emulatore](http://localhost:8000/?emulatore). Con `?emulatore` il tabellone usa l'emulatore
al posto del progetto vero (solo da localhost), anche nel link della diretta, e la finestra di Google è quella finta
dell'emulatore, dove si inventa un account.

## File

| File | Contenuto |
| --- | --- |
| [index.html](index.html) | La pagina |
| [tabellino.html](tabellino.html) | La pagina del tabellino pubblicato con un link |
| [statistiche.html](statistiche.html) | La pagina dell'archivio e delle statistiche della stagione |
| [statistiche.js](statistiche.js) | Archivio, tabellino con lo scout e statistiche della stagione nella pagina |
| [style.css](style.css) | La grafica, anche per il telefono |
| [game.js](game.js) | Le regole e i calcoli, senza grafica: tabellino e scout, file della partita, importazione della scheda, archivio e statistiche, comandi vocali, cosa pubblicare nella diretta |
| [app.js](app.js) | Collega i pulsanti della pagina alle regole |
| [voice.js](voice.js) | Il microfono a pulsante: ascolta finché lo si tiene premuto |
| [tests/voice.test.js](tests/voice.test.js) | Test automatici del microfono a pulsante |
| [tabellino.js](tabellino.js) | Disegna il tabellino, nel tabellone e nella pagina pubblicata |
| [diretta.html](diretta.html) | La pagina della diretta, per chi segue la partita |
| [diretta.js](diretta.js) | Mostra la diretta con il video di YouTube, fa scorrere il cronometro e aspetta il ritardo del video |
| [live.js](live.js) | La diretta con Firebase: il tabellone la scrive, la pagina della diretta la legge |
| [database.rules.json](database.rules.json) | Le regole del database: chi legge e chi scrive la diretta |
| [firebase.json](firebase.json) | Le impostazioni per provare la diretta con l'emulatore di Firebase |
| [tests/game.test.js](tests/game.test.js) | Test automatici delle regole |
| [esempi/scheda_pc52_mogliano_2026-10-04.json](esempi/scheda_pc52_mogliano_2026-10-04.json) | La scheda della partita PC52 – Mogliano del 4 ottobre 2026, da importare con «Importa partita» |

## Test

Con Node.js 20 o successivo, dalla cartella del repository:

```
node --test
```
