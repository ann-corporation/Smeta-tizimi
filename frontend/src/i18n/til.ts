/**
 * Interfeys tili (egasi, 2026-10-02): o'zbek (lotin — asosiy manba), o'zbek (kirill — avtomatik), rus, ingliz.
 *
 * QOIDA (docs: AGENTS.md "Til qoidasi"):
 *  • Interfeysdagi har matn `t('Oʻzbekcha lotin matn')` orqali — kalit = o'zbek lotin matnning o'zi.
 *  • Rus/ingliz tarjima — `lugat/ru.json`, `lugat/en.json` + YANGI matnlar `lugat/qism/<mavzu>.json` ga
 *    (`{ "kalit": { "ru": "...", "en": "..." } }`, har ish o'z fayli — PR lar ziddiyatsiz). Topilmasa — o'zbekcha ko'rinadi.
 *  • O'zbek kirill — `lotinKirill()` bilan avtomatik; qoidaga sig'maganlari `lugat/kirill-istisno.json`.
 *  • Rasmiy hujjatlar (F2, F3, M-29, akt…) — RUS tilida qoladi, bu yerga kirmaydi; smeta ma'lumoti tarjima qilinmaydi.
 *  • Til almashganda ilova qayta chiziladi (`TilChegarasi`), shuning uchun `t()` ni render ichida chaqirish kifoya.
 */
import { useSyncExternalStore } from 'react';
import { lugatHolat } from './lugat-holat';
import kirillIstisno from './lugat/kirill-istisno.json';
import { lotinKirill, sozIstisnolariniQoy } from './lotin-kirill';

export type Til = 'uz' | 'uz-Cyrl' | 'ru' | 'en';
export const TILLAR: { kod: Til; nom: string; qisqa: string }[] = [
  { kod: 'uz', nom: 'Oʻzbekcha', qisqa: 'UZ' },
  { kod: 'uz-Cyrl', nom: 'Ўзбекча', qisqa: 'ЎЗ' },
  { kod: 'ru', nom: 'Русский', qisqa: 'RU' },
  { kod: 'en', nom: 'English', qisqa: 'EN' },
];

/* Tez yuklash (2026-10-30): ru/en lug'ati (~1 MB) boshlang'ich bundle'da emas — faqat kerak bo'lganda
 * dinamik yuklanadi. O'zbek (lotin/kirill) lug'atsiz ishlaydi. `main.tsx` tanlangan tilni render'dan
 * OLDIN `tilTayyorla()` bilan yuklaydi — tarjimasiz «miltillash» bo'lmaydi. */
let lugatVada: Promise<void> | null = null;
function lugatKerak(til: Til): til is 'ru' | 'en' { return til === 'ru' || til === 'en'; }

/** ru/en lug'atini yuklaydi (bir marta). */
export function lugatniYukla(): Promise<void> {
  if (lugatHolat.lugat) return Promise.resolve();
  lugatVada ??= import('./lugat').then((m) => { lugatHolat.lugat = { ru: m.LUGAT_RU, en: m.LUGAT_EN }; })
    .catch((e) => { lugatVada = null; throw e; });
  return lugatVada;
}
let kutilayotgan: Til | null = null; // lug'at yuklanayotganda oxirgi so'ralgan til
const ISTISNO = kirillIstisno as { sozlar: Record<string, string>; matnlar: Record<string, string> };
sozIstisnolariniQoy(ISTISNO.sozlar ?? {});

const KALIT = 'til';
function boshlangich(): Til {
  try {
    const s = localStorage.getItem(KALIT);
    if (s && TILLAR.some((x) => x.kod === s)) return s as Til;
  } catch { /* xotira yopiq */ }
  return 'uz';
}

let joriy: Til = boshlangich();
if (typeof document !== 'undefined') document.documentElement.lang = joriy;
const tinglovchilar = new Set<() => void>();
const kirillKesh = new Map<string, string>();

