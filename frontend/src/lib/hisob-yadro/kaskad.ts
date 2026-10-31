/**
 * KASKAD va HISOB natijasi — saytning har burchagi (ekran, Excel, F2, qoldiq, oy) shu yerdan oladi.
 * Formulalar podvaldan (`podval.ts`), har qadam ROUND 2. Kategoriyasi noma'lum summa ИТОГО-4 ga USTAMASIZ qo'shiladi,
 * QQS undan keyin (server `_t2_summa_paket_hisob_v1`). Yaxlit svod — НДС dan KEYIN, QQS bilan, aynan (egasi 2026-10-30).
 */
import { katJami, katSummalari, type Kat, type KatSummalar, type Kesim } from './kategoriya';
import { podvalAniqla, podvalBahola, podvalKf, podvalNdsFoizi, type KoefKod, type Podval } from './podval';
import { qqsSumma } from './nds';
import { yaxlit2 } from './yaxlit';
import { yaxlitKOplate } from './yaxlit-svod';

export type UstamaQadam = { kod: string; nom: string; tur: 'foiz' | 'summa' | 'jami'; foiz: number | null; summa: number | null };

export type KaskadNatija = {
  /** ПРЯМЫЕ ЗАТРАТЫ (kaskadga kirgan kategoriyalar). */
  pryamye: number;
  /**
   * Podval QATORLARI qiymati (Excel bilan aynan): itogo4/nds — ishlar (+ kat noma'lum qism), oxirgi qator (ВСЕГО) —
   * shular + yaxlit svod (QQS bilan, aynan). Qo'shimcha kalitlar: kaskad_itogo4, nomalum_qism, yaxlit.
   */
  qiymat: Record<string, number | null>;
  qadamlar: UstamaQadam[];
  /** SARLAVHA: ustamali, QQS siz = ishlar ИТОГО-4 + yaxlit svodning QQS siz qismi. null — noma'lum. */
  itogo4: number | null;
  /** Kaskadning o'z ИТОГО-4 (hech narsa qo'shilmasdan). */
  kaskadItogo4: number | null;
  /** SARLAVHA: QQS = ishlar QQS + (svod − svod QQS siz) — ayirma sifatida (yig'indi aynan qaytadi). */
  qqs: number | null;
  /** SARLAVHA: QQS bilan = ishlar ВСЕГО + svod summasi (aynan, ÷/× aylanmasiz). */
  qqsBilan: number | null;
  qqsFoiz: number | null;
  /** Podvalning oxirgi qatori (ВСЕГО) — yaxlit svod qo'shilgan. */
  vsego: number | null;
  /** ИТОГО-4 ga ustamasiz qo'shilgan kat noma'lum qism (QQS bundan keyin). */
  nomalumQism: number | null;
  /** Yaxlit svod: QQS bilan (aynan) va QQS siz (ko'rsatish uchun). */
  yaxlit: { qqsBilan: number; qqssiz: number | null } | null;
  /** ВСЕГО dan keyingi qatorlar — BUYURTMACHI xarajatlari (pudratchi daromadi emas), bazasi yaxlit qo'shilgan ВСЕГО. */
  buyurtmachi: Array<{ kod: string; nom: string; summa: number | null; amal: 'qoshiladi' | 'korsatish' | 'ayiriladi' }>;
  /** ВСЕГО + buyurtmachi xarajatlari (``qoshiladi`` +, ``ayiriladi`` −, ``korsatish`` kirmaydi). Qator yo'q — null. */
  buyurtmachiJami: number | null;
  /** Noma'lum podval qatorlari kodlari (foiz/summa kiritilmagan). */
  nomalumQatorlar: string[];
  /** Aniq rad etish sababi (jim tashlab yuborilmaydi). */
  xato?: 'SVOD_YAXLIT_ITOGO4_DAN_KEYIN_QATOR' | 'VSEGO_KODI_YOQ';
};

/**
 * Yaxlit (lump-sum) qatorning KIRISH BOSQICHI (ABC-4 ekspert svodlari bo'yicha):
 *  - `qqsdan_keyin` (SUKUT): summa QQS BILAN, НДС dan keyin qo'shiladi; ustama ham QQS ham ustiga yo'q;
 *  - `qqssiz_ustamadan_keyin`: summa QQS SIZ, pudratchi ustamalaridan keyin (ИТОГО-4 ga) — faqat QQS oladi;
 *  - `togri_xarajat`: o'z manba smetasining TO'G'RI xarajatlari kategoriyalar bo'yicha (manba ustamalari olinmaydi) —
 *    oddiy ishlar kabi to'liq podval kaskadidan o'tadi.
 */
