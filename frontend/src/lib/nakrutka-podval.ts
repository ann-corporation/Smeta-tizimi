import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import { yaxlit2, type Qiymat, type RasmiyVaraq } from './hujjat-yozuvchi';
import {
  KATLAR, katAniqla, kaskad as yadroKaskad, type PodvalQator, kategoriyaKf as yadroKf, kOplate as yadroKOplate, podvalNdsFoizi,
  podvalVsegoKodi, standartPodval, type Kat, type KaskadNatija, type KatSummalar as YKatSummalar, type Podval,
} from './hisob-yadro';
import { YAXLIT_PODVAL_NOM } from './svod-yaxlit';

/**
 * NAKRUTKA PODVALI va IKKI NARX — egasi (2026-09-25): "hamma joyda ikki narx: прямые затраты va к оплате
 * (to'liq ustama bilan); hujjat oxirida nakrutka podvali".
 *
 * HISOB bu yerda EMAS — `lib/hisob-yadro` (yagona kaskad, podval baholovchisi). Bu fayl: Excel podvalini yozish
 * (tirik formulalar: foiz kataklari, SUMIF, Kf) va eski import yo'llari uchun moslik qatlami. Har podval qiymati
 * (keshlangan `v`) yadrodan; noma'lum (foiz kiritilmagan) — bo'sh katak, 0 emas.
 */

export const NAKRUTKA_KATLAR = KATLAR;
export type NakrutkaKat = Kat;
export type KatSummalar = YKatSummalar;

const KAT_NOMI: Record<NakrutkaKat, string> = {
  ЧЕЛ: 'Прямые затраты: заработная плата рабочих (ЧЕЛ)',
  МАШ: 'Прямые затраты: машины и механизмы (МАШ)',
  МАТ: 'Прямые затраты: материалы (МАТ)',
  ОБ: 'Прямые затраты: оборудование (ОБ)',
  КАБ: 'Прямые затраты: кабели и провода (КАБ)',
  'М/К': 'Прямые затраты: металлоконструкции (М/К)',
  'БЕЗ СКЛАД': 'Прямые затраты: материалы без складского хранения (БЕЗ СКЛАД)',
};

/** Qatorning kategoriyasi (noma'lum — null: к оплате hisoblanmaydi, diqqatga). */
export const nakrutkaKat = katAniqla;

const podvalOl = (nk: Partial<NakrutkaKoeffitsientlar> | null | undefined, podval?: Podval | null): Podval => podval ?? standartPodval(nk);

/** Kategoriya koeffitsientlari (yadrodan). Noma'lum foiz — null. */
export function kategoriyaKf(nk: Partial<NakrutkaKoeffitsientlar> | null | undefined, podval?: Podval | null): Record<NakrutkaKat, number | null> {
  return yadroKf(podvalOl(nk, podval));
}

/** Qatorning к оплате summasi (yadro `kOplate`). Yaxlit (svod) qatori: faqat QQS — `ndsFoiz` kerak. */
export function kOplate(summa: number | null, kat: NakrutkaKat | null, kf: Record<NakrutkaKat, number | null>, yaxlitmi = false, ndsFoiz: number | null = null): number | null {
  return yadroKOplate(summa, kat, kf, yaxlitmi, ndsFoiz);
}

export type NakrutkaHisobJS = Record<string, number> & { pryamye: number; vsego: number; itogo4: number; nds: number };

/** Yadro natijasi → eski shakl (to'liq bo'lsagina). */
function eskiShakl(r: KaskadNatija): NakrutkaHisobJS | null {
  if (r.nomalumQatorlar.length || r.itogo4 == null) return null;
  const vsego = r.vsego ?? r.itogo4;
  return { ...(r.qiymat as Record<string, number>), pryamye: r.pryamye, itogo4: r.itogo4, nds: r.qqs ?? 0, vsego } as NakrutkaHisobJS;
}

