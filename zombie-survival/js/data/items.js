// Definizioni degli oggetti, guidate dai dati (l'equivalente degli ScriptableObject del GDD):
// si aggiungono contenuti qui senza toccare la logica.
//
// Campi comuni: n nome, c categoria, w peso (kg), ic icona, col colore icona, d descrizione.
// Proprietà opzionali: food, drink, med, wpn, tool (array di tag), cloth, bag, lit, light,
// thr (lanciabile), liq (contenitore di liquidi), seed, bulky (si porta solo a mano / carriola),
// stack (quantità per pila), uses (usi), misc.

export const ITEMS = {};
const def = (id, o) => {
  o.id = id;
  ITEMS[id] = o;
};

// ---------------------------------------------------------------- CIBO
// food: hu fame saziata, th sete saziata (negativa = assetante), mo morale, bo noia, fa fatica,
// pa panico, poison probabilità di intossicazione, raw da cuocere, hot caldo (scalda il corpo)
const F = (id, n, w, ic, col, food, extra = {}) => def(id, { n, c: 'food', w, ic, col, food, ...extra });

F('beans', 'Fagioli in scatola', 0.45, 'can', '#b4632f', { hu: 30, th: -3, mo: -3 }, { can: true, d: 'Sostanziosi. Mangiati freddi mettono tristezza.' });
F('soup_can', 'Zuppa in scatola', 0.45, 'can', '#c08a2e', { hu: 22, th: 8, mo: -2 }, { can: true, d: 'Meglio calda, ma anche fredda tiene in piedi.' });
F('tuna', 'Tonno in scatola', 0.2, 'can', '#6e8fa8', { hu: 18, th: -4, mo: 0 }, { can: true });
F('peaches', 'Pesche sciroppate', 0.45, 'can', '#e0a040', { hu: 15, th: 10, mo: 4 }, { can: true, d: 'Dolci. Un piccolo lusso.' });
F('corn', 'Mais in scatola', 0.35, 'can', '#e3c53a', { hu: 15, th: 2, mo: -1 }, { can: true });
F('dog_food', 'Cibo per cani', 0.4, 'can', '#8a6a4a', { hu: 20, th: -2, mo: -14 }, { can: true, d: 'Solo per i giorni peggiori.' });
F('crackers', 'Cracker', 0.2, 'snack', '#d8b26a', { hu: 10, th: -6, mo: 0 });
F('chips', 'Patatine', 0.15, 'snack', '#e2c03c', { hu: 9, th: -8, mo: 4 });
F('choco', 'Cioccolata', 0.1, 'snack', '#6b3f25', { hu: 8, mo: 6, bo: -4 });
F('energy_bar', 'Barretta energetica', 0.08, 'snack', '#c9673a', { hu: 12, st: 0.25 });
F('cereal', 'Cereali', 0.3, 'snack', '#d6a24c', { hu: 14, th: -4, mo: 1 });
F('jam', 'Marmellata', 0.35, 'jar', '#a33b3b', { hu: 10, mo: 4 }, { d: 'Il barattolo resta: è utile per le conserve.', leaves: 'jar' });
F('bread', 'Pagnotta', 0.4, 'bread', '#c99a5a', { hu: 18, mo: 2 }, { rot: [3, 6] });
F('milk', 'Latte', 1.0, 'drink', '#e8e6dc', { hu: 6, th: 25, mo: 1 }, { rot: [2, 4] });
F('cheese', 'Formaggio', 0.3, 'snack', '#e8cf72', { hu: 14, th: -4, mo: 3 }, { rot: [8, 14] });
F('ham', 'Prosciutto cotto', 0.25, 'meat', '#d98a8a', { hu: 12, th: -4, mo: 2 }, { rot: [3, 6] });
F('eggs', 'Uova', 0.35, 'egg', '#e9dcc0', { hu: 12, mo: -4, poison: 0.15 }, { rot: [10, 20], raw: true });
F('meat', 'Carne cruda', 0.5, 'meat', '#b8433b', { hu: 22, mo: -10, poison: 0.4 }, { rot: [2, 4], raw: true, d: 'Va cotta. Cruda è una scommessa.' });
F('apple', 'Mela', 0.18, 'fruit', '#c23b2b', { hu: 6, th: 6, mo: 1 }, { rot: [12, 24] });
F('carrot', 'Carota', 0.1, 'veg', '#e07a2c', { hu: 5, th: 3 }, { rot: [12, 24] });
F('potato', 'Patata', 0.2, 'veg', '#b89466', { hu: 8, mo: -3 }, { rot: [30, 60], raw: true });
F('tomato', 'Pomodoro', 0.15, 'veg', '#d33a2c', { hu: 5, th: 6, mo: 1 }, { rot: [6, 12] });
F('cabbage', 'Cavolo', 0.8, 'veg', '#7aa24a', { hu: 15, th: 4 }, { rot: [14, 28] });
F('pasta', 'Pasta secca', 0.5, 'snack', '#e2c47c', { hu: 4, mo: -8 }, { raw: true, d: 'Serve acqua, pentola e fuoco.' });
F('rice', 'Riso', 0.5, 'snack', '#ece7d6', { hu: 4, mo: -8 }, { raw: true, d: 'Serve acqua, pentola e fuoco.' });
F('coffee', 'Caffè solubile', 0.1, 'jar', '#5a3a26', { hu: 0, th: -2, mo: 3, fa: -14 });
// cucinati
F('hot_beans', 'Fagioli caldi', 0.45, 'bowl', '#b4632f', { hu: 32, mo: 6, hot: 1 }, { rot: [2, 4] });
F('hot_soup', 'Zuppa calda', 0.45, 'bowl', '#c08a2e', { hu: 25, th: 12, mo: 8, hot: 1 }, { rot: [2, 4] });
F('stew', 'Stufato', 0.7, 'bowl', '#8c4a2c', { hu: 45, th: 6, mo: 15, hot: 1 }, { rot: [2, 4], d: 'Un pasto vero. Il morale ringrazia.' });
F('veg_soup', 'Zuppa di verdure', 0.6, 'bowl', '#7d9a3e', { hu: 30, th: 12, mo: 10, hot: 1 }, { rot: [2, 4] });
F('steak', 'Bistecca cotta', 0.4, 'meat', '#7c3b22', { hu: 30, mo: 10, hot: 1 }, { rot: [2, 4] });
F('fried_eggs', 'Uova strapazzate', 0.3, 'bowl', '#e7c64e', { hu: 18, mo: 7, hot: 1 }, { rot: [1, 3] });
F('pasta_dish', 'Piatto di pasta', 0.6, 'bowl', '#e2b45c', { hu: 35, mo: 10, hot: 1 }, { rot: [2, 3] });
F('rice_dish', 'Riso bollito', 0.6, 'bowl', '#ece7d6', { hu: 30, mo: 4, hot: 1 }, { rot: [2, 3] });
F('boiled_potato', 'Patate lesse', 0.4, 'bowl', '#c9a76e', { hu: 20, mo: 4, hot: 1 }, { rot: [3, 5] });
F('preserve', 'Conserva di pomodoro', 0.5, 'jar', '#c23b2b', { hu: 14, th: 4, mo: 5 }, { d: "Il raccolto dell'orto, chiuso nel vetro. Non marcisce.", leaves: 'jar' });
F('burnt_food', 'Cibo bruciato', 0.3, 'bowl', '#3a2a22', { hu: 10, mo: -6 });

