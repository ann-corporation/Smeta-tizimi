import type { T2Qator, T2QatorHolat } from '../api/supabase';
import {
  RasmiyVaraq, bugunSana, sumRefs, hujjatFaylNomi, imzoTomonlari, rasmiyKitob,
  type ImzoNomlar, type Qiymat, type RasmiyUstun,
} from './hujjat-yozuvchi';
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import { NAKRUTKA_KATLAR, nakrutkaKat, podvalNdsFoiz } from './nakrutka-podval';
import {
  NDS_SUKUT_FOIZ, ayirma2, faktSummaF2Narxda, kaskad, kategoriyaKf, kOplate, qatorSumma, serverMerosKoefQoy, standartPodval,
  yaxlit2, yigindi2, type KatSummalar, type Podval,
} from './hisob-yadro';
import { mashinistMehnati } from './narx-bildirishnoma';

/**
 * «ОБОСНОВАНИЕ ВЫПОЛНЕННЫХ ОБЪЁМОВ, НЕ ЗАКРЫТЫХ Ф-2» (egasi: «bajarilgan, lekin F2 ga chiqmagan ish» tizimning HAQIQIY
 * smeta va fakt ma'lumotlaridan pozitsiya bo'yicha asoslansin).
 *
 * Manba — `t2_qator_holat` (fakt/F2 hajm va summa) va smeta qatorlari; pul qoidalari hisob-yadrodan:
 *  - fakt summasi: tasdiqlangan F2 bor qatorda `faktSummaF2Narxda` (F2 narxida), aks holda hajm × smeta narxi;
 *  - F2 summasi: faqat tasdiqlangan F2 (`f2_summa`; `f2_summa_yoq` > 0 — noma'lum, bo'sh);
 *  - qoldiq = fakt − F2 (hajmda va pulda); minus saqlanadi (MAX yo'q), F2 > fakt qator izoh bilan;
 *  - NULL ≠ 0: noma'lum summa bo'sh qoladi; jamilar faqat ma'lum qatorlardan, noma'lumlar soni alohida aytiladi;
 *  - har jami uchlik: QQS bilan / ustamali (QQS siz) / ustamasiz — ustama foizlari faqat smeta podvalidan (yadro `kaskad`).
 * Faktning qaysi dalilga tayanishi (jurnal №/sana, F2 №, F2 qoralama №, foizli qamrov) — «Основание» ustunida.
 */

// ═════════════════════ dalil (asos) ═════════════════════

export type DalilTuri = 'jurnal' | 'foiz' | 'f2' | 'f2_qoralama';
export type DalilYozuv = { akt: number; tur: DalilTuri; raqam: string | null; sana: string | null; foiz: number | null };
export type DalilXarita = ReadonlyMap<number, readonly DalilYozuv[]>;
export type AktXom = { id: number; tur: string | null; raqam: string | null; sana: string | null; izoh: string | null; holat: string | null };
export type AktQatorXom = { akt_id: number; qator_id: number };

/** Foizli qamrov yozuvi: fakt hujjati izohi «Qamrov 100%: …». */
const QAMROV = /Qamrov\s+(-?\d+(?:[.,]\d+)?)\s*%/i;

/** Fakt hujjatlari (jurnal / foizli qamrov) va F2 hujjatlari (tasdiqlangan / qoralama) → qator bo'yicha dalil. Bekor qilinganlar kirmaydi. */
export function dalilYigish(aktlar: readonly AktXom[], qatorlar: readonly AktQatorXom[]): Map<number, DalilYozuv[]> {
  const turi = new Map<number, Omit<DalilYozuv, 'akt'>>();
  for (const a of aktlar) {
    if (a.holat === 'bekor') continue;
    if (a.tur === 'fakt') {
      const m = QAMROV.exec(a.izoh ?? '');
      turi.set(a.id, m ? { tur: 'foiz', raqam: a.raqam, sana: a.sana, foiz: Number(m[1].replace(',', '.')) } : { tur: 'jurnal', raqam: a.raqam, sana: a.sana, foiz: null });
    } else if (a.tur === 'f2' && a.holat === 'tasdiqlangan') turi.set(a.id, { tur: 'f2', raqam: a.raqam, sana: a.sana, foiz: null });
    else if (a.tur === 'f2' && a.holat === 'qoralama') turi.set(a.id, { tur: 'f2_qoralama', raqam: a.raqam, sana: a.sana, foiz: null });
  }
  const out = new Map<number, DalilYozuv[]>();
  const korilgan = new Set<string>();
  for (const q of qatorlar) {
    const t = turi.get(q.akt_id);
    if (!t) continue;
    const kalit = `${q.qator_id}:${q.akt_id}`;
    if (korilgan.has(kalit)) continue;
    korilgan.add(kalit);
    const a = out.get(q.qator_id);
    const y = { akt: q.akt_id, ...t };
    if (a) a.push(y); else out.set(q.qator_id, [y]);
  }
  return out;
}

const sanaRu = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');
const DALIL_TARTIB: Record<DalilTuri, number> = { f2: 0, f2_qoralama: 1, foiz: 2, jurnal: 3 };

function dalilBir(y: DalilYozuv): string {
  const raqam = y.raqam ? `№ ${y.raqam}` : 'б/н';
  const sana = y.sana ? ` от ${sanaRu(y.sana)}` : '';
  if (y.tur === 'f2') return `Ф-2 ${raqam}${sana} (утверждён)`;
  if (y.tur === 'f2_qoralama') return `Ф-2 ${raqam}${sana} (проект, не утверждён)`;
  if (y.tur === 'foiz') return `Процент выполнения${y.foiz != null ? ` ${y.foiz}%` : ''}, ${raqam}${sana}`;
  return `Журнал факта ${raqam}${sana}`;
}

