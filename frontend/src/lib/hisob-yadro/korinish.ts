/**
 * KO'RINISHLAR (Construct uslubi): smeta / fakt / F2 / F2 qoralama / qoldiq / oy / jamlanma — bitta yadro, faqat
 * HAJM ko'rinishi boshqa. Oylik pul = o'sha kaskad, masshtablangan hajm ko'rinishida.
 *  - F2 summalari tasdiqlangan import qatorlaridan AYNAN olinadi (ishorali, minus ruxsat), hech qachon masshtablanmaydi.
 *  - Qoldiq = smeta − F2 − almashtirilgan; smeta summasi noma'lum — qoldiq ham noma'lum (0 emas).
 *  - Fakt hech qachon tasdiqlangan F2 dan kam emas (egasi 2026-10-29): `faktF2Max`.
 */
import { bosKesim, kesimgaQosh, type Kesim } from './kategoriya';
import { qatorSumma, yaxlit2 } from './yaxlit';

export type Korinish = 'smeta' | 'fakt' | 'f2' | 'f2_qoralama' | 'qoldiq' | 'oy' | 'jamlanma';

export type KorinishQator = {
  id: number;
  kat: string | null | undefined;
  narx: number | null | undefined;
  smetaHajm: number | null | undefined;
  faktHajm?: number | null;
  /** Tasdiqlangan F2 summasi (ishorali, aynan). */
  f2Summa?: number | null;
  /** Qoralama F2 summasi (aynan). */
  f2QoralamaSumma?: number | null;
  /** Almashtirilgan (replaced) summa — qoldiqdan ayriladi. */
  almashtirilganSumma?: number | null;
  /** Oy / jamlanma uchun hajm (masshtablangan ko'rinish). */
  davrHajm?: number | null;
};

/** MAX(fakt, F2): fakt noma'lum — noma'lum; F2 yo'q — 0 deb olinadi (tasdiqlangan hujjat yo'q). */
export function faktF2Max(fakt: number | null | undefined, f2: number | null | undefined): number | null {
  if (fakt == null || !Number.isFinite(fakt)) return null;
  return Math.max(fakt, f2 ?? 0);
}

/**
 * Fakt summasi MAX qoidasi bilan: MAX(fakt × narx, F2 summa). Fakt hajmi noma'lum — null. Narxsiz qator
 * (protokol narxli) — F2 summasi aynan (F2 ham yo'q bo'lsa null).
 */
export function faktSummaF2Max(faktHajm: number | null | undefined, narx: number | null | undefined, f2Summa: number | null | undefined): number | null {
  if (faktHajm == null || !Number.isFinite(faktHajm)) return null;
  const f = qatorSumma(faktHajm, narx);
  if (f == null) return f2Summa ? f2Summa : null;
  return Math.max(f, f2Summa ?? 0);
}

/** Qoldiq = smeta − F2 − almashtirilgan (ROUND 2). Smeta noma'lum — null. F2/almashtirilgan yo'q — 0. */
export function qoldiq(smeta: number | null | undefined, f2: number | null | undefined, almashtirilgan?: number | null): number | null {
  if (smeta == null || !Number.isFinite(smeta)) return null;
  return yaxlit2(smeta - (f2 ?? 0) - (almashtirilgan ?? 0));
}

/** Hajmni masshtablash (oylik ko'rinish: hajm × ulush), 6 xonagacha. Noma'lum — null. */
export function hajmMasshtab(hajm: number | null | undefined, ulush: number | null | undefined): number | null {
  if (hajm == null || ulush == null || !Number.isFinite(hajm) || !Number.isFinite(ulush)) return null;
  return Math.round(hajm * ulush * 1e6) / 1e6;
}

export type KorinishOpsiya = {
  /** Fakt ko'rinishida MAX(fakt × narx, F2 summa) qoidasi. */
  faktF2Max?: boolean;
};

/** Qatorning ko'rinishdagi to'g'ri xarajat summasi (QQS siz, ustamasiz). null — noma'lum. */
export function korinishSummasi(q: KorinishQator, k: Korinish, o: KorinishOpsiya = {}): number | null {
  switch (k) {
    case 'smeta': return qatorSumma(q.smetaHajm, q.narx);
    case 'fakt': return o.faktF2Max ? faktSummaF2Max(q.faktHajm, q.narx, q.f2Summa) : qatorSumma(q.faktHajm, q.narx);
    case 'f2': return q.f2Summa == null ? null : q.f2Summa;
    case 'f2_qoralama': return q.f2QoralamaSumma == null ? null : q.f2QoralamaSumma;
    case 'qoldiq': return qoldiq(qatorSumma(q.smetaHajm, q.narx), q.f2Summa, q.almashtirilganSumma);
    case 'oy':
    case 'jamlanma': return qatorSumma(q.davrHajm, q.narx);
  }
}

/** Ko'rinish kesimi: har qator summasi `korinishSummasi` dan; `yaxlitIdlar` — svod yaxlit avlodlari (ustamasiz). */
export function korinishKesim(qatorlar: Iterable<KorinishQator>, k: Korinish, o: KorinishOpsiya & { yaxlitIdlar?: ReadonlySet<number> | null } = {}): Kesim {
  const kes = bosKesim();
  for (const q of qatorlar) kesimgaQosh(kes, q.kat, korinishSummasi(q, k, o), !!o.yaxlitIdlar?.has(q.id));
  return kes;
}
