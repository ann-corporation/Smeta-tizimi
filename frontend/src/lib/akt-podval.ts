/**
 * F2 HUJJAT PODVALI (egasi 2026-11-03): F2 faylining o'z podvalidan (ПРОЧИЕ РАСХОДЫ, СТРАХОВАНИЕ, РИСК, НДС, транспорт …)
 * foizlar o'qiladi va `t2_akt_podval` ga yoziladi. O'qish — mavjud smeta podval o'quvchisi (`nakrutkaPodvaliniOqi`,
 * parallel aniqlagich emas); bu modul uning natijasini saqlash shakliga o'giradi va yetishmagan foizni hujjat summalari
 * nisbatidan ISBOTLAYDI. Isbotsiz foiz to'qilmaydi: isbotsiz summali qator bor — `toliq: false` (yozilmaydi, smeta podvali qoladi).
 * Pul arifmetikasi yo'q: faqat yig'ish/nisbat (yaxlitlash yadro `yaxlit2` orqali).
 */
import { yaxlit2, type AktPodvalNk, type KoefKod } from './hisob-yadro';
import type { NakrutkaPodvalOqish, NakrutkaPodvalQatori } from './smeta-anatomiya/nakrutka';

export type AktPodvalSatr = {
  kod: string;
  nom: string;
  foiz: number | null;
  /** So'mda (hujjat masshtabi qo'llangan). null — hujjatda summa yo'q. */
  summa: number | null;
  manzil: string;
};

export type AktPodvalYuk = {
  nk: Partial<Record<KoefKod, number>>;
  qatorlar: AktPodvalSatr[];
  itogo1: number | null; itogo2: number | null; itogo3: number | null; itogo4: number | null;
  hujjat: { pryamye: number | null; itogo4: number | null; nds: number | null; vsego: number | null };
  masshtab: 1 | 1000;
  tekshiruv: { holat: NakrutkaPodvalOqish['holat']; toliq: boolean; isbotsiz: string[]; isbotNomos: number; nisbatdan: string[] };
};

/** Saqlangan qator (RPC `t2_akt_podval_ol_v1`). */
export type AktPodvalQator = {
  akt_id: number; blok: string; manba: 'import' | 'storno' | 'smeta' | 'backfill'; manba_akt_id: number | null; ishora: 1 | -1;
  nk: AktPodvalNk; qatorlar: AktPodvalSatr[];
  itogo1: number | null; itogo2: number | null; itogo3: number | null; itogo4: number | null; nds_foiz: number | null;
  hujjat_pryamye: number | null; hujjat_itogo4: number | null; hujjat_nds: number | null; hujjat_vsego: number | null;
  masshtab: 1 | 1000; tekshiruv: Record<string, unknown>; versiya: number;
};

/** Qator kodi → (foiz kodi, baza qatori kodi): foiz hujjat summalari nisbatidan isbotlanadi. */
const NISBAT: Array<{ kod: string; koef: KoefKod; baza: string }> = [
  { kod: 'prochie', koef: 'ПРОЧИЕ_ПОДРЯДЧИК', baza: 'itogo1' },
  { kod: 'strax', koef: 'СТРАХОВАНИЕ', baza: 'itogo3' },
  { kod: 'risk', koef: 'РИСК', baza: 'itogo3' },
  { kod: 'nds', koef: 'НДС', baza: 'itogo4' },
];
/** Foizi faqat kategoriya bazasidan isbotlanadigan qatorlar (baza hujjatda alohida qator emas) — isbotsiz bo'lsa to'liq emas. */
const KATEGORIYA_QATORLAR = new Set(['tr_mat', 'skl_mat', 'tr_kab', 'tr_ob', 'zag_ob']);

const nolmi = (x: number | null | undefined) => x == null || Math.abs(x) < 0.005;

function summaSom(q: NakrutkaPodvalQatori | undefined): number | null {
  return q?.summa == null ? null : yaxlit2(q.summa * q.masshtab);
}