/** Dalil matni (Основание): F2, F2 qoralama, foiz, jurnal tartibida; ko'pi bilan `max` ta, qolgani «и ещё N». */
export function dalilMatni(yozuvlar: readonly DalilYozuv[], max = 3): string {
  const t = [...yozuvlar].sort((a, b) => DALIL_TARTIB[a.tur] - DALIL_TARTIB[b.tur] || String(a.sana ?? '').localeCompare(String(b.sana ?? '')) || a.akt - b.akt);
  const korsat = t.slice(0, max).map(dalilBir);
  return t.length > max ? `${korsat.join('; ')}; и ещё ${t.length - max}` : korsat.join('; ');
}

// ═════════════════════ model ═════════════════════

/** Uchlik: QQS bilan / ustamali (QQS siz) / ustamasiz. null — noma'lum (0 emas). */
export type Uchlik = { qqsBilan: number | null; ustamali: number | null; ustamasiz: number | null };
export const BOSH_UCHLIK: Uchlik = { qqsBilan: null, ustamali: null, ustamasiz: null };

export type UstamaKontekst = {
  nakrutka?: Partial<NakrutkaKoeffitsientlar> | null;
  podval?: Podval | null;
  nkManba?: string | null;
  ndsFoiz?: number | null;
  /** Svod yaxlit bo'limlari avlodlari: ustama yo'q, faqat QQS. */
  yaxlitIdlar?: ReadonlySet<number> | null;
};

export type ObosnovanieKirish = {
  obyektId: number;
  obyektNomi: string;
  qatorlar: readonly T2Qator[];
  holatlar: readonly T2QatorHolat[];
  /** Qator → dalil. Berilmasa (yuklanmadi) — «Основание» ustuni bo'sh va izohda aytiladi. */
  dalil?: DalilXarita | null;
  kontekst?: UstamaKontekst | null;
};

export type ObosnovanieOpsiya = {
  /** F2 > fakt qatorlarni ham ko'rsatish (izoh: «F2 faktdan oshgan»). Sukut true. */
  f2OshganKorsat?: boolean;
};

export type ObosnovanieQator = {
  id: number;
  tur: 'rz' | 'poz' | 'itogo';
  daraja: number;
  tartib: string;
  kod: string;
  nom: string;
  birlik: string;
  smetaHajm: number | null;
  smetaSumma: number | null;
  faktHajm: number | null;
  /** Bajarilgan % = fakt hajm / smeta hajm × 100. */
  foiz: number | null;
  faktSumma: number | null;
  f2Hajm: number | null;
  f2Summa: number | null;
  qoldiqHajm: number | null;
  qoldiqSumma: number | null;
  dalil: string;
  izoh: string;
  /** Jami qatori (itogo/rz) uchun — bolalar model indekslari. */
  bolalar: number[];
};

export type ObyektSvod = {
  smeta: Uchlik; fakt: Uchlik; f2: Uchlik; qoldiq: Uchlik;
  /** Faktsiz smeta qoldig'i = smeta − fakt. */
  faktsizQoldiq: Uchlik;
  pozJami: number;
  /** Fakti kiritilgan (≠ 0) pozitsiyalar. */
  faktBor: number;
  /** Fakti bor, lekin tasdiqlangan F2 yo'q. */
  faktBorF2Yoq: number;
  /** Tasdiqlangan F2 bor, lekin fakt F2 dan kam. */
  f2FaktdanKop: number;
  /** Faktli pozitsiyalar ulushi, % (poz > 0 bo'lsa). */
  faktulush: number | null;
  /** Summasi noma'lum (narxsiz) pozitsiya-resurslar soni — jamilarga kirmagan. */
  nomalum: { smeta: number; fakt: number; f2: number };
  /** Ustama/QQS bo'yicha tushuntirish (ustamali va QQS bilan bo'sh bo'lsa sababi). */
  ustamaIzoh: string;
};

export type ObosnovanieModel = {
  obyektId: number;
  obyektNomi: string;
  qatorlar: ObosnovanieQator[];
  ildizlar: number[];
  /** Hujjatda ko'rsatilgan pozitsiyalar jamisi (uchlik). */
  jami: { smeta: Uchlik; fakt: Uchlik; f2: Uchlik; qoldiq: Uchlik };
  pozSoni: number;
  svod: ObyektSvod;
  diqqat: Array<{ nom: string; sabab: string; joy?: string }>;
  dalilYuklangan: boolean;
};

const BARG = new Set(['rs', 'mat', 'ob']);
const EPS = 1e-9;
const SUM_EPS = 0.005;
const nol = (x: number | null): boolean => x != null && Math.abs(x) < EPS;
const ost = (x: number | null): number | null => (x == null ? null : Math.abs(x) < EPS ? 0 : x);

type Barg = { kat: ReturnType<typeof nakrutkaKat>; yax: boolean; smeta: number | null; fakt: number | null; f2: number | null };

/** Hajm × narx; hajm 0 → 0 (narxsiz bo'lsa ham); mashinist mehnati narxsiz — 0; aks holda noma'lum (null). */
function pul(hajm: number | null, narx: number | null, q: T2Qator): number | null {
  if (hajm == null) return null;
  if (hajm === 0) return 0;
  const s = qatorSumma(hajm, narx);
  return s == null && mashinistMehnati(q) ? 0 : s;
}

function bargHisob(q: T2Qator, h: T2QatorHolat | undefined, yax: boolean): Barg {
  const faktH = h ? Number(h.fakt_hajm ?? 0) : null;
  const f2H = h ? Number(h.f2_hajm ?? 0) : null;
  const smeta = pul(q.hajm ?? null, q.narx ?? null, q);
  const faktAsl = pul(faktH, q.narx ?? null, q);
  let fakt = faktAsl;
  if (h && faktH != null && f2H != null && f2H !== 0) {
    // Tasdiqlangan F2 bor qator: fakt F2 narxida (yadro qoidasi); F2 summasi noma'lum bo'lsa fakt F2 narxida baholanmaydi.
    fakt = faktSummaF2Narxda(faktH, f2H, h.f2_summa == null ? null : Number(h.f2_summa), faktAsl, h.f2_summa_yoq).summa;
  }
  const f2Yoq = h ? Number(h.f2_summa_yoq ?? 0) > 0 : false;
  const f2 = h == null ? null : f2H === 0 ? 0 : f2Yoq || h.f2_summa == null ? null : Number(h.f2_summa);
  return { kat: nakrutkaKat(q.kat), yax, smeta, fakt, f2 };
}