// ---------------------------------------------------------------- BEVANDE
const D = (id, n, w, ic, col, food, extra = {}) => def(id, { n, c: 'drink', w, ic, col, food, ...extra });
def('bottle', { n: "Bottiglia d'acqua", c: 'drink', w: 0.05, ic: 'bottle', col: '#7fb2d8', liq: { cap: 1.0, kind: 'water' }, d: 'Plastica da un litro. Si riempie ai rubinetti, ai barili, ovunque ci sia acqua.' });
D('soda', 'Bibita gassata', 0.35, 'drink', '#c23b3b', { hu: 2, th: 20, mo: 3 }, { leaves: 'empty_can' });
D('juice', 'Succo di frutta', 0.3, 'drink', '#e39a2c', { hu: 3, th: 22, mo: 2 });
D('beer', 'Birra', 0.35, 'drink', '#d9a73a', { th: 10, mo: 5, pa: -10, fa: 5 }, { leaves: 'empty_can' });
D('wine', 'Bottiglia di vino', 0.9, 'bottle', '#6e1f2e', { th: 4, mo: 7, pa: -14, fa: 4 }, { uses: 3, leaves: 'glass_bottle' });
D('whiskey', 'Whisky', 0.8, 'bottle', '#b8752c', { th: -2, mo: 6, pa: -18, fa: 3 }, { uses: 6, alcohol: true, leaves: 'glass_bottle', d: 'Si beve, ma disinfetta anche le ferite.' });
D('energy_drink', 'Energy drink', 0.3, 'drink', '#3fa0c7', { th: 15, fa: -16, pa: 4 }, { leaves: 'empty_can' });

