/**
 * FAOLLASHTIRILGAN VERSIYA FARQI (egasi 2026-10-29): «tizim o'zi eski va yangi versiyalarni to'g'ri topib, to'g'ri farqini
 * ko'rsatsin va to'g'ri hisoblasin». `t2_smeta_versiya_faollashtir_v1` eski smetani `t2_smeta_versiya` (tur 'dastlabki')
 * sifatida saqlaydi, eski qatorlarni `versiya_holat = 'almashtirilgan'` qiladi (O'CHIRILMAYDI — F2 tarixi ularda) va
 * pozitsiya ↔ yangi faol qator mosligini `t2_smeta_versiya_moslik` ga yozadi. Bu modul — sof hisob:
 *   - har pozitsiya: eski hajm/narx/summa (eski qatordan) ↔ yangi hajm/narx/summa (faol qatordan);
 *   - eski qatordagi TASDIQLANGAN F2 (hajm, summa) — tarix, o'zgarmaydi;
 *   - pereraschet ishorasi: eski F2 summasi minus, shu hajm (yangi hajmgacha) yangi narxda plus; ortiqcha hajm — alohida.
 * Pul — NDS siz (ustamasiz = прямые); ustamali/QQS SummaJuft kaskadida. NULL ≠ 0: narxsiz qator summasi null qoladi.
 */
import { yaxlit2 } from '../hisob-yadro';
import { katKesimYigish, type KatKesim } from '../ustamali-summa';
import { son, type MoslikHolat, type MoslikQator, type PozitsiyaQator } from './turlar';

/** Eski (almashtirilgan) yoki yangi (faol) smeta qatori — kerakli maydonlar. */
export type VQator = {
  id: number; ota_id: number | null; tur: string | null; kat: string | null;
  hajm: number | string | null; narx: number | string | null; summa: number | string | null;
};
/** Eski qatordagi tasdiqlangan F2 (`t2_qator_holat`). */
export type F2Qator = { qator_id: number; f2_hajm: number | string | null; f2_summa: number | string | null };
/** Faollashtirish pozitsiyasi: `manba.qator_id` — eski smeta qatori. */
export type FPozitsiya = PozitsiyaQator & { manba?: { qator_id?: number | null; tur?: string | null; narx?: number | null; summa?: number | null } | null };

export type Uchlik = { hajm: number | null; narx: number | null; summa: number | null };
export type FarqQator = {
  mosId: number; holat: MoslikHolat;
  kod: string | null; nom: string; birlik: string | null; bolim: string | null;
  eskiQatorId: number | null; yangiQatorId: number | null;
  eski: Uchlik | null; yangi: Uchlik | null;
  /** summa farqi (yangi − eski), ustamasiz; biri noma'lum bo'lsa null. */
  farq: number | null;
  /** Eski qatordagi tasdiqlangan F2 (pozitsiya qatori + uning resurslari). */
  f2: { hajm: number | null; summa: number } | null;
  /** Pereraschet ishorasi: minus — eski F2 summasi; plus — min(F2 hajm, yangi hajm) × yangi narx; ortiqcha — yangi hajmdan oshgan F2 hajmi. */
  pereraschet: { minus: number; plus: number | null; ortiqchaHajm: number } | null;
};
export type FarqJami = {
  eski: number; yangi: number; farq: number;
  eskiKesim: KatKesim; yangiKesim: KatKesim; farqKesim: KatKesim;
  eskiNarxsiz: number; yangiNarxsiz: number;
  f2Summa: number; minus: number; plus: number; plusNomalum: number;
  holatlar: Record<MoslikHolat, number>;
};

const r2 = yaxlit2;
const BARG = new Set(['rs', 'mat', 'ob']);
const birlikNarx = (summa: number | null, hajm: number | null): number | null =>
  summa == null || hajm == null || hajm === 0 ? null : r2(summa / hajm);

/** Barg qatorlar (rs/mat/ob) — summa jamlanadigan yagona daraja (bl/rz — rollup). */
function barglar(qatorlar: readonly VQator[]): VQator[] {
  return qatorlar.filter((q) => BARG.has(String(q.tur ?? '')));
}