/** Kaskad (yadro). Noma'lum foiz/summa bo'lsa — XATO (к оплате taxmin qilinmaydi: NULL ≠ 0). */
export function podvalliKaskad(s: KatSummalar, nk: Partial<NakrutkaKoeffitsientlar> | null | undefined, podval?: Podval | null, asosiy = true): NakrutkaHisobJS {
  const p = podvalOl(nk, podval);
  const r = yadroKaskad(s, p, { asosiy });
  const e = eskiShakl(r);
  if (!e) throw new Error('PODVAL_TOLIQ_EMAS: nakrutka podvalida qiymat kiritilmagan — ' + r.nomalumQatorlar.map((k) => p.qatorlar.find((q) => q.kod === k)?.nom ?? k).join('; '));
  return e;
}

/** Standart kaskad (koeffitsientlardan) — yadro orqali. */
export function nakrutkaKaskadJS(s: KatSummalar, nk: Partial<NakrutkaKoeffitsientlar>): NakrutkaHisobJS {
  return podvalliKaskad(s, nk, null);
}

/** Standart podval qatorlari soni (Excel joylashuvi uchun). */
const STANDART_QATORLAR = standartPodval({}).qatorlar.length; // pryamye + 15 kaskad

/** Podval qatorlari soni (sarlavha + 7 kategoriya + podval + sarlavha + 7 Kf). */
export const PODVAL_QATORLAR = 1 + NAKRUTKA_KATLAR.length + STANDART_QATORLAR + 1 + NAKRUTKA_KATLAR.length;

/** Podval `bosh` qatoridan boshlansa — har kategoriya Kf katagi qaysi qatorda. */
export function podvalKfQatorlari(bosh: number, podval?: Podval | null, yaxlitBor = false, nomalumBor = false, oldinBor = false): Record<NakrutkaKat, number> {
  const n = podval ? podval.qatorlar.length : STANDART_QATORLAR;
  const kf0 = bosh + 1 + NAKRUTKA_KATLAR.length + n + 1 + (yaxlitBor ? 1 : 0) + (nomalumBor ? 1 : 0) + (oldinBor ? 1 : 0);
  return Object.fromEntries(NAKRUTKA_KATLAR.map((k, i) => [k, kf0 + i])) as Record<NakrutkaKat, number>;
}

/** Podval `bosh` dan boshlansa — `kod` qatori (masalan 'nds' foiz katagi) qaysi qatorda. Yo'q — null. */
export function podvalQatorRaqami(bosh: number, podval: Podval | null | undefined, kod: string, yaxlitBor = false, nomalumBor = false): number | null {
  const qs = (podval ?? standartPodval({})).qatorlar;
  const i = qs.findIndex((q) => q.kod === kod);
  if (i < 0) return null;
  const i4 = qs.findIndex((q) => q.kod === 'itogo4');
  // Kat noma'lum qatori ИТОГО-4 dan oldin, yaxlit (QQS bilan) qatori ВСЕГО qatoridan oldin turadi.
  const vk = podvalVsegoKodi(podval ?? standartPodval({}));
  const vi = vk == null ? qs.length : qs.findIndex((q) => q.kod === vk);
  return bosh + 1 + NAKRUTKA_KATLAR.length + i + (nomalumBor && i4 >= 0 && i >= i4 ? 1 : 0) + (yaxlitBor && i >= vi ? 1 : 0);
}

