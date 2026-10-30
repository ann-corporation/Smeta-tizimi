/**
 * YAXLIT SVOD bo'limlari (egasi qoidasi): yaxlit svod summasi — bu boshqa shartnoma yoki ish (smeta, shartnoma yoki
 * boshqa manbadan — yechim universal). Uning BUTUN tarkibi aynan shu summaga yig'iladi; QQS dan boshqa ustama YO'Q.
 * Server: `t2_svod_yaxlit_obyekt_v1` (qqssiz = svod_summa / (1 + qqs_stavka/100), dalil bo'lmasa — bolalar summasi) va
 * `t2_nakrutka_yaxlit_qosh_v1` (ИТОГО-4 + yaxlit, QQS bir marta).
 *
 * «Ustamasiz» ko'rsatkich tarkibdan kelib chiqadi: bolalar summasi svod summasiga MASSHTABLANADI va tiyingacha
 * TAQSIMLANADI (eng katta qoldiq usuli), shunda Σ bolalar = svod summasi (QQS siz) aynan.
 */
import { qqsSumma } from './nds';
import { yaxlit2 } from './yaxlit';

/** Bo'lim QQS siz yaxlit summasi: svod summasi (QQS bilan) va stavka bo'lsa — undan; aks holda bolalar summasi. */
export function yaxlitQqssiz(svodSumma: number | null | undefined, qqsStavka: number | null | undefined, bolalarSumma: number | null | undefined): number | null {
  if (svodSumma != null && Number.isFinite(svodSumma)) {
    if (qqsStavka == null || !Number.isFinite(qqsStavka)) return null; // stavka noma'lum — taxmin yo'q
    return yaxlit2(svodSumma / (1 + qqsStavka / 100));
  }
  return bolalarSumma == null ? null : yaxlit2(bolalarSumma);
}

/**
 * Bolalarni yaxlit summaga taqsimlash: har bola ulushi = summa × (yaxlit / Σ bolalar), tiyingacha; yaxlitlash qoldig'i
 * eng katta kasr qoldiqli bolalarga beriladi — Σ natija = yaxlit aynan. Σ bolalar = 0 yoki noma'lum bola bor — null.
 */
export function yaxlitTaqsim<T extends { id: number | string; summa: number | null }>(yaxlit: number, bolalar: readonly T[]): Map<T['id'], number> | null {
  if (!bolalar.length || bolalar.some((b) => b.summa == null || !Number.isFinite(b.summa))) return null;
  const jami = bolalar.reduce((t, b) => t + (b.summa as number), 0);
  if (Math.abs(jami) < 1e-9) return null;
  const maqsad = Math.round(yaxlit2(yaxlit) * 100); // tiyin
  const xom = bolalar.map((b) => ((b.summa as number) * maqsad) / jami);
  const past = xom.map((x) => Math.floor(x + 1e-9));
  let qoldiq = maqsad - past.reduce((t, x) => t + x, 0);
  const tartib = xom.map((x, i) => ({ i, k: x - past[i] })).sort((a, b) => b.k - a.k || a.i - b.i);
  for (let j = 0; qoldiq > 0 && tartib.length; j = (j + 1) % tartib.length, qoldiq--) past[tartib[j].i]++;
  for (let j = 0; qoldiq < 0 && tartib.length; j = (j + 1) % tartib.length, qoldiq++) past[tartib[tartib.length - 1 - j].i]--;
  const out = new Map<T['id'], number>();
  bolalar.forEach((b, i) => out.set(b.id, past[i] / 100));
  return out;
}

/** Bola qatorining yaxlit ulushi (masshtab koeffitsienti: yaxlit / Σ bolalar). Σ = 0 — null. */
export function yaxlitMasshtab(yaxlit: number | null | undefined, bolalarSumma: number | null | undefined): number | null {
  if (yaxlit == null || bolalarSumma == null || Math.abs(bolalarSumma) < 1e-9) return null;
  return yaxlit / bolalarSumma;
}

/**
 * Ko'rinishdagi (fakt, oy, qoldiq…) yaxlit summa = yaxlit × (ko'rinishdagi bolalar / smetadagi bolalar) — bajarilish
 * ulushi bo'yicha. F2 ko'rinishida masshtablanmaydi (tasdiqlangan summa aynan olinadi — `korinish.ts`).
 */
export function yaxlitKorinish(yaxlit: number | null | undefined, smetaBolalar: number | null | undefined, korinishBolalar: number | null | undefined): number | null {
  const k = yaxlitMasshtab(yaxlit, smetaBolalar);
  return k == null || korinishBolalar == null ? null : yaxlit2(korinishBolalar * k);
}

/** ИТОГО-4 + yaxlit (QQS siz) → ИТОГО-4, QQS, ВСЕГО (server `t2_nakrutka_yaxlit_qosh_v1` qadami). */
export function yaxlitBilanYakun(itogo4: number, yaxlitQqssizSumma: number | null | undefined, ndsFoiz: number | null | undefined): { itogo4: number; nds: number | null; vsego: number | null } | null {
  if (yaxlitQqssizSumma == null || !Number.isFinite(yaxlitQqssizSumma)) return null;
  const i4 = yaxlit2(itogo4 + yaxlitQqssizSumma);
  const nds = qqsSumma(i4, ndsFoiz);
  return { itogo4: i4, nds, vsego: nds == null ? null : yaxlit2(i4 + nds) };
}

/** Yaxlit qatorning «к оплате» (QQS bilan) summasi: ustama yo'q, faqat QQS — koeffitsient (1 + НДС/100), masalan 1,12. */
export function yaxlitKOplate(summa: number | null | undefined, ndsFoiz: number | null | undefined): number | null {
  if (summa == null || ndsFoiz == null || !Number.isFinite(summa)) return null;
  return yaxlit2(summa * (1 + ndsFoiz / 100));
}
