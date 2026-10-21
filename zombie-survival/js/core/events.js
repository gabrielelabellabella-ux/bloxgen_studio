// Bus di eventi: i sistemi si parlano attraverso eventi invece che con riferimenti diretti
// (come chiedono le note tecniche del GDD).

export class EventBus {
  constructor() {
    this.map = new Map();
  }
  on(type, fn) {
    let list = this.map.get(type);
    if (!list) {
      list = [];
      this.map.set(type, list);
    }
    list.push(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) {
    const list = this.map.get(type);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }
  emit(type, data) {
    const list = this.map.get(type);
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      try {
        list[i](data);
      } catch (e) {
        console.error('[evento ' + type + ']', e);
      }
    }
  }
  clear() {
    this.map.clear();
  }
}
