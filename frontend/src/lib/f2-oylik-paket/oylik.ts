/**
 * OYLIK F2 PAKETI — bir oyning barcha F2 lari obyektlar kesimida (egasi 2026-10-25: «oylik F2 paketini tayyorlash»).
 * Faqat hisob/saralash (toza funksiyalar): yangi formula yo'q — summa `ustamaliHisobla` (Nakopitelniy bilan bir xil kaskad),
 * holat `bosqich`, jamlash `qosh` (f2-reestr).
 *
 * Qoidalar (egasi): summa NDS SIZ; NDS faqat oxirida alohida (ustamali = ИТОГО-4, NDS siz); NULL ≠ 0 — summasi noma'lum F2
 * jamga 0 bo'lib qo'shilmaydi, «noma'lum» deb alohida sanaladi; tekshiruvlar BLOKLAMAYDI — faqat ro'yxat.
 */
import type { F2Qator } from '../f2-tayyor';
import type { T2Qator } from '../../api/supabase';
import type { F2Tafsilot } from '../../api/t2-narx';
import type { F2HujjatKonteksti } from '../../api/f2-hujjat-kontekst';
import { f2AktKirish } from '../f2-akt-hujjat';
import { f2Hujjat } from '../f2-hujjat';
import { NDS_SUKUT_FOIZ, hisob, qqsSumma, yaxlit2 } from '../hisob-yadro';
import { f3SotuvdanHisobla, sotuvF3lar, type SotuvF3, type SvodShartnoma } from '../nakopitelniy-svod';
import type { NakrutkaKoeffitsientlar } from '../../api/t2-nakrutka';
import type { Podval } from '../nakrutka-konstruktor';
import { katKesimYigish } from '../ustamali-summa';
import { bosqich, qosh, type F2Bosqich, type ReestrAkt, type ReestrObyekt, type ReestrShartnoma, type Summa } from '../f2-reestr/reestr';

export const NDS_FOIZ = NDS_SUKUT_FOIZ;

/** «YYYY-MM» (yoki «YYYY-MM-DD») → «YYYY-MM»; noto'g'ri bo'lsa null. */
export function oyKaliti(s: string | null | undefined): string | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])/.exec(String(s ?? ''));
  return m ? `${m[1]}-${m[2]}` : null;
}

export type NomalumSabab = 'QATOR_YOQ' | 'KOEF_YOQ' | 'PODVAL_TOLIQ_EMAS' | 'KAT_NOMALUM';

/** Bitta F2 ning pul ko'rsatkichlari. `null` — noma'lum (0 emas). */
export type AktMoliya = {
  /** Ustamasiz to'liq summa (NDS siz). */
  ustamasiz: number | null;
  /** Ustamali = ИТОГО-4 (NDS siz). */
  ustamali: number | null;
  /** Kategoriyasi noma'lum qator bor — ustamali taxminiy (noma'lum qism ustamasiz qo'shilgan). */
  taxminiy: boolean;
  nds: number | null;
  jami: number | null;
  /** Narxsiz (summasi o'zi yo'q) qatorlar soni. */
  narxsizQator: number;
  qatorSoni: number;
  sabab: NomalumSabab | null;
};

/** Kategoriya faqat qatorning o'zidan; yo'q — noma'lum (tur bo'yicha МАТ/ОБ deb taxmin qilinmaydi — hisob yadrosi qoidasi). */
const katTuri = (x: F2Qator): string | null => x.kat ?? null;

/**
 * F2 qatorlaridan (f2AktKirish natijasi) summalar — hisob yadrosi (`hisob`): kat noma'lum qism ИТОГО-4 ga ustamasiz
 * (taxminiy), QQS bir marta. Qator yo'q bo'lsa — faqat hujjat jami (ustamasiz), ustamali noma'lum.
 */