export type PodvalOpsiya = {
  /** Yashirin kategoriya ustuni harfi (barg qatorlarida ЧЕЛ/МАШ/…). */
  katUstun: string;
  /** Ma'lumot oralig'i (SUMIF diapazoni) — birinchi va oxirgi qator. */
  oraliq: readonly [number, number];
  /** Pul ustunlari (to'g'ri xarajat) — har biriga alohida kaskad. */
  pulUstunlar: readonly string[];
  /** Foiz va koeffitsient yoziladigan ustun harfi. */
  foizUstun: string;
  nk: Partial<NakrutkaKoeffitsientlar>;
  /** Har pul ustunining kategoriya jamilari. */
  katSummalar: Record<string, KatSummalar>;
  /** Kategoriya qatorlarida fizik ko'rsatkich (Форма № 3): ustun → kategoriya → soat. */
  katHajm?: { qiymat: Record<string, Partial<Record<NakrutkaKat, number>>>; birlikUstun?: string };
  sarlavha?: string;
  vsegoNom?: string;
  /** Koeffitsientlar jadvali (sukut true). */
  kfJadval?: boolean;
  /** Kategoriya summalari SUMIF emas, qiymat sifatida. */
  katFormulasiz?: boolean;
  /** Maxsus podval (konstruktor) — berilsa standart o'rniga shu yoziladi. */
  podval?: Podval | null;
  /**
   * Svod yaxlit (egasi 2026-10-30): pul ustuni → yaxlit summa QQS BILAN (yakuniy). НДС qatoridan KEYIN alohida qator,
   * ВСЕГО = ishlar ВСЕГО + shu katak (aynan; ustama ham QQS ham qo'shilmaydi).
   */
  yaxlit?: Record<string, number> | null;
  /** Yaxlit qatori formulalari (ustun → formula), keshi `yaxlit` dan. */
  yaxlitF?: Record<string, string> | null;
  /**
   * Kategoriyasi ko'rsatilmagan summa (ustun → summa): server kabi ИТОГО-4 ga USTAMASIZ qo'shiladi, QQS bir marta;
   * alohida «ВИД ЗАТРАТ НЕ УКАЗАН — без накрутки» qatori (summa doim ko'rinadi, 0 ga tushirilmaydi).
   */
  nomalum?: Record<string, number> | null;
  /** Kat noma'lum qatori formulalari (ustun → formula), keshi `nomalum` dan. */
  nomalumF?: Record<string, string> | null;
  /** Yaxlit `qqssiz_ustamadan_keyin` bosqichi: QQS siz summa, ustamalardan keyin ИТОГО-4 ga (faqat QQS oladi). */
  yaxlitOldin?: Record<string, number> | null;
};

/** QQS foizi: podvalning `nds` foiz qatori (standart podvalda — koeffitsientlardagi НДС). Noma'lum — null. */
export const podvalNdsFoiz = (podval: Podval | null | undefined, nk: Partial<NakrutkaKoeffitsientlar> | null | undefined): number | null =>
  podvalNdsFoizi(podvalOl(nk, podval));

/**
 * Podval qiymatlari + svod yaxlit → ИТОГО-4/НДС/ВСЕГО yaxlit bilan (yadro `yaxlitBilanYakun`). itogo4 yo'q — o'zgarishsiz.
 */
export function podvalQiymatYaxlit(qiymat: Record<string, number | null>, podval: Podval, yaxlit: { qqsBilan: number; qqssiz: number } | null | undefined): Record<string, number | null> {
  // Podval QATORLARI: ИТОГО-4/НДС — ishlar; ВСЕГО = ishlar ВСЕГО + yaxlit (QQS bilan, aynan). QQS siz — alohida kalit.
  const vk = podvalVsegoKodi(podval);
  if (!yaxlit || !vk || qiymat[vk] == null) return qiymat;
  return { ...qiymat, [vk]: yaxlit2((qiymat[vk] as number) + yaxlit.qqsBilan), yaxlit: yaxlit2(yaxlit.qqsBilan), yaxlit_qqssiz: yaxlit2(yaxlit.qqssiz) };
}

/** Podvalda yaxlit qatori bormi. */
export const podvalYaxlitBor = (y: Record<string, number> | null | undefined): boolean => !!y && Object.keys(y).length > 0;
/** Podvalda kat noma'lum qatori bormi (biror ustunda 0 dan farqli summa). */
export const podvalNomalumBor = (y: Record<string, number> | null | undefined): boolean => !!y && Object.values(y).some((x) => Math.abs(x) >= 0.005);
/** Kat noma'lum podval qatori nomi va qator yashirin kategoriya belgisi. */
export const NOMALUM_PODVAL_NOM = 'ВИД ЗАТРАТ НЕ УКАЗАН — без накрутки (только НДС)';
export const NOMALUM_KAT = 'НЕ УКАЗАН';
export const YAXLIT_OLDIN_PODVAL_NOM = 'Разделы по своду целой суммой (без НДС, после накладных расходов; облагаются НДС)';

