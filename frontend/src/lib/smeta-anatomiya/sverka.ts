/**
 * СВЕРКА ЛРВ И РС — smeta yuklanganda LRV (ish + resurs, norma × hajm) va RES
 * (resurs vedomosti) jamilarini resurs bo'yicha solishtirish (egasi, C5:
 * "LRV va RES o'rtasidagi farqlar smeta yuklanganda hisoblanilishi, tekshirilishi
 * va foydalanuvchiga va hujjatda bildirilishi kerak").
 *
 * Qonunlar:
 *  - Kalit: NOM + BIRLIK (normallashtirilgan). Kod yolg'iz kalit EMAS — T1 da bir
 *    kod bir necha materialga takrorlanadi (SmetaYuklaNative izohiga qarang).
 *    Kodi va birligi bir xil, nomi farqli juftlar faqat "ehtimoliy" deb ko'rsatiladi,
 *    birlashtirilmaydi (taxminiy moslash yo'q).
 *  - NULL ≠ 0: bir tomonda miqdor noma'lum bo'lsa farq ham noma'lum ('noaniq').
 *  - Mashinistlar mehnati (ЗАТРАТЫ ТРУДА МАШИНИСТОВ) RES da odatda alohida
 *    bo'lmaydi — ogohlantirish emas, ma'lumot ('mashinist').
 *  - Manba qiymatlari o'zgartirilmaydi; faqat farq ko'rsatiladi.
 */
import { varaqniTahlilQil } from './varaq';
import { kalit } from './matn';
import type { Katak, Manzil, Resurs, VaraqAnatomiyasi } from './turlar';

export type SverkaKat = 'ЧЕЛ' | 'МАШ' | 'МАТ' | 'ОБ';
export type SverkaHolat = 'mos' | 'farq' | 'faqat_lrv' | 'faqat_res' | 'noaniq' | 'mashinist';

export interface SverkaPozitsiya {
  kat: SverkaKat;
  kod: string | null;
  nom: string;
  birlik: string;
  lrvHajm: number | null;
  resHajm: number | null;
  farqHajm: number | null;
  lrvSumma: number | null;
  resSumma: number | null;
  farqSumma: number | null;
  /** LRV da necha marta uchradi (necha ish ichida). */
  lrvSoni: number;
  lrvManzil: Manzil | null;
  resManzil: Manzil | null;
  holat: SverkaHolat;
  izoh: string;
}

export interface SverkaNatija {
  pozitsiyalar: SverkaPozitsiya[];
  soni: Record<SverkaHolat, number>;
  /** RES manbasi umuman berilmagan/o'qilmagan — solishtirish qilinmadi. */
  resYoq: boolean;
  /** Muammo: farq + faqat birida + noaniq (mashinist va mos emas). */
  muammo: number;
}

export const SVERKA_KAT_NOMI: Record<SverkaKat, string> = {
  ЧЕЛ: 'ЗАТРАТЫ ТРУДА',
  МАШ: 'СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ',
  МАТ: 'МАТЕРИАЛЫ, ИЗДЕЛИЯ И КОНСТРУКЦИИ',
  ОБ: 'ОБОРУДОВАНИЕ',
};
const KAT_TARTIB: SverkaKat[] = ['ЧЕЛ', 'МАШ', 'МАТ', 'ОБ'];

const TOZA = (s: string) => kalit(s).replace(/[^0-9A-ZА-ЯЁЎҚҒҲ]/g, '');

export function birlikKaliti(b: string | null | undefined): string {
  return TOZA(b ?? '').replace(/ЧАС$/, 'Ч').replace(/^ЧЕЛОВЕКОЧ$/, 'ЧЕЛЧ').replace(/^МАШИНОЧ$/, 'МАШЧ');
}

function mashinistmi(nom: string): boolean {
  return /МАШИНИСТ/.test(kalit(nom));
}