export function faollashtirishFarqi(p: {
  pozitsiyalar: readonly FPozitsiya[]; mosliklar: readonly MoslikQator[];
  eskiQatorlar: readonly VQator[]; yangiQatorlar: readonly VQator[]; f2: readonly F2Qator[];
}): { qatorlar: FarqQator[]; jami: FarqJami } {
  const pozById = new Map(p.pozitsiyalar.map((x) => [x.id, x]));
  const eskiById = new Map(p.eskiQatorlar.map((x) => [x.id, x]));
  const yangiById = new Map(p.yangiQatorlar.map((x) => [x.id, x]));
  const bolalar = new Map<number, number[]>();
  for (const q of p.eskiQatorlar) if (q.ota_id != null) bolalar.set(q.ota_id, [...(bolalar.get(q.ota_id) ?? []), q.id]);
  const f2ById = new Map(p.f2.map((x) => [x.qator_id, { hajm: son(x.f2_hajm) ?? 0, summa: son(x.f2_summa) ?? 0 }]));

  const holatlar = { ozgarmagan: 0, kamaygan: 0, oshgan: 0, almashtirilgan: 0, ochirilgan: 0, yangi: 0, noaniq: 0 } as Record<MoslikHolat, number>;
  let minus = 0; let plus = 0; let plusNomalum = 0; let f2Summa = 0;

  const qatorlar: FarqQator[] = p.mosliklar.map((m) => {
    holatlar[m.holat] = (holatlar[m.holat] ?? 0) + 1;
    const poz = m.pozitsiya_id != null ? pozById.get(m.pozitsiya_id) ?? null : null;
    const eskiId = poz?.manba?.qator_id ?? null;
    const eq = eskiId != null ? eskiById.get(eskiId) ?? null : null;
    const yq = m.qator_id != null ? yangiById.get(m.qator_id) ?? null : null;

    const eski: Uchlik | null = poz ? (() => {
      const hajm = son(poz.hajm) ?? son(eq?.hajm);
      const summa = son(eq?.summa) ?? son(poz.manba?.summa);
      return { hajm, summa, narx: birlikNarx(summa, hajm) };
    })() : null;
    const yangi: Uchlik | null = yq ? (() => {
      const hajm = son(yq.hajm) ?? son(m.joriy_hajm);
      const summa = son(yq.summa);
      return { hajm, summa, narx: birlikNarx(summa, hajm) };
    })() : null;

    let f2: FarqQator['f2'] = null;
    if (eskiId != null) {
      const oz = f2ById.get(eskiId);
      let summa = oz?.summa ?? 0;
      for (const b of bolalar.get(eskiId) ?? []) summa += f2ById.get(b)?.summa ?? 0;
      const hajm = oz && oz.hajm !== 0 ? oz.hajm : null;
      if (summa !== 0 || hajm != null) f2 = { hajm, summa: r2(summa) };
    }
    let pereraschet: FarqQator['pereraschet'] = null;
    if (f2 && f2.summa !== 0) {
      f2Summa += f2.summa;
      minus += f2.summa;
      let pl: number | null = null; let ortiqchaHajm = 0;
      if (yangi && f2.hajm != null && yangi.hajm != null && yangi.narx != null) {
        const h = Math.min(f2.hajm, yangi.hajm);
        pl = r2(Math.max(h, 0) * yangi.narx);
        ortiqchaHajm = Math.max(0, r2(f2.hajm - yangi.hajm));
        plus += pl;
      } else if (!yangi) {
        pl = 0; ortiqchaHajm = f2.hajm ?? 0;
      } else plusNomalum += 1;
      pereraschet = { minus: f2.summa, plus: pl, ortiqchaHajm };
    }
    const farq = eski?.summa != null && yangi?.summa != null ? r2(yangi.summa - eski.summa)
      : !eski && yangi?.summa != null ? yangi.summa : eski?.summa != null && !yangi ? -eski.summa : null;
    return {
      mosId: m.id, holat: m.holat,
      kod: poz?.kod ?? m.joriy_kod ?? null, nom: poz?.nom ?? m.joriy_nom ?? '—', birlik: poz?.birlik ?? m.joriy_birlik ?? null,
      bolim: poz?.ls_nom ?? poz?.razdel ?? null,
      eskiQatorId: eskiId, yangiQatorId: m.qator_id,
      eski, yangi, farq, f2, pereraschet,
    };
  });

  const eb = barglar(p.eskiQatorlar); const yb = barglar(p.yangiQatorlar);
  const sum = (xs: VQator[]) => r2(xs.reduce((s, q) => s + (son(q.summa) ?? 0), 0));
  const eskiKesim = katKesimYigish(eb, (q) => q.kat, (q) => son(q.summa));
  const yangiKesim = katKesimYigish(yb, (q) => q.kat, (q) => son(q.summa));
  const farqKesim = katKesimYigish<{ kat: string | null; s: number | null }>(
    [...yb.map((q) => ({ kat: q.kat, s: son(q.summa) })), ...eb.map((q) => ({ kat: q.kat, s: son(q.summa) == null ? null : -(son(q.summa) as number) }))],
    (x) => x.kat, (x) => x.s);
  const eski = sum(eb); const yangi = sum(yb);
  return {
    qatorlar,
    jami: {
      eski, yangi, farq: r2(yangi - eski), eskiKesim, yangiKesim, farqKesim,
      eskiNarxsiz: eb.filter((q) => son(q.narx) == null).length, yangiNarxsiz: yb.filter((q) => son(q.narx) == null).length,
      f2Summa: r2(f2Summa), minus: r2(minus), plus: r2(plus), plusNomalum, holatlar,
    },
  };
}