/** Ma'lum (null emas) qiymatlar yig'indisi; hammasi noma'lum bo'lsa — null. */
function maluml(xs: ReadonlyArray<number | null>): number | null {
  const m = xs.filter((x): x is number => x != null);
  return xs.length && !m.length ? null : yigindi2(m);
}

type KontekstNatija = { podval: Podval; nk: Partial<NakrutkaKoeffitsientlar>; nds: number | null } | null;
function kontekstTayyorla(k: UstamaKontekst | null | undefined): KontekstNatija {
  if (!k || (!k.nakrutka && !k.podval)) return null;
  try {
    const nk: Partial<NakrutkaKoeffitsientlar> = { ...(k.nakrutka ?? {}) };
    nk.НДС = k.ndsFoiz ?? nk.НДС ?? NDS_SUKUT_FOIZ;
    const podval = k.podval ? serverMerosKoefQoy(k.podval, nk, k.nkManba) : standartPodval(nk);
    return { podval, nk, nds: podvalNdsFoiz(podval, nk) };
  } catch { return null; }
}

/** Barglar to'plami bo'yicha uchlik: ustamasiz = ma'lum summalar; ustamali va QQS bilan — smeta podvali kaskadi (yadro). */
export function uchlikHisobla(barglar: ReadonlyArray<{ kat: ReturnType<typeof nakrutkaKat>; yax: boolean; v: number | null }>, ctx: KontekstNatija): { uchlik: Uchlik; nomalum: number; izoh: string } {
  const nomalum = barglar.filter((b) => b.v == null).length;
  const ustamasiz = barglar.length ? maluml(barglar.map((b) => b.v)) : 0;
  if (!ctx) return { uchlik: { qqsBilan: null, ustamali: null, ustamasiz }, nomalum, izoh: 'ставки накладных расходов (подвал сметы) не получены — суммы с накладными и с НДС не определены' };
  try {
    const kf = kategoriyaKf(ctx.podval);
    const s0 = Object.fromEntries(NAKRUTKA_KATLAR.map((k) => [k, 0])) as KatSummalar;
    let nomalumQism = 0;
    const yaxQ: Array<number | null> = [];
    let yaxQqssiz = 0;
    for (const b of barglar) {
      if (b.v == null) continue;
      if (b.yax) { yaxQ.push(kOplate(b.v, null, kf, true, ctx.nds)); yaxQqssiz += b.v; }
      else if (b.kat) s0[b.kat] += b.v;
      else nomalumQism += b.v;
    }
    const yq = yaxQ.length ? (yaxQ.some((x) => x == null) ? null : yigindi2(yaxQ)) : null;
    if (yaxQ.length && yq == null) throw new Error('YAXLIT_QQS');
    const r = kaskad(s0, ctx.podval, { nomalumQism: nomalumQism ? yaxlit2(nomalumQism) : null, yaxlit: yq != null ? { qqsBilan: yq, qqssiz: yaxlit2(yaxQqssiz) } : null });
    if (r.nomalumQatorlar.length || r.itogo4 == null || r.qqsBilan == null) return { uchlik: { qqsBilan: null, ustamali: null, ustamasiz }, nomalum, izoh: 'в подвале сметы не задан процент — суммы с накладными и с НДС не определены (не принимаются равными 0)' };
    return { uchlik: { qqsBilan: r.qqsBilan, ustamali: r.itogo4, ustamasiz }, nomalum, izoh: '' };
  } catch {
    return { uchlik: { qqsBilan: null, ustamali: null, ustamasiz }, nomalum, izoh: 'суммы с накладными и с НДС не рассчитаны (подвал сметы неполный)' };
  }
}

type Poz = {
  q: T2Qator;
  h: T2QatorHolat | undefined;
  barglar: Barg[];
  smetaHajm: number | null; faktHajm: number | null; f2Hajm: number | null;
  smetaSumma: number | null; faktSumma: number | null; f2Summa: number | null; qoldiqSumma: number | null; qoldiqHajm: number | null;
  nomalum: boolean;
  qismanNomalum: boolean;
  f2Resursda: boolean;
  idlar: number[];
};