/**
 * Podval o'qish natijasi → saqlash yuki. `null` — hujjatda podval topilmadi (smeta podvali qoladi).
 * `jami` — F2 o'quvchisining hujjat jamilari (ИТОГО ПРЯМЫЕ, НДС, ВСЕГО), hujjat birligida.
 */
export function aktPodvalYuki(o: NakrutkaPodvalOqish, jami: { pryamye: number | null; nds: number | null; vsego: number | null } | null): AktPodvalYuk | null {
  if (o.holat === 'topilmadi' && !o.qatorlar.length) return null;
  const ms = o.masshtab;
  const bor = (kod: string) => o.qatorlar.find((q) => q.kod === kod && q.summa != null);
  const nk: Partial<Record<KoefKod, number>> = { ...o.koeffitsientlar } as Partial<Record<KoefKod, number>>;
  const nisbatdan: string[] = [];
  for (const n of NISBAT) {
    if (nk[n.koef] != null) continue;
    const q = bor(n.kod); const b = bor(n.baza);
    if (!q || !b || nolmi(b.summa)) continue;
    const foiz = Math.round(((q.summa as number) / (b.summa as number)) * 1e4) / 1e2;
    // Isbot: qayta hisob hujjat summasiga ±1 (hujjat birligida) mos kelishi shart.
    if (Number.isFinite(foiz) && Math.abs(yaxlit2(((b.summa as number) * foiz) / 100) - (q.summa as number)) <= 1) { nk[n.koef] = foiz; nisbatdan.push(n.koef); }
  }
  const isbotsiz: string[] = [];
  for (const q of o.qatorlar) {
    if (nolmi(q.summa)) continue;
    if (KATEGORIYA_QATORLAR.has(q.kod) && !q.foizlar.length) isbotsiz.push(q.kod);
    const nisb = NISBAT.find((n) => n.kod === q.kod);
    if (nisb && nk[nisb.koef] == null) isbotsiz.push(q.kod);
  }
  const satr = (q: NakrutkaPodvalQatori): AktPodvalSatr => ({
    kod: q.kod, nom: q.xom.slice(0, 200), foiz: q.foizlar[0]?.foiz ?? (NISBAT.find((n) => n.kod === q.kod) ? (nk[NISBAT.find((n) => n.kod === q.kod)!.koef] ?? null) : null),
    summa: summaSom(q), manzil: `${q.manzil.varaq}!${q.manzil.qator}`,
  });
  const som = (x: number | null | undefined) => (x == null ? null : yaxlit2(x * ms));
  const isbotNomos = o.isbot.filter((b) => !b.mos).length;
  return {
    nk,
    qatorlar: o.qatorlar.filter((q) => q.kod !== 'kf').slice(0, 200).map(satr),
    itogo1: summaSom(bor('itogo1')), itogo2: summaSom(bor('itogo2')), itogo3: summaSom(bor('itogo3')), itogo4: summaSom(bor('itogo4')),
    hujjat: { pryamye: som(jami?.pryamye), itogo4: summaSom(bor('itogo4')), nds: som(jami?.nds), vsego: som(jami?.vsego) },
    masshtab: ms,
    tekshiruv: { holat: o.holat, toliq: isbotsiz.length === 0 && isbotNomos === 0 && Object.keys(nk).length > 0, isbotsiz: [...new Set(isbotsiz)], isbotNomos, nisbatdan },
  };
}

/** RPC `t2_akt_podval_yoz_v1` ga beriladigan `p_podval` (itogo/hujjat so'mda). */
export function aktPodvalRpcYuki(y: AktPodvalYuk): Record<string, unknown> {
  return { nk: y.nk, qatorlar: y.qatorlar, itogo1: y.itogo1, itogo2: y.itogo2, itogo3: y.itogo3, itogo4: y.itogo4, hujjat: y.hujjat, masshtab: y.masshtab, tekshiruv: y.tekshiruv };
}

/** Saqlangan podvallar: aktning o'z bloki (`''`) bo'yicha xarita. */
export function aktPodvalXaritasi(qatorlar: readonly AktPodvalQator[]): Map<string, AktPodvalQator> {
  return new Map(qatorlar.map((p) => [`${p.akt_id}:${p.blok}`, p]));
}