export type PodvalRef = { kat: (k: Kat) => string; qator: (kod: string) => string; foiz: string; qosh?: readonly string[] };

/**
 * YAGONA Excel formula quruvchisi (podval qatori → formula). Yadro baholovchisi bilan bir xil tuzilma — formula = kesh.
 * `summa` qatori — null (qiymat yoziladi). `qosh` — ИТОГО-4 ga ustamasiz qo'shiladigan kataklar (yaxlit, kat noma'lum).
 */
export function podvalQatorFormulasi(q: PodvalQator, r: PodvalRef): string | null {
  if (q.tur === 'summa') return null;
  const hadlar = (q.baza ?? []).map((h, i) => {
    const ref = 'kat' in h ? r.kat(h.kat) : r.qator(h.qator);
    const k = h.k ?? 1;
    const ifoda = Math.abs(k) === 1 ? ref : `${ref}*${Math.abs(k)}`;
    return (k < 0 ? '-' : i === 0 ? '' : '+') + ifoda;
  }).join('') || '0';
  if (q.tur === 'jami') return `ROUND(${hadlar}${(r.qosh ?? []).map((x) => `+${x}`).join('')},2)`;
  return `ROUND((${hadlar})*${r.foiz}/100,2)`;
}

/** Podval qatori nomi: izoh va meros manbasi (foiz smetadan emas — `из договора / по умолчанию`) ko'rinadi. */
export function podvalQatorNomi(q: PodvalQator): string {
  const amal = q.amal === 'korsatish' ? 'справочно' : q.amal === 'ayiriladi' ? 'вычитается' : '';
  const iz = [q.izoh?.trim(), q.merosIzoh?.trim(), amal].filter(Boolean);
  return iz.length ? `${q.nom} (${iz.join('; ')})` : q.nom;
}

const colIdx = (h: string) => h.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const vq = (x: number | null | undefined): number | string => (x == null ? '' : x);

/**
 * Podvalni yozadi (joriy qatordan). Formulalar tirik; har katak keshi (`v`) — yadro natijasi.
 * Qaytaradi: ВСЕГО qatori, Kf qatorlari, har pul ustunining yadro natijasi va eski shakli (to'liq bo'lsa).
 */
