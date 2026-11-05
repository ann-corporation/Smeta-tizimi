/**
 * «Keyingi qadam» murabbiyi — obyekt holatidan KEYINGI ishni tanlaydigan YAGONA sof funksiya (egasi, 2026-11-05:
 * sinovchi smeta yuklab podval qo'ydi-yu, fakt → F2 → portfelni topmay to'xtadi).
 *
 * Ketma-ketlik: smeta → podval → fakt → shu oy F2 → qoralamalarni tasdiqlash → F2 portfeli.
 * NULL = noma'lum (o'qilmagan / o'qib bo'lmadi): taxmin qilinmaydi. Podval noma'lum bo'lsa — o'tkazib yuboriladi
 * (eski server `nk_manba` qaytarmaydi); qolgan qadamlar uchun noma'lum bo'lsa — maslahat berilmaydi (null).
 */
import { bosqich } from '../f2-reestr/reestr';

export type ObyektHolati = {
  smetaBor: boolean | null;
  podvalBor: boolean | null;
  faktBor: boolean | null;
  /** Joriy oy uchun (bekor qilinmagan) F2 bormi. */
  f2JoriyOyBor: boolean | null;
  /** Tasdiqlanmagan (jarayonda yoki rad etilgan) F2 lar soni. */
  qoralamaSoni: number | null;
  tasdiqlanganSoni: number | null;
};

export type QadamTuri = 'smeta' | 'podval' | 'fakt' | 'f2' | 'tasdiqlash' | 'portfel';

export type KeyingiQadam = {
  tur: QadamTuri;
  /** Tugma matni (i18n kaliti; `{n}` o'rinbosari bilan). */
  matn: string;
  /** Nega aynan shu qadam — bir qator izoh (i18n kaliti). */
  izoh: string;
  /** Sahifa yo'li (obyekt oldindan tanlangan) — `?qollanma=` bilan: o'sha sahifaning birinchi kartasi shuni tushuntiradi. */
  yol: string;
  /** Qaysi qollanma kartasi (lib/qollanma/reestr kaliti). */
  karta: string;
  n?: number;
};

/** Tartibdagi qadamlar (testlar va UI qadam chizig'i uchun). */
export const QADAMLAR: readonly QadamTuri[] = ['smeta', 'podval', 'fakt', 'f2', 'tasdiqlash', 'portfel'];

export function keyingiQadam(h: ObyektHolati, obyektId: number): KeyingiQadam | null {
  const o = obyektId;
  if (h.smetaBor == null) return null;
  if (!h.smetaBor) return { tur: 'smeta', matn: 'Smetani yuklang', izoh: 'Obyektda hali smeta yo‘q — fakt va F2 smetadan boshlanadi.', yol: `/admin/holat/${o}?panel=smeta&qollanma=smeta-yuklash`, karta: 'smeta-yuklash' };
  if (h.podvalBor === false) return { tur: 'podval', matn: 'Nakrutka podvalini qo‘ying', izoh: 'Podval yo‘q — summalar kompaniya sukut foizlari bilan hisoblanmoqda.', yol: `/admin/holat/${o}?panel=smeta&qollanma=podval`, karta: 'podval' };
  if (h.faktBor == null) return null;
  if (!h.faktBor) return { tur: 'fakt', matn: 'Faktni kiriting (Fakt jurnali)', izoh: 'Smeta tayyor. Endi bajarilgan ishni yozing — F2 shundan tuziladi.', yol: `/admin/fakt?obyekt=${o}&qollanma=fakt`, karta: 'fakt' };
  if (h.f2JoriyOyBor == null) return null;
  if (!h.f2JoriyOyBor) return { tur: 'f2', matn: 'F2 tayyorlang', izoh: 'Fakt bor, lekin shu oy uchun F2 hali yo‘q.', yol: `/admin/f2-tayyorlash?obyekt=${o}&qollanma=f2-tayyorlash`, karta: 'f2-tayyorlash' };
  if (h.qoralamaSoni == null) return null;
  if (h.qoralamaSoni > 0) return { tur: 'tasdiqlash', matn: 'Qoralamalarni tekshirib tasdiqlang ({n} ta)', izoh: 'Tasdiqlanmagan F2 hujjat bo‘lmaydi va portfel jamiga kirmaydi.', yol: `/admin/f2-tarix?obyekt=${o}&qollanma=f2-tarix`, karta: 'f2-tarix', n: h.qoralamaSoni };
  return { tur: 'portfel', matn: 'F2 portfelida yig‘ib, Excel yuklang', izoh: 'F2 lar tasdiqlangan — hammasini bitta Excelda oling.', yol: `/admin/f2-reestr?portfel=1&portfel_obyekt=${o}&qollanma=f2-portfel`, karta: 'f2-portfel' };
}

type AktQisqa = { tur: string | null; oy: string | null; holat: string | null; lifecycle_status?: string | null };

/** Akt reestri (`t2_akt_reestr`) qatorlaridan fakt/F2 holati. `joriyOy` — 'YYYY-MM'. Bekor qilingan F2 hisobga olinmaydi. */
export function aktlardanHolat(aktlar: readonly AktQisqa[], joriyOy: string): Pick<ObyektHolati, 'faktBor' | 'f2JoriyOyBor' | 'qoralamaSoni' | 'tasdiqlanganSoni'> {
  const f2 = aktlar.filter((a) => a.tur === 'f2')
    .map((a) => ({ a, b: bosqich({ holat: a.holat ?? '', lifecycle_status: a.lifecycle_status ?? null }) }))
    .filter((x) => x.b !== 'bekor');
  return {
    faktBor: aktlar.some((a) => a.tur === 'fakt'),
    f2JoriyOyBor: f2.some((x) => (x.a.oy ?? '').slice(0, 7) === joriyOy),
    qoralamaSoni: f2.filter((x) => x.b !== 'tasdiqlangan').length,
    tasdiqlanganSoni: f2.filter((x) => x.b === 'tasdiqlangan').length,
  };
}

/** Mahalliy vaqt bo'yicha joriy oy: 'YYYY-MM'. */
export function joriyOy(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