// ---------------------------------------------------------------- MEDICINA
const M = (id, n, w, ic, col, med, extra = {}) => def(id, { n, c: 'med', w, ic, col, med, ...extra });
M('bandage', 'Benda', 0.05, 'bandage', '#e8e4d8', { kind: 'bandage', clean: 0.85 });
M('sterile_bandage', 'Benda sterile', 0.05, 'bandage', '#ffffff', { kind: 'bandage', clean: 1 }, { d: 'Si sporca più lentamente e riduce il rischio di infezione.' });
M('rag', 'Straccio', 0.05, 'rag', '#b9ab8e', { kind: 'bandage', clean: 0.45 }, { stack: 10, d: 'Benda di fortuna. Si sporca presto.' });
M('rag_dirty', 'Straccio sporco', 0.05, 'rag', '#6d6250', { kind: 'none' }, { stack: 10, d: 'Va lavato o bollito prima di usarlo sulle ferite.' });
M('disinfectant', 'Disinfettante', 0.3, 'pill', '#d84b3a', { kind: 'disinfect' }, { uses: 6 });
M('painkillers', 'Antidolorifici', 0.05, 'pill', '#e8e8e8', { kind: 'painkill' }, { uses: 10, d: 'Calmano il dolore per qualche ora.' });
M('antibiotics', 'Antibiotici', 0.05, 'pill', '#e6c13a', { kind: 'antibio' }, { uses: 6, d: 'Curano le infezioni delle ferite. Rallentano il contagio, ma non lo fermano.' });
M('antiviral', 'Antivirale sperimentale', 0.1, 'syringe', '#7fd0a0', { kind: 'antiviral' }, { uses: 1, d: "Campione da ambulatorio. Se il contagio non è all'ultimo stadio, lo ferma." });
M('cold_med', 'Sciroppo per la tosse', 0.2, 'pill', '#9a4fb0', { kind: 'coldmed' }, { uses: 4 });
M('vitamins', 'Vitamine', 0.05, 'pill', '#e88a2c', { kind: 'vitamin' }, { uses: 10 });
M('sleeping_pills', 'Sonniferi', 0.05, 'pill', '#8aa0d8', { kind: 'sleep' }, { uses: 6 });
M('suture_kit', 'Kit di sutura', 0.1, 'kit', '#c8d4dc', { kind: 'suture' }, { uses: 4, d: 'Ago chirurgico e filo. Chiude le ferite profonde.' });
M('splint', 'Stecca', 0.4, 'splint', '#b08a5a', { kind: 'splint' }, { d: 'Immobilizza una frattura: guarisce più in fretta e zoppichi meno.' });

