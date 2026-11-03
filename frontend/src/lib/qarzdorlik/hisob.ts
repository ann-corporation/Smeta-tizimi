/**
 * Qarzdorlik hisobi (kreditor: postavshik / subpudrat) - YAGONA qoida.
 * SQL (t2_qarzdorlik_royxat_v1) bilan bir xil:
 *   qabul    = yetkazib_berish + bajarilgan_ish         (qatorlari summa si; hammasi noma'lum bo'lsa NULL)
 *   tolangan = tolov qatorlari (t2_tolov ga bog'lanmagan) + t2_tolov   (hammasi noma'lum bo'lsa NULL)
 *   qarz     = boshlang'ich qoldiq + qabul - tolangan   (+ biz qarzmiz, - ular qarz / avans); uchala qism NULL bo'lsa NULL
 *   farq     = qarz - spravka_qarz                      (biri NULL bo'lsa NULL; manfiy = spravka qarzi asoslanmagan)
 * Qoidalar: hamma summa QQS bilan; minus ruxsat; NULL = noma'lum (0 emas).
 */

export type AsosTur = 'yetkazib_berish' | 'bajarilgan_ish' | 'tolov' | 'boshlangich_qoldiq';
export const ASOS_TURLAR: readonly AsosTur[] = ['yetkazib_berish', 'bajarilgan_ish', 'tolov', 'boshlangich_qoldiq'];

export type AsosQator = {
  id?: number | null;
  tur: AsosTur;
  hujjat_raqam: string | null;
  sana: string | null;
  nomi: string | null;
  birlik: string | null;
  hajm: number | null;
  narx: number | null;
  summa: number | null;
  izoh: string | null;
  sklad_harakat_id?: number | null;
  tolov_id?: number | null;
};

export type OgohKod = 'avans' | 'qabul_oshgan' | 'farq' | 'asossiz_spravka' | 'summasiz_qator' | 'tolov_spravkadan_kam';
export type Ogohlantirish = { kod: OgohKod; daraja: 'xato' | 'ogoh' | 'info' };

export type QarzNatija = {
  boshlangich: number | null;
  yetkazilgan: number | null;
  bajarilgan: number | null;
  qabul: number | null;
  tolangan: number | null;
  qarz: number | null;
  farq: number | null;
  nomalumQator: number;
  ogohlantirishlar: Ogohlantirish[];
};

/** Sezgirlik chegarasi (so'm): shundan kichik farq e'tiborga olinmaydi. */
export const QARZ_TOLERANS = 0.5;

const yaxlit = (n: number): number => Math.round(n * 100) / 100;
const son = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Qator summasi: kiritilgan summa, bo'lmasa hajm x narx; bo'lmasa NULL (noma'lum). */
export function qatorSumma(q: Pick<AsosQator, 'summa' | 'hajm' | 'narx'>): number | null {
  if (son(q.summa)) return q.summa;
  if (son(q.hajm) && son(q.narx)) return yaxlit(q.hajm * q.narx);
  return null;
}

/** Noma'lumlarni tashlab yig'adi; birorta ham ma'lum qiymat bo'lmasa NULL (0 emas). */
export function yigNull(qiymatlar: ReadonlyArray<number | null | undefined>): number | null {
  let jami = 0; let bor = false;
  for (const v of qiymatlar) { if (son(v)) { jami += v; bor = true; } }
  return bor ? yaxlit(jami) : null;
}

export function qarzHisobla(p: {
  qatorlar: ReadonlyArray<AsosQator>;
  /** t2_tolov dagi to'lovlar yig'indisi (qaytarim ayirilgan) - asosdagi tolov_id bilan bog'langanlari shu yerda. */
  tolovT2?: number | null;
  shartnomaSumma?: number | null;
  spravkaQarz?: number | null;
  spravkaTolangan?: number | null;
}): QarzNatija {
  const qs = p.qatorlar;
  const sum = (tur: AsosTur, faqatBogsiz = false) => yigNull(qs.filter((q) => q.tur === tur && (!faqatBogsiz || q.tolov_id == null)).map(qatorSumma));
  const boshlangich = sum('boshlangich_qoldiq');
  const yetkazilgan = sum('yetkazib_berish');
  const bajarilgan = sum('bajarilgan_ish');
  const qabul = yigNull([yetkazilgan, bajarilgan]);
  const tolangan = yigNull([sum('tolov', true), p.tolovT2]);
  const qarz = boshlangich == null && qabul == null && tolangan == null ? null : yaxlit((boshlangich ?? 0) + (qabul ?? 0) - (tolangan ?? 0));
  const sq = p.spravkaQarz;
  const farq = qarz == null || !son(sq) ? null : yaxlit(qarz - sq);
  const nomalumQator = qs.filter((q) => qatorSumma(q) == null).length;

  const og: Ogohlantirish[] = [];
  if (qarz != null && qarz < -QARZ_TOLERANS) og.push({ kod: 'avans', daraja: 'ogoh' });
  const ss = p.shartnomaSumma;
  if (qabul != null && son(ss) && qabul > ss + QARZ_TOLERANS) og.push({ kod: 'qabul_oshgan', daraja: 'xato' });
  if (farq != null && Math.abs(farq) > QARZ_TOLERANS) og.push({ kod: 'farq', daraja: 'xato' });
  if (qarz == null && son(sq) && Math.abs(sq) > QARZ_TOLERANS) og.push({ kod: 'asossiz_spravka', daraja: 'xato' });
  if (nomalumQator > 0) og.push({ kod: 'summasiz_qator', daraja: 'ogoh' });
  if (tolangan != null && son(p.spravkaTolangan) && tolangan < p.spravkaTolangan - QARZ_TOLERANS) og.push({ kod: 'tolov_spravkadan_kam', daraja: 'ogoh' });
  return { boshlangich, yetkazilgan, bajarilgan, qabul, tolangan, qarz, farq, nomalumQator, ogohlantirishlar: og };
}

/** Ro'yxat jami: ma'lum qiymatlar yig'indisi, noma'lumlar soni alohida. */
export function royxatJami(qs: ReadonlyArray<Pick<QarzNatija, 'qabul' | 'tolangan' | 'qarz' | 'farq'> & { shartnomaSumma: number | null; spravkaQarz: number | null }>) {
  return {
    shartnomaSumma: yigNull(qs.map((q) => q.shartnomaSumma)),
    qabul: yigNull(qs.map((q) => q.qabul)),
    tolangan: yigNull(qs.map((q) => q.tolangan)),
    qarz: yigNull(qs.map((q) => q.qarz)),
    spravkaQarz: yigNull(qs.map((q) => q.spravkaQarz)),
    farq: yigNull(qs.map((q) => q.farq)),
    qarzNomalum: qs.filter((q) => q.qarz == null).length,
  };
}
