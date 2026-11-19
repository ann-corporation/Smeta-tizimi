/**
 * YAGONA RAQAM FORMATI (sayt = Android = Windows; design/tokens.json `format`, namunalar design/fixtures/format.json).
 * Kotlin ikkilamchisi: android-native/shared .../core/data/Format.kt (formatMoney / formatVolume / formatPercent).
 * Qoida: guruh ajratgich NBSP, kasr — vergul, noma'lum (null/NaN) — «—» (hech qachon 0 emas), 0 — 0.
 * Yarim yuqoriga (HALF_UP) yaxlitlash o'nlik matn ustida — ikkilik suzuvchi nuqta xatosisiz (999.995 → 1 000,00).
 */
export const NBSP = ' ';
export const NOMALUM = '—';

function guruh(butun: string): string {
  return butun.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** |n| ni `kasr` xonagacha HALF_UP yaxlitlab, [butun, kasr] qator juftligini qaytaradi (belgisiz). */
function yaxlit(n: number, kasr: number): [string, string] {
  let s = Math.abs(n).toString();
  if (/e/i.test(s)) s = Math.abs(n).toFixed(Math.min(20, kasr + 6));
  const [b, k = ''] = s.split('.');
  if (k.length <= kasr) return [b, k.padEnd(kasr, '0')];
  const yarim = k.charCodeAt(kasr) >= 53; // '5' dan boshlab
  const raqamlar = (b + k.slice(0, kasr)).split('').map(Number);
  if (yarim) {
    let i = raqamlar.length - 1;
    while (i >= 0) { if (raqamlar[i] === 9) { raqamlar[i] = 0; i--; } else { raqamlar[i]++; break; } }
    if (i < 0) raqamlar.unshift(1);
  }
  const hammasi = raqamlar.join('');
  return [hammasi.slice(0, hammasi.length - kasr) || '0', hammasi.slice(hammasi.length - kasr)];
}

const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/** «1 234 567,89» — 2 kasr, null → «—». */
export function pulMatni(v: number | null | undefined, kasr = 2): string {
  if (!ok(v)) return NOMALUM;
  const [b, k] = yaxlit(v, kasr);
  const manfiy = v < 0 && /[1-9]/.test(b + k);
  return (manfiy ? '-' : '') + guruh(b) + (k ? ',' + k : '');
}

/** Hajm: 3 kasrgacha, ortiqcha nollar olinadi: «1 234,568», «3», «12,5». */
export function hajmMatni(v: number | null | undefined, kasr = 3): string {
  if (!ok(v)) return NOMALUM;
  const [b, k0] = yaxlit(v, kasr);
  const k = k0.replace(/0+$/, '');
  const manfiy = v < 0 && /[1-9]/.test(b + k);
  return (manfiy ? '-' : '') + guruh(b) + (k ? ',' + k : '');
}

/** Foiz: bir kasr, «12,3%». */
export function foizMatni(v: number | null | undefined): string {
  if (!ok(v)) return NOMALUM;
  const [b, k] = yaxlit(v, 1);
  const manfiy = v < 0 && /[1-9]/.test(b + k);
  return (manfiy ? '-' : '') + b + ',' + k + '%'; // Kotlin formatPercent bilan bir xil: guruhlanmaydi
}
