/**
 * Hujjatlar paketi - ro'yxat ko'rinishi (egasi 2026-11-19): ixcham filtr paneli + oddiy natija ro'yxati. TOZA mantiq (UI va testlar uchun):
 * filtr holati <-> server filtri, yangilik matni («Excel tayyor · v5 · 2 daqiqa oldin»), tanlov va token bahosi (faqat TO'LANMAGAN hujjatlar),
 * saqlangan filtrlarni tozalash. Server filtrlaydi va sahifalaydi (t2_hujjat_paket_royxat_v1) - mijozda yuzlab aktni aylanish yo'q.
 */
import { OY_RE, TUR_NOMI, TUR_TARTIB, katakBahosi, type Nomzod, type PaketFiltr, type PaketHolat } from './nomzod';

/** Server qaytaradigan qator: Nomzod + navbat holati va to'lov belgisi (SQL t2_hujjat_paket_royxat_v1). */
export type RoyxatQator = Nomzod & { yangilanmoqda?: boolean; navbat_holat?: string | null; navbat_xato?: string | null; raqam?: string | null; tolangan?: boolean };

/** UI filtr holati. */
export type FiltrHolati = {
  shartnomaId: number | null;
  obyektIds: number[];
  oyDan: string | null;
  oyGacha: string | null;
  turlar: string[];
  holatlar: PaketHolat[];
};
export const BOSH_FILTR: FiltrHolati = { shartnomaId: null, obyektIds: [], oyDan: null, oyGacha: null, turlar: [], holatlar: [] };

export const HOLAT_NOMI: Readonly<Record<string, string>> = { tasdiqlangan: 'Tasdiqlangan', qoralama: 'Qoralama', joriy: 'Joriy' };
export const FILTR_HOLATLARI: readonly PaketHolat[] = ['tasdiqlangan', 'qoralama'];
export const FILTR_TURLARI: readonly string[] = TUR_TARTIB;

export function filtrdanServerga(f: FiltrHolati): PaketFiltr {
  const o: { -readonly [K in keyof PaketFiltr]: PaketFiltr[K] } = {};
  if (f.shartnomaId != null) o.shartnomaIds = [f.shartnomaId];
  if (f.obyektIds.length) o.obyektIds = [...f.obyektIds];
  if (f.oyDan && OY_RE.test(f.oyDan)) o.oyDan = f.oyDan;
  if (f.oyGacha && OY_RE.test(f.oyGacha)) o.oyGacha = f.oyGacha;
  if (f.turlar.length) o.turlar = [...f.turlar];
  if (f.holatlar.length) o.holatlar = [...f.holatlar];
  return o;
}

/** Saqlangan filtr (server JSON, snake_case) -> UI holati. Noma'lum/yaroqsiz qiymatlar tashlanadi. */
export function filtrniTozala(xom: unknown): FiltrHolati {
  const j = (xom && typeof xom === 'object' ? xom : {}) as Record<string, unknown>;
  const sonlar = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 200) : []);
  const oy = (v: unknown): string | null => (typeof v === 'string' && OY_RE.test(v) ? v : null);
  const sh = sonlar(j.shartnoma_ids)[0] ?? null;
  const turlar = (Array.isArray(j.turlar) ? j.turlar.map(String) : []).filter((t) => TUR_NOMI[t]);
  const holatlar = (Array.isArray(j.holatlar) ? j.holatlar.map(String) : []).filter((h): h is PaketHolat => h === 'tasdiqlangan' || h === 'qoralama');
  let dan = oy(j.oy_dan), gacha = oy(j.oy_gacha);
  if (dan && gacha && dan > gacha) [dan, gacha] = [gacha, dan];
  return { shartnomaId: sh, obyektIds: sonlar(j.obyekt_ids), oyDan: dan, oyGacha: gacha, turlar, holatlar };
}

/** Filtr bo'shmi (hech narsa tanlanmagan). */
export const filtrBosh = (f: FiltrHolati): boolean => f.shartnomaId == null && !f.obyektIds.length && !f.oyDan && !f.oyGacha && !f.turlar.length && !f.holatlar.length;

