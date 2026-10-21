# Montesordo

Survival horror in prima persona tratto dal GDD *Zombie Survival*. Montesordo è un paese delle Prealpi chiuso dal contagio: si parte il 9 settembre nella propria camera da letto e l'obiettivo è restare vivi il più a lungo possibile. Il rumore è la risorsa più pericolosa che hai.

Gira nel browser, su PC (tastiera e mouse) e su telefono o tablet (controlli touch). Non serve installare niente.

## Come avviarlo

Il gioco è fatto di moduli JavaScript, quindi va servito via HTTP (aprire `index.html` con un doppio clic non basta):

```bash
cd zombie-survival
python3 -m http.server 8000
# poi apri http://localhost:8000
```

Serve la connessione a internet per scaricare three.js (r160, da jsDelivr) e i font. Non c'è nessun passo di build.

## Comandi

| Azione | PC | Touch |
| --- | --- | --- |
| Muoversi | WASD o frecce, Shift per correre | Joystick a sinistra (appare dove tocchi), pulsante Corri |
| Guardarsi intorno | Mouse (clic sul gioco per bloccare il puntatore) | Trascina nella metà destra |
| Colpire / spingere | Clic sinistro / clic destro o Spazio | Pulsante rosso / Spingi |
| Accovacciarsi | C | Giù |
| Interagire | E, Q o rotella per scegliere l'azione | Pulsante giallo con il nome dell'azione, Altro |
| Torcia, lanciare, lasciare | F, G, X | Luce, Lancia, Lascia |
| Tasti rapidi | 1–4 | In alto a destra |
| Aspettare / riposare | Z | Orologio in alto |
| Zaino, salute, crea, costruisci, abilità, mappa | Tab, H, K, B, L, M | Icone in alto |
| Ruotare il pezzo da costruire, pausa | R, Esc | Ruota, pausa |

Se la pagina è dentro un riquadro che non permette di bloccare il mouse, il gioco passa da solo alla modalità "tieni premuto e trascina per guardare".

## Cosa c'è del GDD

- **Rumore**: un sistema centrale a cui passa ogni azione (passi, corsa, colpi, vetri, martello, generatore, allarmi delle auto, radio). Gli zombie sentono, indagano l'ultimo suono e lo raccontano agli altri con i versi. I muri attutiscono, la pioggia copre.
- **Corpo**: fame, sete, sonno, stamina, dolore, temperatura con vestiti a strati che si bagnano e si strappano, ferite per zona (graffi, lacerazioni, morsi, ferite profonde, fratture, ustioni) da bendare, disinfettare, suturare e steccare. Le ferite sporche si infettano, i cibi marci e l'acqua non bollita intossicano, il monossido del generatore uccide.
- **Mente**: panico (respiro, mani che tremano, colpi a vuoto), morale, noia e solitudine. Il personaggio parla da solo e la vignetta racconta come sta, non c'è una barra della vita.
- **Zombie**: macchina a stati (vaga, sente, indaga, insegue, attacca, sfonda, scavalca), gruppi che vagano insieme, orde migranti annunciate da un brusio, uccelli in fuga e zombie che camminano tutti nella stessa direzione. Smembramento per arti (chi perde le gambe striscia), cadaveri da portare via o bruciare, altrimenti l'aria si fa malsana.
- **Combattimento e stealth**: armi da mischia con portata, peso e usura, colpi alla testa, spinta, uccisioni silenziose alle spalle, lancio di oggetti per distrarre, torcia che si vede da lontano.
- **Inventario**: peso con soglie di ingombro, tasche, zaini e borse che riducono il peso, oggetti ingombranti da portare in braccio (assi, porte, generatore) o con la carriola, contenitori da frugare.
- **Crafting**: ricette con attrezzi, banchi e abilità; riviste e manuali che insegnano ricette e raddoppiano l'esperienza; qualità del risultato legata alla skill; smontare mobili e auto per materiali.
- **Building**: barricate su porte e finestre (assi, assi rinforzate, lamiera) che gli zombie consumano, costruzione a griglia con fondamenta, muri, porte, solai, pali e integrità strutturale (senza sostegni crolla), staccionate, torretta, scale. Base viva con generatore e carburante, raccoglitore di pioggia, orto, letto, banchi.
- **Mondo che peggiora**: ciclo giorno e notte, meteo (pioggia, temporale, nebbia, freddo), corrente che salta, poi l'acqua; frigoriferi spenti e cibo che marcisce, erba che cresce, radio che trasmette sempre meno.
- **Morte**: definitiva. Si riparte con un nuovo sopravvissuto nello stesso mondo, qualche ora dopo, da un'altra casa; il vecchio te si rialza e vaga con le tue cose addosso.
- **Impostazioni del mondo**: popolazione zombie, durata del giorno, giorno in cui salta la corrente, ritardo dell'acqua, velocità del decadimento, frequenza delle orde, contagio. Più il seme per rigenerare la stessa mappa.
- **Salvataggi**: automatici (ogni due ore di gioco, quando dormi, quando chiudi la pagina) nel browser, più un codice di salvataggio da copiare su un altro dispositivo.

## Come ho chiuso i punti aperti

- **Ambientazione**: Montesordo, paese immaginario di montagna nel nord Italia, ai giorni nostri. Quartiere residenziale, piazza con negozi, supermercato, farmacia, scuola, chiesa, campo sportivo, cascina, capannoni e bosco intorno.
- **Morso**: non è morte certa. Morso, lacerazione e graffio hanno probabilità diverse di contagio (circa 60%, 20% e 6%, regolabili). Il contagio incuba per 12–30 ore, poi febbre a stadi. Un antivirale, raro, lo ferma prima dell'ultimo stadio; gli antibiotici lo rallentano soltanto.
- **Armi da fuoco**: assenti. Solo mischia e lancio.
- **Veicoli**: solo relitti. Si frugano bagagliaio e cruscotto, si travasa la benzina, si smontano per pezzi e batterie; l'allarme, se lo fai scattare, chiama mezzo paese.
- **Altri sopravvissuti**: nessuno vivo. Restano le voci della radio, sempre più rade.

## Struttura del codice

```
index.html          pagina, stile e schermate dei menu
js/main.js          avvio, ciclo di gioco, collegamento dei sistemi
js/core/            utilità, generatore casuale, eventi, orologio
js/data/            oggetti, mobili, bottino, ricette, pezzi da costruzione (solo dati)
js/world/           griglia, generazione della mappa, mesh del mondo, cielo, meteo, decadimento
js/sim/             giocatore, corpo, mente, inventario, zombie, rumore, combattimento,
                    interazioni, crafting, costruzione, base, sonno, salvataggi
js/render/          texture e modelli procedurali, zombie, effetti, mani in prima persona
js/audio/           suoni sintetizzati con WebAudio
js/ui/              input, HUD, pannelli, controlli touch, menu
```

I sistemi si parlano attraverso eventi; oggetti, ricette e pezzi sono tabelle di dati, quindi si aggiungono contenuti senza toccare la logica. Tutto (texture, modelli, suoni) è generato dal codice: non ci sono asset esterni.
