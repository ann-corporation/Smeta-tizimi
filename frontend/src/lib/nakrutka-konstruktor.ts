/**
 * nakrutka-konstruktor.ts — NAKRUTKA PODVALI KONSTRUKTORI (egasi Q6, 2026-10-01).
 *
 * Egasi: "har bir kompaniya har bir smeta uchun individual qatorma-qator tuzish,
 * qo'shish, olib tashlash — qo'lda podval yasash moduli. Asosiy foizlar 1-kompaniyadagidek,
 * lekin kimdir vremenniy zdaniyalar uchun foizda shartnoma qilsa, qaysidir summalarga
 * asosan foiz olsa — shularni qo'shish mumkin bo'lsin".
 *
 * Podval — qatorlar ro'yxati (tartib muhim, har qator faqat OLDINGI qatorlarga tayanadi):
 *   - `foiz`  — baza × foiz/100 (baza: kategoriya jamilari va/yoki oldingi qatorlar yig'indisi);
 *   - `summa` — belgilangan summa (masalan shartnoma bo'yicha); NULL ≠ 0 — bo'sh bo'lsa
 *               hisob TO'XTAMAYDI, lekin "noma'lum" deb belgilanadi va ВСЕГО ham noma'lum;
 *   - `jami`  — oraliq jami (baza hadlari yig'indisi). Oxirgi qator — ВСЕГО (jami).
 * Har qadam ROUND 2 — Excel formulalari bilan aynan (hujjat == sayt).
 *
 * Standart podval (`standartPodval(nk)`) — hozirgi kaskad (`nakrutka-podval.ts`) bilan
 * AYNAN bir xil natija beradi (test bilan qotirilgan); maxsus podval shundan boshlanadi.
 * Koeffitsientlar (qator "к оплате" = to'g'ri xarajat × Kf[kat]) — chiziqli qism:
 * har kategoriya uchun birlik vektor bilan yaxlitlashsiz hisob; `summa` qatorlari
 * chiziqli emas — ular Kf ga kirmaydi (podvalda alohida ko'rinadi).
 */
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import { NAKRUTKA_KATLAR, type KatSummalar, type NakrutkaKat } from './nakrutka-podval';

export type PodvalHad = { kat: NakrutkaKat; k?: number } | { qator: string; k?: number };

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
  /** Asos (masalan "по договору № 12 от 01.02.2026, п. 4.3"). */
  izoh?: string;
  /** Standart koeffitsient kodi (standart qatorlar uchun — foiz sozlamadan keladi). */
  koefKod?: keyof NakrutkaKoeffitsientlar;
};

export type Podval = { versiya: 1; nom?: string; qatorlar: PodvalQator[] };

const y2 = (x: number) => Math.round((x + Number.EPSILON * Math.sign(x)) * 100) / 100;

const K = (kat: NakrutkaKat, k = 1): PodvalHad => ({ kat, k });
const Q = (qator: string, k = 1): PodvalHad => ({ qator, k });
const barchaKat = () => NAKRUTKA_KATLAR.map((k) => K(k));

/** Hozirgi standart kaskad (server `t2_nakrutka_hisob` bilan bir xil) — podval ko'rinishida. */
export function standartPodval(nk: Partial<NakrutkaKoeffitsientlar>): Podval {
  const f = (kod: keyof NakrutkaKoeffitsientlar) => Number(nk[kod] ?? 0);
  const q = (kod: string, nom: string, koefKod: keyof NakrutkaKoeffitsientlar, baza: PodvalHad[]): PodvalQator => ({ kod, nom, tur: 'foiz', foiz: f(koefKod), baza, koefKod });
  const j = (kod: string, nom: string, baza: PodvalHad[]): PodvalQator => ({ kod, nom, tur: 'jami', baza });
  return {
    versiya: 1,
    nom: 'Стандартный расчет',
    qatorlar: [
      j('pryamye', 'ПРЯМЫЕ ЗАТРАТЫ — ВСЕГО', barchaKat()),
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

/** Standart podvalga koeffitsient qiymatlarini qayta qo'yish (koefKod li qatorlar). */
export function podvalgaKoefQoy(p: Podval, nk: Partial<NakrutkaKoeffitsientlar>): Podval {
  return { ...p, qatorlar: p.qatorlar.map((q) => (q.koefKod && q.tur === 'foiz' ? { ...q, foiz: Number(nk[q.koefKod] ?? 0) } : q)) };
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
        if ('kat' in h && !(NAKRUTKA_KATLAR as readonly string[]).includes(h.kat)) x.push({ kod: q.kod, xabar: `Noma’lum kategoriya: ${h.kat}` });
      }
    }
    kodlar.add(q.kod);
  }
  if (p.qatorlar[p.qatorlar.length - 1].tur !== 'jami') x.push({ kod: p.qatorlar[p.qatorlar.length - 1].kod, xabar: 'Oxirgi qator — ВСЕГО (jami) bo‘lishi shart' });
  return x;
}

