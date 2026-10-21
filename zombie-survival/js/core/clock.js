// Orologio del mondo: minuti di gioco dall'inizio, giorno/notte, stagioni.
import { pad2, clamp } from './util.js';

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto',
  'settembre', 'ottobre', 'novembre', 'dicembre'];
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const START_DOY = 251; // 9 settembre
export const SEASONS = ['Inverno', 'Primavera', 'Estate', 'Autunno'];

export class Clock {
  constructor(minutes = 8 * 60) {
    this.min = minutes;
  }
  get day() {
    return Math.floor(this.min / 1440) + 1;
  }
  get days() {
    return this.min / 1440;
  }
  get hour() {
    return (this.min % 1440) / 60;
  }
  doy() {
    return (START_DOY + Math.floor(this.min / 1440)) % 365;
  }
  date() {
    let d = this.doy();
    let m = 0;
    while (d >= MDAYS[m]) {
      d -= MDAYS[m];
      m++;
    }
    return { d: d + 1, m };
  }
  dateStr() {
    const { d, m } = this.date();
    return d + ' ' + MONTHS[m];
  }
  timeStr() {
    const h = Math.floor(this.hour);
    const mm = Math.floor((this.hour - h) * 60);
    return pad2(h) + ':' + pad2(mm);
  }
  seasonIndex() {
    const m = this.date().m;
    if (m === 11 || m <= 1) return 0;
    if (m <= 4) return 1;
    if (m <= 7) return 2;
    return 3;
  }
  season() {
    return SEASONS[this.seasonIndex()];
  }
  // ore di luce in base al giorno dell'anno (latitudine prealpina ~46°)
  sunTimes() {
    const d = this.doy();
    const dl = 12 + 3.3 * Math.sin((2 * Math.PI * (d - 80)) / 365);
    return [13 - dl / 2, 13 + dl / 2];
  }
  // 0 = notte fonda, 1 = pieno giorno; transizioni morbide all'alba/tramonto
  daylight() {
    const h = this.hour;
    const [r, s] = this.sunTimes();
    if (h < r - 0.8 || h > s + 0.8) return 0;
    if (h < r + 0.8) return clamp((h - (r - 0.8)) / 1.6, 0, 1);
    if (h > s - 0.8) return clamp(((s + 0.8) - h) / 1.6, 0, 1);
    return 1;
  }
  isNight() {
    return this.daylight() < 0.25;
  }
  // elevazione del sole in radianti (negativa di notte)
  sunElevation() {
    const h = this.hour;
    const [r, s] = this.sunTimes();
    const noon = (r + s) / 2;
    const half = (s - r) / 2;
    const maxEl = 0.5 + 0.35 * Math.sin((2 * Math.PI * (this.doy() - 80)) / 365);
    const x = (h - noon) / half; // -1 alba, 0 mezzogiorno, 1 tramonto
    if (Math.abs(x) <= 1) return Math.cos((x * Math.PI) / 2) * maxEl;
    const over = Math.abs(x) - 1;
    return -Math.min(over * 0.9, 0.9);
  }
  sunAzimuth() {
    const h = this.hour;
    const [r, s] = this.sunTimes();
    const t = (h - r) / (s - r);
    return Math.PI * 0.5 + t * Math.PI; // da est (90°) a ovest (270°) passando per sud
  }
}