/** Kanonik daraxt + holat → hujjat modeli (sof funksiya). */
export function obosnovanieModeli(k: ObosnovanieKirish, o: ObosnovanieOpsiya = {}): ObosnovanieModel {
  const f2Korsat = o.f2OshganKorsat ?? true;
  const rows = [...k.qatorlar].sort((a, b) => (a.tartib ?? 0) - (b.tartib ?? 0) || a.id - b.id);
  const byId = new Map(rows.map((q) => [q.id, q]));
  const holat = new Map(k.holatlar.map((h) => [h.qator_id, h]));
  const bolalar = new Map<number | null, T2Qator[]>();
  for (const q of rows) {
    const ota = q.ota_id != null && byId.has(q.ota_id) ? q.ota_id : null;
    const a = bolalar.get(ota);
    if (a) a.push(q); else bolalar.set(ota, [q]);
  }
  const yaxIdlar = k.kontekst?.yaxlitIdlar ?? null;
  const ctx = kontekstTayyorla(k.kontekst);

  const yigBarg = (q: T2Qator, chiq: T2Qator[]) => {
    const kids = bolalar.get(q.id) ?? [];
    if (BARG.has(q.tur ?? '') || (q.tur === 'bl' && !kids.length)) { chiq.push(q); return; }
    for (const c of kids) yigBarg(c, chiq);
  };
  const pozHisobla = (q: T2Qator): Poz => {
    const leaves: T2Qator[] = [];
    yigBarg(q, leaves);
    const barglar = leaves.map((l) => bargHisob(l, holat.get(l.id), !!yaxIdlar?.has(l.id)));
    const h = holat.get(q.id);
    const faktHajm = h ? Number(h.fakt_hajm ?? 0) : null;
    const f2Hajm = h ? Number(h.f2_hajm ?? 0) : null;
    const smetaSumma = maluml(barglar.map((b) => b.smeta));
    const faktSumma = maluml(barglar.map((b) => b.fakt));
    const f2Summa = maluml(barglar.map((b) => b.f2));
    const qoldiqSumma = maluml(barglar.map((b) => ayirma2(b.fakt, b.f2)));
    const qoldiqHajm = faktHajm == null || f2Hajm == null ? null : ost(faktHajm - f2Hajm);
    const nomalum = barglar.length > 0 && barglar.every((b) => b.fakt == null || b.f2 == null);
    const qismanNomalum = !nomalum && barglar.some((b) => b.fakt == null || b.f2 == null || b.smeta == null);
    const leafF2 = leaves.some((l) => Number(holat.get(l.id)?.f2_hajm ?? 0) !== 0);
    const f2Resursda = q.tur === 'bl' && leaves.length > 0 && !(leaves.length === 1 && leaves[0].id === q.id) && (f2Hajm ?? 0) === 0 && leafF2;
    const idlar = [q.id, ...leaves.map((l) => l.id)];
    return { q, h, barglar, smetaHajm: q.hajm ?? null, faktHajm, f2Hajm, smetaSumma, faktSumma, f2Summa, qoldiqSumma, qoldiqHajm, nomalum, qismanNomalum, f2Resursda, idlar };
  };

  // 1) Barcha pozitsiyalar (svod uchun) — daraxt tartibida, razdel yo'li bilan.
  const barchaPoz: Poz[] = [];
  const pozOf = new Map<number, Poz>();
  const yigPoz = (q: T2Qator) => {
    const kids = bolalar.get(q.id) ?? [];
    if (q.tur === 'bl' || BARG.has(q.tur ?? '')) { const p = pozHisobla(q); barchaPoz.push(p); pozOf.set(q.id, p); return; }
    for (const c of kids) yigPoz(c);
  };
  for (const q of bolalar.get(null) ?? []) yigPoz(q);

  // 2) Qaysi pozitsiya hujjatga kiradi.
  const kiradi = (p: Poz): { kirsin: boolean; oshgan: boolean } => {
    const hajmNol = p.qoldiqHajm != null && Math.abs(p.qoldiqHajm) > EPS;
    const sumNol = p.qoldiqSumma != null && Math.abs(p.qoldiqSumma) >= SUM_EPS;
    const bilinmas = p.qoldiqSumma == null && ((p.faktHajm ?? 0) !== 0 || (p.f2Hajm ?? 0) !== 0);
    const oshgan = (p.qoldiqHajm != null && p.qoldiqHajm < -EPS) || (p.qoldiqSumma != null && p.qoldiqSumma <= -SUM_EPS);
    return { kirsin: (hajmNol || sumNol || bilinmas) && (f2Korsat || !oshgan), oshgan };
  };

  const dalilBor = k.dalil != null;
  const diqqat: ObosnovanieModel['diqqat'] = [];
  const yolOf = (q: T2Qator): string => {
    const y: string[] = [];
    for (let x = q.ota_id == null ? undefined : byId.get(q.ota_id); x; x = x.ota_id == null ? undefined : byId.get(x.ota_id)) if (x.tur === 'rz') y.unshift(x.nom ?? '');
    return y.join(' › ');
  };
  const dalilOf = (p: Poz): DalilYozuv[] => {
    const seen = new Set<number>();
    const out: DalilYozuv[] = [];
    for (const id of p.idlar) for (const y of k.dalil?.get(id) ?? []) if (!seen.has(y.akt)) { seen.add(y.akt); out.push(y); }
    return out;
  };

  const out: ObosnovanieQator[] = [];
  const korsatilgan: Poz[] = [];
  let tartibNo = 0;
  const pozQator = (p: Poz, daraja: number, oshgan: boolean): number => {
    const q = p.q;
    const dl = dalilOf(p);
    const izohlar: string[] = [];
    if (oshgan) izohlar.push('Ф-2 превышает факт (F2 faktdan oshgan)');
    if (p.smetaHajm != null && p.faktHajm != null && (p.smetaHajm >= 0 ? p.faktHajm > p.smetaHajm + EPS : p.faktHajm < p.smetaHajm - EPS)) izohlar.push('факт превышает объём по смете');
    if (p.nomalum) izohlar.push('нет сметной цены — сумма не определена');
    else if (p.qismanNomalum) izohlar.push('часть ресурсов без цены — сумма неполная');
    if (p.h && p.f2Summa == null && (p.f2Hajm ?? 0) !== 0) izohlar.push('сумма Ф-2 не указана');
    if (p.f2Resursda) izohlar.push('Ф-2 закрыт по ресурсам позиции');
    if (!p.h) izohlar.push('нет данных о выполнении');
    const faktBor = (p.faktHajm ?? 0) !== 0;
    const faktDalil = dl.some((y) => y.tur === 'jurnal' || y.tur === 'foiz');
    let dalilTxt = dl.length ? dalilMatni(dl) : '';
    if (dalilBor && faktBor && !faktDalil) dalilTxt = [dalilTxt, 'запись факта в журнале не найдена'].filter(Boolean).join('; ');
    if (p.nomalum || p.qismanNomalum) diqqat.push({ nom: `${q.nom ?? ''}${q.birlik ? `, ${q.birlik}` : ''}`, sabab: p.nomalum ? 'нет сметной цены или данных — сумма не определена, в итоги не включена' : 'часть ресурсов без цены — сумма по позиции неполная', joy: yolOf(q) || undefined });
    const foiz = p.smetaHajm != null && p.smetaHajm !== 0 && p.faktHajm != null ? (p.faktHajm / p.smetaHajm) * 100 : null;
    out.push({
      id: q.id, tur: 'poz', daraja, tartib: String(++tartibNo), kod: q.kod ?? '', nom: q.nom ?? '', birlik: q.birlik ?? '',
      smetaHajm: p.smetaHajm, smetaSumma: p.smetaSumma, faktHajm: p.faktHajm, foiz, faktSumma: p.faktSumma,
      f2Hajm: p.f2Hajm, f2Summa: p.f2Summa, qoldiqHajm: p.qoldiqHajm, qoldiqSumma: p.qoldiqSumma,
      dalil: dalilTxt, izoh: izohlar.join('; '), bolalar: [],
    });
    korsatilgan.push(p);
    return out.length - 1;
  };

  const jamiQiy = (idx: readonly number[], f: (r: ObosnovanieQator) => number | null): number | null => maluml(idx.map((i) => f(out[i])));
  const qayta = (q: T2Qator, daraja: number): number | null => {
    const p = pozOf.get(q.id);
    if (p) { const x = kiradi(p); return x.kirsin ? pozQator(p, daraja, x.oshgan) : null; }
    const idx = out.length;
    out.push({ id: q.id, tur: 'rz', daraja, tartib: '', kod: '', nom: q.nom ?? '', birlik: '', smetaHajm: null, smetaSumma: null, faktHajm: null, foiz: null, faktSumma: null, f2Hajm: null, f2Summa: null, qoldiqHajm: null, qoldiqSumma: null, dalil: '', izoh: '', bolalar: [] });
    const b: number[] = [];
    for (const c of bolalar.get(q.id) ?? []) { const i = qayta(c, daraja + 1); if (i != null) b.push(i); }
    if (!b.length) { out.length = idx; return null; }
    out.push({
      id: q.id, tur: 'itogo', daraja, tartib: '', kod: '', nom: `ИТОГО ПО РАЗДЕЛУ: ${q.nom ?? ''}`, birlik: '',
      smetaHajm: null, smetaSumma: jamiQiy(b, (r) => r.smetaSumma), faktHajm: null, foiz: null, faktSumma: jamiQiy(b, (r) => r.faktSumma),
      f2Hajm: null, f2Summa: jamiQiy(b, (r) => r.f2Summa), qoldiqHajm: null, qoldiqSumma: jamiQiy(b, (r) => r.qoldiqSumma), dalil: '', izoh: '', bolalar: b,
    });
    const rz = out[idx], it = out[out.length - 1];
    rz.smetaSumma = it.smetaSumma; rz.faktSumma = it.faktSumma; rz.f2Summa = it.f2Summa; rz.qoldiqSumma = it.qoldiqSumma;
    return out.length - 1;
  };
  const ildizlar: number[] = [];
  for (const q of bolalar.get(null) ?? []) { const i = qayta(q, 0); if (i != null) ildizlar.push(i); }

  // 3) Uchliklar: ko'rsatilgan pozitsiyalar bo'yicha (jami) va barcha pozitsiyalar bo'yicha (svod).
  const uchliklar = (pl: readonly Poz[]) => {
    const barg = (pick: (b: Barg) => number | null) => pl.flatMap((p) => p.barglar.map((b) => ({ kat: b.kat, yax: b.yax, v: pick(b) })));
    const smeta = uchlikHisobla(barg((b) => b.smeta), ctx);
    const fakt = uchlikHisobla(barg((b) => b.fakt), ctx);
    const f2 = uchlikHisobla(barg((b) => b.f2), ctx);
    const qoldiq = uchlikHisobla(barg((b) => (b.fakt == null || b.f2 == null ? null : b.fakt - b.f2)), ctx);
    const faktsiz = uchlikHisobla(barg((b) => (b.smeta == null || b.fakt == null ? null : b.smeta - b.fakt)), ctx);
    return { smeta, fakt, f2, qoldiq, faktsiz };
  };
  const kor = uchliklar(korsatilgan);
  const bar = uchliklar(barchaPoz);

  const faktBor = barchaPoz.filter((p) => (p.faktHajm ?? 0) !== 0).length;
  const svod: ObyektSvod = {
    smeta: bar.smeta.uchlik, fakt: bar.fakt.uchlik, f2: bar.f2.uchlik, qoldiq: bar.qoldiq.uchlik, faktsizQoldiq: bar.faktsiz.uchlik,
    pozJami: barchaPoz.length,
    faktBor,
    faktBorF2Yoq: barchaPoz.filter((p) => (p.faktHajm ?? 0) !== 0 && (p.f2Hajm ?? 0) === 0).length,
    f2FaktdanKop: barchaPoz.filter((p) => (p.f2Hajm ?? 0) > 0 && (p.faktHajm ?? 0) < (p.f2Hajm ?? 0) - EPS).length,
    faktulush: barchaPoz.length ? (faktBor / barchaPoz.length) * 100 : null,
    nomalum: { smeta: bar.smeta.nomalum, fakt: bar.fakt.nomalum, f2: bar.f2.nomalum },
    ustamaIzoh: bar.smeta.izoh || bar.fakt.izoh,
  };
  // Hamma pozitsiya faktsiz va noldan farq qilmaydigan holat — izoh: hujjat bo'sh.
  return {
    obyektId: k.obyektId, obyektNomi: k.obyektNomi, qatorlar: out, ildizlar,
    jami: { smeta: kor.smeta.uchlik, fakt: kor.fakt.uchlik, f2: kor.f2.uchlik, qoldiq: kor.qoldiq.uchlik },
    pozSoni: korsatilgan.length, svod, diqqat, dalilYuklangan: dalilBor,
  };
}

