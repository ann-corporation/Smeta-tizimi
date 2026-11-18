/**
 * mat-joy.ts - razdel (bo'lim) oxirida / razdel darajasida turgan mat/ob qatorini O'Z ishi (BL) ostiga bog'lash.
 *
 * Egasi shikoyati (2026-11-18, Fast Food 2-qavat «СТЕНЫ»): «materiallar o'z ish turi tagidan emas razdel oxiriga
 * tushib ketayapdi». Asl smetada mat.ota_id = razdel (BL emas) - ASL SMETA QATORLARI O'ZGARMAYDI; bu faqat
 * hujjat/ko'rinish qatlamidagi bog'lanish. Summalar yadrodan, bu yerda pul hisoblanmaydi (sof funksiya).
 *
 * Qoida (deterministik, tushuntiriladigan):
 *  (a) shu razdeldagi OLDINGI BL, birlik bir xil va hajm teng (ishorasi bilan, ±0,1 %) - eng kuchli dalil;
 *  (b) nom kalit so'zi: umumiy so'z o'zagi (>=5 harf) yoki bir tur guruhi (АРМАТУР/КАРКАС/СЕТК/ЗАКЛАДН) BL nomida;
 *  (c) nomzod bir nechta bo'lsa - eng yaqin oldingi BL, lekin `shubhali: true`.
 *  Dalil yo'q - bog'lanmaydi (joyida qoladi).
 * Qo'lda tanlov (`qol`): mat -> BL id yoki null (joyida qoldirish) - avto qoidadan ustun.
 */
export type MatJoyQator = {
  id: number; ota_id?: number | null; tur: string | null; kod?: string | null; nom?: string | null;
  birlik?: string | null; hajm?: number | string | null; tartib?: number | null;
  zamena?: boolean | null; qoshimcha?: boolean | null; versiya_holat?: string | null;
};
export type MatJoyManba = 'avto' | 'qol';
export type MatJoy = { blId: number; manba: MatJoyManba; shubhali: boolean; sabab: 'hajm' | 'nom' | 'qol'; nomzodlar: number };

const TOL = 0.001;
const TUR_GURUH = ['АРМАТУР', 'КАРКАС', 'СЕТК', 'ЗАКЛАДН'];
const UMUMIY = new Set(['ДЛЯ', 'УСТРОЙСТВО', 'ИЗГОТОВЛЕНИЕ', 'МОНТАЖ', 'УСТАНОВКА', 'ПРИ', 'ВЫСОТЕ', 'НАРУЖНЫХ', 'ПРОСТЫХ', 'ИСКЛЮЧИТЬ', 'ЗАТ', 'ТРУДА', 'ПЛОСКИХ', 'ОБЪЕМНЫХ', 'ЖЕЛЕЗОБЕТОННЫХ', 'ЖЕЛЕЗОБЕТОННЫЕ', 'ЖЕЛЕЗОБЕТОННОЙ']);

const son = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const katta = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/Ё/g, 'Е');

/** Nomdagi ahamiyatli so'z o'zaklari (>=5 harf, umumiy so'zlarsiz, 5 harfgacha qisqartirilgan). */
export function nomOzaklari(nom: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const w of katta(nom).split(/[^А-ЯA-Z]+/)) if (w.length >= 5 && !UMUMIY.has(w)) out.add(w.slice(0, 5));
  return out;
}
const guruhlar = (nom: string): Set<string> => new Set(TUR_GURUH.filter((g) => nom.includes(g)));

const GURUH_O = new Set(TUR_GURUH.map((g) => g.slice(0, 5)));

/** Nom mosligi: 2 - maxsus so'z o'zagi (ПЕРЕМЫЧ, СЕРДЕ...), 1 - umumiy tur guruhi (АРМАТУР/КАРКАС/СЕТК/ЗАКЛАДН), 0 - yo'q. */
function nomMos(mat: MatJoyQator, bl: MatJoyQator): 0 | 1 | 2 {
  const mo = nomOzaklari(mat.nom);
  for (const x of nomOzaklari(bl.nom)) if (mo.has(x) && !GURUH_O.has(x)) return 2;
  const mg = guruhlar(katta(mat.nom)); const bg = guruhlar(katta(bl.nom));
  for (const g of mg) if (bg.has(g)) return 1;
  return 0;
}
function hajmMos(mat: MatJoyQator, bl: MatJoyQator): boolean {
  const a = son(mat.hajm); const b = son(bl.hajm);
  if (a == null || b == null || a === 0) return false;
  if (katta(mat.birlik).trim() !== katta(bl.birlik).trim()) return false;
  return Math.abs(a - b) <= Math.abs(a) * TOL;
}

/**
 * Razdel darajasidagi mat/ob -> BL. `qol`: qo'lda tanlov (mat id -> BL id; null - joyida qoldirish).
 * Natijada FAQAT bog'langanlar bor; bog'lanmaganlar yo'q (joyida qoladi).
 */
export function matJoyBogla(rows: readonly MatJoyQator[], qol?: ReadonlyMap<number, number | null>): Map<number, MatJoy> {
  const out = new Map<number, MatJoy>();
  const faol = rows.filter((r) => r.versiya_holat !== 'almashtirilgan');
  const rzId = new Set(faol.filter((r) => r.tur === 'rz').map((r) => r.id));
  const blById = new Map(faol.filter((r) => r.tur === 'bl').map((r) => [r.id, r] as const));
  const tr = (r: MatJoyQator, i: number) => r.tartib ?? i;
  const idx = new Map(faol.map((r, i) => [r.id, i] as const));
  const bolalar = new Map<number, MatJoyQator[]>();
  for (const r of faol) if (r.ota_id != null && rzId.has(r.ota_id)) { const l = bolalar.get(r.ota_id) ?? []; l.push(r); bolalar.set(r.ota_id, l); }
  for (const list of bolalar.values()) {
    list.sort((p, q) => tr(p, idx.get(p.id)!) - tr(q, idx.get(q.id)!) || p.id - q.id);
    const oldingi: MatJoyQator[] = [];
    for (const r of list) {
      if (r.tur === 'bl') { oldingi.push(r); continue; }
      if (r.tur !== 'mat' && r.tur !== 'ob') continue;
      if (qol?.has(r.id)) {
        const b = qol.get(r.id);
        if (b != null && blById.get(b)?.ota_id === r.ota_id) out.set(r.id, { blId: b, manba: 'qol', shubhali: false, sabab: 'qol', nomzodlar: 1 });
        continue; // null yoki yaroqsiz - joyida
      }
      if (r.zamena || r.qoshimcha) continue;
      const H = oldingi.filter((b) => hajmMos(r, b));
      const kuch = H.length ? [] : oldingi.map((b) => ({ b, m: nomMos(r, b) }));
      const maxM = kuch.reduce((s, x) => Math.max(s, x.m), 0);
      const K = maxM ? kuch.filter((x) => x.m === maxM).map((x) => x.b) : [];
      const nom = H.length ? H : K;
      if (!nom.length) continue;
      out.set(r.id, { blId: nom[nom.length - 1].id, manba: 'avto', shubhali: nom.length > 1, sabab: H.length ? 'hajm' : 'nom', nomzodlar: nom.length });
    }
  }
  return out;
}
