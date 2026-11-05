/**
 * ISH KARTASI — 1 amaliy birlikka ShNQ taqsimoti (egasi 2026-11-05).
 *
 * Karta tarkibli: asosiy norma + armatura materiali + armatura tayyorlash + ISHORALI istisno qatorlari + zakladnoy. Har bog'langan
 * smeta qatorining resurslari (yoki qatorning o'zi, resurssiz bo'lsa) 1 smeta birligiga keltiriladi va koeffitsientga ko'paytiriladi:
 * birlikka = resurs.summa / qator.hajm × koef. Istisno qatorida hajm va summa manfiy, koef ham manfiy — hissa manfiy chiqadi.
 * NULL ≠ 0: summa yo'q resurs — «narxsiz» (hisobga kirmaydi, sanaladi), koef/hajm yo'q qator — ogohlantirish.
 *
 * Pul (ustama, QQS) — FAQAT `lib/hisob-yadro` (`hisob`, obyektning o'z podvali). Bu fayl faqat kesim yig'adi.
 */
import { hisob, katAniqla, kesimgaQosh, bosKesim, podvalAniqla, yaxlit2, type Kat, type Kesim, type KoefKod, type Podval } from '../hisob-yadro';

export const BOSQICHLAR = ['opalubka', 'armatura', 'beton'] as const;
export type Bosqich = typeof BOSQICHLAR[number];
/** Material guruhi (kimdan: biz / usta). */
export type MatGuruh = Bosqich;
export type BosqichUlush = Record<Bosqich, number>;

/** Tizim sukuti (egasi misoli): opalubka 40 % / armatura 25 % / beton 35 %. Kompaniya va karta o'zgartiradi. */
export const SUKUT_ULUSH: BosqichUlush = { opalubka: 40, armatura: 25, beton: 35 };

export type BogRol = 'asosiy' | 'armatura_mat' | 'armatura_tayyorlash' | 'istisno' | 'zakladnoy' | 'boshqa';

export type SmetaResurs = {
  tur?: string | null; kat: string | null; kod?: string | null; nom: string | null; birlik: string | null;
  norma?: number | null; hajm: number | null; narx?: number | null; summa: number | null;
};
export type SmetaQator = {
  id: number; obyekt_id: number; obyekt_nom?: string | null; ota_id?: number | null; tartib?: number | null;
  tur: string | null; kat?: string | null; kod: string | null; nom: string | null; birlik: string | null;
  hajm: number | null; summa?: number | null; qoshimcha?: boolean | null; zamena?: boolean | null;
  bolalar: SmetaResurs[];
};
export type KartaBog = {
  qator_id: number | null; obyekt_id: number; rol: BogRol; koef: number | null;
  bosqich: Bosqich | null; material_guruh: MatGuruh | null;
  kod?: string | null; nom?: string | null; birlik?: string | null;
};

export type Qamrov = {
  bosqichlar: Record<Bosqich, boolean>;
  material: Record<MatGuruh, 'biz' | 'usta'>;
  mexanizm: 'biz' | 'usta';
};
/** Sukut: usta hamma bosqichni bajaradi, material va mexanizm — bizdan. */
export const SUKUT_QAMROV: Qamrov = {
  bosqichlar: { opalubka: true, armatura: true, beton: true },
  material: { opalubka: 'biz', armatura: 'biz', beton: 'biz' },
  mexanizm: 'biz',
};

/** Saqlangan (qisman) qamrovni to'liq qamrovga to'ldiradi. */
export function qamrovToldir(q: Partial<{ bosqichlar: Partial<Record<Bosqich, boolean>>; material: Partial<Record<MatGuruh, 'biz' | 'usta'>>; mexanizm: 'biz' | 'usta' }> | null | undefined): Qamrov {
  return {
    bosqichlar: { ...SUKUT_QAMROV.bosqichlar, ...(q?.bosqichlar ?? {}) },
    material: { ...SUKUT_QAMROV.material, ...(q?.material ?? {}) },
    mexanizm: q?.mexanizm ?? SUKUT_QAMROV.mexanizm,
  };
}

