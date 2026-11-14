/**
 * Jarvis oynasi holati: uch rejim (kichik suzuvchi / keng yon panel / to'liq ekran), sudrab ko'chirish va o'lcham.
 * Sof funksiyalar + foydalanuvchi bo'yicha eslab qolish (localStorage, xato bo'lsa jim). Telefonda doim to'liq ekran varaq.
 */
export type Rejim = 'kichik' | 'yon' | 'toliq';
export type OynaHolat = {
  rejim: Rejim;
  /** Suzuvchi oynaning chap/yuqori burchagi (px); null — sukut joy (pastki o'ng). */
  x: number | null; y: number | null;
  /** Suzuvchi oyna o'lchami (px). */
  w: number; h: number;
  /** Yon panel kengligi (px). */
  yonW: number;
};

export const SUKUT_OYNA: OynaHolat = { rejim: 'kichik', x: null, y: null, w: 416, h: 640, yonW: 0 };
export const MIN_W = 320; export const MIN_H = 360; export const TELEFON_ENI = 640; export const CHEKKA = 8;
export const YON_MIN = 360; export const YON_MAX = 900;

export const telefonmi = (vw: number) => vw < TELEFON_ENI;
const chegara = (v: number, a: number, b: number) => Math.min(Math.max(v, a), Math.max(a, b));
const son = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Yon panel sukut kengligi: ekranning ~40% (YON_MIN..YON_MAX). */
export const yonSukut = (vw: number) => Math.round(chegara(vw * 0.4, YON_MIN, YON_MAX));

/** Saqlangan/noma'lum qiymatni ekranga sig'adigan to'g'ri holatga keltiradi. */
export function oynaTekshir(raw: unknown, vw: number, vh: number): OynaHolat {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rejim: Rejim = r.rejim === 'yon' || r.rejim === 'toliq' ? r.rejim : 'kichik';
  const w = Math.round(chegara(son(r.w, SUKUT_OYNA.w), MIN_W, vw - 2 * CHEKKA));
  const h = Math.round(chegara(son(r.h, SUKUT_OYNA.h), MIN_H, vh - 2 * CHEKKA));
  const x = typeof r.x === 'number' && Number.isFinite(r.x) ? Math.round(chegara(r.x, CHEKKA, vw - w - CHEKKA)) : null;
  const y = typeof r.y === 'number' && Number.isFinite(r.y) ? Math.round(chegara(r.y, CHEKKA, vh - h - CHEKKA)) : null;
  const yonW = Math.round(chegara(son(r.yonW, 0) || yonSukut(vw), YON_MIN, Math.min(YON_MAX, vw - 280)));
  return { rejim, x: x == null || y == null ? null : x, y: x == null || y == null ? null : y, w, h, yonW };
}

/** Suzuvchi oynaning hisoblangan to'rtburchagi (x/y yo'q bo'lsa pastki o'ng burchak). */
export function suzuvchiRect(o: OynaHolat, vw: number, vh: number) {
  const w = Math.min(o.w, vw - 2 * CHEKKA); const h = Math.min(o.h, vh - 2 * CHEKKA);
  const left = o.x ?? vw - w - 24; const top = o.y ?? vh - h - 24;
  return { left: chegara(left, CHEKKA, vw - w - CHEKKA), top: chegara(top, CHEKKA, vh - h - CHEKKA), width: w, height: h };
}

/** Sudrash: oyna ekrandan chiqib ketmaydi. */
export function surish(o: OynaHolat, dx: number, dy: number, vw: number, vh: number): OynaHolat {
  const r = suzuvchiRect(o, vw, vh);
  return { ...o, x: Math.round(chegara(r.left + dx, CHEKKA, vw - r.width - CHEKKA)), y: Math.round(chegara(r.top + dy, CHEKKA, vh - r.height - CHEKKA)) };
}

/** O'lcham o'zgartirish (pastki o'ng burchakdan): minimum va ekran chegarasi hisobga olinadi. */
export function olchamlash(o: OynaHolat, dw: number, dh: number, vw: number, vh: number): OynaHolat {
  const r = suzuvchiRect(o, vw, vh);
  return { ...o, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(chegara(r.width + dw, MIN_W, vw - r.left - CHEKKA)), h: Math.round(chegara(r.height + dh, MIN_H, vh - r.top - CHEKKA)) };
}

/** Yon panel kengligi (chap chetidan tortib). */
export function yonOlcham(o: OynaHolat, dw: number, vw: number): OynaHolat {
  return { ...o, yonW: Math.round(chegara((o.yonW || yonSukut(vw)) - dw, YON_MIN, Math.min(YON_MAX, vw - 280))) };
}

/** Samarali rejim: telefonda doim to'liq ekran; yon panel torayib ketgan ekranda to'liq ekranga o'tadi. */
export function amalRejim(o: OynaHolat, vw: number): Rejim {
  if (telefonmi(vw)) return 'toliq';
  if (o.rejim === 'yon' && vw < YON_MIN + 320) return 'toliq';
  return o.rejim;
}

export const oynaKaliti = (uid: number | null | undefined) => `jarvis-oyna:${uid ?? 0}`;
export function oynaOqi(kalit: string, vw: number, vh: number, st: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): OynaHolat {
  try { return oynaTekshir(st ? JSON.parse(st.getItem(kalit) ?? 'null') : null, vw, vh); } catch { return oynaTekshir(null, vw, vh); }
}
export function oynaYoz(kalit: string, o: OynaHolat, st: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage) {
  try { st?.setItem(kalit, JSON.stringify(o)); } catch { /* xotira yopiq — sukut bilan davom */ }
}