// ═════════════════════ Excel ═════════════════════

/** Eski hisobotdagi (qo'lda kiritilgan) raqamlar — obyekt bo'yicha, QQS bilan. Hech narsa qattiq yozilmaydi. */
export type EskiHisobot = { fakt?: number | null; f2?: number | null; qoldiq?: number | null };

export type ObosnovanieHujjatOpsiya = {
  /** "По состоянию на" — YYYY-MM-DD. Berilmasa — bugun. */
  sana?: string;
  /** Hujjat tuzilgan kun (sana < bugun bo'lsa — izoh: ma'lumot joriy holat bo'yicha). */
  tuzilgan?: string;
  imzo?: ImzoNomlar;
  /** Sarlavhadagi nom: bitta obyekt yoki loyiha. */
  nom: string;
  eski?: ReadonlyMap<number, EskiHisobot> | Record<number, EskiHisobot> | null;
  f2OshganKorsat?: boolean;
};

const USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Шифр, код', kenglik: 14, tur: 'kod' },
  { sarlavha: 'Наименование работ и затрат', kenglik: 42, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 8, tur: 'birlik' },
  { sarlavha: 'кол-во', kenglik: 12, tur: 'hajm', guruh: 'ПО СМЕТЕ' },
  { sarlavha: 'сумма, сум', kenglik: 16, tur: 'pul', guruh: 'ПО СМЕТЕ' },
  { sarlavha: 'кол-во', kenglik: 12, tur: 'hajm', guruh: 'ВЫПОЛНЕНО (ФАКТ)' },
  { sarlavha: '%', kenglik: 8, tur: 'foiz', guruh: 'ВЫПОЛНЕНО (ФАКТ)' },
  { sarlavha: 'сумма, сум', kenglik: 16, tur: 'pul', guruh: 'ВЫПОЛНЕНО (ФАКТ)' },
  { sarlavha: 'кол-во', kenglik: 12, tur: 'hajm', guruh: 'ЗАКРЫТО Ф-2 (утверждённые)' },
  { sarlavha: 'сумма, сум', kenglik: 16, tur: 'pul', guruh: 'ЗАКРЫТО Ф-2 (утверждённые)' },
  { sarlavha: 'кол-во', kenglik: 12, tur: 'hajm', guruh: 'НЕ ЗАКРЫТО Ф-2 (факт − Ф-2)' },
  { sarlavha: 'сумма, сум', kenglik: 16, tur: 'pul', guruh: 'НЕ ЗАКРЫТО Ф-2 (факт − Ф-2)' },
  { sarlavha: 'Основание (журнал факта, Ф-2, процент)', kenglik: 40, tur: 'matn' },
  { sarlavha: 'Примечание', kenglik: 28, tur: 'matn' },
] as RasmiyUstun[];