// ---------------------------------------------------------------- ARMI
// wpn: dmg danno, reach portata (m), spd durata colpo (s), sta stamina per colpo, dur colpi prima di rompersi,
// type blunt|blade, two a due mani, knock prob. di atterrare, sever prob. di staccare un arto, stab affondo, noise raggio impatto
const W = (id, n, w, ic, col, wpn, extra = {}) => def(id, { n, c: 'weapon', w, ic, col, wpn, ...extra });
W('bat', 'Mazza da baseball', 1.0, 'bat', '#b0834a', { dmg: 1.0, reach: 1.65, spd: 0.62, sta: 0.1, dur: 70, type: 'blunt', two: true, knock: 0.35, noise: 7 });
W('crowbar', 'Piede di porco', 1.8, 'crowbar', '#c0392b', { dmg: 1.1, reach: 1.4, spd: 0.66, sta: 0.12, dur: 160, type: 'blunt', two: false, knock: 0.3, noise: 7 }, { tool: ['crowbar'] });
W('kitchen_knife', 'Coltello da cucina', 0.25, 'knife', '#cfd6dc', { dmg: 0.6, reach: 0.95, spd: 0.38, sta: 0.05, dur: 30, type: 'blade', stab: true, knock: 0.05, sever: 0.2, noise: 3 }, { tool: ['knife'] });
W('hunting_knife', 'Coltello da caccia', 0.4, 'knife', '#9aa6ae', { dmg: 0.8, reach: 1.0, spd: 0.4, sta: 0.06, dur: 90, type: 'blade', stab: true, knock: 0.05, sever: 0.3, noise: 3 }, { tool: ['knife'] });
W('scalpel', 'Bisturi', 0.05, 'knife', '#e6eef2', { dmg: 0.35, reach: 0.8, spd: 0.3, sta: 0.03, dur: 15, type: 'blade', stab: true, knock: 0, sever: 0.1, noise: 2 }, { tool: ['knife'] });
W('axe', 'Ascia', 2.2, 'axe', '#a0522d', { dmg: 1.9, reach: 1.5, spd: 0.86, sta: 0.2, dur: 120, type: 'blade', two: true, knock: 0.5, sever: 0.6, noise: 8 }, { tool: ['axe'] });
W('hatchet', 'Accetta', 1.0, 'axe', '#8d5a3b', { dmg: 1.2, reach: 1.15, spd: 0.55, sta: 0.1, dur: 80, type: 'blade', two: false, knock: 0.25, sever: 0.4, noise: 6 }, { tool: ['axe'] });
W('shovel', 'Pala', 2.0, 'shovel', '#6f7f86', { dmg: 1.0, reach: 1.85, spd: 0.8, sta: 0.16, dur: 90, type: 'blunt', two: true, knock: 0.45, noise: 8 }, { tool: ['shovel'] });
W('pipe', 'Tubo di ferro', 1.5, 'pipe', '#7d8a90', { dmg: 0.9, reach: 1.4, spd: 0.62, sta: 0.12, dur: 120, type: 'blunt', two: false, knock: 0.3, noise: 7 }, { tool: ['pipe'] });
W('pan', 'Padella', 1.2, 'pan', '#3b3f43', { dmg: 0.8, reach: 1.05, spd: 0.58, sta: 0.1, dur: 70, type: 'blunt', two: false, knock: 0.35, noise: 9 }, { tool: ['pan'] });
W('hammer', 'Martello', 0.8, 'hammer', '#8a6a4a', { dmg: 0.7, reach: 0.95, spd: 0.48, sta: 0.07, dur: 140, type: 'blunt', two: false, knock: 0.15, noise: 6 }, { tool: ['hammer'] });
W('rolling_pin', 'Mattarello', 0.6, 'bat', '#d0a46a', { dmg: 0.45, reach: 1.0, spd: 0.5, sta: 0.07, dur: 30, type: 'blunt', two: false, knock: 0.15, noise: 5 });
W('golf_club', 'Mazza da golf', 0.8, 'bat', '#9aa6ae', { dmg: 0.8, reach: 1.6, spd: 0.55, sta: 0.09, dur: 40, type: 'blunt', two: true, knock: 0.25, noise: 6 });
W('machete', 'Machete', 0.9, 'axe', '#b8c2c8', { dmg: 1.4, reach: 1.3, spd: 0.5, sta: 0.1, dur: 90, type: 'blade', two: false, knock: 0.2, sever: 0.5, noise: 5 }, { tool: ['knife'] });
W('spear', 'Lancia artigianale', 0.9, 'spear', '#a0794a', { dmg: 1.0, reach: 2.05, spd: 0.6, sta: 0.09, dur: 18, type: 'blade', stab: true, two: true, knock: 0.1, sever: 0.05, noise: 4 }, { d: 'Tiene gli zombie a distanza. Si rompe in fretta.' });
W('metal_spear', 'Lancia di metallo', 1.4, 'spear', '#8d9aa0', { dmg: 1.25, reach: 2.05, spd: 0.62, sta: 0.1, dur: 70, type: 'blade', stab: true, two: true, knock: 0.1, sever: 0.1, noise: 5 });
W('spiked_bat', 'Mazza chiodata', 1.3, 'bat', '#8a5a3a', { dmg: 1.35, reach: 1.65, spd: 0.64, sta: 0.12, dur: 55, type: 'blunt', two: true, knock: 0.4, noise: 7 });