export function nakrutkaPodvaliYoz(v: RasmiyVaraq, o: PodvalOpsiya): { bosh: number; vsegoQator: number; kfQator: Record<NakrutkaKat, number>; kaskad: Record<string, NakrutkaHisobJS | null>; natija: Record<string, KaskadNatija> } {
  const n = v.ustunlar.length;
  const mc = v.matnUstuni;
  const fi = colIdx(o.foizUstun);
  const bosh = v.r;
  const yaxlitBor = podvalYaxlitBor(o.yaxlit);
  const nomalumBor = podvalNomalumBor(o.nomalum);
  const oldinBor = podvalNomalumBor(o.yaxlitOldin);
  const podval = podvalOl(o.nk, o.podval);
  if ((yaxlitBor || nomalumBor || oldinBor) && !podval.qatorlar.some((x) => x.kod === 'itogo4')) throw new Error('SVOD_YAXLIT_PODVAL_ITOGO4_YOQ: maxsus podvalda ИТОГО-4 (itogo4) qatori yo‘q — ustamasiz qism (svod yaxlit / vid zatrat ko‘rsatilmagan) qo‘shib bo‘lmaydi');
  const natija: Record<string, KaskadNatija> = {};
  const kaskad: Record<string, NakrutkaHisobJS | null> = {};
  o.pulUstunlar.forEach((c, i) => {
    natija[c] = yadroKaskad(o.katSummalar[c], podval, { asosiy: i === 0, nomalumQism: nomalumBor ? yaxlit2(o.nomalum![c] ?? 0) : null, yaxlit: yaxlitBor ? { qqsBilan: yaxlit2(o.yaxlit![c] ?? 0) } : null,
      yaxlitlar: oldinBor ? [{ bosqich: 'qqssiz_ustamadan_keyin', qqssiz: yaxlit2(o.yaxlitOldin![c] ?? 0) }] : null });
    if (natija[c].xato) throw new Error(`${natija[c].xato}: ИТОГО-4 dan keyin maxsus qator bor — ustamasiz qismni qayerga qo‘shish noaniq`);
    kaskad[c] = eskiShakl(natija[c]);
  });
  const kfJS = yadroKf(podval);
  const kfQator = podvalKfQatorlari(bosh, o.podval, yaxlitBor, nomalumBor, oldinBor);
  const row = (fill: (cells: Qiymat[], r: number) => void) => (r: number) => { const c: Qiymat[] = Array(n).fill(null); fill(c, r); return c; };
  const qismQatori = (nom: string, q: Record<string, number>, qf: Record<string, string> | null | undefined) => v.qator('oddiy', row((c) => {
    c[mc] = nom;
    for (const col of o.pulUstunlar) c[colIdx(col)] = qf?.[col] ? { f: qf[col], v: yaxlit2(q[col] ?? 0) } : yaxlit2(q[col] ?? 0);
  }));
  const [a, b] = o.oraliq;

  v.bolim(o.sarlavha ?? 'РАСЧЕТ СТОИМОСТИ К ОПЛАТЕ (прямые затраты → накладные и прочие расходы → НДС)', { daraja: 0 });
  const katQ = {} as Record<NakrutkaKat, number>;
  for (const k of NAKRUTKA_KATLAR) {
    katQ[k] = v.qator('oddiy', row((c) => {
      c[mc] = KAT_NOMI[k];
      if (o.katHajm) {
        const bor = Object.values(o.katHajm.qiymat).some((x) => x[k] != null);
        if (bor && o.katHajm.birlikUstun) c[colIdx(o.katHajm.birlikUstun)] = k === 'ЧЕЛ' ? 'чел.-ч' : k === 'МАШ' ? 'маш.-ч' : '';
        for (const [hc, x] of Object.entries(o.katHajm.qiymat)) if (x[k] != null) c[colIdx(hc)] = x[k]!;
      }
      for (const col of o.pulUstunlar) c[colIdx(col)] = o.katFormulasiz ? yaxlit2(o.katSummalar[col][k]) : { f: `SUMIF(${o.katUstun}${a}:${o.katUstun}${b},"${k}",${col}${a}:${col}${b})`, v: yaxlit2(o.katSummalar[col][k]) };
    }));
  }
  // Podval qatorlari (standart ham maxsus ham — yagona formula quruvchisi). Formulalar tirik (`$` siz).
  const qr: Record<string, number> = {};
  // ВСЕГО (pudratchi yakuni) qatori; undan keyingilar — buyurtmachi xarajatlari (bazasi yaxlit qo'shilgan ВСЕГО).
  const oxirgi = podvalVsegoKodi(podval);
  if (!oxirgi) throw new Error('VSEGO_KODI_YOQ: podvalda ВСЕГО dan keyin buyurtmachi qatorlari bor — ВСЕГО qatori `vsego` kodi bilan bo‘lishi shart');
  const asosiyUstun = o.pulUstunlar[0];
  const qoshR: number[] = [];
  let yaxR: number | null = null;
  for (const q of podval.qatorlar) {
    if (q.kod === 'itogo4' && oldinBor) qoshR.push(qismQatori(YAXLIT_OLDIN_PODVAL_NOM, o.yaxlitOldin!, null));
    if (q.kod === 'itogo4' && nomalumBor) qoshR.push(qismQatori(NOMALUM_PODVAL_NOM, o.nomalum!, o.nomalumF));
    // Yaxlit svod (QQS bilan) — НДС dan keyin, ВСЕГО dan oldin.
    if (q.kod === oxirgi && yaxlitBor) yaxR = qismQatori(YAXLIT_PODVAL_NOM, o.yaxlit!, o.yaxlitF);
    const r = v.r;
    qr[q.kod] = r;
    v.qator(q.kod === oxirgi ? 'vsego' : q.tur === 'jami' ? 'jami' : 'oddiy', row((c) => {
      c[mc] = q.kod === oxirgi && o.vsegoNom ? o.vsegoNom : podvalQatorNomi(q);
      if (q.tur === 'foiz') c[fi] = { n: q.foiz ?? null, uslub: 'foiz' };
      for (const col of o.pulUstunlar) {
        const xom = natija[col].qiymat[q.kod];
        const val = vq(xom);
        if (q.tur === 'summa') { c[colIdx(col)] = col === asosiyUstun ? (q.summa ?? null) : null; continue; }
        // Noma'lum (foiz kiritilmagan yoki noma'lumga tayangan) — bo'sh katak, formula YO'Q: Excel bo'sh foizni 0 deb
        // hisoblab yubormasin. Foiz noma'lum-u baza 0 — aniq 0 (formula emas).
        if (xom == null) { c[colIdx(col)] = null; continue; }
        if (q.tur === 'foiz' && q.foiz == null) { c[colIdx(col)] = xom; continue; }
        const f = podvalQatorFormulasi(q, { kat: (k) => `${col}${katQ[k]}`, qator: (kod) => `${col}${qr[kod]}`, foiz: `${o.foizUstun}${r}`, qosh: q.kod === 'itogo4' ? qoshR.map((x) => `${col}${x}`) : q.kod === oxirgi && yaxR != null ? [`${col}${yaxR}`] : [] });
        c[colIdx(col)] = { f: f as string, v: val };
      }
    }));
  }  const vsegoQator = qr[oxirgi];
  if (o.kfJadval === false) return { bosh, vsegoQator, kfQator, kaskad, natija };
  // Koeffitsientlar: standart podvalda foiz kataklaridan tirik formula; maxsus podvalda — yadro qiymati.
  const P = (kod: string) => `${o.foizUstun}${qr[kod]}/100`;
  const standart = !o.podval;
  const umumiy = `(1+${P('prochie')})*(1+${P('strax')}+${P('risk')})*(1+${P('nds')})`;
  const kfF: Record<NakrutkaKat, string> = {
    ЧЕЛ: umumiy,
    МАШ: umumiy,
    МАТ: `(1+${P('tr_mat')}+${P('skl_mat')})*${umumiy}`,
    ОБ: `(1+${P('tr_ob')}+${P('zag_ob')})*(1+${P('strax')}+${P('risk')})*(1+${P('nds')})`,
    КАБ: `(1+${P('skl_mat')}+${P('tr_kab')})*${umumiy}`,
    'М/К': `(1+${P('tr_mat')}+${P('skl_mk')})*${umumiy}`,
    'БЕЗ СКЛАД': `(1+${P('tr_mat')})*${umumiy}`,
  };
  v.qator('jami', row((c) => { c[mc] = standart ? 'Коэффициенты пересчета прямых затрат в стоимость к оплате (по видам затрат)' : 'Коэффициенты пересчета прямых затрат в стоимость к оплате (индивидуальный подвал, без фиксированных сумм)'; }));
  for (const k of NAKRUTKA_KATLAR) {
    const r = v.qator('oddiy', row((c) => {
      c[mc] = `Коэффициент к оплате: ${KAT_NOMI[k].replace('Прямые затраты: ', '')}`;
      // Kf noma'lum — bo'sh (formula yo'q: bo'sh foiz kataklari 0 deb olinmasin).
      c[fi] = kfJS[k] == null ? null : standart ? { f: kfF[k], v: kfJS[k] as number, uslub: 'norma' } : { n: kfJS[k], uslub: 'norma' };
    }));
    if (r !== kfQator[k]) throw new Error('NAKRUTKA_PODVAL_SILJIDI');
  }
  return { bosh, vsegoQator, kfQator, kaskad, natija };
}
