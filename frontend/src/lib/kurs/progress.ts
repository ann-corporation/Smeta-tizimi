/**
 * KURS PROGRESSI — har foydalanuvchi uchun alohida, bir necha bayt. Serverda umumiy foydalanuvchi sozlamalari jadvali yo‘q
 * va baza byudjeti tugagan: `qollanma/korilgan.ts` qoidasi bo‘yicha brauzer xotirasi (localStorage), kalit = foydalanuvchi xeshi.
 * Boshqa foydalanuvchi kaliti bilan yozish mumkin emas (kalit funksiya argumenti bilan qat’iy ajratilgan). Xotira yopiq bo‘lsa — sessiya zaxirasi.
 * Keyinchalik serverga o‘tish uchun faqat shu fayl (xotiraOqi / xotiraYoz) almashtiriladi.
 */
export type KursXotira = {
  /** Bajarilgan darslar: id -> vaqt (soniya, 36 lik). */
  b: Record<string, string>;
  /** Joriy (yarim qolgan) dars: dars id, qadam, vaqt. */
  j?: { d: string; q: number; t: string };
};

const PREFIKS = 'fz-kurs:';
const zaxira = new Map<string, KursXotira>();
const tinglovchilar = new Set<() => void>();

const hozir = () => Math.floor(Date.now() / 1000).toString(36);

export function xotiraOqi(foyd: string): KursXotira {
  const z = zaxira.get(foyd);
  if (z) return z;
  let x: KursXotira = { b: {} };
  try {
    const xom = JSON.parse(localStorage.getItem(PREFIKS + foyd) ?? 'null') as Partial<KursXotira> | null;
    if (xom && typeof xom === 'object') {
      const b: Record<string, string> = {};
      if (xom.b && typeof xom.b === 'object') for (const [k, v] of Object.entries(xom.b)) if (typeof v === 'string') b[k] = v;
      x = { b, ...(xom.j && typeof xom.j.d === 'string' && Number.isInteger(xom.j.q) ? { j: { d: xom.j.d, q: xom.j.q, t: String(xom.j.t ?? '') } } : {}) };
    }
  } catch { /* xotira yopiq */ }
  zaxira.set(foyd, x);
  return x;
}

function xotiraYoz(foyd: string, x: KursXotira) {
  zaxira.set(foyd, x);
  try { localStorage.setItem(PREFIKS + foyd, JSON.stringify(x)); } catch { /* yopiq: sessiya zaxirasi qoladi */ }
  tinglovchilar.forEach((f) => f());
}

export const bajarilganlar = (foyd: string): ReadonlySet<string> => new Set(Object.keys(xotiraOqi(foyd).b));

export function darsBajarildi(foyd: string, darsId: string): void {
  const x = xotiraOqi(foyd);
  const j = x.j?.d === darsId ? undefined : x.j;
  xotiraYoz(foyd, { b: { ...x.b, [darsId]: hozir() }, ...(j ? { j } : {}) });
}

export function darsBekor(foyd: string, darsId: string): void {
  const x = xotiraOqi(foyd);
  const { [darsId]: _o, ...b } = x.b;
  xotiraYoz(foyd, { b, ...(x.j ? { j: x.j } : {}) });
}

/** Yarim qolgan joyni eslab qoladi (davom ettirish uchun). */
export function joriyniSaqla(foyd: string, darsId: string, qadam: number): void {
  xotiraYoz(foyd, { b: xotiraOqi(foyd).b, j: { d: darsId, q: qadam, t: hozir() } });
}

export function joriyniOchir(foyd: string): void {
  const x = xotiraOqi(foyd);
  xotiraYoz(foyd, { b: x.b });
}

export const joriyOl = (foyd: string): { dars: string; qadam: number } | null => {
  const j = xotiraOqi(foyd).j;
  return j ? { dars: j.d, qadam: j.q } : null;
};

export function kuzat(f: () => void): () => void {
  tinglovchilar.add(f);
  return () => { tinglovchilar.delete(f); };
}

/** Faqat testlar uchun. */
export function xotiraTozala(): void { zaxira.clear(); tinglovchilar.clear(); }
