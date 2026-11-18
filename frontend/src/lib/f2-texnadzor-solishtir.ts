/**
 * Texnadzor qaytargan F-2 Excel'ni joriy qoralama bilan solishtirish (faqat o'qish, hech narsa yozilmaydi).
 * Oqim: tizim F-2 ni eksport qiladi (yashirin КАЛИТ ustuni = "<qator_id>:<izi>") -> texnadzor hajmni o'zgartiradi,
 * qator qo'shadi, katakni bo'yaydi, КАЛИТ dan keyingi ustunga izoh yozadi -> fayl shu yerda qoralama bilan solishtiriladi.
 * Sof mantiq: faylni o'qish f2-texnadzor-oqi.ts da, ko'rinish F2TexnadzorSolishtir.tsx da.
 */

export type FaylQator = {
  /** Excel qator raqami (1-asosli). */
  qator: number;
  shifr: string;
  nom: string;
  /** «Тип» belgisi (bl/mat/ob/rs/rz), kichik harfda; bo'sh bo'lishi mumkin. */
  tip: string;
  hajm: number | null;
  narx: number | null;
  summa: number | null;
  /** КАЛИТ ustunidagi xom matn (raqamli bo'lmasa — texnadzor qo'shgan qator). */
  kalit: string | null;
  /** КАЛИТ dan keyingi ustun: texnadzor izohi. */
  izoh: string;
  /** Katak foni (RRGGBB) yoki null. */
  rang: string | null;
};

export type QoralamaQator = { id: number; kod: string | null; nom: string | null; tur: string | null; hajm: number | null; narx: number | null };

export type Holat = 'TENG' | 'HAJM_FARQ' | 'NARX_FARQ' | 'TIZIMDA_YOQ' | 'FAYLDA_YOQ' | 'KALITSIZ';
export type IzohHolat = 'BAJARILDI' | 'HUJJAT_KERAK' | 'OCHIQ';
export type Chip = 'bajarildi' | 'bizning' | 'yangi' | 'hujjat' | 'ochiq';

export type Natija = {
  /** Fayldagi Excel qatori (faylda yo'q qator uchun null). */
  qator: number | null;
  id: number | null;
  tip: string;
  shifr: string;
  nom: string;
  izoh: string;
  rang: string | null;
  fHajm: number | null;
  dHajm: number | null;
  fNarx: number | null;
  dNarx: number | null;
  holat: Holat;
  /** KALITSIZ qator qoralamada shifr+hajm bo'yicha topildi (texnadzor qo'shganini biz kiritganmiz). */
  kiritilgan: boolean;
  izohHolat: IzohHolat | null;
  chip: Chip | null;
  /** Xulosada hisoblanadimi (faqat BL/MAT/OB va texnadzor qo'shgan qatorlar). */
  hisobga: boolean;
  /** RS (resurs) qatori — BL tagida kulrang ko'rsatiladi. */
  rs: boolean;
};

export type Xulosa = Record<Chip, number>;

const HUJJAT_RE = /лаборат|лабарат|разбивк|фактур|сертифик|испал|исполн|ҳужжат|котлонадзор|цеплени/i;
const OCHIQ_RE = /олиб|камайт|ўзгарт|қилинмаган|бажарилмаган|1 км|газоблок|мос эмас|фарқ|қойилсин|ўрнатилмаган/i;
const OLIB_RE = /олиб|қилинмаган/i;
const JAMI_RE = /^\s*(итого|всего|ндс|в том числе|жами)/i;

const EPS = 1e-6;
const teng = (a: number | null, b: number | null) => a == null || b == null ? a == b : Math.abs(a - b) <= EPS * Math.max(1, Math.abs(b));
const normShifr = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, '');

/** "123:abcd" -> 123; boshqa shakl -> null. */
export function kalitId(kalit: string | null | undefined): number | null {
  const m = /^\s*(\d+)\s*:/.exec(kalit ?? '');
  return m ? Number(m[1]) : null;
}

export function izohHolatiniTop(izoh: string, holat: Holat): IzohHolat | null {
  const matn = izoh.trim();
  if (!matn) return null;
  if (holat === 'TIZIMDA_YOQ') return 'BAJARILDI';
  const ochiq = OCHIQ_RE.test(matn);
  // «olib tashlansin / qilinmagan» — faqat hajm o'zgargan bo'lsa ham ish tugamagan (qator hali bor).
  if (holat === 'HAJM_FARQ' && OLIB_RE.test(matn)) return 'OCHIQ';
  if (holat === 'HAJM_FARQ' || holat === 'NARX_FARQ') return 'BAJARILDI';
  if (ochiq) return 'OCHIQ';
  if (HUJJAT_RE.test(matn)) return 'HUJJAT_KERAK';
  return 'OCHIQ'; // izoh bor, qator o'zgarmagan, hujjat talabi ham emas — hal bo'lmagan deb ko'rsatamiz
}

