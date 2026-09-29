/**
 * hujjat-yozuvchi/propis.ts — summa so'z bilan (rus tilida): Форма № 3 dagi
 * «ВСЕГО: Тридцать восемь миллионов … сум 00 тийин» qatori (rasmiy blanka
 * 1_F3__ОБР va PTO.uz Ф3 dagi kabi).
 */
const BIRLAR_E = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const BIRLAR_A = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const ONLAR_1 = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const ONLAR = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const YUZLAR = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

/** [1, 2–4, 5+] shakllari; ayol jinsi (тысяча) — `ayol`. */
const DARAJALAR: Array<{ s: [string, string, string]; ayol: boolean }> = [
  { s: ['', '', ''], ayol: false },
  { s: ['тысяча', 'тысячи', 'тысяч'], ayol: true },
  { s: ['миллион', 'миллиона', 'миллионов'], ayol: false },
  { s: ['миллиард', 'миллиарда', 'миллиардов'], ayol: false },
  { s: ['триллион', 'триллиона', 'триллионов'], ayol: false },
];

function shakl(n: number, s: readonly [string, string, string]): string {
  const a = n % 100, b = n % 10;
  if (a >= 11 && a <= 19) return s[2];
  if (b === 1) return s[0];
  if (b >= 2 && b <= 4) return s[1];
  return s[2];
}

function uchlik(n: number, ayol: boolean): string[] {
  const out: string[] = [];
  if (n >= 100) out.push(YUZLAR[Math.floor(n / 100)]);
  const o = n % 100;
  if (o >= 10 && o <= 19) out.push(ONLAR_1[o - 10]);
  else {
    if (o >= 20) out.push(ONLAR[Math.floor(o / 10)]);
    if (o % 10) out.push((ayol ? BIRLAR_A : BIRLAR_E)[o % 10]);
  }
  return out;
}

/** Butun sonni so'z bilan (0 → «ноль»). */
export function sonSozBilan(n: number): string {
  let x = Math.floor(Math.abs(n));
  if (x === 0) return 'ноль';
  const qism: string[] = [];
  for (let d = 0; x > 0 && d < DARAJALAR.length; d++) {
    const u = x % 1000;
    x = Math.floor(x / 1000);
    if (!u) continue;
    const soz = uchlik(u, DARAJALAR[d].ayol);
    if (d > 0) soz.push(shakl(u, DARAJALAR[d].s));
    qism.unshift(soz.join(' '));
  }
  return qism.join(' ');
}

/** «Тридцать восемь миллионов … сум 00 тийин» (manfiy — «минус …»). */
export function summaSozBilan(summa: number): string {
  const yax = Math.round(Math.abs(summa) * 100);
  const butun = Math.floor(yax / 100), tiyin = yax % 100;
  const m = sonSozBilan(butun);
  return `${summa < 0 ? 'минус ' : ''}${m.charAt(0).toUpperCase()}${m.slice(1)} сум ${String(tiyin).padStart(2, '0')} тийин`;
}