/** Ulush yaroqli: uchala bosqich 0..100, yig'indi 100 (±0,01). Server `_t2_ish_kartasi_ulush` bilan bir xil. */
export function ulushYaroqli(u: Partial<Record<Bosqich, number | null>> | null | undefined): u is BosqichUlush {
  if (!u) return false;
  let s = 0;
  for (const b of BOSQICHLAR) {
    const v = u[b];
    if (v == null || !Number.isFinite(v) || v < 0 || v > 100) return false;
    s += v;
  }
  return Math.abs(s - 100) <= 0.01;
}

/** Amaldagi ulush: karta → kompaniya (tur) → tizim sukuti. */
export function ulushTanla(karta: Partial<BosqichUlush> | null | undefined, kompaniya: Partial<BosqichUlush> | null | undefined): { ulush: BosqichUlush; manba: 'karta' | 'kompaniya' | 'sukut' } {
  if (ulushYaroqli(karta)) return { ulush: karta, manba: 'karta' };
  if (ulushYaroqli(kompaniya)) return { ulush: kompaniya, manba: 'kompaniya' };
  return { ulush: SUKUT_ULUSH, manba: 'sukut' };
}

const kalit = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/Ё/g, 'Е');

/** Resurs nomidan material guruhi: бетон/раствор → beton; арматура/каркас/сетка → armatura; qolgani (opalubka, sim, mix …) → opalubka. */
export function materialGuruhi(nom: string | null | undefined): MatGuruh {
  const n = kalit(nom);
  if (/АРМАТУР|КАРКАС|СЕТК/.test(n)) return 'armatura';
  if (/БЕТОН|РАСТВОР/.test(n) && !/ГАЗОБЕТОН|ПЕНОБЕТОН/.test(n)) return 'beton';
  return 'opalubka';
}

/** Kategoriya guruhi. */
export type Guruh = 'mehnat' | 'mashina' | 'material' | 'nomalum';
const guruhi = (k: Kat | null): Guruh => (k == null ? 'nomalum' : k === 'ЧЕЛ' ? 'mehnat' : k === 'МАШ' ? 'mashina' : 'material');

/** 1 amaliy birlikka bitta hissa (qator resursi × koef). */
export type Hissa = {
  qatorId: number; kat: Kat | null; katXom: string | null; guruh: Guruh; matGuruh: MatGuruh | null;
  /** null — asosiy norma: mehnat/mashina bosqich ulushi bo'yicha bo'linadi. */
  bosqich: Bosqich | null;
  qiymat: number;
  /** Ishchi mehnat sarfi, чел-ч (faqat ЧЕЛ + ЧЕЛ-Ч). */
  chelSoat: number | null;
};

export type QatorHolat = 'ok' | 'topilmadi' | 'koef_yoq' | 'hajm_yoq' | 'qoshimcha_chiqarildi';
export type QatorTahlil = { bog: KartaBog; qator: SmetaQator | null; holat: QatorHolat; hissalar: Hissa[]; narxsizSoni: number };