export function aktMoliya(i: {
  qatorlar: readonly F2Qator[]; hujjatJami: number | null;
  koef: Partial<NakrutkaKoeffitsientlar> | null | undefined; podval?: Podval | null; ndsFoiz?: number;
}): AktMoliya {
  const ndsFoiz = i.ndsFoiz ?? NDS_FOIZ;
  const qatorlar = i.qatorlar.filter((x) => x.tur !== 'bl' && !x.xato);
  if (!qatorlar.length) {
    return { ustamasiz: i.hujjatJami == null ? null : yaxlit2(i.hujjatJami), ustamali: null, taxminiy: false, nds: null, jami: null, narxsizQator: 0, qatorSoni: 0, sabab: 'QATOR_YOQ' };
  }
  const kesim = katKesimYigish(qatorlar, katTuri, (x) => (x.narxsiz ? null : x.summa));
  const h = hisob(kesim, { podval: i.podval, koef: i.koef });
  const hechBiriYoq = h.nomalumSoni > 0 && yaxlit2(h.ustamasiz - h.nomalumSumma) === 0;
  let ustamali: number | null = null;
  let sabab: NomalumSabab | null = null;
  if (h.sabab === 'KOEF_YOQ' || h.sabab === 'PODVAL_TOLIQ_EMAS') sabab = h.sabab;
  else if (hechBiriYoq) sabab = 'KAT_NOMALUM';
  else ustamali = h.ustamali;
  const nds = qqsSumma(ustamali, ndsFoiz);
  return { ustamasiz: h.ustamasiz, ustamali, taxminiy: ustamali != null && h.taxminiy, nds, jami: ustamali == null || nds == null ? null : yaxlit2(ustamali + nds), narxsizQator: kesim.summasizSoni, qatorSoni: qatorlar.length, sabab };
}

const UCHASTKA_RE = /уч[аa]ст|uchast|(^|[^а-яa-z])уч\.?\s*№?\s*\d|(^|[^а-яa-z0-9])эо([^а-яa-z]|$)|(^|[^a-z0-9])eo([^a-z]|$)/i;

/**
 * Aktdagi qatorlar nechta «uchastka» (nomi uchastkaga o'xshash yuqori bo'lim) ga tegishli. Smeta ko'p uchastkali
 * bo'lsa, ular yuqori RZ bo'lib saqlanadi (SmetaYuklaNative). `>= 2` — F2 uchastkalar aralash.
 */
export function uchastkalarSoni(smeta: ReadonlyArray<{ id: number; ota_id: number | null; nom?: string | null }>, qatorIdlar: Iterable<number>): number {
  const byId = new Map(smeta.map((r) => [r.id, r]));
  const topilgan = new Set<number>();
  for (const id of qatorIdlar) {
    let r = byId.get(id);
    let guard = 0;
    while (r && r.ota_id != null && byId.has(r.ota_id) && guard++ < 64) r = byId.get(r.ota_id);
    if (r && UCHASTKA_RE.test(r.nom ?? '')) topilgan.add(r.id);
  }
  return topilgan.size;
}

/* ───────────── jadval qatori ───────────── */

export type PaketAkt = {
  akt: ReestrAkt;
  obyektNom: string;
  loyiha: string | null;
  bosqich: F2Bosqich;
  /** null — hali hisoblanmagan yoki o'qib bo'lmadi (`moliyaXato`). */
  moliya: AktMoliya | null;
  moliyaXato: boolean;
  /** Aktdagi qatorlar tegadigan uchastkalar soni (null — noma'lum). */
  uchastkalar: number | null;
};

export type PaketSozlama = { oy: string; loyihaId: number | null; shartnomaId: number | null };

/** Tanlangan oy (+ loyiha/shartnoma) F2 lari, obyekt nomi va F2 raqami bo'yicha tartiblangan. Bekor qilinganlar kirmaydi. */
export function oyAktlari(p: {
  aktlar: readonly ReestrAkt[]; obyektlar: readonly ReestrObyekt[];
  shartnomalar: ReadonlyMap<number, ReestrShartnoma[]>; loyihalar: ReadonlyMap<number, string>;
}, s: PaketSozlama): PaketAkt[] {
  const ob = new Map(p.obyektlar.map((o) => [o.id, o]));
  const out: PaketAkt[] = [];
  for (const a of p.aktlar) {
    if (oyKaliti(a.oy) !== s.oy) continue;
    const b = bosqich(a);
    if (b === 'bekor') continue;
    const o = ob.get(a.obyekt_id);
    if (s.loyihaId != null && o?.loyiha_id !== s.loyihaId) continue;
    if (s.shartnomaId != null && !(p.shartnomalar.get(a.obyekt_id) ?? []).some((x) => x.id === s.shartnomaId)) continue;
    out.push({ akt: a, obyektNom: o?.nom ?? String(a.obyekt_id), loyiha: o?.loyiha_id != null ? p.loyihalar.get(o.loyiha_id) ?? null : null,
      bosqich: b, moliya: null, moliyaXato: false, uchastkalar: null });
  }
  return out.sort((x, y) => x.obyektNom.localeCompare(y.obyektNom, 'ru') || String(x.akt.raqam ?? '').localeCompare(String(y.akt.raqam ?? ''), 'ru', { numeric: true }) || x.akt.id - y.akt.id);
}