const SVOD_USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Объект / показатель', kenglik: 46, tur: 'matn' },
  { sarlavha: 'С НДС, сум', kenglik: 20, tur: 'pul', guruh: 'СУММА' },
  { sarlavha: 'С накладными, без НДС, сум', kenglik: 20, tur: 'pul', guruh: 'СУММА' },
  { sarlavha: 'Прямые затраты, без НДС, сум', kenglik: 20, tur: 'pul', guruh: 'СУММА' },
  { sarlavha: 'Поз., шт.', kenglik: 10, tur: 'tartib' },
  { sarlavha: 'Примечание', kenglik: 44, tur: 'matn' },
];

const qiy = (x: number | null): Qiymat => (x == null ? null : x);
const fmt = (n: number, d = 1): string => n.toLocaleString('ru-RU', { maximumFractionDigits: d });
const eskiOl = (e: ObosnovanieHujjatOpsiya['eski'], id: number): EskiHisobot | undefined => (e == null ? undefined : e instanceof Map ? e.get(id) : (e as Record<number, EskiHisobot>)[id]);

function varaqNomi(nom: string, band: Set<string>, i: number): string {
  const toza = nom.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim() || `Объект ${i}`;
  let kand = toza.slice(0, 31);
  for (let n = 2; band.has(kand.toLowerCase()); n++) kand = `${toza.slice(0, 31 - String(n).length - 1)} ${n}`;
  band.add(kand.toLowerCase());
  return kand;
}

/** Uchlik qatorlari: QQS bilan birinchi (egasi qoidasi), so'ng ustamali, so'ng ustamasiz. */
const UCHLIK_NOMLARI = ['с НДС (QQS bilan)', 'с накладными, без НДС (ustamali)', 'прямые затраты, без НДС (ustamasiz)'] as const;
const uchlikSon = (u: Uchlik): [number | null, number | null, number | null] => [u.qqsBilan, u.ustamali, u.ustamasiz];

