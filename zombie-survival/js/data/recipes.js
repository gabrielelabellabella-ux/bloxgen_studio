// Ricette di crafting. Il personaggio non sa fare tutto dal primo giorno: le ricette con `learn`
// si sbloccano leggendo la rivista/manuale indicato.
//
// in: [[id|{tag}, quantità]], tools: tag di attrezzi richiesti (si consumano un po'),
// bench: banco richiesto entro 3 m (carp|mech|kitchen|med|elec), heat: serve una fonte di calore,
// skill: livelli minimi, time: secondi, noise: raggio del rumore, xp: esperienza guadagnata,
// quality: il risultato ha una qualità (scadente/normale/buona/ottima).

export const SKILLS = {
  carp: 'Falegnameria',
  metal: 'Metallurgia',
  cook: 'Cucina',
  med: 'Medicina',
  farm: 'Agricoltura',
  elec: 'Elettricità',
  mech: 'Meccanica',
  melee: 'Mischia',
  stealth: 'Stealth',
};

export const BENCH_NAMES = {
  carp: 'banco da falegname',
  mech: 'banco da meccanico',
  kitchen: 'cucina',
  med: 'stazione medica',
  elec: 'banco elettrico',
};

export const RECIPES = [
  // --- a mano: solo le cose semplici (bende, torce, armi base)
  { id: 'rip_cloth', n: 'Strappa un vestito in stracci', cat: 'Materiali', in: [[{ tag: 'cloth' }, 1]], out: ['rag', 3], time: 3, noise: 2 },
  { id: 'rip_sheet', n: 'Strappa un lenzuolo in stracci', cat: 'Materiali', in: [['sheet', 1]], out: ['rag', 4], time: 3, noise: 2 },
  { id: 'bandage', n: 'Benda di fortuna', cat: 'Medicina', in: [['rag', 2]], out: ['bandage', 1], time: 3, xp: { med: 3 } },
  { id: 'sterile_disinf', n: 'Sterilizza una benda col disinfettante', cat: 'Medicina', in: [['bandage', 1], ['disinfectant', 1]], out: ['sterile_bandage', 1], time: 3, xp: { med: 4 } },
  { id: 'splint', n: 'Stecca', cat: 'Medicina', in: [[{ tag: 'stick' }, 1], ['rag', 2]], out: ['splint', 1], time: 5, xp: { med: 4 } },
  { id: 'spear', n: 'Lancia artigianale', cat: 'Armi', in: [[{ tag: 'stick' }, 1]], tools: ['knife'], out: ['spear', 1], time: 7, noise: 3, xp: { carp: 6 }, quality: 'carp' },
  { id: 'torch', n: 'Torcia improvvisata', cat: 'Utilità', in: [['branch', 1], ['rag', 1], [{ tag: 'fuel', amt: 0.1 }, 1]], out: ['torch_improv', 1], time: 4 },
  { id: 'sheet_rope', n: 'Corda di lenzuola', cat: 'Utilità', in: [['sheet', 2]], out: ['sheet_rope', 1], time: 5, d: 'Fissala sul bordo dove hai smontato le scale.' },
  { id: 'wash_rag', n: 'Lava gli stracci sporchi', cat: 'Medicina', in: [['rag_dirty', 2], [{ tag: 'water', amt: 0.25 }, 1]], out: ['rag', 2], time: 4 },
  { id: 'planks_log', n: 'Ricava assi dal tronco', cat: 'Materiali', in: [['log', 1]], tools: ['saw'], out: ['plank', 3], time: 9, noise: 14, xp: { carp: 6 } },
  { id: 'planks_door', n: 'Ricava assi da una porta', cat: 'Materiali', in: [['door_item', 1]], tools: ['saw'], out: ['plank', 3], time: 8, noise: 14, xp: { carp: 5 } },
  { id: 'planks_branch', n: 'Rami dalla legna', cat: 'Materiali', in: [['plank', 1]], tools: ['saw'], out: ['branch', 2], time: 4, noise: 10 },
  // cucina di base: serve una pentola o padella e una fonte di calore
  { id: 'hot_beans', n: 'Scalda i fagioli', cat: 'Cibo', in: [['beans', 1]], tools: ['pot'], heat: true, out: ['hot_beans', 1], time: 5, xp: { cook: 4 } },
  { id: 'hot_soup', n: 'Scalda la zuppa', cat: 'Cibo', in: [['soup_can', 1]], tools: ['pot'], heat: true, out: ['hot_soup', 1], time: 5, xp: { cook: 4 } },
  { id: 'pasta_dish', n: 'Cuoci la pasta', cat: 'Cibo', in: [['pasta', 1], [{ tag: 'water', amt: 0.5 }, 1]], tools: ['pot'], heat: true, out: ['pasta_dish', 1], time: 8, xp: { cook: 6 }, burnable: true },
  { id: 'rice_dish', n: 'Bolli il riso', cat: 'Cibo', in: [['rice', 1], [{ tag: 'water', amt: 0.5 }, 1]], tools: ['pot'], heat: true, out: ['rice_dish', 1], time: 8, xp: { cook: 5 }, burnable: true },
  { id: 'boiled_potato', n: 'Patate lesse', cat: 'Cibo', in: [['potato', 2], [{ tag: 'water', amt: 0.5 }, 1]], tools: ['pot'], heat: true, out: ['boiled_potato', 1], time: 7, xp: { cook: 5 } },
  { id: 'fried_eggs', n: 'Uova strapazzate', cat: 'Cibo', in: [['eggs', 1]], tools: ['pan'], heat: true, out: ['fried_eggs', 1], time: 5, xp: { cook: 5 }, burnable: true },
  { id: 'steak', n: 'Cuoci la carne', cat: 'Cibo', in: [['meat', 1]], tools: ['pan'], heat: true, out: ['steak', 1], time: 7, xp: { cook: 6 }, burnable: true },
  { id: 'boil_water', n: "Fai bollire l'acqua", cat: 'Cibo', special: 'boil', in: [[{ tag: 'tainted', amt: 0.25 }, 1]], tools: ['pot'], heat: true, out: null, time: 6, xp: { cook: 2 }, d: "Rende potabile l'acqua dei barili, del WC o dei fiumi." },
  // --- sbloccate da riviste e manuali
  { id: 'stew', n: 'Stufato', cat: 'Cibo', learn: 'mag_cook', in: [['meat', 1], [{ tag: 'veg' }, 2], [{ tag: 'water', amt: 0.5 }, 1]], tools: ['pot'], heat: true, bench: 'kitchen', out: ['stew', 2], time: 10, xp: { cook: 12 }, burnable: true },
  { id: 'veg_soup', n: 'Zuppa di verdure', cat: 'Cibo', learn: 'mag_cook', in: [[{ tag: 'veg' }, 3], [{ tag: 'water', amt: 0.5 }, 1]], tools: ['pot'], heat: true, out: ['veg_soup', 2], time: 9, xp: { cook: 10 }, burnable: true },
  { id: 'preserve', n: 'Conserva di pomodoro', cat: 'Cibo', learn: 'mag_cook', in: [['tomato', 3], ['jar', 1], [{ tag: 'water', amt: 0.5 }, 1]], tools: ['pot'], heat: true, bench: 'kitchen', out: ['preserve', 1], time: 10, skill: { cook: 1 }, xp: { cook: 10 } },
  { id: 'sterile_boil', n: 'Bolli bende e stracci', cat: 'Medicina', learn: 'man_med', in: [[{ tag: 'dressing' }, 1], [{ tag: 'water', amt: 0.25 }, 1]], tools: ['pot'], heat: true, out: ['sterile_bandage', 1], time: 6, xp: { med: 5 } },
  { id: 'disinfect_alcohol', n: 'Disinfettante dal whisky', cat: 'Medicina', learn: 'man_med', in: [['whiskey', 2]], bench: 'med', out: ['disinfectant', 1], time: 5, xp: { med: 5 } },
  { id: 'spiked_bat', n: 'Mazza chiodata', cat: 'Armi', learn: 'mag_wood1', in: [['bat', 1], ['nails', 6]], tools: ['hammer'], out: ['spiked_bat', 1], time: 8, noise: 16, skill: { carp: 1 }, xp: { carp: 10 }, quality: 'carp' },
  { id: 'metal_spear', n: 'Lancia di metallo', cat: 'Armi', learn: 'man_metal', in: [['pipe', 1], ['scrap', 1]], tools: ['welder', 'propane'], bench: 'mech', out: ['metal_spear', 1], time: 10, noise: 22, skill: { metal: 1 }, xp: { metal: 14 }, quality: 'metal' },
  { id: 'scrap_sheet', n: 'Lamiera dai rottami', cat: 'Materiali', learn: 'mag_mech', in: [['scrap', 4]], tools: ['welder', 'propane'], bench: 'mech', out: ['sheet_metal', 1], time: 10, noise: 24, skill: { metal: 1 }, xp: { metal: 12 } },
  { id: 'alarm_trap', n: 'Sveglia a tempo', cat: 'Utilità', learn: 'man_elec', in: [['alarm_clock', 1], ['batteries', 1]], tools: ['screwdriver'], bench: 'elec', out: ['alarm_clock', 1, { timer: true }], time: 6, xp: { elec: 8 }, d: 'Lasciata a terra, squilla da sola dopo un po\': una distrazione lontano da dove lavori.' },
  { id: 'charge_batteries', n: 'Ricarica le batterie', cat: 'Utilità', learn: 'man_elec', in: [['car_battery', 1]], bench: 'elec', needsPower: true, out: ['batteries', 3], time: 8, xp: { elec: 8 } },
  { id: 'seed_tomato', n: 'Estrai semi di pomodoro', cat: 'Agricoltura', learn: 'mag_farm', in: [['tomato', 1]], tools: ['knife'], out: ['seeds_tomato', 4], time: 4, xp: { farm: 4 } },
  { id: 'seed_potato', n: 'Taglia patate da semina', cat: 'Agricoltura', learn: 'mag_farm', in: [['potato', 1]], tools: ['knife'], out: ['seeds_potato', 2], time: 4, xp: { farm: 4 } },
];

export function recipeById(id) {
  return RECIPES.find((r) => r.id === id);
}