/** Bitta bog'langan qator → 1 amaliy birlikka hissalar. */
export function qatorHissalari(bog: KartaBog, qator: SmetaQator | null | undefined, o: { qoshimchaBilan?: boolean } = {}): QatorTahlil {
  if (!qator) return { bog, qator: null, holat: 'topilmadi', hissalar: [], narxsizSoni: 0 };
  if (qator.qoshimcha && !o.qoshimchaBilan) return { bog, qator, holat: 'qoshimcha_chiqarildi', hissalar: [], narxsizSoni: 0 };
  if (bog.koef == null || !Number.isFinite(bog.koef)) return { bog, qator, holat: 'koef_yoq', hissalar: [], narxsizSoni: 0 };
  if (qator.hajm == null || !Number.isFinite(qator.hajm) || qator.hajm === 0) return { bog, qator, holat: 'hajm_yoq', hissalar: [], narxsizSoni: 0 };
  const koef = bog.koef; const hajm = qator.hajm;
  const resurslar: SmetaResurs[] = qator.bolalar.length
    ? qator.bolalar
    : [{ kat: qator.kat ?? null, nom: qator.nom, birlik: qator.birlik, hajm: qator.hajm, summa: qator.summa ?? null }];
  const hissalar: Hissa[] = [];
  let narxsizSoni = 0;
  for (const r of resurslar) {
    const kat = katAniqla(r.kat);
    const g = guruhi(kat);
    const chel = kat === 'ЧЕЛ' && /ЧЕЛ/.test(kalit(r.birlik)) && r.hajm != null && Number.isFinite(r.hajm) ? (r.hajm / hajm) * koef : null;
    if (r.summa == null || !Number.isFinite(r.summa)) {
      narxsizSoni++;
      if (chel != null) hissalar.push({ qatorId: qator.id, kat, katXom: r.kat, guruh: g, matGuruh: null, bosqich: bog.bosqich, qiymat: 0, chelSoat: chel });
      continue;
    }
    hissalar.push({
      qatorId: qator.id, kat, katXom: r.kat, guruh: g,
      matGuruh: g === 'material' ? (bog.material_guruh ?? (bog.rol === 'armatura_mat' ? 'armatura' : materialGuruhi(r.nom))) : null,
      bosqich: bog.bosqich, qiymat: (r.summa / hajm) * koef, chelSoat: chel,
    });
  }
  return { bog, qator, holat: 'ok', hissalar, narxsizSoni };
}

/** Hissaning qamrovga kiruvchi ulushi (0..1). */
export function qamrovUlushi(h: Hissa, q: Qamrov, ulush: BosqichUlush): number {
  const bosqichUlush = () => (h.bosqich ? (q.bosqichlar[h.bosqich] ? 1 : 0)
    : BOSQICHLAR.reduce((s, b) => s + (q.bosqichlar[b] ? ulush[b] / 100 : 0), 0));
  if (h.guruh === 'mehnat') return bosqichUlush();
  if (h.guruh === 'mashina') return q.mexanizm === 'usta' ? bosqichUlush() : 0;
  if (h.guruh === 'material') return h.matGuruh && q.material[h.matGuruh] === 'usta' ? 1 : 0;
  return 0;
}

/** Hissalardan hisob-yadro kesimi (og'irlik bilan). */
export function hissaKesim(hissalar: readonly Hissa[], w: (h: Hissa) => number): Kesim {
  const k = bosKesim();
  for (const h of hissalar) {
    const x = w(h);
    if (x === 0 || h.qiymat === 0) continue;
    kesimgaQosh(k, h.katXom, h.qiymat * x);
  }
  return k;
}

/** 1 birlikka taqsimot (ustamasiz, to'g'ri xarajat). */
export type Taqsimot = {
  mehnat: BosqichUlush & { jami: number };
  chelSoat: number | null;
  mashina: number;
  material: Record<MatGuruh, number> & { jami: number };
  /** Kategoriyasi noma'lum summa (ustamaga kirmaydi). */
  nomalum: number;
  /** To'g'ri xarajat jami. */
  jami: number;
};

export function taqsimot(hissalar: readonly Hissa[], ulush: BosqichUlush): Taqsimot {
  const mehnat = { opalubka: 0, armatura: 0, beton: 0, jami: 0 };
  const material = { opalubka: 0, armatura: 0, beton: 0, jami: 0 };
  let mashina = 0; let nomalum = 0; let chel: number | null = null;
  for (const h of hissalar) {
    if (h.chelSoat != null) chel = (chel ?? 0) + h.chelSoat;
    if (h.guruh === 'mehnat') {
      for (const b of BOSQICHLAR) mehnat[b] += h.bosqich ? (h.bosqich === b ? h.qiymat : 0) : h.qiymat * ulush[b] / 100;
      mehnat.jami += h.qiymat;
    } else if (h.guruh === 'mashina') mashina += h.qiymat;
    else if (h.guruh === 'material' && h.matGuruh) { material[h.matGuruh] += h.qiymat; material.jami += h.qiymat; }
    else nomalum += h.qiymat;
  }
  return { mehnat, chelSoat: chel, mashina, material, nomalum, jami: mehnat.jami + mashina + material.jami + nomalum };
}