function obyektVaraq(m: ObosnovanieModel, nom: string, o: ObosnovanieHujjatOpsiya): RasmiyVaraq {
  const sana = o.sana ?? bugunSana();
  const sanaTxt = sana.split('-').reverse().join('.');
  const v = new RasmiyVaraq({
    nom,
    sarlavha: 'ОБОСНОВАНИЕ ВЫПОЛНЕННЫХ ОБЪЁМОВ, НЕ ЗАКРЫТЫХ Ф-2',
    ostSarlavha: [`(по состоянию на ${sanaTxt}; выполнено по факту, не закрытое утверждёнными актами Ф-2)`],
    titul: [
      ['Объект:', m.obyektNomi],
      ['Заказчик:', o.imzo?.zakazchik],
      ['Подрядчик:', o.imzo?.pudratchi],
      ['Основание:', 'смета объекта, журнал фактически выполненных объёмов, утверждённые акты Ф-2 (данные системы)'],
    ],
    ustunlar: USTUNLAR,
    yonalish: 'landscape',
  });
  const bosh = v.malumotBoshi;
  const rowOf = (i: number) => bosh + i;
  m.qatorlar.forEach((q, i) => {
    const kid = (col: string) => sumRefs(col, q.bolalar.map(rowOf));
    const yigQ = (col: string, val: number | null): Qiymat => (val == null ? null : { f: kid(col), v: val });
    let r = 0;
    if (q.tur === 'rz') r = v.bolim(q.nom, { daraja: q.daraja });
    else if (q.tur === 'poz') {
      r = v.qator('oddiy', (n) => [
        q.tartib, q.kod, q.nom, q.birlik, qiy(q.smetaHajm), qiy(q.smetaSumma), qiy(q.faktHajm),
        q.foiz == null ? null : { f: `IF(OR(E${n}="",G${n}="",N(E${n})=0),"",G${n}/E${n}*100)`, v: q.foiz },
        qiy(q.faktSumma), qiy(q.f2Hajm), qiy(q.f2Summa),
        q.qoldiqHajm == null ? null : { f: `IF(OR(G${n}="",J${n}=""),"",G${n}-J${n})`, v: q.qoldiqHajm },
        q.qoldiqSumma == null ? null : { f: `IF(OR(I${n}="",K${n}=""),"",I${n}-K${n})`, v: q.qoldiqSumma },
        q.dalil, q.izoh,
      ], { daraja: q.daraja });
    } else {
      r = v.qator('jami', () => [
        null, null, q.nom, null, null, yigQ('F', q.smetaSumma), null, null, yigQ('I', q.faktSumma), null, yigQ('K', q.f2Summa), null, yigQ('M', q.qoldiqSumma), null, null,
      ], { daraja: q.daraja });
    }
    if (r !== rowOf(i)) throw new Error('OBOSNOVANIE_QATOR_SILJIDI');
  });
  if (m.ildizlar.length) {
    const jamiSum = (pick: (r: ObosnovanieQator) => number | null, col: string): Qiymat => {
      const val = m.ildizlar.map((i) => pick(m.qatorlar[i]));
      const bor = val.filter((x) => x != null);
      return bor.length ? { f: sumRefs(col, m.ildizlar.map(rowOf)), v: yaxlit2(bor.reduce<number>((a, b) => a + (b ?? 0), 0)) } : null;
    };
    v.qator('vsego', () => [
      null, null, 'ВСЕГО ПО ПОЗИЦИЯМ ВЕДОМОСТИ (прямые затраты, без НДС)', null, null,
      jamiSum((r) => r.smetaSumma, 'F'), null, null, jamiSum((r) => r.faktSumma, 'I'), null, jamiSum((r) => r.f2Summa, 'K'), null, jamiSum((r) => r.qoldiqSumma, 'M'), null, null,
    ]);
    // Uchlik: QQS bilan birinchi. Ustamali va QQS bilan — smeta podvali kaskadidan (yadro); noma'lum bo'lsa bo'sh.
    v.bosh();
    UCHLIK_NOMLARI.forEach((nomi, j) => {
      v.qator(j === 0 ? 'vsego' : 'jami', () => [
        null, null, `ВСЕГО ${nomi}`, null, null,
        qiy(uchlikSon(m.jami.smeta)[j]), null, null, qiy(uchlikSon(m.jami.fakt)[j]), null, qiy(uchlikSon(m.jami.f2)[j]), null, qiy(uchlikSon(m.jami.qoldiq)[j]), null, null,
      ]);
    });
  }
  v.bosh();
  v.izoh('Ведомость включает позиции, по которым объём факта не равен объёму, закрытому утверждёнными актами Ф-2 (графа «не закрыто» = факт − Ф-2). Минус показан как есть: Ф-2 превышает факт. Стоимость факта по позициям с утверждённым Ф-2 — по цене Ф-2; иначе объём × сметная цена (без НДС). Неизвестная сумма показана пустой (не 0) и отмечена в примечании; в итоги входят только известные суммы. Накладные расходы и НДС — по смете объекта (подвал сметы); если процент не задан, суммы с накладными и с НДС не определены.');
  const kiritilgan = m.svod;
  v.izoh(`Факт внесён по ${kiritilgan.faktBor} из ${kiritilgan.pozJami} позиций сметы${kiritilgan.faktulush != null ? ` (${fmt(kiritilgan.faktulush)} %)` : ''}: ведомость отражает частично внесённый факт и пересчитывается по мере его ввода.`);
  if (o.tuzilgan && sana < o.tuzilgan) v.izoh(`Дата «по состоянию на» ${sanaTxt} раньше даты формирования: объёмы и суммы взяты по текущему состоянию данных системы, отбор актов по дате не применялся.`);
  if (!m.dalilYuklangan) v.izoh('Основание факта (журнал, Ф-2) не загружено — столбец «Основание» не заполнен.');
  if (m.svod.ustamaIzoh) v.izoh(`Накладные расходы и НДС: ${m.svod.ustamaIzoh}.`);
  v.diqqat(m.diqqat);
  v.imzo(imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'СОСТАВИЛ'], o.imzo));
  return v;
}