// ---------------------------------------------------------------- ATTREZZI
const T = (id, n, w, ic, col, tool, extra = {}) => def(id, { n, c: 'tool', w, ic, col, tool, ...extra });
T('screwdriver', 'Cacciavite', 0.2, 'screwdriver', '#e0b030', ['screwdriver'], { dur: 120 });
T('saw', 'Sega', 0.9, 'saw', '#9aa6ae', ['saw'], { dur: 90, d: 'Assi dai tronchi, smontaggi puliti. Fa rumore.' });
T('pliers', 'Pinze', 0.3, 'pliers', '#c0392b', ['pliers'], { dur: 120 });
T('wrench', 'Chiave inglese', 0.8, 'wrench', '#8d9aa0', ['wrench'], { dur: 160 });
T('welder', 'Saldatrice', 4.0, 'welder', '#3a6ea5', ['welder'], { dur: 100, d: 'Serve una bombola di propano. Molto rumorosa.' });
T('propane', 'Bombola di propano', 2.5, 'barrel', '#d8d8d8', ['propane'], { uses: 20 });
T('can_opener', 'Apriscatole', 0.1, 'opener', '#b8c2c8', ['opener'], { dur: 200 });
T('lighter', 'Accendino', 0.05, 'fire', '#e05a3a', ['fire'], { uses: 60 });
T('matches', 'Fiammiferi', 0.05, 'fire', '#c99a5a', ['fire'], { uses: 15 });
T('trowel', 'Paletta da giardino', 0.3, 'trowel', '#6f8f4a', ['trowel'], { dur: 120 });
T('hose', 'Tubo di gomma', 0.5, 'rope', '#4a7a4a', ['hose'], { d: 'Per travasare la benzina dalle auto.' });
T('sewing_kit', 'Ago e filo', 0.1, 'kit', '#d6c8a8', ['needle'], { uses: 10, d: 'Ripara i vestiti. In emergenza ricuce una ferita.' });
T('pot', 'Pentola', 1.0, 'pot', '#9aa6ae', ['pot'], { liq: { cap: 3, kind: 'water' } });
T('bucket', 'Secchio', 0.6, 'pot', '#5a7aa5', ['bucket'], { liq: { cap: 8, kind: 'water' } });
T('watering_can', 'Annaffiatoio', 0.6, 'pot', '#5f9a5a', ['watering'], { liq: { cap: 5, kind: 'water' } });
T('gas_can', 'Tanica', 1.0, 'barrel', '#c0392b', ['gascan'], { liq: { cap: 10, kind: 'fuel' }, d: 'Benzina per il generatore e per bruciare i corpi.' });
def('flashlight', { n: 'Torcia elettrica', c: 'tool', w: 0.4, ic: 'light', col: '#e6c13a', light: { kind: 'flash', drain: 0.07 }, d: 'Di notte ti salva. Ma si vede da lontano.' });
def('lantern', { n: 'Lanterna a batteria', c: 'tool', w: 1.0, ic: 'light', col: '#e6a23c', light: { kind: 'lantern', drain: 0.05 }, d: 'Illumina tutto intorno a te. Utile per leggere.' });
def('candle', { n: 'Candela', c: 'tool', w: 0.1, ic: 'candle', col: '#efe3c0', light: { kind: 'candle', burn: 5 }, d: 'Basta per leggere. Si accende con fiammiferi o accendino.' });
def('torch_improv', { n: 'Torcia improvvisata', c: 'tool', w: 0.6, ic: 'fire', col: '#e07a2c', light: { kind: 'torch', burn: 1 }, d: 'Fiamma viva: scalda e illumina, ma dura poco.' });
def('batteries', { n: 'Batterie', c: 'tool', w: 0.1, ic: 'battery', col: '#7fae6a', d: 'Ricarica torce, lanterne, radio e console.', tool: ['battery'] });

// ---------------------------------------------------------------- MATERIALI
const MT = (id, n, w, ic, col, extra = {}) => def(id, { n, c: 'mat', w, ic, col, ...extra });
MT('plank', 'Asse di legno', 2.5, 'plank', '#b08a5a', { bulky: true, d: 'Ingombrante: si porta in mano, una alla volta, o con la carriola.' });
MT('log', 'Tronco', 8, 'log', '#7a5a3a', { bulky: true, d: 'Con una sega diventa tre assi.' });
MT('branch', 'Ramo', 0.8, 'branch', '#8a6a42', { d: 'Per lance, stecche, torce e falò.' });
MT('nails', 'Chiodi', 0.005, 'nails', '#9aa6ae', { stack: 200 });
MT('screws', 'Viti', 0.005, 'nails', '#c8a850', { stack: 200 });
MT('duct_tape', 'Nastro adesivo', 0.2, 'tape', '#8d9aa0', { uses: 8, d: 'Ripara armi e attrezzi.' });
MT('glue', 'Colla', 0.15, 'tape', '#e8e4d8', { uses: 5 });
MT('scrap', 'Rottami di metallo', 1.0, 'metal', '#7d8a90');
MT('sheet_metal', 'Lamiera', 4.0, 'metal', '#9aa6ae', { bulky: true });
MT('elec_parts', 'Componenti elettronici', 0.15, 'parts', '#3fa06a');
MT('wire', 'Filo elettrico', 0.2, 'rope', '#c0392b');
MT('car_battery', 'Batteria per auto', 12, 'battery', '#3a3f43', { bulky: true });
MT('cement', 'Sacco di cemento', 25, 'cement', '#b8b8b0', { bulky: true });
MT('tarp', 'Telo di plastica', 0.8, 'sheet', '#3a6ea5');
MT('rope', 'Corda', 0.6, 'rope', '#c8a86a');
MT('sheet', 'Lenzuolo', 0.5, 'sheet', '#e3dccb', { d: 'Copre le finestre, si annoda in una corda, si strappa in stracci.' });
MT('sheet_rope', 'Corda di lenzuola', 1.0, 'rope', '#e3dccb', { d: 'Fissala dove hai tolto le scale: tu sali, loro no.' });
MT('barrel', 'Barile', 6, 'barrel', '#3a6ea5', { bulky: true });
MT('door_item', 'Porta smontata', 15, 'door', '#8a6a4a', { bulky: true, d: 'Si rimonta in un vano porta costruito da te.' });
MT('generator', 'Generatore', 40, 'generator', '#c9a032', { bulky: true, d: 'Corrente quando la rete salta. Consuma benzina ed è molto rumoroso.' });