function chipTop(n: Pick<Natija, 'holat' | 'kiritilgan' | 'izohHolat'>): Chip | null {
  if (n.holat === 'KALITSIZ') return n.kiritilgan ? 'bajarildi' : 'yangi';
  if (n.izohHolat) return n.izohHolat === 'BAJARILDI' ? 'bajarildi' : n.izohHolat === 'HUJJAT_KERAK' ? 'hujjat' : 'ochiq';
  return n.holat === 'TENG' ? null : 'bizning';
}

export function solishtir(fayl: readonly FaylQator[], qoralama: readonly QoralamaQator[]): { qatorlar: Natija[]; xulosa: Xulosa } {
  const dr = new Map(qoralama.map((q) => [q.id, q]));
  const faylIdlar = new Set<number>();
  for (const f of fayl) { const id = kalitId(f.kalit); if (id != null) faylIdlar.add(id); }
  const ishlatilgan = new Set<number>();
  const chiqish: Natija[] = [];

  for (const f of fayl) {
    const id = kalitId(f.kalit);
    const asos = { qator: f.qator, tip: f.tip, shifr: f.shifr, nom: f.nom, izoh: f.izoh, rang: f.rang, fHajm: f.hajm, fNarx: f.narx, rs: f.tip === 'rs' };
    if (id == null) {
      // KALITSIZ: faqat qiymati bor qator (sarlavha/jami emas) — texnadzor qo'shgan.
      if ((f.hajm == null && f.narx == null) || JAMI_RE.test(f.nom) || (!f.nom.trim() && !f.shifr.trim())) continue;
      const sh = normShifr(f.shifr);
      const mos = sh ? qoralama.find((q) => !faylIdlar.has(q.id) && !ishlatilgan.has(q.id) && normShifr(q.kod) === sh && teng(f.hajm, q.hajm)) : undefined;
      if (mos) ishlatilgan.add(mos.id);
      const n: Natija = { ...asos, id: mos?.id ?? null, dHajm: mos?.hajm ?? null, dNarx: mos?.narx ?? null, holat: 'KALITSIZ', kiritilgan: !!mos, izohHolat: null, chip: null, hisobga: true };
      n.izohHolat = f.izoh.trim() ? izohHolatiniTop(f.izoh, 'KALITSIZ') : null;
      n.chip = chipTop(n);
      chiqish.push(n);
      continue;
    }
    const q = dr.get(id);
    let holat: Holat;
    if (!q) holat = 'TIZIMDA_YOQ';
    else if (!teng(f.hajm, q.hajm)) holat = 'HAJM_FARQ';
    else if (f.narx != null && q.narx != null && !teng(f.narx, q.narx)) holat = 'NARX_FARQ';
    else holat = 'TENG';
    const n: Natija = { ...asos, id, dHajm: q?.hajm ?? null, dNarx: q?.narx ?? null, holat, kiritilgan: false, izohHolat: izohHolatiniTop(f.izoh, holat), chip: null, hisobga: ['bl', 'mat', 'ob'].includes(f.tip) };
    n.chip = chipTop(n);
    chiqish.push(n);
  }

  // Qoralamada bor, faylda yo'q: eksportdan keyin biz qo'shgan qatorlar.
  for (const q of qoralama) {
    if (faylIdlar.has(q.id) || ishlatilgan.has(q.id)) continue;
    const tur = (q.tur ?? '').toLowerCase();
    if (tur === 'rz' || !q.hajm) continue;
    const n: Natija = { qator: null, id: q.id, tip: tur, shifr: q.kod ?? '', nom: q.nom ?? '', izoh: '', rang: null, fHajm: null, dHajm: q.hajm, fNarx: null, dNarx: q.narx, holat: 'FAYLDA_YOQ', kiritilgan: false, izohHolat: null, chip: 'bizning', hisobga: ['bl', 'mat', 'ob'].includes(tur), rs: tur === 'rs' };
    chiqish.push(n);
  }

  const xulosa: Xulosa = { bajarildi: 0, bizning: 0, yangi: 0, hujjat: 0, ochiq: 0 };
  for (const n of chiqish) if (n.hisobga && n.chip) xulosa[n.chip]++;
  return { qatorlar: chiqish, xulosa };
}