export type PodvalNatija = {
  /** Har qator qiymati (null — noma'lum: foiz yoki summa kiritilmagan yoki noma'lumga tayangan). */
  qiymat: Record<string, number | null>;
  vsego: number | null;
  /** Oxirgi qator kodi. */
  vsegoKod: string;
};

function hisobla(p: Podval, s: Partial<Record<NakrutkaKat, number>>, yaxlit: boolean, summaQosh: boolean): PodvalNatija {
  const r = yaxlit ? y2 : (v: number) => v;
  const qiymat: Record<string, number | null> = {};
  const had = (h: PodvalHad): number | null => {
    const v = 'kat' in h ? Number(s[h.kat] ?? 0) : qiymat[h.qator] ?? null;
    return v == null ? null : v * (h.k ?? 1);
  };
  const yigindi = (b: readonly PodvalHad[] | undefined): number | null => {
    let t = 0;
    for (const h of b ?? []) { const v = had(h); if (v == null) return null; t += v; }
    return t;
  };
  for (const q of p.qatorlar) {
    if (q.tur === 'summa') qiymat[q.kod] = summaQosh ? (q.summa == null ? null : r(Number(q.summa))) : 0;
    else if (q.tur === 'jami') { const b = yigindi(q.baza); qiymat[q.kod] = b == null ? null : r(b); }
    else { const b = yigindi(q.baza); qiymat[q.kod] = b == null || q.foiz == null ? null : r(b * Number(q.foiz) / 100); }
  }
  const vsegoKod = p.qatorlar[p.qatorlar.length - 1]?.kod ?? '';
  return { qiymat, vsego: qiymat[vsegoKod] ?? null, vsegoKod };
}

/** Belgilangan summalarsiz hisob (ko'p ustunli hujjatning ikkinchi va keyingi pul ustunlari uchun). */
export function podvalHisoblaSummasiz(p: Podval, s: Partial<KatSummalar>): PodvalNatija {
  return hisobla(p, s, true, false);
}

/** Podval hisobi (Excel bilan aynan — har qadam ROUND 2). */
export function podvalHisobla(p: Podval, s: Partial<KatSummalar>): PodvalNatija {
  return hisobla(p, s, true, true);
}

/** Kategoriya koeffitsientlari — chiziqli qism (summa qatorlarisiz, yaxlitlashsiz). */
export function podvalKf(p: Podval): Record<NakrutkaKat, number> {
  const kf = {} as Record<NakrutkaKat, number>;
  for (const kat of NAKRUTKA_KATLAR) {
    const n = hisobla(p, { [kat]: 1 }, false, false);
    kf[kat] = n.vsego ?? 0;
  }
  return kf;
}

/** Belgilangan (chiziqli bo'lmagan) summalar jami — к оплате qatorlariga kirmaydi. */
export function podvalBelgilanganSumma(p: Podval): number | null {
  let t = 0;
  for (const q of p.qatorlar) if (q.tur === 'summa') { if (q.summa == null) return null; t += Number(q.summa); }
  return t;
}

/** Standart shablondan farq qiladimi (maxsus qator qo'shilgan/olib tashlangan/o'zgargan). */
export function standartmi(p: Podval, nk: Partial<NakrutkaKoeffitsientlar>): boolean {
  const s = standartPodval(nk);
  return JSON.stringify(s.qatorlar) === JSON.stringify(podvalgaKoefQoy(p, nk).qatorlar);
}

/** Yangi maxsus qator uchun bo'sh kod. */
export function yangiKod(p: Podval, asos = 'qator'): string {
  const bor = new Set(p.qatorlar.map((q) => q.kod));
  for (let i = 1; ; i++) if (!bor.has(`${asos}_${i}`)) return `${asos}_${i}`;
}

/** Hadning odam o'qiydigan nomi (UI va izoh uchun). */
export function hadNomi(h: PodvalHad, p: Podval): string {
  const ish = (h.k ?? 1) < 0 ? '− ' : '';
  if ('kat' in h) return ish + h.kat;
  return ish + (p.qatorlar.find((q) => q.kod === h.qator)?.nom ?? h.qator);
}
