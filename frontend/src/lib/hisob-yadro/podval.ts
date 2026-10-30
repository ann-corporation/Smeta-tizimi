/**
 * PODVAL — ustama kaskadining YAGONA ta'rifi (egasi Q6 konstruktori + server `t2_nakrutka_hisobla_v1`).
 *
 * Podval — qatorlar ro'yxati (har qator faqat OLDINGI qatorlarga tayanadi):
 *   - `foiz`  — baza × foiz/100 (baza: kategoriya jamilari va/yoki oldingi qatorlar);
 *   - `summa` — belgilangan summa (shartnoma bo'yicha); null — noma'lum;
 *   - `jami`  — oraliq jami. Oxirgi qator — ВСЕГО (jami).
 * Har qadam ROUND 2 (Excel bilan aynan). Foiz FAQAT podvaldan: kiritilmagan foiz — null («noma'lum»),
 * hech qachon jim 0 yoki shartnoma qiymati bilan almashtirilmaydi.
 */
import { KATLAR, type Kat } from './kategoriya';
import { yaxlit2 } from './yaxlit';

export const KOEF_KODLAR = [
  'ЗТР_СОЦСТРАХ', 'ТРАНСПОРТ_МАТЕРИАЛ', 'СКЛАДСКИЕ_МАТЕРИАЛ', 'СКЛАДСКИЕ_МК',
  'ТРАНСПОРТ_КАБЕЛЬ', 'ПРОЧИЕ_ПОДРЯДЧИК', 'ТРАНСПОРТ_ОБОРУД', 'ЗАГОТ_СКЛАД_ОБОРУД',
  'СТРАХОВАНИЕ', 'РИСК', 'НДС',
] as const;
export type KoefKod = typeof KOEF_KODLAR[number];
export type Koeffitsientlar = Record<KoefKod, number>;

export type PodvalHad = { kat: Kat; k?: number } | { qator: string; k?: number };

export type PodvalQator = {
  kod: string;
  nom: string;
  tur: 'foiz' | 'summa' | 'jami';
  /** `foiz` uchun — foiz qiymati (masalan 2.5). null — noma'lum. */
  foiz?: number | null;
  /** `foiz` va `jami` uchun — baza hadlari (k — ishora/ko'paytiruvchi, sukut 1). */
  baza?: PodvalHad[];
  /** `summa` uchun — belgilangan summa. null — noma'lum. */
  summa?: number | null;
  izoh?: string;
  /** Standart koeffitsient kodi (server bilan bog'lash uchun). */
  koefKod?: KoefKod;
  /** `smeta` — foiz smeta hujjatidan isbotli; `meros` — hujjatda topilmadi (shartnoma/sukut). */
  manba?: 'smeta' | 'meros';
  dalil?: string;
  katak?: string;
};

export type Podval = { versiya: 1; nom?: string; qatorlar: PodvalQator[] };

const K = (kat: Kat, k = 1): PodvalHad => ({ kat, k });
const Q = (qator: string, k = 1): PodvalHad => ({ qator, k });