/** Bitta oy tanlansa - oyDan=oyGacha. Teskari oraliq almashtiriladi. */
export function oyOraligi(dan: string | null, gacha: string | null): { dan: string | null; gacha: string | null } {
  const d = dan && OY_RE.test(dan) ? dan : null, g = gacha && OY_RE.test(gacha) ? gacha : null;
  if (d && g && d > g) return { dan: g, gacha: d };
  return { dan: d, gacha: g };
}

/** «Excel tayyor · v5 · 2 daqiqa oldin» / «yangilanmoqda» / «Diskda yo'q». `hozir` - ms (test uchun). */
export function yangilikMatni(q: Pick<RoyxatQator, 'fayl_id' | 'versiya' | 'yangilandi' | 'yangilanmoqda' | 'navbat_holat'>, hozir: number = Date.now()): string {
  if (q.navbat_holat === 'xato') return 'Yangilanmadi (qayta uriniladi)';
  if (q.fayl_id == null) return q.yangilanmoqda ? 'Yangilanmoqda' : 'Diskda yo\'q';
  const v = q.versiya != null ? ` · v${q.versiya}` : '';
  const t = q.yangilandi ? ` · ${oldin(hozir - Date.parse(q.yangilandi))}` : '';
  return `${q.yangilanmoqda ? 'Eski versiya' : 'Excel tayyor'}${v}${t}`;
}

export function oldin(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'hozirgina';
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'hozirgina';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} daqiqa oldin`;
  const soat = Math.floor(m / 60);
  if (soat < 24) return `${soat} soat oldin`;
  return `${Math.floor(soat / 24)} kun oldin`;
}

/** Tanlangan hujjatlarni (kalit bo'yicha) ro'yxatdan oladi; takror (bir obyekt+oyda ortiqcha F-2) tanlanmaydi. */
export function tanlanganlar(qatorlar: readonly RoyxatQator[], tanlov: ReadonlySet<string>): RoyxatQator[] {
  return qatorlar.filter((q) => tanlov.has(q.kalit) && !q.takror && !q.taxminiy);
}

/**
 * Token bahosi: faqat hali TO'LANMAGAN (mazmun kaliti bo'yicha) va yasaladigan hujjatlar; to'langan yoki Diskdagi (to'langan) qayta yuklash - bepul.
 * `narx(katak)` - chaqiruvchi beradi (sayt: narxHisob). null - narx noma'lum.
 */
export function yuklashBahosi(tanlangan: readonly RoyxatQator[], narx: ((katak: number) => number | null) | null): { tolanadigan: number; bepul: number; token: number | null } {
  // Bepul: allaqachon to'langan (mazmun kaliti) yoki Diskdagi F-2 dan boshqa tur (Disk bepul). F-2 har doim server orqali (token shu yerda, bir marta).
  const tolanadigan = tanlangan.filter((q) => !(q.tolangan || (q.tur !== 'f2' && q.fayl_id != null)));
  if (!tolanadigan.length) return { tolanadigan: 0, bepul: tanlangan.length, token: 0 };
  if (!narx) return { tolanadigan: tolanadigan.length, bepul: tanlangan.length - tolanadigan.length, token: null };
  let jami = 0;
  for (const q of tolanadigan) { const t = narx(katakBahosi(q)); if (t == null) return { tolanadigan: tolanadigan.length, bepul: tanlangan.length - tolanadigan.length, token: null }; jami += t; }
  return { tolanadigan: tolanadigan.length, bepul: tanlangan.length - tolanadigan.length, token: jami };
}

/** Obyekt qidiruvi (type-to-search): nom bo'yicha, kichik/katta harfga befarq. */
export function obyektQidir<T extends { id: number; nom: string }>(obyektlar: readonly T[], q: string, tanlangan: readonly number[] = [], maks = 8): T[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return obyektlar.filter((o) => !tanlangan.includes(o.id) && o.nom.toLowerCase().includes(s)).slice(0, maks);
}