/** Ishchilar mehnati: LRV "ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ" = RES "… С УЧЕТОМ СОЦСТРАХА". */
function nomKaliti(nom: string, birK: string): string {
  const t = TOZA(nom);
  if (birK === 'ЧЕЛЧ' && /^ЗАТРАТЫТРУДАРАБОЧИХ/.test(t)) return 'ЗАТРАТЫТРУДАРАБОЧИХСТРОИТЕЛЕЙ';
  return t;
}

function katOl(r: Resurs, birK: string): SverkaKat {
  if (birK.startsWith('ЧЕЛ')) return 'ЧЕЛ';
  if (birK.startsWith('МАШ')) return 'МАШ';
  if (r.texnikBelgi?.startsWith('ob') || /ОБОРУД/.test(kalit(r.guruh ?? ''))) return 'ОБ';
  return 'МАТ';
}

type Yigma = {
  kat: SverkaKat; kod: string | null; kodlar: Set<string>; nom: string; birlik: string;
  hajm: number; hajmsiz: number; summa: number; summasiz: number; soni: number; manzil: Manzil | null;
};

function yig(resurslar: readonly Resurs[]): Map<string, Yigma> {
  const m = new Map<string, Yigma>();
  for (const r of resurslar) {
    const nom = (r.xom ?? '').trim();
    if (!nom) continue;
    const birK = birlikKaliti(r.birlik);
    const k = `${nomKaliti(nom, birK)}|${birK}`;
    let y = m.get(k);
    if (!y) {
      y = { kat: katOl(r, birK), kod: r.kod, kodlar: new Set(), nom, birlik: r.birlik ?? '', hajm: 0, hajmsiz: 0, summa: 0, summasiz: 0, soni: 0, manzil: r.manzil };
      m.set(k, y);
    }
    if (r.kod) y.kodlar.add(r.kod);
    if (r.hajm == null) y.hajmsiz++; else y.hajm += r.hajm;
    if (r.summa == null) y.summasiz++; else y.summa += r.summa;
    y.soni++;
  }
  return m;
}

const yaxlit = (x: number, n = 6) => Number(x.toFixed(n));
const hajmMos = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.0015, 5e-4 * Math.max(Math.abs(a), Math.abs(b)));
const pulMos = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, 5e-4 * Math.max(Math.abs(a), Math.abs(b)));