function svodVaraq(modellar: readonly ObosnovanieModel[], o: ObosnovanieHujjatOpsiya): RasmiyVaraq {
  const sana = o.sana ?? bugunSana();
  const sanaTxt = sana.split('-').reverse().join('.');
  const v = new RasmiyVaraq({
    nom: 'Свод',
    sarlavha: 'СВОД: ОБОСНОВАНИЕ ВЫПОЛНЕННЫХ ОБЪЁМОВ, НЕ ЗАКРЫТЫХ Ф-2',
    ostSarlavha: [`(по состоянию на ${sanaTxt}; по всем позициям сметы каждого объекта)`],
    titul: [['Объект / проект:', o.nom]],
    ustunlar: SVOD_USTUNLAR,
    yonalish: 'landscape',
  });
  const qatorlarIdx: Record<'smeta' | 'fakt' | 'f2' | 'qoldiq' | 'faktsiz', number[]> = { smeta: [], fakt: [], f2: [], qoldiq: [], faktsiz: [] };
  const NOMLAR: Array<[keyof typeof qatorlarIdx, string]> = [
    ['smeta', 'Смета (стоимость по смете)'], ['fakt', 'Выполнено (факт)'], ['f2', 'Закрыто утверждёнными Ф-2'],
    ['qoldiq', 'НЕ ЗАКРЫТО Ф-2 (факт − Ф-2)'], ['faktsiz', 'Остаток сметы без факта (смета − факт)'],
  ];
  const uchlikQator = (u: Uchlik) => uchlikSon(u).map(qiy);
  modellar.forEach((m, oi) => {
    v.bolim(`${oi + 1}. ${m.obyektNomi}`);
    const s = m.svod;
    const e = eskiOl(o.eski, m.obyektId);
    const qatorRaqami: Partial<Record<string, number>> = {};
    for (const [kalit, nomi] of NOMLAR) {
      const u = s[kalit === 'faktsiz' ? 'faktsizQoldiq' : kalit];
      const izoh = kalit === 'smeta' && s.nomalum.smeta ? `${s.nomalum.smeta} рес. без цены/объёма — не в итоге`
        : kalit === 'fakt' && s.nomalum.fakt ? `${s.nomalum.fakt} рес. без цены — не в итоге`
        : kalit === 'f2' && s.nomalum.f2 ? `${s.nomalum.f2} рес. с Ф-2 без суммы — не в итоге` : '';
      const r = v.qator(kalit === 'qoldiq' ? 'jami' : 'oddiy', () => [null, nomi, ...uchlikQator(u), kalit === 'smeta' ? s.pozJami : null, izoh]);
      qatorRaqami[kalit] = r;
      qatorlarIdx[kalit].push(r);
      const eski = kalit === 'fakt' ? e?.fakt : kalit === 'f2' ? e?.f2 : kalit === 'qoldiq' ? e?.qoldiq : undefined;
      if (eski != null) {
        const eskiR = v.qator('oddiy', () => [null, '   прежний отчёт (введено вручную, с НДС)', qiy(eski), null, null, null, '']);
        const farqVal = u.qqsBilan == null ? null : yaxlit2(u.qqsBilan - eski);
        v.qator('oddiy', (n) => [null, '   разница: система − прежний отчёт (с НДС)', u.qqsBilan == null ? null : { f: `C${r}-C${eskiR}`, v: farqVal }, null, null, null, u.qqsBilan == null ? 'сумма системы не определена' : '']);
      }
    }
    // Nazorat: smeta − fakt − faktsiz qoldiq (QQS bilan) = 0.
    const rs = qatorRaqami.smeta!, rf = qatorRaqami.fakt!, rq = qatorRaqami.faktsiz!;
    const kon = (j: 0 | 1 | 2) => { const a = uchlikSon(s.smeta)[j], b = uchlikSon(s.fakt)[j], c = uchlikSon(s.faktsizQoldiq)[j]; return a == null || b == null || c == null ? null : yaxlit2(a - b - c); };
    v.qator('oddiy', () => [null, 'Контроль: смета − факт − остаток без факта (должно быть 0)',
      ...([0, 1, 2] as const).map((j) => (kon(j) == null ? null : { f: `${'CDE'[j]}${rs}-${'CDE'[j]}${rf}-${'CDE'[j]}${rq}`, v: kon(j) as number })), null, '']);
    v.qator('oddiy', () => [null, 'Позиций с фактом / всего', null, null, null, s.faktBor, s.faktulush == null ? '' : `охват фактом ${fmt(s.faktulush)} % (${s.faktBor} из ${s.pozJami})`]);
    v.qator('oddiy', () => [null, 'Позиций: факт есть, Ф-2 нет', null, null, null, s.faktBorF2Yoq, '']);
    v.qator('oddiy', () => [null, 'Позиций: утверждённый Ф-2 есть, факт меньше Ф-2', null, null, null, s.f2FaktdanKop, s.f2FaktdanKop ? 'F2 faktdan oshgan — факт внесён не полностью или Ф-2 превышает факт' : '']);
    if (s.ustamaIzoh) v.qator('oddiy', () => [null, 'Накладные и НДС', null, null, null, null, s.ustamaIzoh]);
  });
  if (modellar.length > 1) {
    v.bosh();
    const sumU = (kalit: keyof typeof qatorlarIdx, j: 0 | 1 | 2): Qiymat => {
      const key = kalit === 'faktsiz' ? 'faktsizQoldiq' : kalit;
      const vals = modellar.map((m) => uchlikSon(m.svod[key])[j]);
      if (vals.some((x) => x == null)) return null;
      return { f: `SUM(${qatorlarIdx[kalit].map((r) => `${'CDE'[j]}${r}`).join(',')})`, v: yaxlit2(vals.reduce<number>((a, b) => a + (b ?? 0), 0)) };
    };
    v.bolim('ВСЕГО ПО ВСЕМ ОБЪЕКТАМ');
    for (const [kalit, nomi] of NOMLAR) v.qator(kalit === 'qoldiq' ? 'vsego' : 'jami', () => [null, nomi, sumU(kalit, 0), sumU(kalit, 1), sumU(kalit, 2), null, '']);
  }
  v.bosh();
  v.izoh('Все суммы даны тройкой: с НДС / с накладными без НДС / прямые затраты без НДС. Накладные и НДС — по подвалу сметы каждого объекта; пустая ячейка — сумма не определена (не 0). Сравнение с прежним отчётом — по сумме с НДС, значения введены вручную.');
  v.izoh('Охват фактом — доля позиций сметы с внесённым фактом; факт вносится постепенно, поэтому «не закрыто Ф-2» отражает внесённую часть.');
  v.imzo(imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'СОСТАВИЛ'], o.imzo));
  return v;
}

export type ObosnovanieHujjat = { bytes: Uint8Array; faylNomi: string; varaqlar: number };

/** Hujjat: Свод + har obyekt uchun varaq. */
export function obosnovanieXlsx(modellar: readonly ObosnovanieModel[], o: ObosnovanieHujjatOpsiya): ObosnovanieHujjat {
  const band = new Set<string>(['свод']);
  const svod = svodVaraq(modellar, o);
  const varaqlar = modellar.map((m, i) => obyektVaraq(m, varaqNomi(m.obyektNomi, band, i + 1), o));
  const { bytes } = rasmiyKitob([svod, ...varaqlar], { tur: 'obosnovanie' });
  const sana = o.sana ?? bugunSana();
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.nom, hujjat: 'ОБОСНОВАНИЕ_НЕ_ЗАКРЫТО_Ф2', davr: sana }), varaqlar: varaqlar.length + 1 };
}

/** Eski hisobot kiritilgan matn → son (bo'sh / noto'g'ri — null). Probel, nuqta-vergul ajratgichlar qo'llab-quvvatlanadi. */
export function sonOqi(matn: string): number | null {
  const t = matn.replace(/[\s ]/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