export type YaxlitKirish =
  | { bosqich?: 'qqsdan_keyin'; qqsBilan: number; qqssiz?: number | null }
  | { bosqich: 'qqssiz_ustamadan_keyin'; qqssiz: number }
  | { bosqich: 'togri_xarajat'; kategoriyalar: Partial<KatSummalar> };

export type KaskadOpsiya = {
  /** false — ko'p ustunli hujjatning 2-ustunidan boshlab (belgilangan summalar faqat asosiy ustunda). */
  asosiy?: boolean;
  /** Kategoriyasi ko'rsatilmagan summa: ИТОГО-4 ga USTAMASIZ, QQS undan keyin (server `_t2_summa_paket_hisob_v1`). */
  nomalumQism?: number | null;
  /** Yaxlit svod, `qqsdan_keyin` bosqichi qisqa yozuvi (egasi 2026-10-30): QQS bilan, НДС dan keyin, aynan. */
  yaxlit?: { qqsBilan: number; qqssiz?: number | null } | null;
  /** Yaxlit qatorlar har xil kirish bosqichi bilan (jadvalga asoslangan; `yaxlit` bilan birga qo'shiladi). */
  yaxlitlar?: readonly YaxlitKirish[] | null;
};

const raqam = (x: number | null | undefined): x is number => x != null && Number.isFinite(x);

