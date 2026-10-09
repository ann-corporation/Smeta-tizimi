/**
 * Formulasiz hujjat (ABC/TN qiymat eksporti) uchun qiymat bo'yicha isbot. Har tekshiruv hujjatning o'z sonlaridan:
 *  1) resurs qatori: hajm × narx = summa (hujjatda hajm yaxlitlangan bo'ladi — aniqlik chegarasi hisobga olinadi);
 *  2) ish summasi = resurslari summalari yig'indisi;
 *  3) har ИТОГО/ВСЕГО qatori — uchta isbot yo'li (birinchi mos kelgani yoziladi):
 *     a) oldingi jami qatoridan beri turgan qatorlar yig'indisi;
 *     b) bevosita oldidagi ketma-ket jami qatorlari yig'indisi (ВСЕГО = ИТОГО + ТРАНСПОРТ);
 *     c) p% × oldingi jami (p — 0,1 karrali "toza" foiz) — formulasiz hujjatda ham foiz o'zi topiladi.
 *  Hech biri mos kelmasa — 'isbotlanmadi' (taxmin yo'q, manzil bilan ko'rsatiladi).
 */
import type { Ish, JamiQator, Resurs, VaraqAnatomiyasi } from '../smeta-anatomiya/turlar';

export type QiymatHolat = 'mos' | 'farq' | 'isbotlanmadi';
export type QiymatTekshiruv = {
  tur: 'qator' | 'ish' | 'jami';
  qator: number;
  yorliq: string;
  hujjatda: number;
  hisoblandi: number | null;
  holat: QiymatHolat;
  /** Isbot yo'li: "Σ 12 qator", "= ИТОГО + ИТОГО ТРАНСПОРТ", "6% × ИТОГО (213-qator)". */
  isbot: string;
};
export type QiymatNatija = {
  varaq: string;
  qatorlar: { jami: number; mos: number; farq: number };
  ishlar: { jami: number; mos: number; farq: number };
  jamilar: { jami: number; mos: number; isbotlanmadi: number };
  /** Topilgan foizlar (formulasiz hujjatda ham). */
  foizlar: Array<{ qator: number; yorliq: string; foiz: number; baza: string; bazaQiymat: number; natija: number }>;
  muammolar: QiymatTekshiruv[];
};

const tiyin = 0.005;
/** Hujjatda hajm ~1e-5 aniqlikda ko'rsatiladi: |h×n − s| ≤ 0,005 + |n|×1e-5. */
const qatorMos = (r: Resurs) => Math.abs(r.hajm! * r.narx! - r.summa!) <= tiyin + Math.abs(r.narx!) * 1e-5;

