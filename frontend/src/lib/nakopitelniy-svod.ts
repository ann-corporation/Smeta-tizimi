/**
 * Nakopitelniy — SHARTNOMA darajasi (CODEMAP «Nakopitelniy + F3 + Akt TN» qatorining kengaytmasi, yangi modul emas):
 * shartnoma (+ DS) → tasdiqlangan F2 (t2_akt) → F3 sotuv summasidan (t2_forma3.manba='sotuv') → to'lov (t2_tolov) → akt-sverka qoldig'i.
 *
 * Egasi (2026-10-23): «nakopitelniy, slichitelniy va shunga o'xshash hujjatlarni tayyor Smeta tizimimizdan foydalanib qilishimiz kerak»;
 * F3 = akt-sverkadagi har «Продажа» summasi.
 *
 * Qoidalar:
 *  - Hamma pul tiyinda (butun son); yaxlitlash faqat F3 dagi QQS ajratishda (Excel ROUND bilan bir xil).
 *  - Qoldiq (сальдо) = F3 (sotuv) − to'lov; «+» — buyurtmachi qarzi, «−» — pudratchi qarzi (ishlanmagan avans).
 *  - To'lov = avans + to'lov − qaytarim (t2_bux_dashboard bilan bir xil).
 *  - Joriy shartnoma summasi = eng oxirgi (sana, id) faol DS; DS yo'q — shartnomaning o'zi; noma'lum — null (NULL ≠ 0).
 *  - Tizimdagi F2 (t2_akt.hujjat_jami) — NAKRUTKASIZ to'g'ri xarajat; F3/to'lov/shartnoma — nakrutka va QQS bilan.
 *    Ular bir darajada EMAS: F2 ni shartnoma yoki F3 dan ayirmaymiz, faqat yonma-yon ko'rsatamiz (daraja yozuvi bilan).
 */

export type SvodObyekt = { id: number; nom: string };
export type SvodDs = { id: number; raqam: string; sana: string; jami_nds_bilan: number; izoh: string | null; versiya: number };
export type SvodF2 = { akt_id: number; obyekt_id: number; oy: string | null; raqam: string | null; hujjat_jami: number | null };
/** t2_forma3.holat: qoralama (tayyorlanmagan) → tayyor (tayyorlandi/yuborildi) → imzolangan. */
export type F3Holat = 'qoralama' | 'tayyor' | 'imzolangan';
export type SvodF3 = {
  id: number; manba: 'f2' | 'sotuv'; raqam: string | null; sotuv_sana: string | null; sotuv_summa: number | null; nds_foiz: number | null;
  davr_boshi: string | null; davr_oxiri: string | null; holat: F3Holat; bajarilgan_f2_summa: number | null; izoh: string | null; versiya: number;
};
export type TolovTur = 'avans' | 'tolov' | 'qaytarim';
export type SvodTolov = { id: number; sana: string; summa: number; tur: TolovTur; izoh: string | null };
export type SvodShartnoma = {
  id: number; loyiha_id: number | null; raqam: string; nom: string | null; asosiy: boolean; holat: string;
  jami_nds_bilan: number | null;
  obyektlar: SvodObyekt[]; ds: SvodDs[]; f2: SvodF2[]; f3: SvodF3[]; tolovlar: SvodTolov[];
};
/** Sotuv asosidagi F3 (sana va summa majburiy). */
export type SotuvF3 = SvodF3 & { manba: 'sotuv'; sotuv_sana: string; sotuv_summa: number };

/* ───────────── tiyin arifmetikasi ───────────── */

/** So'm → tiyin (butun). 0,005 chegarasi Excel ROUND kabi noldan uzoqqa. */
export function tiyin(x: number | null | undefined): number {
  if (x == null || !Number.isFinite(x)) return 0;
  const a = Math.round(Number((Math.abs(x) * 100).toPrecision(15)));
  return x < 0 ? -a : a;
}
export const somga = (t: number): number => t / 100;
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