/** Reestrdagi oylar (yangisi birinchi). */
export function mavjudOylar(aktlar: readonly Pick<ReestrAkt, 'oy'>[]): string[] {
  return [...new Set(aktlar.map((a) => oyKaliti(a.oy)).filter((x): x is string => !!x))].sort().reverse();
}

/** Sukut tanlov: faqat tasdiqlanganlar. */
export const sukutTanlov = (rows: readonly PaketAkt[]): Set<number> => new Set(rows.filter((r) => r.bosqich === 'tasdiqlangan').map((r) => r.akt.id));

/* ───────────── oy jami ───────────── */

export type OyJami = { soni: number; ustamasiz: Summa; ustamali: Summa; nds: Summa; jami: Summa; taxminiy: number };
const bos = (): Summa => ({ malum: 0, nomalum: 0, soni: 0 });

/** Har ustun alohida: summasi noma'lum F2 shu ustun `nomalum` iga tushadi, 0 bo'lib qo'shilmaydi. Hisoblanmagan qator ham noma'lum. */
export function oyJami(rows: readonly PaketAkt[], tanlov?: ReadonlySet<number>): OyJami {
  const j: OyJami = { soni: 0, ustamasiz: bos(), ustamali: bos(), nds: bos(), jami: bos(), taxminiy: 0 };
  for (const r of rows) {
    if (tanlov && !tanlov.has(r.akt.id)) continue;
    j.soni++;
    const m = r.moliya;
    // Qatorlar ochilmagan bo'lsa ham ustamasiz uchun reestrdagi hujjat jami bor.
    j.ustamasiz = qosh(j.ustamasiz, m ? m.ustamasiz : r.akt.hujjat_jami);
    j.ustamali = qosh(j.ustamali, m?.ustamali ?? null);
    j.nds = qosh(j.nds, m?.nds ?? null);
    j.jami = qosh(j.jami, m?.jami ?? null);
    if (m?.taxminiy) j.taxminiy++;
  }
  return j;
}

/* ───────────── tekshiruvlar (bloklamaydi) ───────────── */

export type TekshiruvKodi = 'qoralama' | 'raqamsiz' | 'raqam_takror' | 'summa_nomalum' | 'uchastka_aralash';
export type Tekshiruv = { kod: TekshiruvKodi; aktId: number; obyektNom: string; raqam: string | null; tafsilot?: string };

