// Pezzi da costruzione. Due livelli: adattare edifici esistenti (barricate, sulle porte/finestre)
// e costruire su griglia con snapping (cella da 1 m, piano da 3 m, come le misure standard per Blender).
//
// kind: cell (occupa una cella) | edge (sta su un lato di cella) | tower (2x2 composito)
// L: livello consentito (0 terra, 1 primo piano), needs: 'foundation' | 'floor' | 'support' | 'outdoor' | 'soil'
// mat: wood|metal|cement (resistenza e campata), hp punti struttura, cost [[id|{tag}, q]], tools, skill, bench (nella base, entro 25 m)
// learn: rivista/manuale che sblocca il pezzo (null = conosciuto), noise raggio per ogni colpo di lavoro.

export const MATERIALS = {
  wood: { n: 'legno', hp: 1, span: 1 },
  metal: { n: 'metallo', hp: 2.6, span: 2 },
  cement: { n: 'cemento', hp: 6, span: 3 },
};

export const BUILD = {
  campfire: { n: 'Falò', cat: 'Base', kind: 'cell', L: [0], needs: 'outdoor', furn: 'campfire', cost: [[{ tag: 'stick' }, 3]], tools: ['fire'], hp: 40, time: 4, noise: 3, xp: { carp: 2 }, d: 'Scalda, cuoce, illumina. Di notte si vede da lontano.' },
  garden: { n: 'Orto (aiuola)', cat: 'Base', kind: 'cell', L: [0], needs: 'soil', furn: 'garden', cost: [], tools: ['dig'], hp: 30, time: 6, noise: 4, xp: { farm: 6 }, d: 'Vanga il terreno, pianta i semi, annaffia. Il raccolto arriva dopo settimane.' },
  crate: { n: 'Cassa di legno', cat: 'Base', kind: 'cell', L: [0, 1], needs: 'floor_any', furn: 'crate_built', cost: [['plank', 2], ['nails', 4]], tools: ['hammer'], skill: { carp: 1 }, hp: 60, time: 6, noise: 18, xp: { carp: 8 } },
  bench_carp: { n: 'Banco da falegname', cat: 'Banchi', kind: 'cell', size: [2, 1], L: [0, 1], needs: 'floor_any', furn: 'bench_carp', learn: 'mag_wood1', cost: [['plank', 4], ['nails', 8]], tools: ['hammer', 'saw'], skill: { carp: 1 }, hp: 80, time: 10, noise: 22, xp: { carp: 14 } },
  bench_mech: { n: 'Banco da meccanico', cat: 'Banchi', kind: 'cell', size: [2, 1], L: [0, 1], needs: 'floor_any', furn: 'bench_mech', learn: 'mag_mech', cost: [['plank', 2], ['scrap', 4], ['screws', 6]], tools: ['screwdriver', 'wrench'], skill: { mech: 1 }, hp: 120, time: 10, noise: 18, xp: { mech: 14 } },
  kitchen_camp: { n: 'Cucina da campo', cat: 'Banchi', kind: 'cell', L: [0], needs: 'floor_any', furn: 'kitchen_camp', learn: 'mag_cook', cost: [['scrap', 3], ['pipe', 1], [{ tag: 'stone' }, 2]], tools: ['hammer'], skill: { cook: 1 }, hp: 80, time: 8, noise: 16, xp: { cook: 10 }, d: 'Cuoci a legna quando la corrente non c\'è più.' },
  med_station: { n: 'Stazione medica', cat: 'Banchi', kind: 'cell', L: [0, 1], needs: 'floor_any', furn: 'med_station', learn: 'man_med', cost: [['plank', 2], ['nails', 4], ['sheet', 1]], tools: ['hammer'], skill: { med: 1 }, hp: 60, time: 8, noise: 16, xp: { med: 12 }, d: 'Riposare accanto alla stazione fa guarire più in fretta.' },
  bench_elec: { n: 'Banco elettrico', cat: 'Banchi', kind: 'cell', L: [0, 1], needs: 'floor_any', furn: 'bench_elec', learn: 'man_elec', cost: [['plank', 2], ['elec_parts', 3], ['wire', 2]], tools: ['screwdriver', 'pliers'], skill: { elec: 1 }, hp: 60, time: 9, noise: 10, xp: { elec: 14 } },
  rain_collector: { n: 'Raccoglitore di pioggia', cat: 'Base', kind: 'cell', L: [0], needs: 'outdoor', furn: 'rain_collector', learn: 'mag_farm', cost: [['barrel', 1], ['tarp', 1], ['plank', 1], ['nails', 2]], tools: ['hammer'], hp: 70, time: 8, noise: 16, xp: { carp: 6, farm: 6 }, d: "L'acqua piovana va bollita prima di berla." },
  generator: { n: 'Posiziona il generatore', cat: 'Base', kind: 'cell', L: [0, 1], needs: 'floor_any', furn: 'generator', cost: [['generator', 1]], tools: [], hp: 120, time: 3, noise: 6, xp: {}, d: 'Rumorosissimo. Al chiuso produce monossido.' },
  found_wood: { n: 'Fondamenta in legno', cat: 'Strutture', kind: 'cell', L: [0], needs: 'ground', mat: 'wood', cost: [['plank', 2], ['nails', 6]], tools: ['hammer'], hp: 160, time: 7, noise: 22, xp: { carp: 10 } },
  found_metal: { n: 'Fondamenta in metallo', cat: 'Strutture', kind: 'cell', L: [0], needs: 'ground', mat: 'metal', learn: 'man_metal', cost: [['sheet_metal', 1], ['scrap', 2]], tools: ['welder', 'propane'], skill: { metal: 2 }, bench: 'mech', hp: 420, time: 9, noise: 26, xp: { metal: 14 } },
  found_cement: { n: 'Fondamenta in cemento', cat: 'Strutture', kind: 'cell', L: [0], needs: 'ground', mat: 'cement', learn: 'man_cement', cost: [['cement', 1], [{ tag: 'water', amt: 2 }, 1]], tools: ['trowel'], skill: { carp: 4 }, bench: 'carp', hp: 1000, time: 12, noise: 10, xp: { carp: 18 } },
  wall_wood: { n: 'Muro in legno', cat: 'Strutture', kind: 'edge', L: [0, 1], needs: 'support', mat: 'wood', cost: [['plank', 3], ['nails', 8]], tools: ['hammer'], hp: 150, time: 8, noise: 22, xp: { carp: 12 } },
  wallwin_wood: { n: 'Muro con finestra', cat: 'Strutture', kind: 'edge', L: [0, 1], needs: 'support', mat: 'wood', learn: 'mag_wood2', window: true, cost: [['plank', 3], ['nails', 8]], tools: ['hammer', 'saw'], skill: { carp: 2 }, hp: 110, time: 9, noise: 22, xp: { carp: 14 } },
  door_wood: { n: 'Porta in legno', cat: 'Strutture', kind: 'edge', L: [0, 1], needs: 'support', mat: 'wood', door: true, cost: [['plank', 3], ['nails', 8], ['screws', 4]], tools: ['hammer', 'screwdriver'], skill: { carp: 1 }, hp: 110, time: 9, noise: 22, xp: { carp: 14 } },
  wall_metal: { n: 'Muro in lamiera', cat: 'Strutture', kind: 'edge', L: [0, 1], needs: 'support', mat: 'metal', learn: 'man_metal', cost: [['sheet_metal', 1], ['scrap', 1]], tools: ['welder', 'propane'], skill: { metal: 2 }, bench: 'mech', hp: 400, time: 10, noise: 26, xp: { metal: 16 } },
  door_metal: { n: 'Porta in metallo', cat: 'Strutture', kind: 'edge', L: [0, 1], needs: 'support', mat: 'metal', learn: 'man_metal', door: true, cost: [['sheet_metal', 1], ['scrap', 2], ['screws', 4]], tools: ['welder', 'propane', 'screwdriver'], skill: { metal: 3 }, bench: 'mech', hp: 320, time: 11, noise: 26, xp: { metal: 18 } },
  wall_cement: { n: 'Muro in cemento', cat: 'Strutture', kind: 'edge', L: [0, 1], needs: 'support', mat: 'cement', learn: 'man_cement', cost: [['cement', 1], [{ tag: 'water', amt: 2 }, 1], ['plank', 1]], tools: ['trowel'], skill: { carp: 5 }, bench: 'carp', hp: 1000, time: 14, noise: 10, xp: { carp: 22 } },
  floor_wood: { n: 'Solaio in legno', cat: 'Strutture', kind: 'cell', L: [1], needs: 'span', mat: 'wood', cost: [['plank', 3], ['nails', 8]], tools: ['hammer'], skill: { carp: 2 }, hp: 140, time: 8, noise: 22, xp: { carp: 12 }, d: 'Pavimento al piano di sopra, e tetto per quello di sotto. Deve poggiare su muri o pali.' },
  floor_metal: { n: 'Solaio in metallo', cat: 'Strutture', kind: 'cell', L: [1], needs: 'span', mat: 'metal', learn: 'man_metal', cost: [['sheet_metal', 1], ['scrap', 2]], tools: ['welder', 'propane'], skill: { metal: 3 }, bench: 'mech', hp: 360, time: 10, noise: 26, xp: { metal: 16 } },
  floor_cement: { n: 'Solaio in cemento', cat: 'Strutture', kind: 'cell', L: [1], needs: 'span', mat: 'cement', learn: 'man_cement', cost: [['cement', 1], [{ tag: 'water', amt: 2 }, 1], ['pipe', 1]], tools: ['trowel'], skill: { carp: 6 }, bench: 'carp', hp: 900, time: 14, noise: 10, xp: { carp: 22 } },
  post_wood: { n: 'Palo di sostegno', cat: 'Strutture', kind: 'cell', L: [0], needs: 'ground', furn: 'post', mat: 'wood', cost: [['plank', 2], ['nails', 4]], tools: ['hammer'], hp: 120, time: 6, noise: 20, xp: { carp: 8 } },
  fence_wood: { n: 'Staccionata', cat: 'Difese', kind: 'edge', L: [0], needs: 'ground', mat: 'wood', fence: true, cost: [['plank', 2], ['nails', 4]], tools: ['hammer'], hp: 90, time: 6, noise: 20, xp: { carp: 8 }, d: 'Gli zombie la scavalcano lentamente. Tu più in fretta.' },
  fence_metal: { n: 'Recinzione metallica', cat: 'Difese', kind: 'edge', L: [0], needs: 'ground', mat: 'metal', fence: 'high', learn: 'man_metal', cost: [['scrap', 3], ['pipe', 1]], tools: ['welder', 'propane'], skill: { metal: 2 }, bench: 'mech', hp: 300, time: 9, noise: 24, xp: { metal: 14 } },
  ladder: { n: 'Scala a pioli', cat: 'Strutture', kind: 'cell', L: [0], needs: 'ladder', furn: 'ladder', learn: 'mag_wood1', cost: [['plank', 2], ['nails', 6]], tools: ['hammer', 'saw'], skill: { carp: 1 }, hp: 60, time: 7, noise: 20, xp: { carp: 10 }, d: 'Tu sali, gli zombie no.' },
  tower_wood: { n: 'Torretta di guardia', cat: 'Difese', kind: 'tower', L: [0], needs: 'ground2', mat: 'wood', learn: 'mag_wood2', cost: [['plank', 10], ['nails', 24]], tools: ['hammer', 'saw'], skill: { carp: 3 }, bench: 'carp', hp: 200, time: 20, noise: 24, xp: { carp: 30 }, d: 'Una piattaforma a 3 m con la scala. Se cedono i pali, crolla.' },
};

// barricate su porte e finestre esistenti (si applicano dal menu di interazione)
export const BARRICADE = {
  plank: { n: 'Asse', hp: 45, max: 4, cost: [['plank', 1], ['nails', 2]], tools: ['hammer'], time: 4, noise: 22, xp: { carp: 6 } },
  heavy: { n: 'Asse rinforzata', hp: 70, max: 4, learn: 'mag_wood2', cost: [['plank', 1], ['nails', 4], ['screws', 2]], tools: ['hammer', 'screwdriver'], time: 6, noise: 22, xp: { carp: 8 } },
  metal: { n: 'Lamiera', hp: 220, max: 1, learn: 'man_metal', cost: [['sheet_metal', 1]], tools: ['welder', 'propane'], time: 8, noise: 26, xp: { metal: 12 }, skill: { metal: 1 } },
};