export function tolovTiyin(t: Pick<SvodTolov, 'summa' | 'tur'>): number {
  return t.tur === 'qaytarim' ? -tiyin(t.summa) : tiyin(t.summa);
}

const sanaKalit = (s: string | null | undefined) => (s ?? '').slice(0, 10);
const oyKalit = (s: string | null | undefined) => (s ?? '').slice(0, 7);

export function sotuvF3lar(sh: Pick<SvodShartnoma, 'f3'>): SotuvF3[] {
  return sh.f3.filter((f): f is SotuvF3 => f.manba === 'sotuv' && f.sotuv_sana != null && f.sotuv_summa != null)
    .slice().sort((a, b) => sanaKalit(a.sotuv_sana).localeCompare(sanaKalit(b.sotuv_sana)) || a.id - b.id);
}

/* ───────────── shartnoma summasi (DS bilan) ───────────── */

export type JoriySumma = { summa: number | null; manba: 'ds' | 'shartnoma' | 'nomalum'; ds: SvodDs | null; asl: number | null };

export function joriyShartnomaSummasi(sh: Pick<SvodShartnoma, 'ds' | 'jami_nds_bilan'>, sanagacha?: string): JoriySumma {
  const amaldagi = sh.ds
    .filter((d) => !sanagacha || sanaKalit(d.sana) <= sanaKalit(sanagacha))
    .slice().sort((a, b) => sanaKalit(a.sana).localeCompare(sanaKalit(b.sana)) || a.id - b.id);
  const oxirgi = amaldagi[amaldagi.length - 1] ?? null;
  const asl = sh.jami_nds_bilan ?? null;
  if (oxirgi) return { summa: oxirgi.jami_nds_bilan, manba: 'ds', ds: oxirgi, asl };
  if (asl != null) return { summa: asl, manba: 'shartnoma', ds: null, asl };
  return { summa: null, manba: 'nomalum', ds: null, asl: null };
}

/* ───────────── akt-sverka ───────────── */

export type SverkaQator = { sana: string; tur: 'sotuv' | TolovTur; hujjat: string; debet: number; kredit: number; qoldiq: number; manbaId: number };
export type Sverka = {
  dan: string | null; gacha: string | null;
  boshlangich: number; qatorlar: SverkaQator[]; debetJami: number; kreditJami: number; yakuniy: number;
  /** boshlangich + debet − kredit = yakuniy (tiyinigacha). */
  tenglik: boolean;
};

const TOLOV_NOM: Record<TolovTur, string> = { avans: 'Аванс', tolov: 'Оплата', qaytarim: 'Возврат' };

/**
 * Davr (dan..gacha, chegaralar kiradi) bo'yicha akt-sverka. Boshlang'ich qoldiq — davrdan oldingi BARCHA sotuv − to'lov.
 * Bir kunda avval sotuvlar, keyin to'lovlar (id tartibida).
 */
