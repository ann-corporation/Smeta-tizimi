/**
 * FAKT ASOSIDAGI PERERASCHET (egasi 2026-10-26): «Smeta yo'q paytida maksimal xavfsiz, arzon ishlar bilan F2 o'tkazganman;
 * endi smetada bu ishlar to'la holatda bor. Hamma olingan F2 ni minus qilib, keyin fakt hajmlarini qayta belgilab
 * pereraschet qila oladigan bo'lsin.»
 *
 * Sof funksiyalar (UI'siz), `t2_qator_holat` barg qatorlari (rs/mat/ob) ustida:
 *  - SMETA POZITSIYASI: «bo'lishi kerak» = min(fakt, smeta − almashtirilgan) × smeta narxi; «olingan» = barcha
 *    TASDIQLANGAN F2 (tuzatish aktlari bilan, `t2_qator_holat.f2_summa`); farq = kerak − olingan.
 *    Smetadan oshgan fakt pulga kirmaydi (DS kerak) — eslatma.
 *  - SMETAGA BOG'LANMAGAN OLINGAN: «(ekspertizagacha)» bo'lim, smetada hajm yo'q/0, F2 importida qo'shilgan narxsiz qator
 *    (qoshimcha) — olingan summa TO'LIQ MINUS (egasi qayta bog'lashi yoki minusni qabul qilishi mumkin).
 *  - TEKSHIRISH (pulga KIRMAYDI, 0 deb hisoblanmaydi): smeta narxi NULL, F2 summasi noma'lum, chegirma (manfiy smeta)
 *    qatori — bu qatorlar uchun «F2 vs smeta» rejimi ishlatiladi.
 * Ikki chiqish formati — natija bir xil: (a) to'liq storno (olinganning hammasi minus) + fakt bo'yicha qayta (plus);
 * (b) faqat farq (pozitsiya bo'yicha ±). Jami (a) = jami (b) — `pereraschet-fakt.test.ts` da isbotlangan.
 * Qoidalar: asl smeta va tasdiqlangan aktlar O'ZGARMAYDI (bu faqat hisob va yangi qoralama yuki); NULL ≠ 0; narx 0 = 0.
 * Summalar NDS SIZ, ustamasiz; ustamali (kaskad) — chaqiruvchida kategoriya kesimlari orqali; NDS faqat oxirida.
 */
import { ajdodlarQur, yaxlit2, PUL_CHEGARA, type PQator } from './pereraschet';
import { katKesimgaQosh, bosKatKesim, type KatKesim } from './ustamali-summa';
import { mashinistMehnati } from './narx-bildirishnoma';
import { ESKI_SMETA } from './f2-dublikat/tekshiruv';

export type FaktTekshirSabab = 'narx_yoq' | 'f2_summa_nomalum' | 'chegirma';
export type BoglanmaganSabab = 'eski_smeta' | 'smeta_hajm_yoq' | 'qoshimcha_narxsiz';
export type FaktEslatma = 'smetadan_tashqari' | 'fakt_norma' | 'fakt_bor_smetada_yoq';

export type FPozitsiya = {
  qatorId: number; kod: string | null; nom: string; birlik: string | null; kat: string | null; tur: string;
  bolimId: number | null; bolimYol: string[]; ajdodlar: number[];
  /** true — joriy smeta pozitsiyasi; false — smetaga bog'lanmagan olingan (to'liq minus). */
  boglangan: boolean;
  boglanmaganSabab: BoglanmaganSabab | null;
  smetaHajm: number | null; smetaNarx: number | null; almashtirilgan: number;
  faktHajm: number;
  /** Pulga kiradigan fakt: min(fakt, smeta − almashtirilgan); bog'lanmaganda 0. */
  hisobFakt: number;
  f2Hajm: number; f2Summa: number;
  /** «Bo'lishi kerak» (ustamasiz, NDS siz). Bog'lanmaganda 0. */
  kerak: number;
  /** Farq = kerak − olingan (ishorali: + olish, − qaytarish). */
  farq: number;
  /** Faktsiz, lekin F2 olingan (fakt jurnalida qayta belgilash uchun). */
  faktsizF2: boolean;
  tekshir: FaktTekshirSabab[];
  eslatma: FaktEslatma[];
  /** Pulga kiradimi (tekshirish sababi yo'q). */
  hisobda: boolean;
  /** Smetadan tashqari fakt hajmi (pulga kirmaydi). */
  tashqariHajm: number;
};