/** Kategoriya summalari + podval → kaskad. Hech qachon tashlamaydi: noma'lum — null va `nomalumQatorlar`. */
export function kaskad(s0: Partial<KatSummalar>, podval: Podval, o: KaskadOpsiya = {}): KaskadNatija {
  // Bosqichlar bo'yicha yig'ish.
  const kirish: YaxlitKirish[] = [...(o.yaxlit && raqam(o.yaxlit.qqsBilan) ? [o.yaxlit] : []), ...(o.yaxlitlar ?? [])];
  const s: Partial<KatSummalar> = { ...s0 };
  let qqssizOldin = 0; let qqsBilanKeyin = 0; let qqssizKeyin: number | null = 0; let keyinBor = false; let togriNomalum = false;
  const qqsFoiz = podvalNdsFoizi(podval);
  for (const y of kirish) {
    if (y.bosqich === 'togri_xarajat') {
      // Noma'lum (null) kategoriya summasi — 0 emas: butun natija noma'lum bo'ladi (pastda).
      for (const [k, v] of Object.entries(y.kategoriyalar)) { if (v == null || !Number.isFinite(v)) togriNomalum = true; else s[k as Kat] = (s[k as Kat] ?? 0) + v; }
    }
    else if (y.bosqich === 'qqssiz_ustamadan_keyin') qqssizOldin += y.qqssiz;
    else {
      keyinBor = true; qqsBilanKeyin += y.qqsBilan;
      const siz = raqam(y.qqssiz) ? y.qqssiz : qqsFoiz == null ? null : yaxlit2(y.qqsBilan / (1 + qqsFoiz / 100));
      qqssizKeyin = qqssizKeyin == null || siz == null ? null : qqssizKeyin + siz;
    }
  }
  const n = podvalBahola(podval, s, { summaQosh: o.asosiy !== false });
  const q = n.qiymat;
  const kodlar = new Set(podval.qatorlar.map((x) => x.kod));
  const pryamye = q.pryamye ?? yaxlit2(katJami(s));
  const qadamlar = (qq: Record<string, number | null>): UstamaQadam[] => podval.qatorlar.map((x) => ({ kod: x.kod, nom: x.nom, tur: x.tur, foiz: x.tur === 'foiz' ? (x.foiz ?? null) : null, summa: qq[x.kod] ?? null }));
  const nomalumQatorlar = [...n.nomalum];
  const ndsBor = kodlar.has('nds');
  const kaskadItogo4 = kodlar.has('itogo4') ? q.itogo4 : n.vsego;
  const nom = raqam(o.nomalumQism) && o.nomalumQism !== 0 ? yaxlit2(o.nomalumQism) : null;
  const oldin = yaxlit2((nom ?? 0) + qqssizOldin);
  const yaxlitN = keyinBor ? { qqsBilan: yaxlit2(qqsBilanKeyin), qqssiz: qqssizKeyin == null ? null : yaxlit2(qqssizKeyin) } : null;
  const vk = n.vsegoKod;
  const vi = podval.qatorlar.findIndex((x) => x.kod === vk);
  if (togriNomalum) {
    return { pryamye, qiymat: q, qadamlar: qadamlar(q), itogo4: null, kaskadItogo4, qqs: null, qqsBilan: null, qqsFoiz, vsego: null, nomalumQism: nom, yaxlit: null, buyurtmachi: [], buyurtmachiJami: null, nomalumQatorlar: [...nomalumQatorlar, 'togri_xarajat'] };
  }
  if (!vk) {
    // Buyurtmachi qatorlari bor-u ВСЕГО (`vsego`) belgilanmagan — aniq xato, oxirgi qator ВСЕГО deb olinmaydi.
    return { pryamye, qiymat: q, qadamlar: qadamlar(q), itogo4: null, kaskadItogo4, qqs: null, qqsBilan: null, qqsFoiz, vsego: null, nomalumQism: nom, yaxlit: null, buyurtmachi: [], buyurtmachiJami: null, nomalumQatorlar, xato: 'VSEGO_KODI_YOQ' };
  }
  const buyurtmachi = (qq: Record<string, number | null>, vsego: number | null) => {
    const b = podval.qatorlar.slice(vi + 1).map((x) => ({ kod: x.kod, nom: x.nom, summa: qq[x.kod] ?? null, amal: x.amal ?? 'qoshiladi' as const }));
    const jami = !b.length || vsego == null ? null : b.some((x) => x.amal !== 'korsatish' && x.summa == null) ? null
      : yaxlit2(b.reduce((t, x) => t + (x.amal === 'qoshiladi' ? (x.summa as number) : x.amal === 'ayiriladi' ? -(x.summa as number) : 0), vsego));
    return { buyurtmachi: b, buyurtmachiJami: jami };
  };
  const bosh = { pryamye, kaskadItogo4, qqsFoiz, nomalumQism: nom, nomalumQatorlar };
  if (oldin === 0 && yaxlitN == null) {
    return { ...bosh, qiymat: q, qadamlar: qadamlar(q), itogo4: kaskadItogo4, qqs: ndsBor ? q.nds : null, qqsBilan: ndsBor ? n.vsego : null, vsego: n.vsego, yaxlit: null, ...buyurtmachi(q, n.vsego) };
  }
  const rad = (xato?: KaskadNatija['xato'], qosh: string[] = []) =>
    ({ ...bosh, qiymat: q, qadamlar: qadamlar(q), itogo4: null, qqs: null, qqsBilan: null, vsego: null, yaxlit: yaxlitN, buyurtmachi: [], buyurtmachiJami: null, nomalumQatorlar: [...nomalumQatorlar, ...qosh], ...(xato ? { xato } : {}) });
  // ИТОГО-4 qatori bo'lishi va u bilan ВСЕГО orasida faqat НДС bo'lishi shart — aks holda qo'shiladigan qism bilan
  // natija noaniq: aniq rad etiladi (jim tashlanmaydi). ВСЕГО dan keyingi buyurtmachi qatorlari ruxsat.
  if (!kodlar.has('itogo4')) return rad(undefined, ['itogo4']);
  const i4i = podval.qatorlar.findIndex((x) => x.kod === 'itogo4');
  const orada = podval.qatorlar.slice(i4i + 1, vi).filter((x) => x.kod !== 'nds');
  if (orada.length || vi < i4i) return rad('SVOD_YAXLIT_ITOGO4_DAN_KEYIN_QATOR', orada.map((x) => x.kod));
  // Ishlar + kat noma'lum + `qqssiz_ustamadan_keyin` (ustamasiz): ИТОГО-4 → НДС → ВСЕГО; so'ng `qqsdan_keyin` (aynan).
  const i4w = kaskadItogo4 == null ? null : yaxlit2(kaskadItogo4 + oldin);
  const ndsW = oldin === 0 ? (ndsBor ? q.nds : null) : ndsBor ? qqsSumma(i4w, qqsFoiz) : null;
  const vsegoW = oldin === 0 ? n.vsego : i4w == null ? null : ndsBor ? (ndsW == null ? null : yaxlit2(i4w + ndsW)) : i4w;
  const vsego = vsegoW == null ? null : yaxlitN ? yaxlit2(vsegoW + yaxlitN.qqsBilan) : vsegoW;
  // Ikkinchi o'tish: ВСЕГО dan keyingi (buyurtmachi) qatorlar yakuniy baza (yaxlit qo'shilgan ВСЕГО) dan hisoblanadi.
  const q2 = podvalBahola(podval, s, { summaQosh: o.asosiy !== false, almashtir: { itogo4: i4w, ...(ndsBor ? { nds: ndsW } : {}), [vk]: vsego } }).qiymat;
  const qiymat = { ...q2, kaskad_itogo4: kaskadItogo4, nomalum_qism: nom, yaxlit_oldin: qqssizOldin ? yaxlit2(qqssizOldin) : null, yaxlit: yaxlitN?.qqsBilan ?? null };
  // Sarlavha: QQS siz = ishlar + svod QQS siz; QQS = ishlar QQS + (svod − svod QQS siz) (ayirma — yig'indi aynan).
  const itogo4 = i4w == null ? null : yaxlitN ? (yaxlitN.qqssiz == null ? null : yaxlit2(i4w + yaxlitN.qqssiz)) : i4w;
  const qqs = !ndsBor || ndsW == null ? null : yaxlitN ? (yaxlitN.qqssiz == null ? null : yaxlit2(ndsW + yaxlitN.qqsBilan - yaxlitN.qqssiz)) : ndsW;
  return { ...bosh, qiymat, qadamlar: qadamlar(qiymat), itogo4, qqs, qqsBilan: ndsBor ? vsego : null, vsego, yaxlit: yaxlitN, ...buyurtmachi(qiymat, vsego) };
}
/** Kategoriya koeffitsientlari (к оплате = to'g'ri xarajat × Kf), yaxlitlashsiz. Noma'lum foiz — null. */
export function kategoriyaKf(podval: Podval): Record<Kat, number | null> {
  return podvalKf(podval);
}