export function sverkaHisobla(sh: Pick<SvodShartnoma, 'f3' | 'tolovlar'>, o?: { dan?: string | null; gacha?: string | null }): Sverka {
  const dan = o?.dan ? sanaKalit(o.dan) : null;
  const gacha = o?.gacha ? sanaKalit(o.gacha) : null;
  type Hod = { sana: string; tartib: number; id: number; tur: SverkaQator['tur']; hujjat: string; debet: number; kredit: number };
  const hodisalar: Hod[] = [
    ...sotuvF3lar(sh).map((s) => ({ sana: sanaKalit(s.sotuv_sana), tartib: 0, id: s.id, tur: 'sotuv' as const,
      hujjat: `Продажа${s.raqam ? ` № ${s.raqam}` : ''}`, debet: tiyin(s.sotuv_summa), kredit: 0 })),
    ...sh.tolovlar.map((t) => ({ sana: sanaKalit(t.sana), tartib: 1, id: t.id, tur: t.tur,
      hujjat: TOLOV_NOM[t.tur] ?? t.tur, debet: 0, kredit: tolovTiyin(t) })),
  ].sort((a, b) => a.sana.localeCompare(b.sana) || a.tartib - b.tartib || a.id - b.id);

  let boshlangich = 0;
  const qatorlar: SverkaQator[] = [];
  for (const h of hodisalar) {
    if (dan && h.sana < dan) { boshlangich += h.debet - h.kredit; continue; }
    if (gacha && h.sana > gacha) continue;
    const oldingi = qatorlar.length ? qatorlar[qatorlar.length - 1].qoldiq : boshlangich;
    qatorlar.push({ sana: h.sana, tur: h.tur, hujjat: h.hujjat, debet: h.debet, kredit: h.kredit, qoldiq: oldingi + h.debet - h.kredit, manbaId: h.id });
  }
  const debetJami = sum(qatorlar.map((q) => q.debet));
  const kreditJami = sum(qatorlar.map((q) => q.kredit));
  const yakuniy = qatorlar.length ? qatorlar[qatorlar.length - 1].qoldiq : boshlangich;
  return { dan, gacha, boshlangich, qatorlar, debetJami, kreditJami, yakuniy, tenglik: boshlangich + debetJami - kreditJami === yakuniy };
}

/* ───────────── shartnoma svodi ───────────── */

export type F2Oy = { oy: string; soni: number; summa: number; nakopitel: number };
export type SvodOgohlantirish = { kod: string; matn: string };
export type ShartnomaSvodi = {
  shartnoma: SvodShartnoma;
  joriy: JoriySumma;
  /** Tiyinda. f2 — nakrutkasiz to'g'ri xarajat (tizim), qolganlari — QQS bilan. */
  f2: number; f3: number; tolov: number; qoldiq: number;
  /** F3 − joriy shartnoma summasi (> 0 — DS kerak); noma'lum — null. */
  f3Oshish: number | null;
  f3Foiz: number | null;
  f2Oylar: F2Oy[]; f2Soni: number; f2SummasizSoni: number;
  f3Soni: number; f3Imzolangan: number; f3F2danSoni: number;
  ogohlantirishlar: SvodOgohlantirish[];
};

