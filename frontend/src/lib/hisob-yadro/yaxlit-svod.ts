/**
 * YAXLIT SVOD bo'limlari (egasi qoidasi): yaxlit svod summasi — bu boshqa shartnoma yoki ish (smeta, shartnoma yoki
 * boshqa manbadan — yechim universal). Uning BUTUN tarkibi aynan shu summaga yig'iladi; QQS dan boshqa ustama YO'Q.
 * Egasi (2026-10-30): svodda yaxlit qator НДС dan KEYIN — summa QQS BILAN va yakuniy; ВСЕГО = ishlar ВСЕГО + svod aynan.
 * Server (20261116000000): `t2_nakrutka_yaxlit_qosh_v2` / `_t2_summa_paket_hisob_v1` — shu qoida bilan aynan (tiyingacha).
 *
 * «Ustamasiz» ko'rsatkich tarkibdan kelib chiqadi: bolalar summasi svod summasiga MASSHTABLANADI va tiyingacha
 * TAQSIMLANADI (eng katta qoldiq usuli), shunda Σ bolalar = svod summasi (QQS siz) aynan.
 */
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

/**
 * Yaxlit svod summasi (egasi 2026-10-30): svodda yaxlit qator НДС dan KEYIN — `svodSumma` QQS BILAN va YAKUNIY.
 * QQS siz = ROUND(svod / (1 + stavka), 2) — faqat ko'rsatish/tahlil; QQS = svod − QQS siz (AYIRMA, yig'indi aynan qaytadi).
 * Svod summasi yo'q (sof tarkib) — bolalar summasi QQS siz, QQS bilan = ×(1 + QQS) (stavka noma'lum — null).
 */
export function yaxlitSvodSumma(svodSumma: number | null | undefined, qqsStavka: number | null | undefined, bolalarSumma: number | null | undefined, ndsFoiz: number | null | undefined): { qqsBilan: number | null; qqssiz: number | null; qqs: number | null } {
  if (svodSumma != null && Number.isFinite(svodSumma)) {
    const qqsBilan = yaxlit2(svodSumma);
    const st = qqsStavka ?? ndsFoiz;
    const qqssiz = st == null || !Number.isFinite(st) ? null : yaxlit2(svodSumma / (1 + st / 100));
    return { qqsBilan, qqssiz, qqs: qqssiz == null ? null : yaxlit2(qqsBilan - qqssiz) };
  }
  if (bolalarSumma == null) return { qqsBilan: null, qqssiz: null, qqs: null };
  const qqssiz = yaxlit2(bolalarSumma);
  const qqsBilan = yaxlitKOplate(qqssiz, ndsFoiz);
  return { qqsBilan, qqssiz, qqs: qqsBilan == null ? null : yaxlit2(qqsBilan - qqssiz) };
}

/**
 * Ishlar natijasi (ИТОГО-4, НДС, ВСЕГО) + yaxlit svod (QQS bilan, aynan) → sarlavha: ВСЕГО = ishlar ВСЕГО + svod
 * (aynan, ÷/× aylanmasiz); ИТОГО-4 = ishlar + svod QQS siz; НДС = ishlar НДС + (svod − svod QQS siz). Yaxlit yo'q — null.
 */
export function yaxlitBilanYakun(ishlar: { itogo4: number; nds: number | null; vsego: number | null }, yaxlit: { qqsBilan: number; qqssiz: number | null } | null | undefined): { itogo4: number | null; nds: number | null; vsego: number | null } | null {
  if (!yaxlit || !Number.isFinite(yaxlit.qqsBilan)) return null;
  const vsego = ishlar.vsego == null ? null : yaxlit2(ishlar.vsego + yaxlit.qqsBilan);
  if (yaxlit.qqssiz == null) return { itogo4: null, nds: null, vsego };
  return { itogo4: yaxlit2(ishlar.itogo4 + yaxlit.qqssiz), nds: ishlar.nds == null ? null : yaxlit2(ishlar.nds + yaxlit.qqsBilan - yaxlit.qqssiz), vsego };
}
/** Yaxlit qatorning «к оплате» (QQS bilan) summasi: ustama yo'q, faqat QQS — koeffitsient (1 + НДС/100), masalan 1,12. */
export function yaxlitKOplate(summa: number | null | undefined, ndsFoiz: number | null | undefined): number | null {
  if (summa == null || ndsFoiz == null || !Number.isFinite(summa)) return null;
  return yaxlit2(summa * (1 + ndsFoiz / 100));
}

/**
 * Bo'lim qatorlariga taqsim (egasi: «butun tarkib aynan yaxlit summaga yig'iladi»): `jami` MA'LUM qatorlarning o'z summalari
 * ulushida tiyingacha taqsimlanadi (Σ = jami aynan). Noma'lum qator taqsimga kirmaydi (null qoladi). Hammasi 0 va jami 0 —
 * har qator 0. Aks holda taqsimlab bo'lmasa — null.
 */
export function yaxlitQatorlarga<T extends { id: number | string; summa: number | null }>(jami: number, qatorlar: readonly T[]): Map<T['id'], number> | null {
  // Noma'lum (null) qatorlar taqsimga KIRMAYDI va natijada yo'q (null qoladi, 0 emas) — chaqiruvchi diqqatga yozadi.
  const malum = qatorlar.filter((q) => q.summa != null && Number.isFinite(q.summa));
  if (!malum.length) return null;
  const t = yaxlitTaqsim(jami, malum);
  if (t) return t;
  if (Math.abs(jami) < 0.005) return new Map(malum.map((q) => [q.id, 0]));
  return null;
}

/** Taqsimlangan qatorlarning «к оплате» (×(1+QQS)): Σ = ROUND(Σ × (1+QQS), 2) aynan. QQS noma'lum — null. */
export function yaxlitKOplateTaqsim<K>(taqsim: ReadonlyMap<K, number>, ndsFoiz: number | null | undefined): Map<K, number> | null {
  if (ndsFoiz == null) return null;
  const qs = [...taqsim].map(([id, summa]) => ({ id: id as unknown as number, summa }));
  const jami = yaxlitKOplate(qs.reduce((a, b) => a + b.summa, 0), ndsFoiz);
  if (jami == null) return null;
  return yaxlitQatorlarga(jami, qs) as unknown as Map<K, number> | null;
}

/** Bo'limning ko'rinishdagi jami: smeta ko'rinishida — yaxlitning o'zi; boshqasida yaxlit × (ko'rinish / smeta). */
export function yaxlitBolimJami(yaxlit: number, smeta: number | null | undefined, korinish: number | null | undefined, smetaKorinishmi = false): number | null {
  return smetaKorinishmi ? yaxlit2(yaxlit) : yaxlitKorinish(yaxlit, smeta, korinish);
}