/** LRV varaqlari resurslari (ish ichidagi + mustaqil MAT/OB) ↔ RES qatorlari. */
export function lrvResSverka(lrv: readonly VaraqAnatomiyasi[], res: readonly Resurs[]): SverkaNatija {
  // Barglar: ish resurslari, mustaqil MAT/OB va resurssiz ish (yaxlit material "С…" qatori — o'zi resurs).
  const lrvRes: Resurs[] = lrv.flatMap((v) => [
    ...v.ishlar.flatMap((i) => (i.resurslar.length ? i.resurslar : [{
      tartib: i.tartib, kod: i.shifr, xom: i.xom, birlik: i.birlik, normaBirlikka: null,
      hajm: i.hajm, narx: i.narx, summa: i.summa, guruh: null, texnikBelgi: i.texnikBelgi, manzil: i.manzil,
    }])),
    ...(v.mustaqilResurslar ?? []),
  ]);
  const L = yig(lrvRes);
  const R = yig(res);
  const out: SverkaPozitsiya[] = [];
  const kalitlar = new Set([...L.keys(), ...R.keys()]);
  for (const k of kalitlar) {
    const l = L.get(k), r = R.get(k);
    const asos = (l ?? r)!;
    const lrvHajm = l && !l.hajmsiz ? yaxlit(l.hajm) : null;
    const resHajm = r && !r.hajmsiz ? yaxlit(r.hajm) : null;
    const lrvSumma = l && !l.summasiz ? yaxlit(l.summa, 2) : null;
    const resSumma = r && !r.summasiz ? yaxlit(r.summa, 2) : null;
    let holat: SverkaHolat;
    let izoh = '';
    if (mashinistmi(asos.nom) && !r) { holat = 'mashinist'; izoh = 'труд машинистов учтен в стоимости маш.-ч'; }
    else if (!r) { holat = 'faqat_lrv'; izoh = 'нет в ресурсной ведомости'; }
    else if (!l) { holat = 'faqat_res'; izoh = 'нет в ЛРВ'; }
    else if (lrvHajm == null || resHajm == null) { holat = 'noaniq'; izoh = lrvHajm == null ? 'в ЛРВ не указано количество' : 'в РС не указано количество'; }
    else if (hajmMos(lrvHajm, resHajm) && (lrvSumma == null || resSumma == null || pulMos(lrvSumma, resSumma))) holat = 'mos';
    else { holat = 'farq'; izoh = hajmMos(lrvHajm, resHajm) ? 'расхождение по стоимости' : 'расхождение по количеству'; }
    out.push({
      kat: asos.kat, kod: l?.kod ?? r?.kod ?? null, nom: asos.nom, birlik: asos.birlik,
      lrvHajm, resHajm,
      farqHajm: lrvHajm != null && resHajm != null ? yaxlit(resHajm - lrvHajm) : null,
      lrvSumma, resSumma,
      farqSumma: lrvSumma != null && resSumma != null ? yaxlit(resSumma - lrvSumma, 2) : null,
      lrvSoni: l?.soni ?? 0, lrvManzil: l?.manzil ?? null, resManzil: r?.manzil ?? null, holat, izoh,
    });
  }
  // Ehtimoliy juftlar: faqat LRV / faqat RES, kod va birlik bir xil — nom yozilishi farqli bo'lishi mumkin.
  const faqatRes = out.filter((p) => p.holat === 'faqat_res' && p.kod);
  for (const p of out) {
    if (p.holat !== 'faqat_lrv' || !p.kod) continue;
    const j = faqatRes.find((q) => q.kod === p.kod && birlikKaliti(q.birlik) === birlikKaliti(p.birlik));
    if (j) {
      p.izoh += `; возможно соответствует позиции РС «${j.nom}» (тот же код) — проверьте наименование`;
      j.izoh += `; возможно соответствует позиции ЛРВ «${p.nom}» (тот же код)`;
    }
  }
  const holatTartib: Record<SverkaHolat, number> = { farq: 0, faqat_lrv: 1, faqat_res: 2, noaniq: 3, mashinist: 4, mos: 5 };
  out.sort((a, b) => KAT_TARTIB.indexOf(a.kat) - KAT_TARTIB.indexOf(b.kat) || holatTartib[a.holat] - holatTartib[b.holat] || a.nom.localeCompare(b.nom, 'ru'));
  const soni: Record<SverkaHolat, number> = { mos: 0, farq: 0, faqat_lrv: 0, faqat_res: 0, noaniq: 0, mashinist: 0 };
  for (const p of out) soni[p.holat]++;
  return { pozitsiyalar: out, soni, resYoq: res.length === 0, muammo: soni.farq + soni.faqat_lrv + soni.faqat_res + soni.noaniq };
}

export type SverkaManba = { nom: string; rows: Katak[][] };

/**
 * Yuklash oqimi uchun: xom varaqlardan. RES manbasi berilmasa, LRV varag'i
 * ichidagi resurs vedomosti (ish daraxtidan keyingi ВЕДОМОСТЬ РЕСУРСОВ) olinadi.
 */
export function sverkaManbalardan(lrvlar: readonly SverkaManba[], reslar: readonly SverkaManba[]): SverkaNatija {
  const lrvA = lrvlar.map((m) => varaqniTahlilQil(m.nom, { nom: m.nom, rows: m.rows }));
  const tashqi = reslar.flatMap((m) => varaqniTahlilQil(m.nom, { nom: m.nom, rows: m.rows }).vedomost);
  const res = tashqi.length ? tashqi : lrvA.flatMap((v) => v.vedomost);
  return lrvResSverka(lrvA.filter((v) => v.ishlar.length), res);
}