const somMatn = (t: number) => (t / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function shartnomaSvodi(sh: SvodShartnoma): ShartnomaSvodi {
  const joriy = joriyShartnomaSummasi(sh);
  const shT = joriy.summa == null ? null : tiyin(joriy.summa);
  const sotuv = sotuvF3lar(sh);
  const f2 = sum(sh.f2.map((a) => tiyin(a.hujjat_jami)));
  const f3 = sum(sotuv.map((s) => tiyin(s.sotuv_summa)));
  const tolov = sum(sh.tolovlar.map(tolovTiyin));

  const oylar = new Map<string, { soni: number; summa: number }>();
  for (const a of sh.f2) {
    const k = oyKalit(a.oy) || '—';
    const v = oylar.get(k) ?? { soni: 0, summa: 0 };
    v.soni++; v.summa += tiyin(a.hujjat_jami);
    oylar.set(k, v);
  }
  let nak = 0;
  const f2Oylar: F2Oy[] = [...oylar.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([oy, v]) => {
    nak += v.summa;
    return { oy, soni: v.soni, summa: v.summa, nakopitel: nak };
  });

  const ogoh: SvodOgohlantirish[] = [];
  if (shT == null) ogoh.push({ kod: 'SHARTNOMA_SUMMASI_YOQ', matn: 'Shartnoma summasi kiritilmagan — oshish hisoblanmaydi.' });
  if (shT != null && f3 > shT) ogoh.push({ kod: 'F3_SHARTNOMADAN_OSHDI', matn: `Sotuv (F3) shartnomadan ${somMatn(f3 - shT)} so‘m ko‘p — qo‘shimcha kelishuv (DS) kerak.` });
  if (tolov > f3) ogoh.push({ kod: 'AVANS_ISHLANMAGAN', matn: `To‘lov sotuvdan ${somMatn(tolov - f3)} so‘m ko‘p — ishlanmagan avans.` });
  const summasiz = sh.f2.filter((a) => a.hujjat_jami == null).length;
  if (summasiz) ogoh.push({ kod: 'F2_SUMMASIZ', matn: `${summasiz} ta tasdiqlangan F2 da hujjat summasi yo‘q.` });
  const imzosiz = sotuv.filter((s) => s.holat !== 'imzolangan').length;
  if (imzosiz) ogoh.push({ kod: 'F3_IMZOLANMAGAN', matn: `${imzosiz} ta F3 buyurtmachi tomonidan imzolanmagan.` });

  return {
    shartnoma: sh, joriy, f2, f3, tolov, qoldiq: f3 - tolov,
    f3Oshish: shT == null ? null : f3 - shT,
    f3Foiz: shT ? Math.round((f3 / shT) * 10000) / 100 : null,
    f2Oylar, f2Soni: sh.f2.length, f2SummasizSoni: summasiz,
    f3Soni: sotuv.length, f3Imzolangan: sotuv.length - imzosiz, f3F2danSoni: sh.f3.filter((f) => f.manba === 'f2').length,
    ogohlantirishlar: ogoh,
  };
}

export type SvodJami = { shartnomaSumma: number; shartnomaNomalum: number; f2: number; f3: number; tolov: number; qoldiq: number };

export function svodJami(svodlar: readonly ShartnomaSvodi[]): SvodJami {
  const bor = svodlar.filter((s) => s.joriy.summa != null);
  return {
    shartnomaSumma: sum(bor.map((s) => tiyin(s.joriy.summa))), shartnomaNomalum: svodlar.length - bor.length,
    f2: sum(svodlar.map((s) => s.f2)), f3: sum(svodlar.map((s) => s.f3)), tolov: sum(svodlar.map((s) => s.tolov)), qoldiq: sum(svodlar.map((s) => s.qoldiq)),
  };
}

/* ───────────── F3 — sotuv summasidan ───────────── */

export type F3SotuvHisob = {
  f3: SotuvF3;
  /** Davr: saqlangani; bir kunlik (boshi = oxiri) bo'lsa — oldingi sotuv sanasidan; birinchisida — o'sha sana. */
  davrBoshi: string; davrOxiri: string;
  /** Tiyinda: [QQSsiz, QQS, QQS bilan] — davr (shu F3), yil boshidan, qurilish boshidan (shu F3 ham kiradi). */
  davr: [number, number, number]; yilBoshidan: [number, number, number]; boshidan: [number, number, number];
  /** Shu sanaga joriy shartnoma summasi (DS bilan), tiyinda; noma'lum — null. */
  shartnoma: number | null;
};

/** QQS bilan summadan [QQSsiz, QQS, jami]: QQSsiz = ROUND(jami / (1 + st), 2), QQS = jami − QQSsiz. */
export function qqsAjrat(jamiTiyin: number, ndsFoiz = 12): [number, number, number] {
  const siz = tiyin(jamiTiyin / 100 / (1 + ndsFoiz / 100));
  return [siz, jamiTiyin - siz, jamiTiyin];
}

export function f3SotuvdanHisobla(sh: Pick<SvodShartnoma, 'f3' | 'ds' | 'jami_nds_bilan'>, f3Id: number): F3SotuvHisob | null {
  const tartib = sotuvF3lar(sh);
  const i = tartib.findIndex((s) => s.id === f3Id);
  if (i < 0) return null;
  const s = tartib[i];
  const sana = sanaKalit(s.sotuv_sana);
  const yil = sana.slice(0, 4);
  const gacha = tartib.slice(0, i + 1);
  const jamiQqs = (xs: SotuvF3[]) => {
    const r: [number, number, number] = [0, 0, 0];
    for (const x of xs) { const q = qqsAjrat(tiyin(x.sotuv_summa), x.nds_foiz ?? 12); r[0] += q[0]; r[1] += q[1]; r[2] += q[2]; }
    return r;
  };
  const oldingi = i > 0 ? tartib[i - 1] : null;
  const saqlangan = s.davr_boshi != null && s.davr_oxiri != null && sanaKalit(s.davr_boshi) < sanaKalit(s.davr_oxiri);
  const j = joriyShartnomaSummasi(sh, sana);
  return {
    f3: s,
    davrBoshi: saqlangan ? sanaKalit(s.davr_boshi) : (oldingi ? sanaKalit(oldingi.sotuv_sana) : sana),
    davrOxiri: saqlangan ? sanaKalit(s.davr_oxiri) : sana,
    davr: qqsAjrat(tiyin(s.sotuv_summa), s.nds_foiz ?? 12),
    yilBoshidan: jamiQqs(gacha.filter((x) => sanaKalit(x.sotuv_sana).startsWith(yil))),
    boshidan: jamiQqs(gacha),
    shartnoma: j.summa == null ? null : tiyin(j.summa),
  };
}

/* ───────────── akt-sverka matnini o'qish (nusxa-joylash) ───────────── */

export type SverkaImportQator = { sana: string; tur: 'sotuv' | TolovTur; raqam: string | null; summa: number };
export type SverkaImportNatija = { qatorlar: SverkaImportQator[]; xatolar: { qator: number; matn: string }[] };

const sonOqi = (v: string): number | null => {
  const t = v.replace(/[\s ]/g, '').replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, '');
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
};
const sanaOqi = (v: string): string | null => {
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(v.trim());
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
};