export function qiymatTekshir(v: VaraqAnatomiyasi): QiymatNatija {
  const n: QiymatNatija = {
    varaq: v.varaq, qatorlar: { jami: 0, mos: 0, farq: 0 }, ishlar: { jami: 0, mos: 0, farq: 0 },
    jamilar: { jami: 0, mos: 0, isbotlanmadi: 0 }, foizlar: [], muammolar: [],
  };
  const resurslar: Resurs[] = [...v.ishlar.flatMap((i) => i.resurslar), ...(v.mustaqilResurslar ?? []), ...v.vedomost];
  for (const r of resurslar) {
    if (r.hajm == null || r.narx == null || r.summa == null) continue;
    n.qatorlar.jami++;
    if (qatorMos(r)) n.qatorlar.mos++;
    else {
      n.qatorlar.farq++;
      n.muammolar.push({ tur: 'qator', qator: r.manzil.qator, yorliq: r.xom, hujjatda: r.summa, hisoblandi: r.hajm * r.narx, holat: 'farq', isbot: 'hajm × narx' });
    }
  }
  for (const i of v.ishlar as Ish[]) {
    if (i.summa == null || !i.resurslar.length || i.resurslar.some((r) => r.summa == null)) continue;
    n.ishlar.jami++;
    const s = i.resurslar.reduce((a, r) => a + r.summa!, 0);
    if (Math.abs(s - i.summa) <= tiyin * Math.max(1, i.resurslar.length)) n.ishlar.mos++;
    else {
      n.ishlar.farq++;
      n.muammolar.push({ tur: 'ish', qator: i.manzil.qator, yorliq: i.xom, hujjatda: i.summa, hisoblandi: s, holat: 'farq', isbot: `Σ ${i.resurslar.length} resurs` });
    }
  }
  // Jamilar: qator bo'yicha tartib; barg qatorlari — resurslar va ishlar (ishning o'z summasi, resurslari emas).
  const barglar = [
    ...v.ishlar.filter((i) => i.summa != null).map((i) => ({ q: i.manzil.qator, s: i.summa! })),
    ...[...(v.mustaqilResurslar ?? []), ...v.vedomost].filter((r) => r.summa != null).map((r) => ({ q: r.manzil.qator, s: r.summa! })),
  ].sort((a, b) => a.q - b.q);
  const jamilar = (v.jamilar as JamiQator[]).filter((j) => j.qiymat != null).sort((a, b) => a.manzil.qator - b.manzil.qator);
  for (let k = 0; k < jamilar.length; k++) {
    const j = jamilar[k];
    const qiymat = j.qiymat!;
    n.jamilar.jami++;
    const oldingi = k > 0 ? jamilar[k - 1] : null;
    const boshQ = oldingi?.manzil.qator ?? -Infinity;
    const oraliq = barglar.filter((b) => b.q > boshQ && b.q < j.manzil.qator);
    const yigindi = oraliq.reduce((a, b) => a + b.s, 0);
    const tol = tiyin * Math.max(1, oraliq.length);
    let isbot: string | null = null;
    if (oraliq.length && Math.abs(yigindi - qiymat) <= tol) isbot = `Σ ${oraliq.length} qator`;
    // b) bevosita oldidagi ketma-ket jamilar yig'indisi (2..6 ta)
    if (!isbot) {
      for (let m = 2; m <= Math.min(6, k) && !isbot; m++) {
        const oldin = jamilar.slice(k - m, k);
        const s = oldin.reduce((a, x) => a + x.qiymat!, 0);
        if (Math.abs(s - qiymat) <= tiyin * m) isbot = `= ${oldin.map((x) => `${x.xom.slice(0, 30)} (${x.manzil.qator})`).join(' + ')}`;
      }
    }
    // c) p% × oldingi jami
    if (!isbot && oldingi && oldingi.qiymat) {
      const p = (qiymat / oldingi.qiymat!) * 100;
      const toza = Math.round(p * 10) / 10;
      if (toza > 0 && toza <= 50 && Math.abs(oldingi.qiymat! * toza / 100 - qiymat) <= tiyin + Math.abs(oldingi.qiymat!) * 1e-12) {
        isbot = `${toza}% × ${oldingi.xom.slice(0, 40)} (${oldingi.manzil.qator}-qator)`;
        n.foizlar.push({ qator: j.manzil.qator, yorliq: j.xom, foiz: toza, baza: `${oldingi.xom} (${oldingi.manzil.qator}-qator)`, bazaQiymat: oldingi.qiymat!, natija: qiymat });
      }
    }
    // d) keng oraliq: bir necha guruh qatorlari + shu oraliqda foiz bilan isbotlangan jamilar (ПРЯМЫЕ = ТРУД + МАШ + МАТ + транспорт)
    if (!isbot) {
      const foizQator = new Set(n.foizlar.map((f) => f.qator));
      for (let s = k - 1; s >= 0 && !isbot; s--) {
        const chegara = s > 0 ? jamilar[s - 1].manzil.qator : -Infinity;
        const qs = barglar.filter((b) => b.q > chegara && b.q < j.manzil.qator);
        const fz = jamilar.slice(s, k).filter((x) => foizQator.has(x.manzil.qator));
        const jam = qs.reduce((a, b) => a + b.s, 0) + fz.reduce((a, x) => a + x.qiymat!, 0);
        if (qs.length && Math.abs(jam - qiymat) <= tiyin * (qs.length + fz.length)) {
          isbot = `Σ ${qs.length} qator${fz.length ? ` + ${fz.length} ta foizli jami` : ''} (${s > 0 ? jamilar[s - 1].manzil.qator + 1 : 1}–${j.manzil.qator - 1}-qatorlar)`;
        }
      }
    }
    if (isbot) n.jamilar.mos++;
    else {
      n.jamilar.isbotlanmadi++;
      n.muammolar.push({ tur: 'jami', qator: j.manzil.qator, yorliq: j.xom, hujjatda: qiymat, hisoblandi: oraliq.length ? yigindi : null, holat: 'isbotlanmadi', isbot: oraliq.length ? `Σ ${oraliq.length} qator = ${yigindi.toFixed(2)}` : 'oraliq bo‘sh' });
    }
  }
  return n;
}
