/**
 * sinov-maslahat.ts — laboratoriya protokoli uchun SOF yordamchilar (React yo'q).
 * Maslahat (mos / mos emas) FAQAT taklif: yakuniy natijani laboratoriya mas'uli o'zi tanlaydi va imzolaydi.
 * Maydon yo'q yoki son emas bo'lsa — maslahat BERILMAYDI (noma'lum ≠ mos).
 */
import type { SinovMaydon } from '../../api/t2-lab-sorov';

const son = (v: unknown): number | null => {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** [o'lchangan, talab, yo'nalish]: 'kam_emas' — o'lchangan >= talab; 'oshmasin' — o'lchangan <= talab. */
const JUFTLAR: Record<string, Array<[string, string, 'kam_emas' | 'oshmasin']>> = {
  beton_kub: [['olchangan_mpa', 'talab_mpa', 'kam_emas']],
  grunt_zichlik: [['olchangan_k', 'talab_k', 'kam_emas']],
  gidravlik: [['bosim_pasayishi_mpa', 'ruxsat_pasayish_mpa', 'oshmasin']],
  elektr: [['izolyatsiya_mom', 'talab_izolyatsiya_mom', 'kam_emas']],
};

export type Maslahat = { natija: 'mos' | 'mos_emas'; sabab: string } | null;

export function natijaMaslahati(sinovTuri: string, qiymat: Record<string, string | number | undefined>): Maslahat {
  const juftlar = JUFTLAR[sinovTuri];
  if (!juftlar) return null;
  let mos = 0;
  for (const [olchangan, talab, yonalish] of juftlar) {
    const a = son(qiymat[olchangan]); const b = son(qiymat[talab]);
    if (a == null || b == null) continue;
    const yaxshi = yonalish === 'kam_emas' ? a >= b : a <= b;
    if (!yaxshi) return { natija: 'mos_emas', sabab: `${a} ${yonalish === 'kam_emas' ? '<' : '>'} ${b}` };
    mos += 1;
  }
  return mos > 0 ? { natija: 'mos', sabab: 'o‘lchangan qiymat talabga javob beradi' } : null;
}

/** Forma qiymatlaridan serverga ketadigan maydonlar: bo'sh qiymatlar tashlanadi, sonlar songa aylantiriladi. */
export function maydonYuki(maydonlar: readonly SinovMaydon[], qiymat: Record<string, string>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const m of maydonlar) {
    const v = (qiymat[m.kalit] ?? '').trim();
    if (!v) continue;
    out[m.kalit] = m.tur === 'son' ? (son(v) ?? v) : v;
  }
  return out;
}

/** Forma yuborilishidan oldin majburiy maydonlar tekshiruvi (server baribir qayta tekshiradi). Birinchi xato matni yoki null. */
export function maydonXatosi(maydonlar: readonly SinovMaydon[], qiymat: Record<string, string>): string | null {
  for (const m of maydonlar) {
    const v = (qiymat[m.kalit] ?? '').trim();
    if (m.majburiy && !v) return `To‘ldirilmagan: ${m.nom}`;
    if (v && m.tur === 'son' && son(v) == null) return `Son kerak: ${m.nom}`;
  }
  return null;
}

/** АОСР uchun: bloklovchi / kutilayotgan sinovlar bo'yicha qisqa matn (null — hammasi joyida yoki so'rov yo'q). */
export function aosrSinovMatni(h: { bloklangan: boolean; holat: { nomos: Array<{ nom: string }>; kutilmoqda: Array<{ nom: string }> } } | undefined): string | null {
  if (!h) return null;
  if (h.bloklangan) return `Sinov mos emas: ${h.holat.nomos.map((x) => x.nom).join(', ')}`;
  if (h.holat.kutilmoqda.length) return `Sinov natijasi kutilmoqda: ${h.holat.kutilmoqda.map((x) => x.nom).join(', ')}`;
  return null;
}