const raqamKalit = (r: string | null | undefined) => (r ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export function paketTekshiruvlari(rows: readonly PaketAkt[]): Tekshiruv[] {
  const out: Tekshiruv[] = [];
  const t = (r: PaketAkt, kod: TekshiruvKodi, tafsilot?: string) => out.push({ kod, aktId: r.akt.id, obyektNom: r.obyektNom, raqam: r.akt.raqam?.trim() || null, tafsilot });
  const takror = new Map<string, number>();
  for (const r of rows) { const k = raqamKalit(r.akt.raqam); if (k) takror.set(`${r.akt.obyekt_id}|${k}`, (takror.get(`${r.akt.obyekt_id}|${k}`) ?? 0) + 1); }
  for (const r of rows) {
    if (r.bosqich !== 'tasdiqlangan') t(r, 'qoralama', r.bosqich);
    const k = raqamKalit(r.akt.raqam);
    if (!k) t(r, 'raqamsiz');
    else if ((takror.get(`${r.akt.obyekt_id}|${k}`) ?? 0) > 1) t(r, 'raqam_takror');
    if (r.akt.hujjat_jami == null) t(r, 'summa_nomalum', 'hujjat_jami');
    else if (r.moliya) {
      if (r.moliya.sabab) t(r, 'summa_nomalum', r.moliya.sabab);
      else if (r.moliya.narxsizQator > 0) t(r, 'summa_nomalum', 'narxsiz');
      else if (r.moliya.taxminiy) t(r, 'summa_nomalum', 'KAT_NOMALUM_QISM');
    } else if (r.moliyaXato) t(r, 'summa_nomalum', 'oqilmadi');
    if ((r.uchastkalar ?? 0) >= 2) t(r, 'uchastka_aralash', String(r.uchastkalar));
  }
  return out;
}

/* ───────────── paket tarkibi ───────────── */

export type PaketFaylTuri = 'f2' | 'reestr' | 'forma3';
export type PaketFayl = { yol: string; bytes: Uint8Array; tur: PaketFaylTuri };

/** ZIP ichida takrorlanmas yo'l: bir xil nom bo'lsa «_2», «_3» qo'shiladi (kengaytmadan oldin). */
export function takrorsizYol(yol: string, band: ReadonlySet<string>): string {
  if (!band.has(yol.toLowerCase())) return yol;
  const nuqta = yol.lastIndexOf('.');
  const [bosh, kengaytma] = nuqta > yol.lastIndexOf('/') ? [yol.slice(0, nuqta), yol.slice(nuqta)] : [yol, ''];
  for (let n = 2; n < 1000; n++) { const y = `${bosh}_${n}${kengaytma}`; if (!band.has(y.toLowerCase())) return y; }
  return yol;
}

/** Fayllarni takrorsiz yo'llar bilan jamlaydi (kirish tartibi saqlanadi). */
export function paketFayllari(fayllar: ReadonlyArray<{ papka: string; nom: string; bytes: Uint8Array; tur: PaketFaylTuri }>): PaketFayl[] {
  const band = new Set<string>();
  return fayllar.map((f) => {
    const yol = takrorsizYol(f.papka ? `${f.papka}/${f.nom}` : f.nom, band);
    band.add(yol.toLowerCase());
    return { yol, bytes: f.bytes, tur: f.tur };
  });
}

/* ───────────── bitta akt: hisob va Excel ───────────── */

export type OyObyekt = { smeta: readonly T2Qator[]; tafsilot: readonly F2Tafsilot[]; kontekst: F2HujjatKonteksti };

/** Aktning pul ko'rsatkichlari va uchastkalar soni (F2 tarixidagi `f2AktKirish` bilan bir xil qatorlar). */
export function aktHisob(m: OyObyekt, akt: Pick<ReestrAkt, 'id' | 'hujjat_jami'>): { moliya: AktMoliya; uchastkalar: number } {
  const k = f2AktKirish(m.smeta, m.tafsilot.filter((l) => l.akt_id === akt.id));
  return {
    moliya: aktMoliya({ qatorlar: k.qatorlar, hujjatJami: akt.hujjat_jami, koef: m.kontekst.nakrutka, podval: m.kontekst.podval }),
    uchastkalar: uchastkalarSoni(m.smeta, k.qatorlar.map((q) => q.id)),
  };
}

/**
 * Saqlangan aktning Ф-2 Excel i — F2 tarixidagi «Ф-2 Excel» bilan bir xil (sertifikatlangan qiymatlar, formulasiz).
 * Chiqariladigan qator yo'q bo'lsa null.
 */
export function aktExcel(m: OyObyekt, a: Pick<ReestrAkt, 'id' | 'oy' | 'raqam'>, obyektNom: string): { bytes: Uint8Array; faylNomi: string; yacheykalar: number; topilmagan: number } | null {
  const k = f2AktKirish(m.smeta, m.tafsilot.filter((l) => l.akt_id === a.id));
  if (!k.qatorlar.length) return null;
  const h = f2Hujjat(k.bolimlar, k.qatorlar, {
    obyektNom, davr: a.oy || '', raqam: a.raqam, imzo: m.kontekst.imzo, shartnoma: m.kontekst.shartnoma,
    ndsFoiz: NDS_FOIZ, nakrutka: m.kontekst.nakrutka, podval: m.kontekst.podval, nkManba: m.kontekst.nkManba ?? null, formulasiz: true,
  });
  return { bytes: h.bytes, faylNomi: h.faylNomi, yacheykalar: h.yacheykalar, topilmagan: k.topilmagan };
}

/* ───────────── Forma-3 ───────────── */

/** Shu oyning sotuv F3 lari (tanlangan obyektlarning shartnomalari bo'yicha, takrorsiz). Qoralama holatdagilar paketga kirmaydi — soni alohida. */
export function oyF3lar(svod: readonly SvodShartnoma[], shartnomaIdlar: ReadonlySet<number>, oy: string): { tayyor: Array<{ sh: SvodShartnoma; f3: SotuvF3 }>; qoralama: number } {
  const tayyor: Array<{ sh: SvodShartnoma; f3: SotuvF3 }> = [];
  const korilgan = new Set<number>();
  let qoralama = 0;
  for (const sh of svod) {
    if (!shartnomaIdlar.has(sh.id)) continue;
    for (const f3 of sotuvF3lar(sh)) {
      if (oyKaliti(f3.sotuv_sana) !== oy || korilgan.has(f3.id)) continue;
      korilgan.add(f3.id);
      if (f3.holat === 'qoralama') { qoralama++; continue; }
      if (f3SotuvdanHisobla(sh, f3.id)) tayyor.push({ sh, f3 });
    }
  }
  return { tayyor, qoralama };
}