export type FJami = {
  /** Fakt bo'yicha bo'lishi kerak (format (a) ning plus qismi). */
  kerak: number;
  /** Olingan (tasdiqlangan F2) — format (a) ning storno (minus) qismi; shundan bog'lanmagan. */
  olingan: number; olinganBoglanmagan: number;
  /** Format (b): musbat farqlar va manfiy farqlar (mutlaq) yig'indisi. */
  plus: number; minus: number;
  /** Sof = kerak − olingan = plus − minus. */
  sof: number;
  soni: number;
};
export type FBolimJami = { bolimId: number | null; yol: string[]; kerak: number; olingan: number; plus: number; minus: number; sof: number; soni: number };

export type FNatija = {
  pozitsiyalar: FPozitsiya[];
  /** Pulga kirgan pozitsiyalar (|farq| bo'yicha kamayish). */
  hisobda: FPozitsiya[];
  /** Smetaga bog'lanmagan olingan (hisobda bo'lganlari; olingan bo'yicha kamayish). */
  boglanmagan: FPozitsiya[];
  tekshirish: FPozitsiya[];
  /** Fakti yo'q, lekin F2 olingan smeta pozitsiyalari (hisobda). */
  faktsizF2: FPozitsiya[];
  jami: FJami;
  /** Kategoriya kesimlari (ustamali hisob uchun, MUTLAQ qiymatda). */
  kerakKesim: KatKesim; olinganKesim: KatKesim; plusKesim: KatKesim; minusKesim: KatKesim;
  bolimlar: FBolimJami[];
  /** Tekshirish qatorlaridagi olingan (pulga kirmagan; ma'lum qismi). */
  tekshirOlingan: number;
};

export type FKontekst = {
  /** F2 importi / qo'shimcha ish orqali qo'shilgan qatorlar (t2_qator.qoshimcha = true). */
  qoshimchaIdlar?: ReadonlySet<number>;
  /** Filtr: faqat shu razdel (rz id) ostidagilar. */
  bolimId?: number | null;
  /** Svod yaxlit bo'limlari va avlodlari (yaxlitQatorIdlari): ustamali summada koeffitsient qo'llanmaydi. */
  yaxlitIdlar?: ReadonlySet<number>;
};