const foizOl = (nk: Partial<Record<string, unknown>> | null | undefined, kod: KoefKod): number | null => {
  const v = nk?.[kod];
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Standart kaskad (server `t2_nakrutka_hisobla_v1` tartibi) podval ko'rinishida. Yo'q foiz — null (noma'lum). */
export function standartPodval(nk: Partial<Record<KoefKod, number | null>> | null | undefined): Podval {
  const q = (kod: string, nom: string, koefKod: KoefKod, baza: PodvalHad[]): PodvalQator => ({ kod, nom, tur: 'foiz', foiz: foizOl(nk, koefKod), baza, koefKod });
  const j = (kod: string, nom: string, baza: PodvalHad[]): PodvalQator => ({ kod, nom, tur: 'jami', baza });
  return {
    versiya: 1,
    nom: 'Стандартный расчет',
    qatorlar: [
      j('pryamye', 'ПРЯМЫЕ ЗАТРАТЫ — ВСЕГО', KATLAR.map((k) => K(k))),
      q('tr_mat', 'Транспортные расходы — материалы, %', 'ТРАНСПОРТ_МАТЕРИАЛ', [K('МАТ'), K('М/К'), K('БЕЗ СКЛАД')]),
      q('skl_mat', 'Складские расходы — материалы, %', 'СКЛАДСКИЕ_МАТЕРИАЛ', [K('МАТ'), K('КАБ')]),
      q('skl_mk', 'Складские расходы — металлоконструкции, %', 'СКЛАДСКИЕ_МК', [K('М/К')]),
      q('tr_kab', 'Транспортные расходы — кабели и провода, %', 'ТРАНСПОРТ_КАБЕЛЬ', [K('КАБ')]),
      j('itogo1', 'ИТОГО-1 (прямые затраты без оборудования с транспортными и складскими)', [Q('pryamye'), K('ОБ', -1), Q('tr_mat'), Q('skl_mat'), Q('skl_mk'), Q('tr_kab')]),
      q('prochie', 'Прочие расходы подрядчика, %', 'ПРОЧИЕ_ПОДРЯДЧИК', [Q('itogo1')]),
      j('itogo2', 'ИТОГО-2', [Q('itogo1'), Q('prochie')]),
      q('tr_ob', 'Транспортные расходы — оборудование, %', 'ТРАНСПОРТ_ОБОРУД', [K('ОБ')]),
      q('zag_ob', 'Заготовительно-складские расходы — оборудование, %', 'ЗАГОТ_СКЛАД_ОБОРУД', [K('ОБ')]),
      j('itogo3', 'ИТОГО-3 (с оборудованием)', [Q('itogo2'), K('ОБ'), Q('tr_ob'), Q('zag_ob')]),
      q('strax', 'Страхование объекта, %', 'СТРАХОВАНИЕ', [Q('itogo3')]),
      q('risk', 'Риск, %', 'РИСК', [Q('itogo3')]),
      j('itogo4', 'ИТОГО-4 (без НДС)', [Q('itogo3'), Q('strax'), Q('risk')]),
      q('nds', 'НДС, %', 'НДС', [Q('itogo4')]),
      j('vsego', 'ВСЕГО К ОПЛАТЕ (с накладными расходами и НДС)', [Q('itogo4'), Q('nds')]),
    ],
  };
}

/**
 * SERVER MEROS rejimi (aniq nomlangan, test bilan qotirilgan): server `t2_obyekt_nakrutka` koeffitsientlari
 * = sukut ← kompaniya ← shartnoma ← smeta podvali (faqat `manba = 'smeta'` foiz qatorlari). Shu bilan bir xil:
 * `manba = 'smeta'` qatorlar o'zgarmaydi; qolgan `koefKod` li foiz qatorlari — `nk` dagi qiymat (yo'q — null).
 * Boshqa hech qanday holatda chaqiruvchi podval foizini almashtira olmaydi.
 */
export function serverMerosKoefQoy(p: Podval, nk: Partial<Record<KoefKod, number | null>> | null | undefined): Podval {
  return { ...p, qatorlar: p.qatorlar.map((q) => (q.koefKod && q.tur === 'foiz' && q.manba !== 'smeta' ? { ...q, foiz: foizOl(nk, q.koefKod) } : q)) };
}

export type PodvalXato = { kod: string | null; xabar: string };

/** Tuzilma tekshiruvi: kod takrori, oldinga havola, bo'sh baza, oxirgi qator jami. */
export function podvalTekshir(p: Podval): PodvalXato[] {
  const x: PodvalXato[] = [];
  const kodlar = new Set<string>();
  if (!p.qatorlar.length) return [{ kod: null, xabar: 'Podval bo‘sh' }];
  for (const q of p.qatorlar) {
    if (!q.kod || !/^[a-z0-9_]{1,40}$/i.test(q.kod)) x.push({ kod: q.kod, xabar: 'Qator kodi noto‘g‘ri (lotin harf/raqam/_)' });
    if (kodlar.has(q.kod)) x.push({ kod: q.kod, xabar: 'Qator kodi takrorlangan' });
    if (!q.nom?.trim()) x.push({ kod: q.kod, xabar: 'Qator nomi bo‘sh' });
    if (q.tur !== 'summa') {
      if (!q.baza?.length) x.push({ kod: q.kod, xabar: 'Baza tanlanmagan' });
      for (const h of q.baza ?? []) {
        if ('qator' in h && !kodlar.has(h.qator)) x.push({ kod: q.kod, xabar: `«${h.qator}» — faqat YUQORIDAGI qatorga tayanish mumkin` });
        if ('kat' in h && !(KATLAR as readonly string[]).includes(h.kat)) x.push({ kod: q.kod, xabar: `Noma’lum kategoriya: ${h.kat}` });
      }
    }
    kodlar.add(q.kod);
  }
  if (p.qatorlar[p.qatorlar.length - 1].tur !== 'jami') x.push({ kod: p.qatorlar[p.qatorlar.length - 1].kod, xabar: 'Oxirgi qator — ВСЕГО (jami) bo‘lishi shart' });
  return x;
}

export type PodvalNatija = {
  /** Har qator qiymati (null — noma'lum: foiz/summa kiritilmagan yoki noma'lumga tayangan). */
  qiymat: Record<string, number | null>;
  vsego: number | null;
  vsegoKod: string;
  /** Qiymati noma'lum qatorlar kodlari (tartibda). */
  nomalum: string[];
};

export type PodvalRejim = {
  /** Har qadam ROUND 2 (sukut true). false — faqat chiziqli koeffitsient uchun. */
  yaxlit?: boolean;
  /** Belgilangan summalar qo'shilsinmi (sukut true; ko'p ustunli hujjatning 2-ustunidan boshlab false). */
  summaQosh?: boolean;
};

/** Podval baholovchisi — YAGONA kaskad hisobi. Kategoriya summasi yo'q — 0 so'm (foiz emas). */
export function podvalBahola(p: Podval, s: Partial<Record<Kat, number>>, r: PodvalRejim = {}): PodvalNatija {
  const yax = r.yaxlit !== false ? yaxlit2 : (v: number) => v;
  const summaQosh = r.summaQosh !== false;
  const qiymat: Record<string, number | null> = {};
  const nomalum: string[] = [];
  const had = (h: PodvalHad): number | null => {
    const v = 'kat' in h ? Number(s[h.kat] ?? 0) : qiymat[h.qator] ?? null;
    return v == null ? null : v * (h.k ?? 1);
  };
  const yig = (b: readonly PodvalHad[] | undefined): number | null => {
    let t = 0;
    for (const h of b ?? []) { const v = had(h); if (v == null) return null; t += v; }
    return t;
  };
  for (const q of p.qatorlar) {
    let v: number | null;
    if (q.tur === 'summa') v = summaQosh ? (q.summa == null ? null : yax(Number(q.summa))) : 0;
    else if (q.tur === 'jami') { const b = yig(q.baza); v = b == null ? null : yax(b); }
    else {
      // Baza aynan 0 bo'lsa natija 0 — foiz noma'lum bo'lsa ham (matematik aniq, taxmin emas).
      const b = yig(q.baza);
      const f = q.foiz == null || !Number.isFinite(Number(q.foiz)) ? null : Number(q.foiz);
      v = b == null ? null : b === 0 ? 0 : f == null ? null : yax((b * f) / 100);
    }
    qiymat[q.kod] = v;
    if (v == null) nomalum.push(q.kod);
  }
  const vsegoKod = p.qatorlar[p.qatorlar.length - 1]?.kod ?? '';
  return { qiymat, vsego: qiymat[vsegoKod] ?? null, vsegoKod, nomalum };
}

/** Kategoriya koeffitsientlari (chiziqli qism, yaxlitlashsiz, summa qatorlarisiz). Noma'lum foiz — null. */
export function podvalKf(p: Podval): Record<Kat, number | null> {
  const kf = {} as Record<Kat, number | null>;
  for (const kat of KATLAR) kf[kat] = podvalBahola(p, { [kat]: 1 }, { yaxlit: false, summaQosh: false }).vsego;
  return kf;
}

/** Belgilangan (chiziqli bo'lmagan) summalar jami. Birortasi noma'lum — null. */
export function podvalBelgilanganSumma(p: Podval): number | null {
  let t = 0;
  for (const q of p.qatorlar) if (q.tur === 'summa') { if (q.summa == null) return null; t += Number(q.summa); }
  return t;
}

/** QQS foizi podvalning `nds` foiz qatoridan; qator yo'q yoki foiz kiritilmagan — null. */
export function podvalNdsFoizi(p: Podval | null | undefined): number | null {
  const f = p?.qatorlar.find((x) => x.kod === 'nds' && x.tur === 'foiz')?.foiz;
  return f == null || !Number.isFinite(Number(f)) ? null : Number(f);
}

/** Podval: berilgan bo'lsa o'zi, aks holda koeffitsientlardan standart. Ikkalasi ham yo'q — null. */
export function podvalAniqla(podval: Podval | null | undefined, koef: Partial<Record<KoefKod, number | null>> | null | undefined): Podval | null {
  if (podval) return podval;
  if (koef && Object.keys(koef).length) return standartPodval(koef);
  return null;
}

/** Standart shablondan farq qiladimi (server meros rejimidan keyin solishtiriladi). */
export function standartmi(p: Podval, nk: Partial<Record<KoefKod, number | null>>): boolean {
  return JSON.stringify(standartPodval(nk).qatorlar) === JSON.stringify(serverMerosKoefQoy(p, nk).qatorlar);
}

export function yangiKod(p: Podval, asos = 'qator'): string {
  const bor = new Set(p.qatorlar.map((q) => q.kod));
  for (let i = 1; ; i++) if (!bor.has(`${asos}_${i}`)) return `${asos}_${i}`;
}

export function hadNomi(h: PodvalHad, p: Podval): string {
  const ish = (h.k ?? 1) < 0 ? '− ' : '';
  if ('kat' in h) return ish + h.kat;
  return ish + (p.qatorlar.find((q) => q.kod === h.qator)?.nom ?? h.qator);
}