/**
 * Kf JADVALI (ko'rsatish uchun) — 1 so'mlik kaskad ВСЕГО, `round(…, 2)`. SQL `t2_nakrutka_koef_jadval_v1`
 * (20261116000000 dan) yaxlitlanmagan Kf qaytaradi (= `kategoriyaKf`); bu jadval — uning 2 xonali ko'rinishi.
 * Pul hisobi (к оплате) yaxlitlashsiz Kf bilan — aks holda katta
 * summalarda 0,5 % gacha xato bo'lardi (1 mlrd → 5 mln so'm).
 */
export function kategoriyaKfJadval(podval: Podval): Record<Kat, number | null> {
  const kf = podvalKf(podval);
  return Object.fromEntries(Object.entries(kf).map(([k, v]) => [k, v == null ? null : yaxlit2(v)])) as Record<Kat, number | null>;
}

/**
 * Qatorning «к оплате» (QQS bilan) summasi. Oddiy qator: ROUND(summa × Kf[kat], 2). Yaxlit (svod) qatori va
 * kategoriyasi ko'rsatilmagan qator (server kabi — ИТОГО-4 ga ustamasiz): ustama yo'q, faqat QQS —
 * ROUND(summa × (1 + НДС/100), 2). Kf/QQS noma'lum — null.
 */
export function kOplate(summa: number | null | undefined, kat: Kat | null, kf: Record<Kat, number | null>, yaxlitmi = false, ndsFoiz: number | null = null): number | null {
  if (summa == null || !Number.isFinite(summa)) return null;
  if (yaxlitmi) return yaxlitKOplate(summa, ndsFoiz);
  if (kat == null) return yaxlitKOplate(summa, ndsFoiz);
  const k = kf[kat];
  return k == null ? null : yaxlit2(summa * k);
}