// ---------------------------------------------------------------- LANCIABILI
// thr: noise raggio del rumore all'impatto, breaks si rompe, ring secondi di squillo
MT('glass_bottle', 'Bottiglia di vetro', 0.35, 'bottle', '#5f8f6a', { thr: { noise: 17, breaks: true } });
MT('empty_can', 'Lattina vuota', 0.05, 'can', '#9aa6ae', { thr: { noise: 10 } });
MT('stone', 'Sasso', 0.4, 'stone', '#8a8a82', { thr: { noise: 8 } });
MT('jar', 'Barattolo di vetro', 0.3, 'jar', '#a8c8c8', { thr: { noise: 15, breaks: true } });
def('alarm_clock', { n: 'Sveglia', c: 'tool', w: 0.3, ic: 'clock', col: '#e05a3a', thr: { noise: 6, ring: 18 }, d: 'Lanciala lontano: squilla e attira gli zombie dove vuoi tu.' });

// ---------------------------------------------------------------- SEMI
const S = (id, n, crop, days) => def(id, { n, c: 'seed', w: 0.02, ic: 'seed', col: '#8aa04a', seed: { crop, days }, stack: 20 });
S('seeds_carrot', 'Semi di carota', 'carrot', 10);
S('seeds_potato', 'Patate da semina', 'potato', 14);
S('seeds_tomato', 'Semi di pomodoro', 'tomato', 16);
S('seeds_cabbage', 'Semi di cavolo', 'cabbage', 12);

// ---------------------------------------------------------------- VESTITI
// cloth: slot, warm calore, scratch/bite protezione, water impermeabilità, quiet rumorosità dei passi
const C = (id, n, w, ic, col, cloth, extra = {}) => def(id, { n, c: 'cloth', w, ic, col, cloth, ...extra });
C('tshirt', 'Maglietta', 0.15, 'shirt', '#8a9aa8', { slot: 'torso_in', warm: 0.08, scratch: 0.05, bite: 0 });
C('flannel', 'Camicia di flanella', 0.3, 'shirt', '#a33b3b', { slot: 'torso_in', warm: 0.18, scratch: 0.12, bite: 0.02 });
C('sweater', 'Maglione di lana', 0.5, 'shirt', '#6b5a4a', { slot: 'torso_in', warm: 0.32, scratch: 0.15, bite: 0.03 });
C('hoodie', 'Felpa con cappuccio', 0.5, 'jacket', '#4a5a6a', { slot: 'torso_out', warm: 0.28, scratch: 0.18, bite: 0.05 });
C('leather_jacket', 'Giubbotto di pelle', 1.2, 'jacket', '#3a2a22', { slot: 'torso_out', warm: 0.32, scratch: 0.55, bite: 0.3, water: 0.4 });
C('winter_coat', 'Giaccone invernale', 1.5, 'jacket', '#2f4a5a', { slot: 'torso_out', warm: 0.62, scratch: 0.3, bite: 0.15, water: 0.5 });
C('raincoat', 'Impermeabile', 0.6, 'jacket', '#d8c23a', { slot: 'torso_out', warm: 0.14, scratch: 0.1, bite: 0.02, water: 0.95 });
C('denim_jacket', 'Giacca di jeans', 0.9, 'jacket', '#4a6a9a', { slot: 'torso_out', warm: 0.2, scratch: 0.35, bite: 0.15 });
C('jeans', 'Jeans', 0.6, 'pants', '#3a5070', { slot: 'legs', warm: 0.14, scratch: 0.3, bite: 0.1 });
C('work_pants', 'Pantaloni da lavoro', 0.7, 'pants', '#5a5a3a', { slot: 'legs', warm: 0.2, scratch: 0.42, bite: 0.15 });
C('sweatpants', 'Pantaloni della tuta', 0.4, 'pants', '#5a5a62', { slot: 'legs', warm: 0.18, scratch: 0.08, bite: 0 });
C('shorts', 'Pantaloncini', 0.2, 'pants', '#8a7a5a', { slot: 'legs', warm: 0.02, scratch: 0.02, bite: 0 });
C('sneakers', 'Scarpe da ginnastica', 0.6, 'shoes', '#d8d8d0', { slot: 'feet', warm: 0.08, scratch: 0.2, bite: 0.1, quiet: 0.85 }, { d: 'Silenziose.' });
C('boots', 'Stivali da lavoro', 1.2, 'shoes', '#5a3a22', { slot: 'feet', warm: 0.22, scratch: 0.5, bite: 0.4, quiet: 1.2 }, { d: 'Proteggono, ma i passi si sentono di più.' });
C('gloves_work', 'Guanti da lavoro', 0.2, 'gloves', '#c8a050', { slot: 'hands', warm: 0.1, scratch: 0.5, bite: 0.2 }, { d: 'Proteggono anche dai vetri rotti.' });
C('gloves_wool', 'Guanti di lana', 0.1, 'gloves', '#7a3b3b', { slot: 'hands', warm: 0.25, scratch: 0.1, bite: 0 });
C('wool_hat', 'Berretto di lana', 0.1, 'hat', '#a33b3b', { slot: 'head', warm: 0.2, scratch: 0.05, bite: 0 });
C('cap', 'Cappellino', 0.1, 'hat', '#3a5a8a', { slot: 'head', warm: 0.05, scratch: 0.05, bite: 0 });
C('hard_hat', 'Elmetto da cantiere', 0.4, 'helmet', '#e6c13a', { slot: 'head', warm: 0.05, scratch: 0.45, bite: 0.35 });
C('moto_helmet', 'Casco da moto', 1.5, 'helmet', '#2a2a2a', { slot: 'head', warm: 0.2, scratch: 0.85, bite: 0.85 }, { d: 'Una testa non si morde attraverso il casco.' });