/**
 * Akt-sverkadan nusxa olingan qatorlar (Tab bilan): «Дата | Документ | Дебет | Кредит».
 * «Продажа/реализация» — sotuv (debet), «Оплата/Поступление/платеж» — to'lov (kredit), «Возврат» — qaytarim.
 * Raqam — «(N от …)» yoki «№ N». Sarlavha/jami qatorlar o'tkaziladi; tushunilmagani — xatolar ro'yxatiga.
 */
export function sverkaMatniniOqi(matn: string): SverkaImportNatija {
  const qatorlar: SverkaImportQator[] = [];
  const xatolar: { qator: number; matn: string }[] = [];
  matn.split(/\r?\n/).forEach((xom, n) => {
    const k = xom.split('\t').map((x) => x.trim());
    if (!k.some(Boolean)) return;
    const sana = sanaOqi(k[0] ?? '');
    if (!sana) return;
    const hujjat = (k[1] ?? '').toLowerCase();
    const debet = sonOqi(k[2] ?? '');
    const kredit = sonOqi(k[3] ?? '');
    const raqam = /\(\s*([^\s()]+)\s+от/i.exec(k[1] ?? '')?.[1] ?? /№\s*([^\s,()]+)/.exec(k[1] ?? '')?.[1] ?? null;
    let tur: SverkaImportQator['tur'] | null = null;
    if (/продаж|реализац|сотув/.test(hujjat)) tur = 'sotuv';
    else if (/возврат|qaytar/.test(hujjat)) tur = 'qaytarim';
    else if (/оплат|поступлен|плат[её]ж|tolov|to‘lov|to'lov/.test(hujjat)) tur = 'tolov';
    const summa = tur === 'sotuv' ? debet : tur ? (kredit ?? debet) : null;
    if (!tur || summa == null || summa === 0) { xatolar.push({ qator: n + 1, matn: xom.slice(0, 200) }); return; }
    qatorlar.push({ sana, tur, raqam, summa: Math.abs(summa) });
  });
  return { qatorlar, xatolar };
}