const BARG = new Set(['rs', 'mat', 'ob']);
const EPS = 1e-6;
const son = (x: unknown): number | null => {
  if (x == null || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
const aniq = (x: number) => Number(x.toPrecision(12));

/** Bitta barg qator → pozitsiya (tasnifga kirmasa null). */
export function faktPozitsiya(q: PQator, o: { eski: boolean; qoshimcha: boolean; bolimId: number | null; bolimYol: string[]; ajdodlar: number[] }): FPozitsiya | null {
  const tur = q.tur ?? '';
  if (!BARG.has(tur) || mashinistMehnati({ nom: q.nom })) return null;
  const f2 = son(q.f2_hajm) ?? 0;
  const fakt = Math.max(0, son(q.fakt_hajm) ?? 0);
  const f2s = son(q.f2_summa) ?? 0;
  if (Math.abs(f2) < EPS && Math.abs(f2s) < PUL_CHEGARA && fakt < EPS) return null;
  const smeta = son(q.smeta_hajm);
  const narx = son(q.smeta_narx);
  const nomalum = (son(q.f2_summa_nomalum) ?? 0) > 0;
  const alm = Math.max(0, son(q.almashtirilgan_hajm) ?? 0);
  const chegirma = !o.qoshimcha && smeta != null && smeta < -EPS;

  let boglanmaganSabab: BoglanmaganSabab | null = null;
  if (!chegirma) {
    if (o.eski) boglanmaganSabab = 'eski_smeta';
    else if (smeta == null || smeta <= EPS) boglanmaganSabab = 'smeta_hajm_yoq';
    else if (o.qoshimcha && narx == null) boglanmaganSabab = 'qoshimcha_narxsiz';
  }
  const boglangan = boglanmaganSabab == null;
  const olinganBor = Math.abs(f2) > EPS || Math.abs(f2s) >= PUL_CHEGARA;
  // Bog'lanmagan qatorda F2 olinmagan bo'lsa (faqat fakt bor) — pulga ta'siri yo'q, ro'yxatga kirmaydi.
  if (!boglangan && !olinganBor) return null;

  const tekshir: FaktTekshirSabab[] = [];
  const eslatma: FaktEslatma[] = [];
  if (chegirma) tekshir.push('chegirma');
  if (boglangan && !chegirma && narx == null) tekshir.push('narx_yoq');
  if (nomalum && olinganBor) tekshir.push('f2_summa_nomalum');
  if (q.fakt_manbasi === 'BL_NORMA' && fakt > EPS) eslatma.push('fakt_norma');
  if (!boglangan && fakt > EPS) eslatma.push('fakt_bor_smetada_yoq');

  let hisobFakt = 0; let kerak = 0; let tashqariHajm = 0;
  if (boglangan && !chegirma) {
    const chegara = Math.max(0, (smeta as number) - alm);
    hisobFakt = aniq(Math.min(fakt, chegara));
    if (fakt - chegara > EPS) { tashqariHajm = aniq(fakt - chegara); eslatma.push('smetadan_tashqari'); }
    if (narx != null) kerak = yaxlit2(hisobFakt * narx);
  }
  const hisobda = tekshir.length === 0;
  const farq = hisobda ? yaxlit2(kerak - f2s) : 0;
  return {
    qatorId: q.qator_id, kod: q.kod, nom: q.nom ?? '', birlik: q.birlik, kat: q.kat, tur,
    bolimId: o.bolimId, bolimYol: o.bolimYol, ajdodlar: o.ajdodlar,
    boglangan, boglanmaganSabab,
    smetaHajm: smeta, smetaNarx: narx, almashtirilgan: alm,
    faktHajm: fakt, hisobFakt, f2Hajm: f2, f2Summa: f2s, kerak, farq,
    faktsizF2: boglangan && fakt < EPS && Math.abs(f2) > EPS,
    tekshir, eslatma, hisobda, tashqariHajm,
  };
}

/** Butun obyekt (yoki razdel) bo'yicha fakt asosidagi pereraschet. O(n). */
export function faktPereraschetHisobla(rows: readonly PQator[], k: FKontekst = {}): FNatija {
  const { byId, ajdodOl } = ajdodlarQur(rows);
  const qosh = k.qoshimchaIdlar ?? new Set<number>();
  const pozitsiyalar: FPozitsiya[] = [];
  for (const r of rows) {
    if (!BARG.has(r.tur ?? '')) continue;
    const a = ajdodOl(r.ota_id ?? null);
    if (k.bolimId != null && !a.ajdodlar.includes(k.bolimId)) continue;
    const ota = r.ota_id != null ? byId.get(r.ota_id) : undefined;
    const qoshimcha = qosh.has(r.qator_id) || (ota?.tur === 'bl' && qosh.has(ota.qator_id));
    const p = faktPozitsiya(r, { eski: a.eski || ESKI_SMETA.test(String(r.nom ?? '')), qoshimcha, bolimId: a.bolimId, bolimYol: a.yol, ajdodlar: a.ajdodlar });
    if (p) pozitsiyalar.push(p);
  }
  const hisobda = pozitsiyalar.filter((p) => p.hisobda).sort((a, b) => Math.abs(b.farq) - Math.abs(a.farq));
  const tekshirish = pozitsiyalar.filter((p) => !p.hisobda).sort((a, b) => Math.abs(b.f2Summa) - Math.abs(a.f2Summa));
  const boglanmagan = hisobda.filter((p) => !p.boglangan).sort((a, b) => Math.abs(b.f2Summa) - Math.abs(a.f2Summa));
  const faktsizF2 = hisobda.filter((p) => p.faktsizF2);

  const kerakKesim = bosKatKesim(); const olinganKesim = bosKatKesim(); const plusKesim = bosKatKesim(); const minusKesim = bosKatKesim();
  let kerak = 0; let olingan = 0; let olinganB = 0; let plus = 0; let minus = 0;
  const bolimMap = new Map<string, FBolimJami>();
  for (const p of hisobda) {
    kerak += p.kerak; olingan += p.f2Summa; if (!p.boglangan) olinganB += p.f2Summa;
    // Kesim MUTLAQ qiymatda: manfiy olingan (eski tuzatish) — teskari tomonga.
    const yx = !!k.yaxlitIdlar?.has(p.qatorId);
    if (p.kerak > 0) katKesimgaQosh(kerakKesim, p.kat, p.kerak, yx);
    if (p.f2Summa > 0) katKesimgaQosh(olinganKesim, p.kat, p.f2Summa, yx); else if (p.f2Summa < 0) katKesimgaQosh(kerakKesim, p.kat, -p.f2Summa, yx);
    if (p.farq > 0) { plus += p.farq; katKesimgaQosh(plusKesim, p.kat, p.farq, yx); }
    else if (p.farq < 0) { minus += -p.farq; katKesimgaQosh(minusKesim, p.kat, -p.farq, yx); }
    const bk = String(p.bolimId ?? 'yoq');
    const bj = bolimMap.get(bk) ?? { bolimId: p.bolimId, yol: p.bolimYol, kerak: 0, olingan: 0, plus: 0, minus: 0, sof: 0, soni: 0 };
    bj.soni++; bj.kerak += p.kerak; bj.olingan += p.f2Summa;
    if (p.farq > 0) bj.plus += p.farq; else bj.minus += -p.farq;
    bolimMap.set(bk, bj);
  }
  const jami: FJami = {
    kerak: yaxlit2(kerak), olingan: yaxlit2(olingan), olinganBoglanmagan: yaxlit2(olinganB),
    plus: yaxlit2(plus), minus: yaxlit2(minus), sof: yaxlit2(plus - minus), soni: hisobda.length,
  };
  const bolimlar = [...bolimMap.values()].map((b) => ({ ...b, kerak: yaxlit2(b.kerak), olingan: yaxlit2(b.olingan), plus: yaxlit2(b.plus), minus: yaxlit2(b.minus), sof: yaxlit2(b.plus - b.minus) }))
    .sort((a, b) => Math.abs(b.sof) - Math.abs(a.sof));
  const tekshirOlingan = yaxlit2(tekshirish.reduce((s, p) => s + p.f2Summa, 0));
  return { pozitsiyalar, hisobda, boglanmagan, tekshirish, faktsizF2, jami, kerakKesim, olinganKesim, plusKesim, minusKesim, bolimlar, tekshirOlingan };
}

export type FaktFormat = 'storno' | 'farq';

export type FaktYukQator = {
  qatorId: number; certifiedQuantity: number; certifiedUnitPrice: number; certifiedAmount: number;
  rawSnapshot: Record<string, unknown>; izoh: string;
};
export type FaktYuk = {
  qatorlar: FaktYukQator[];
  jami: number;
  /** Qoralamaga sig'magan pozitsiyalar (hajm farqi 0, lekin summa farqi bor — server hajm ≠ 0 talab qiladi). */
  sigmadi: { soni: number; summa: number; idlar: number[] };
};

const MANBA = { source: 'pereraschet_fakt', sourceReference: 'Перерасчёт по факту (накопительная ведомость)' };

function yukYig(qatorlar: FaktYukQator[], sigmadi: FaktYuk['sigmadi']): FaktYuk {
  sigmadi.summa = yaxlit2(sigmadi.summa);
  return { qatorlar, jami: yaxlit2(qatorlar.reduce((s, q) => s + q.certifiedAmount, 0)), sigmadi };
}

/**
 * Format (a), 1-qism — STORNO: har pulga kirgan pozitsiyaning olingan F2 si to'liq minus
 * (hajm = −F2 hajm, narx = F2 o'rtacha narxi, summa = −F2 summa).
 */
export function stornoYuk(n: FNatija): FaktYuk {
  const out: FaktYukQator[] = []; const sig: FaktYuk['sigmadi'] = { soni: 0, summa: 0, idlar: [] };
  for (const p of n.hisobda) {
    if (Math.abs(p.f2Hajm) < EPS) { if (Math.abs(p.f2Summa) >= PUL_CHEGARA) { sig.soni++; sig.summa -= p.f2Summa; sig.idlar.push(p.qatorId); } continue; }
    const narx = p.f2Summa / p.f2Hajm;
    out.push({
      qatorId: p.qatorId, certifiedQuantity: aniq(-p.f2Hajm), certifiedUnitPrice: narx, certifiedAmount: yaxlit2(-p.f2Summa),
      rawSnapshot: { ...MANBA, bolim: 'storno', enteredQuantity: -p.f2Hajm, enteredUnitPrice: narx, enteredAmount: -p.f2Summa },
      izoh: p.boglangan ? 'Перерасчёт: сторно ранее предъявленного (Ф-2)' : 'Перерасчёт: сторно ранее предъявленного — позиция не привязана к смете',
    });
  }
  return yukYig(out, sig);
}

/** Format (a), 2-qism — QAYTA: fakt bo'yicha yangi qatorlar (hajm = hisobdagi fakt, narx = smeta narxi). */
export function qaytaYuk(n: FNatija): FaktYuk {
  const out: FaktYukQator[] = [];
  for (const p of n.hisobda) {
    if (!p.boglangan || p.smetaNarx == null || p.hisobFakt < EPS) continue;
    out.push({
      qatorId: p.qatorId, certifiedQuantity: p.hisobFakt, certifiedUnitPrice: p.smetaNarx, certifiedAmount: p.kerak,
      rawSnapshot: { ...MANBA, bolim: 'qayta', enteredQuantity: p.hisobFakt, enteredUnitPrice: p.smetaNarx, enteredAmount: p.kerak },
      izoh: 'Перерасчёт: предъявлено по факту по цене сметы',
    });
  }
  return yukYig(out, { soni: 0, summa: 0, idlar: [] });
}

/** Format (b) — FAQAT FARQ: pozitsiya bo'yicha bitta ± qator (hajm = fakt − F2, summa = kerak − olingan). */
export function farqYuk(n: FNatija): FaktYuk {
  const out: FaktYukQator[] = []; const sig: FaktYuk['sigmadi'] = { soni: 0, summa: 0, idlar: [] };
  for (const p of n.hisobda) {
    const dh = aniq(p.hisobFakt - p.f2Hajm);
    if (Math.abs(p.farq) < PUL_CHEGARA && Math.abs(dh) < EPS) continue;
    if (Math.abs(dh) < EPS) { sig.soni++; sig.summa += p.farq; sig.idlar.push(p.qatorId); continue; }
    out.push({
      qatorId: p.qatorId, certifiedQuantity: dh, certifiedUnitPrice: p.farq / dh, certifiedAmount: p.farq,
      rawSnapshot: { ...MANBA, bolim: 'farq', kerak: p.kerak, olingan: p.f2Summa, hisobFakt: p.hisobFakt, f2Hajm: p.f2Hajm, enteredQuantity: dh, enteredAmount: p.farq },
      izoh: `Перерасчёт по факту: положено ${p.kerak.toFixed(2)}, предъявлено ${p.f2Summa.toFixed(2)}${p.boglangan ? '' : ' (позиция не привязана к смете)'}`,
    });
  }
  return yukYig(out, sig);
}

/** Fakt jurnaliga havola: «fakti yo'q, lekin F2 olingan» filtri bilan (ixtiyoriy razdel). */
export function faktJurnalHavola(obyektId: number, bolimId?: number | null): string {
  return `/admin/fakt?obyekt=${obyektId}&filtr=faktsiz_f2${bolimId != null ? `&bolim=${bolimId}` : ''}`;
}