function yangila(til: Til, saqla: boolean): void {
  // Lug'at hali yuklanmagan bo'lsa — avval yuklab, keyin almashtiramiz (yarim tarjima ko'rinmasin).
  if (lugatKerak(til) && !lugatHolat.lugat) {
    kutilayotgan = til;
    void lugatniYukla().then(
      () => { if (kutilayotgan === til) { kutilayotgan = null; yangila(til, saqla); } },
      (e) => { if (kutilayotgan === til) kutilayotgan = null; console.error('[til] lug\'at yuklanmadi', e); });
    return;
  }
  kutilayotgan = null;
  if (til === joriy) return;
  joriy = til;
  kirillKesh.clear();
  if (saqla) try { localStorage.setItem(KALIT, til); } catch { /* xotira yopiq */ }
  if (typeof document !== 'undefined') document.documentElement.lang = til;
  tinglovchilar.forEach((f) => f());
}

/** Bitta foydalanuvchi bir necha tabda ishlasa, ko‘rinish tili ham bir xil qoladi. */
if (typeof window !== 'undefined') window.addEventListener('storage', (event) => {
  if (event.key !== KALIT || !event.newValue) return;
  if (TILLAR.some((x) => x.kod === event.newValue)) yangila(event.newValue as Til, false);
});

export function tilOl(): Til { return joriy; }

/** Ilova chizilishidan oldin: joriy til ru/en bo'lsa lug'atni yuklaydi. Xato bo'lsa ham ilova ochiladi (o'zbekcha). */
export function tilTayyorla(): Promise<void> {
  return lugatKerak(joriy) ? lugatniYukla().catch((e) => console.error('[til] lug\'at yuklanmadi', e)) : Promise.resolve();
}

export function tilQoy(til: Til): void {
  yangila(til, true);
}

function tilObuna(f: () => void): () => void { tinglovchilar.add(f); return () => { tinglovchilar.delete(f); }; }

/** Tarjima: `manba` — o'zbek lotin matn (kalit). `{nom}` o'rinbosarlari `p` dan to'ldiriladi. */
export function t(manba: string, p?: Record<string, string | number>): string {
  let s: string;
  if (joriy === 'uz') s = manba;
  else if (joriy === 'uz-Cyrl') {
    s = kirillKesh.get(manba) ?? '';
    if (!s) { s = ISTISNO.matnlar?.[manba] ?? lotinKirill(manba); kirillKesh.set(manba, s); }
  } else s = lugatHolat.lugat?.[joriy][manba] ?? manba;
  return p ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m)) : s;
}

/** Komponent tilni kuzatadi (almashganda qayta chiziladi). */
export function useTil(): { til: Til; t: typeof t; tilQoy: typeof tilQoy } {
  const til = useSyncExternalStore(tilObuna, tilOl, tilOl);
  return { til, t, tilQoy };
}

/** Sanalar va raqamlar uchun locale. */
export function tilLocale(til: Til = joriy): string {
  return til === 'ru' ? 'ru-RU' : til === 'en' ? 'en-GB' : til === 'uz-Cyrl' ? 'uz-Cyrl-UZ' : 'uz-Latn-UZ';
}

/** UI sonlari tanlangan tilga mos ko‘rsatiladi; hisoblash yoki Excelga ta’sir qilmaydi. */
export function raqamFormatla(qiymat: number | null | undefined, opts: Intl.NumberFormatOptions = {}): string {
  if (qiymat == null || !Number.isFinite(qiymat)) return '—';
  return new Intl.NumberFormat(tilLocale(), opts).format(qiymat);
}

/** UI sanasi; rasmiy Excel/PDF hujjatlari o‘z template tilini saqlaydi. */
export function sanaFormatla(qiymat: string | number | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  if (qiymat == null || qiymat === '') return '—';
  const sana = qiymat instanceof Date ? qiymat : new Date(qiymat);
  if (Number.isNaN(sana.getTime())) return '—';
  return new Intl.DateTimeFormat(tilLocale(), opts).format(sana);
}

/** Testlar uchun: tilni xotirasiz o'rnatish. */
export function _tilniTestdaQoy(til: Til): void { yangila(til, false); }