/** Natija (6-band): ko'rsatish tartibi — QQS bilan, keyin ustamali (QQS siz), keyin ustamasiz. */
export type HisobNatija = {
  qqsBilan: number | null;
  qqs: number | null;
  /** ИТОГО-4: ustamali, QQS siz. */
  ustamali: number | null;
  itogo4: number | null;
  /** To'g'ri xarajat jami: aniq kategoriyalar + kat noma'lum + yaxlit bo'limlar tarkibi. */
  ustamasiz: number;
  /** Ustama qadamlari (podval qatorlari). */
  ustama: UstamaQadam[];
  qqsFoiz: number | null;
  kategoriyalar: KatSummalar;
  /** Narxsiz (summasi noma'lum) qatorlar soni. */
  narxsizSoni: number;
  /** Kategoriyasi noma'lum qatorlar soni va summasi (ustamasiz qo'shilgan — natija taxminiy). */
  nomalumSoni: number;
  nomalumSumma: number;
  /** ИТОГО-4 ga ustamasiz qo'shilgan yaxlit (svod) qism, QQS siz. */
  yaxlit: number | null;
  /** Kat noma'lum qism bor — qiymatlar taxminiy («≈»). */
  taxminiy: boolean;
  kaskad: KaskadNatija | null;
  sabab: null | 'KOEF_YOQ' | 'PODVAL_TOLIQ_EMAS' | 'QQS_STAVKA_YOQ';
};

export type HisobKirish = { podval?: Podval | null; koef?: Partial<Record<KoefKod, number | null>> | null };

/** Kesim → to'liq natija. Podval bo'lmasa koeffitsientlardan standart podval (server tartibi). */
export function hisob(k: Kesim, kirish: HisobKirish): HisobNatija {
  const kategoriyalar = katSummalari(k);
  const yaxlit = (k.yaxlit || k.yaxlitQator != null) ? (k.yaxlit?.qqssiz ?? 0) + (k.yaxlitQator ?? 0) : null;
  const ustamasiz = yaxlit2(katJami(kategoriyalar) + k.nomalum + (k.yaxlit?.barglar ?? 0) + (k.yaxlitQator ?? 0));
  const taxminiy = k.nomalumSoni > 0 || k.nomalum !== 0;
  const bosh: HisobNatija = {
    qqsBilan: null, qqs: null, ustamali: null, itogo4: null, ustamasiz, ustama: [], qqsFoiz: null, kategoriyalar,
    narxsizSoni: k.summasizSoni, nomalumSoni: k.nomalumSoni, nomalumSumma: yaxlit2(k.nomalum), yaxlit: yaxlit == null ? null : yaxlit2(yaxlit), taxminiy, kaskad: null, sabab: null,
  };
  const podval = podvalAniqla(kirish.podval, kirish.koef);
  if (!podval) return { ...bosh, sabab: 'KOEF_YOQ' };
  // Yaxlit svod (egasi 2026-10-31, yagona model): svod summasi (QQS bilan) bor bo'limlar — `qqsdan_keyin`, НДС dan
  // keyin aynan; svod summasiz bo'limlar va qator darajasidagi yaxlit — xom tarkib, QQS SIZ: `qqssiz_ustamadan_keyin`
  // (ИТОГО-4 ga, QQS jamidan bir marta) — server `_t2_summa_paket_hisob_v1` / `t2_nakrutka_yaxlit_qosh_v2` bilan aynan.
  let yx: { qqsBilan: number; qqssiz: number } | null = null;
  let oldin: YaxlitKirish[] | null = null;
  if (yaxlit != null) {
    const svQ = k.yaxlit?.svodQqsBilan ?? 0, svS = k.yaxlit?.svodQqssiz ?? 0;
    const qolgan = yaxlit - svS;
    if (svQ !== 0 || svS !== 0) yx = { qqsBilan: yaxlit2(svQ), qqssiz: yaxlit2(svS) };
    if (Math.abs(qolgan) >= 0.005) oldin = [{ bosqich: 'qqssiz_ustamadan_keyin', qqssiz: qolgan }];
  }
  const r = kaskad(kategoriyalar, podval, { nomalumQism: k.nomalum, yaxlit: yx, yaxlitlar: oldin });
  const itogo4 = r.itogo4;
  const natija: HisobNatija = { ...bosh, kaskad: r, ustama: r.qadamlar, qqsFoiz: r.qqsFoiz, itogo4, ustamali: itogo4, qqs: r.qqs, qqsBilan: r.qqsBilan };
  if (r.itogo4 == null) return { ...natija, sabab: 'PODVAL_TOLIQ_EMAS' };
  if (r.qqsBilan == null) return { ...natija, sabab: 'QQS_STAVKA_YOQ' };
  return natija;
}