// ---------------------------------------------------------------- BORSE
// bag: cap capacità (kg), red riduzione del peso percepito, slot, eq secondi per tirare fuori un oggetto
const B = (id, n, w, col, bag, extra = {}) => def(id, { n, c: 'bag', w, ic: 'bag', col, bag, ...extra });
B('backpack', 'Zaino da trekking', 0.8, '#4a6a3a', { cap: 18, red: 0.45, slot: 'back', eq: 1.6 });
B('school_bag', 'Zaino scolastico', 0.5, '#3a5a8a', { cap: 10, red: 0.25, slot: 'back', eq: 1.4 });
B('duffel', 'Borsone', 0.7, '#2f3a4a', { cap: 16, red: 0.3, slot: 'shoulder', eq: 1.3 });
B('satchel', 'Borsa a tracolla', 0.4, '#7a5a3a', { cap: 6, red: 0.2, slot: 'shoulder', eq: 1.0 });
B('toolbelt', 'Cintura porta attrezzi', 0.4, '#8a6a3a', { cap: 3.5, red: 0.5, slot: 'belt', eq: 0.35 }, { d: 'Armi e attrezzi qui si estraggono al volo.' });

// ---------------------------------------------------------------- LETTURE
// lit: kind mag|manual|book|comic|news|map, skill, recipes, bo noia, mo morale, time secondi di lettura
const L = (id, n, col, lit, extra = {}) => def(id, { n, c: 'lit', w: lit.kind === 'book' || lit.kind === 'manual' ? 0.5 : 0.15, ic: lit.kind === 'mag' || lit.kind === 'comic' ? 'mag' : lit.kind === 'news' || lit.kind === 'map' ? 'paper' : 'book', col, lit, ...extra });
L('mag_wood1', 'Rivista: Fai da te in legno', '#c99a5a', { kind: 'mag', skill: 'carp', recipes: ['bench_carp', 'ladder', 'spiked_bat'], time: 10, bo: -15 });
L('mag_wood2', 'Rivista: Difese domestiche', '#a05a3a', { kind: 'mag', skill: 'carp', recipes: ['tower_wood', 'wallwin_wood', 'barricade_heavy'], time: 10, bo: -15 });
L('mag_cook', 'Rivista: Cucina rustica', '#d36a3a', { kind: 'mag', skill: 'cook', recipes: ['stew', 'veg_soup', 'preserve', 'kitchen_camp'], time: 9, bo: -18 });
L('mag_farm', "Rivista: L'orto in casa", '#6f9a3a', { kind: 'mag', skill: 'farm', recipes: ['rain_collector', 'seed_tomato', 'seed_potato'], time: 9, bo: -15 });
L('mag_mech', 'Rivista: Motori e meccanica', '#5a6a7a', { kind: 'mag', skill: 'mech', recipes: ['bench_mech', 'dismantle_car', 'scrap_sheet'], time: 10, bo: -12 });
L('man_metal', 'Manuale: Metallurgia e saldatura', '#3a6ea5', { kind: 'manual', skill: 'metal', recipes: ['found_metal', 'wall_metal', 'door_metal', 'floor_metal', 'fence_metal', 'barricade_metal', 'metal_spear'], time: 16, bo: -10 });
L('man_med', 'Manuale: Pronto soccorso', '#c0392b', { kind: 'manual', skill: 'med', recipes: ['med_station', 'sterile_boil', 'disinfect_alcohol'], time: 14, bo: -10 });
L('man_elec', 'Manuale: Elettricista', '#e6c13a', { kind: 'manual', skill: 'elec', recipes: ['bench_elec', 'alarm_trap', 'charge_batteries', 'gen_wiring'], time: 14, bo: -8 });
L('man_cement', 'Manuale: Costruire in cemento', '#9a9a92', { kind: 'manual', skill: 'carp', recipes: ['found_cement', 'wall_cement', 'floor_cement'], time: 16, bo: -8 });
// libri di abilità: per un giorno di gioco raddoppiano l'esperienza nell'abilità
const SKB = (id, n, col, skill) => L(id, n, col, { kind: 'book', skill, boost: 2, boostHours: 24, xp: 30, time: 20, bo: -25, mo: 2 });
SKB('bk_carp', 'Falegnameria per principianti', '#b08a5a', 'carp');
SKB('bk_metal', 'Metallo e fuoco', '#6f7f86', 'metal');
SKB('bk_cook', 'Il cuoco di casa', '#d36a3a', 'cook');
SKB('bk_med', "Medicina d'urgenza", '#c0392b', 'med');
SKB('bk_farm', 'Coltivare la terra', '#6f9a3a', 'farm');
SKB('bk_elec', 'Elettronica di base', '#e6c13a', 'elec');
SKB('bk_mech', "Meccanica dell'auto", '#5a6a7a', 'mech');
SKB('bk_melee', 'Difesa personale', '#8a3b3b', 'melee');
SKB('bk_stealth', "Muoversi nell'ombra", '#3a3f4a', 'stealth');
L('novel', 'Romanzo giallo', '#7a3b5a', { kind: 'book', time: 18, bo: -45, mo: 9, lonely: -6 });
L('comic', 'Fumetto', '#e05a3a', { kind: 'comic', time: 8, bo: -28, mo: 5 });
L('newspaper', 'Giornale', '#d8d0bc', { kind: 'news', time: 6, bo: -10, lore: true });
L('town_map', 'Mappa di Montesordo', '#d8c89a', { kind: 'map', time: 4, bo: -2 }, { d: 'Rivela le strade e gli edifici del paese sulla mappa.' });