/** Qiymat uchligi (1 birlikka): ustamasiz → ustamali (QQS siz, ИТОГО-4) → QQS bilan. null — noma'lum. */
export type Uchlik = { ustamasiz: number; ustamali: number | null; qqsBilan: number | null; taxminiy: boolean; sabab: string | null };

export type UstamaKirish = { podval?: Podval | null; koef?: Partial<Record<KoefKod, number | null>> | null } | null;

/** Kesim → uchlik (yagona yadro `hisob`). Ustama ma'lumoti yo'q — ustamali/QQS null (0 emas). */
export function uchlik(k: Kesim, u: UstamaKirish): Uchlik {
  const podval = u ? podvalAniqla(u.podval, u.koef) : null;
  if (!podval) {
    const ustamasiz = yaxlit2(Object.values(k.summalar).reduce((s, x) => s + (x ?? 0), 0) + k.nomalum);
    return { ustamasiz, ustamali: null, qqsBilan: null, taxminiy: k.nomalumSoni > 0, sabab: 'KOEF_YOQ' };
  }
  const r = hisob(k, { podval });
  return { ustamasiz: r.ustamasiz, ustamali: r.ustamali, qqsBilan: r.qqsBilan, taxminiy: r.taxminiy, sabab: r.sabab };
}

export type ObyektNatija = {
  obyektId: number; obyektNom: string | null;
  /** Shu obyektdagi ish hajmi, amaliy birlikda (asosiy qator hajmi / koef). Noma'lum — null. */
  hajm: number | null;
  qatorlar: QatorTahlil[];
  taqsimot: Taqsimot;
  mehnat: Uchlik; qamrov: Uchlik; toliq: Uchlik;
  narxsizSoni: number;
  ogohlantirish: QatorTahlil[];
};

export type KartaKirish = {
  bog: readonly KartaBog[];
  qatorlar: ReadonlyMap<number, SmetaQator>;
  ulush: BosqichUlush;
  qamrov: Qamrov;
  ustama: (obyektId: number) => UstamaKirish;
  qoshimchaBilan?: boolean;
};

/** Karta → har obyekt bo'yicha 1 birlikka natija. */
export function kartaObyektlar(k: KartaKirish): ObyektNatija[] {
  const guruh = new Map<number, KartaBog[]>();
  for (const b of k.bog) { if (!guruh.has(b.obyekt_id)) guruh.set(b.obyekt_id, []); guruh.get(b.obyekt_id)!.push(b); }
  const out: ObyektNatija[] = [];
  for (const [oid, boglar] of guruh) {
    const qatorlar = boglar.map((b) => qatorHissalari(b, b.qator_id == null ? null : k.qatorlar.get(b.qator_id), { qoshimchaBilan: k.qoshimchaBilan }));
    const hissalar = qatorlar.flatMap((q) => q.hissalar);
    const asos = qatorlar.find((q) => q.bog.rol === 'asosiy' && q.holat === 'ok');
    const hajm = asos && asos.qator?.hajm != null && asos.bog.koef ? asos.qator.hajm / asos.bog.koef : null;
    const ust = k.ustama(oid);
    out.push({
      obyektId: oid, obyektNom: qatorlar.find((q) => q.qator?.obyekt_nom)?.qator?.obyekt_nom ?? null, hajm, qatorlar,
      taqsimot: taqsimot(hissalar, k.ulush),
      mehnat: uchlik(hissaKesim(hissalar, (h) => (h.guruh === 'mehnat' ? 1 : 0)), ust),
      qamrov: uchlik(hissaKesim(hissalar, (h) => qamrovUlushi(h, k.qamrov, k.ulush)), ust),
      toliq: uchlik(hissaKesim(hissalar, () => 1), ust),
      narxsizSoni: qatorlar.reduce((s, q) => s + q.narxsizSoni, 0),
      ogohlantirish: qatorlar.filter((q) => q.holat !== 'ok'),
    });
  }
  return out;
}

export type Oraliq = { ortacha: number | null; min: number | null; max: number | null };