// ---------------------------------------------------------------- VARIE
const X = (id, n, w, ic, col, extra = {}) => def(id, { n, c: 'misc', w, ic, col, ...extra });
X('photo', 'Foto di famiglia', 0.02, 'photo', '#d8c89a', { fun: { lonely: -16, mo: 4, cd: 12 }, d: 'Guardarla aiuta. Non troppo spesso.' });
X('diary', 'Diario', 0.3, 'book', '#5a3a2a', { fun: { lonely: -12, bo: -12, mo: 3, cd: 20, needs: 'pen' }, d: 'Scriverci la sera tiene a bada la solitudine.' });
X('pen', 'Penna', 0.02, 'pen', '#3a5a9a');
X('radio', 'Radio portatile', 0.8, 'radio', '#3a3f43', { fun: { lonely: -10, bo: -14, mo: 2, battery: 0.06 }, d: 'Finché trasmettono, ci sono voci umane là fuori.' });
X('cards', 'Mazzo di carte', 0.1, 'cards', '#c0392b', { fun: { bo: -25, mo: 2, cd: 2 } });
X('handheld', 'Console portatile', 0.3, 'game', '#5a6a7a', { fun: { bo: -35, mo: 6, battery: 0.08 } });
X('teddy', 'Peluche', 0.2, 'misc', '#b08a5a', { fun: { lonely: -8, mo: 2, cd: 8 } });

export function itemDef(id) {
  return ITEMS[id];
}

export const CAT_NAMES = {
  food: 'Cibo', drink: 'Bevanda', med: 'Medicina', weapon: 'Arma', tool: 'Attrezzo', mat: 'Materiale',
  seed: 'Semi', cloth: 'Vestito', bag: 'Contenitore', lit: 'Lettura', misc: 'Varie',
};

export const QUALITY_NAMES = ['scadente', 'normale', 'buona', 'ottima'];
export const QUALITY_MULT = {
  dur: [0.5, 1, 1.4, 1.8],
  eff: [0.8, 1, 1.12, 1.25],
  w: [1.1, 1, 0.95, 0.9],
};