/** Hajm bo'yicha tortilgan o'rtacha + min–max. Hajmi noma'lum obyekt og'irligi 1 (ogohlantiriladi). */
export function tortilganOrtacha(qiymatlar: ReadonlyArray<{ v: number | null; w: number | null }>): Oraliq {
  const bor = qiymatlar.filter((x): x is { v: number; w: number | null } => x.v != null && Number.isFinite(x.v));
  if (!bor.length) return { ortacha: null, min: null, max: null };
  let sw = 0; let sv = 0;
  for (const x of bor) { const w = x.w != null && x.w > 0 ? x.w : 1; sw += w; sv += x.v * w; }
  return { ortacha: sv / sw, min: Math.min(...bor.map((x) => x.v)), max: Math.max(...bor.map((x) => x.v)) };
}

export type KartaNatija = {
  obyektlar: ObyektNatija[];
  /** Hajmi noma'lum obyekt bor — o'rtacha og'irliksiz qo'shildi. */
  hajmNomalum: boolean;
  mehnat: Record<'ustamasiz' | 'ustamali' | 'qqsBilan', Oraliq>;
  qamrov: Record<'ustamasiz' | 'ustamali' | 'qqsBilan', Oraliq>;
  toliq: Record<'ustamasiz' | 'ustamali' | 'qqsBilan', Oraliq>;
  taqsimot: Record<'mehnat' | 'mashina' | 'beton_opalubka' | 'armatura' | 'jami', Oraliq> & { chelSoat: Oraliq };
};

export function kartaNatija(k: KartaKirish): KartaNatija {
  const obs = kartaObyektlar(k);
  const ort = (f: (o: ObyektNatija) => number | null) => tortilganOrtacha(obs.map((o) => ({ v: f(o), w: o.hajm })));
  const uch = (f: (o: ObyektNatija) => Uchlik) => ({
    ustamasiz: ort((o) => f(o).ustamasiz), ustamali: ort((o) => f(o).ustamali), qqsBilan: ort((o) => f(o).qqsBilan),
  });
  return {
    obyektlar: obs,
    hajmNomalum: obs.some((o) => o.hajm == null),
    mehnat: uch((o) => o.mehnat), qamrov: uch((o) => o.qamrov), toliq: uch((o) => o.toliq),
    taqsimot: {
      mehnat: ort((o) => o.taqsimot.mehnat.jami), mashina: ort((o) => o.taqsimot.mashina),
      beton_opalubka: ort((o) => o.taqsimot.material.beton + o.taqsimot.material.opalubka),
      armatura: ort((o) => o.taqsimot.material.armatura), jami: ort((o) => o.taqsimot.jami),
      chelSoat: ort((o) => o.taqsimot.chelSoat),
    },
  };
}

/** Usta narxi bilan solishtirish: farq % va summa × miqdor. Asos null/0 — null. */
export type Farq = { asos: number | null; farq: number | null; foiz: number | null; baravar: number | null; jamiFarq: number | null };
export function farq(ustaNarx: number | null | undefined, asos: number | null | undefined, miqdor?: number | null): Farq {
  if (ustaNarx == null || !Number.isFinite(ustaNarx) || asos == null || !Number.isFinite(asos)) return { asos: asos ?? null, farq: null, foiz: null, baravar: null, jamiFarq: null };
  const f = ustaNarx - asos;
  return {
    asos, farq: f, foiz: asos === 0 ? null : (f / asos) * 100, baravar: asos === 0 ? null : ustaNarx / asos,
    jamiFarq: miqdor != null && Number.isFinite(miqdor) ? f * miqdor : null,
  };
}

/** Hukm bo'laklari (matn ekranda `t()` bilan yig'iladi). */
export type Hukm = { mehnat: { baravar: number | null; foiz: number | null }; qamrov: { foiz: number | null } };
export function hukm(ustaNarx: number | null | undefined, mehnatUstamali: number | null | undefined, qamrovUstamali: number | null | undefined): Hukm {
  const m = farq(ustaNarx, mehnatUstamali); const q = farq(ustaNarx, qamrovUstamali);
  return { mehnat: { baravar: m.baravar, foiz: m.foiz }, qamrov: { foiz: q.foiz } };
}
