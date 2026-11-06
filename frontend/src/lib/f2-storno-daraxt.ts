/**
 * F2 STORNO tanlov daraxti (egasi 2026-11-06: «ierarxik ko'rsatish va qulaylik»): УЧАСТОК/РАЗДЕЛ → ish (bl) → resurs/material.
 *
 * Yangi daraxt quruvchi YO'Q: tuzilma — storno hujjat blokining o'zi ishlatadigan `eskiDaraxt` (lib/f2-hujjat), tartib —
 * `daraxtTartibida` (smeta daraxti tartibi), pul — yagona yadro `yigindi2`. Bu modul faqat UI uchun tugun kalitlari va
 * tanlov yig'indilarini beradi; storno yuki (`stornoQur`) o'zgarmaydi.
 *
 * Pul qoidasi (eskiDaraxtYoz bilan bir xil): har qatorning O'Z summasi bir marta; ish summasi = o'z summasi + resurslari.
 * NULL ≠ 0: summasi noma'lum qator «noma'lum» sanaladi; faqat resurslari bor ishning bo'sh o'z summasi noma'lum EMAS
 * (ish puli resurslarida — hujjatda ish katagi resurslar yig'indisi).
 */
import { eskiDaraxt, type EskiBlokQator, type EskiEl } from './f2-hujjat';
import { daraxtTartibida } from './daraxt-tartibi';
import { qatorSumma, yigindi2 } from './hisob-yadro';
import { qidiruvdaBor } from '../i18n/lotin-kirill';
import { mashinistMehnati } from './narx-bildirishnoma';
import { stornoQator, stornoQatorimi, type SaqlanganAktQator, type StornoDaraxtTugun, type StornoManbaQator } from './f2-storno';

export type StornoBarg = {
  kalit: string; aktId: number; qatorId: number; tur: string;
  kod: string | null; nom: string; birlik: string | null;
  /** Storno hajmi (minus) — o'tkazilmaydigan qatorda null. */
  hajm: number | null;
  /** Storno summasi (minus); noma'lum — null (0 emas). */
  summa: number | null;
  tanlanadi: boolean;
  otkaz?: 'nol' | 'hajmsiz';
};

export type StornoTugun = {
  id: string;
  k: 'akt' | 'bolim' | 'ish' | 'qator';
  nom: string;
  daraja: number;
  ota: string | null;
  q?: StornoBarg;
  bolalar: StornoTugun[];
  /** Shu tugun (o'zi bilan) ostidagi TANLANADIGAN barg kalitlari. */
  barglar: string[];
};

export type StornoDaraxt = { ildiz: StornoTugun[]; byId: Map<string, StornoTugun> };

type Nom = { tur?: string | null; kod?: string | null; nom?: string | null; birlik?: string | null };

export function stornoDaraxtQur(p: {
  bloklar: ReadonlyArray<{ aktId: number; aktNom: string; qatorlar: readonly StornoManbaQator[] }>;
  daraxt: readonly StornoDaraxtTugun[] | null;
  nomlar: ReadonlyMap<number, Nom>;
  kalit: (aktId: number, qatorId: number) => string;
}): StornoDaraxt {
  const daraxt = p.daraxt ?? [];
  const rowById = new Map(daraxt.map((r) => [r.id, { id: r.id, ota_id: r.ota_id, tur: r.tur, nom: r.nom ?? '' }]));
  const tartib = new Map(daraxtTartibida(daraxt.map((r) => ({ qator_id: r.id, ota_id: r.ota_id, tartib: r.tartib ?? null }))).map((r, i) => [r.qator_id, i]));
  const byId = new Map<string, StornoTugun>();
  const kop = p.bloklar.length > 1;

  const ildiz: StornoTugun[] = [];
  for (const b of p.bloklar) {
    const barglar = new Map<number, StornoBarg>();
    const eski: EskiBlokQator[] = [];
    const tartiblangan = [...b.qatorlar].map((x, i) => ({ x, i }))
      .sort((a, c) => (tartib.get(a.x.qator_id) ?? Infinity) - (tartib.get(c.x.qator_id) ?? Infinity) || a.i - c.i);
    for (const { x } of tartiblangan) {
      if (barglar.has(x.qator_id)) continue;
      const n = p.nomlar.get(x.qator_id);
      const tur = rowById.get(x.qator_id)?.tur || n?.tur || '';
      const s = stornoQator(x, b.aktId);
      const q: StornoBarg = {
        kalit: p.kalit(b.aktId, x.qator_id), aktId: b.aktId, qatorId: x.qator_id, tur,
        kod: n?.kod ?? null, nom: n?.nom || `#${x.qator_id}`, birlik: n?.birlik ?? null,
        hajm: s.tur === 'qator' ? s.qator.certifiedQuantity : null,
        summa: s.tur === 'qator' ? s.qator.certifiedAmount ?? null : null,
        tanlanadi: s.tur === 'qator', otkaz: s.tur === 'otkaz' ? s.sabab : undefined,
      };
      barglar.set(x.qator_id, q);
      eski.push({ id: x.qator_id, kod: q.kod, nom: q.nom, birlik: q.birlik, kat: null, tur, hajm: q.hajm, narx: null, summa: q.summa });
    }
    const pre = `${b.aktId}`;
    const qoy = (t: StornoTugun) => { byId.set(t.id, t); return t; };
    const bargTugun = (q: StornoBarg, k: 'ish' | 'qator', daraja: number, ota: string | null): StornoTugun =>
      qoy({ id: `${pre}:q:${q.qatorId}`, k, nom: q.nom, daraja, ota, q, bolalar: [], barglar: q.tanlanadi ? [q.kalit] : [] });
    const conv = (els: readonly EskiEl[], daraja: number, ota: string | null): StornoTugun[] => els.map((el) => {
      if (el.k === 'tugun') {
        const t = qoy({ id: `${pre}:rz:${el.t.id}`, k: 'bolim', nom: el.t.nom, daraja, ota, bolalar: [], barglar: [] });
        t.bolalar = conv(el.t.ichki, daraja + 1, t.id);
        t.barglar = t.bolalar.flatMap((c) => c.barglar);
        return t;
      }
      if (el.k === 'ish') {
        const t = bargTugun(barglar.get(el.ish.bl.id)!, 'ish', daraja, ota);
        t.bolalar = el.ish.resurslar.map((r) => bargTugun(barglar.get(r.id)!, 'qator', daraja + 1, t.id));
        t.barglar = [...t.barglar, ...t.bolalar.flatMap((c) => c.barglar)];
        return t;
      }
      return bargTugun(barglar.get(el.q.id)!, 'qator', daraja, ota);
    });
    if (kop) {
      const a = qoy({ id: `${pre}:akt`, k: 'akt', nom: `F2 №${b.aktNom}`, daraja: 0, ota: null, bolalar: [], barglar: [] });
      a.bolalar = conv(eskiDaraxt(eski, rowById), 1, a.id);
      a.barglar = a.bolalar.flatMap((c) => c.barglar);
      ildiz.push(a);
    } else {
      ildiz.push(...conv(eskiDaraxt(eski, rowById), 0, null));
    }
  }
  return { ildiz, byId };
}

/** Tugun yig'indisi: tanlangan va saqlab qolinadigan qismlar (summa — faqat ma'lum qism, noma'lumlar soni alohida). */
export type StornoJam = {
  barchasi: number;
  soni: number; jami: number; nomalum: number;
  qolganSoni: number; qolganJami: number; qolganNomalum: number;
};

/** Bitta o'tishda barcha tugunlar yig'indisi (post-order). */
export function stornoJamlar(ildiz: readonly StornoTugun[], tanlangan: ReadonlySet<string>): Map<string, StornoJam> {
  const out = new Map<string, StornoJam>();
  const yur = (t: StornoTugun): StornoJam => {
    const bolalar = t.bolalar.map(yur);
    const tan: Array<number | null> = []; const qol: Array<number | null> = [];
    let soni = 0; let nomalum = 0; let qolganSoni = 0; let qolganNomalum = 0;
    const q = t.q;
    if (q?.tanlanadi) {
      // Audit M1: ish (bl) summasi resurslarida, mashinist mehnati narxi mashina-soatda — «summa noma'lum» sanalmaydi.
      const nomalummi = q.summa == null && q.tur !== 'bl' && !(t.k === 'ish' && t.bolalar.length > 0) && !mashinistMehnati({ nom: q.nom } as Parameters<typeof mashinistMehnati>[0]);
      if (tanlangan.has(q.kalit)) { soni++; tan.push(q.summa); if (nomalummi) nomalum++; }
      else { qolganSoni++; qol.push(q.summa); if (nomalummi) qolganNomalum++; }
    }
    for (const b of bolalar) {
      soni += b.soni; nomalum += b.nomalum; tan.push(b.jami);
      qolganSoni += b.qolganSoni; qolganNomalum += b.qolganNomalum; qol.push(b.qolganJami);
    }
    const j: StornoJam = { barchasi: t.barglar.length, soni, jami: yigindi2(tan), nomalum, qolganSoni, qolganJami: yigindi2(qol), qolganNomalum };
    out.set(t.id, j);
    return j;
  };
  for (const t of ildiz) yur(t);
  return out;
}

/** Ildiz bo'yicha umumiy yig'indi (footer). */
export function stornoUmumiy(ildiz: readonly StornoTugun[], jam: ReadonlyMap<string, StornoJam>): StornoJam {
  const xs = ildiz.map((t) => jam.get(t.id)!).filter(Boolean);
  const s = (f: (x: StornoJam) => number) => xs.reduce((a, x) => a + f(x), 0);
  return {
    barchasi: s((x) => x.barchasi), soni: s((x) => x.soni), nomalum: s((x) => x.nomalum), jami: yigindi2(xs.map((x) => x.jami)),
    qolganSoni: s((x) => x.qolganSoni), qolganNomalum: s((x) => x.qolganNomalum), qolganJami: yigindi2(xs.map((x) => x.qolganJami)),
  };
}

export type StornoBelgiHolat = 'bor' | 'yoq' | 'qisman';
export const stornoBelgiHolat = (j: StornoJam | undefined): StornoBelgiHolat =>
  !j || j.soni === 0 ? 'yoq' : j.soni >= j.barchasi ? 'bor' : 'qisman';

/** Tugun belgisini almashtirish: to'liq belgilangan bo'lsa — hammasi olinadi, aks holda hammasi belgilanadi. */
export function stornoTugunAlmashtir(t: StornoTugun, j: StornoJam | undefined, tanlangan: ReadonlySet<string>): Set<string> {
  const n = new Set(tanlangan);
  const olish = stornoBelgiHolat(j) === 'bor';
  for (const k of t.barglar) { if (olish) n.delete(k); else n.add(k); }
  return n;
}

/** Ish o'z resurslaridan qisman ajratilgan (bir qismi belgilangan, bir qismi yo'q) ishlar. */
export function stornoBolinganIshlar(byId: ReadonlyMap<string, StornoTugun>, jam: ReadonlyMap<string, StornoJam>): StornoTugun[] {
  const out: StornoTugun[] = [];
  for (const t of byId.values()) if (t.k === 'ish' && t.bolalar.length > 0 && stornoBelgiHolat(jam.get(t.id)) === 'qisman') out.push(t);
  return out;
}

/**
 * Qidiruv: mos tugunlar, ularning ajdodlari (ko'rinadi va ochiladi) va mos bo'lim/ishning butun avlodi.
 * Bo'sh qidiruv — null (filtr yo'q).
 */
export function stornoQidir(ildiz: readonly StornoTugun[], byId: ReadonlyMap<string, StornoTugun>, qidir: string): { korinadi: Set<string>; ochiq: Set<string> } | null {
  if (!qidir.trim()) return null;
  const korinadi = new Set<string>(); const ochiq = new Set<string>();
  const avlod = (t: StornoTugun) => { korinadi.add(t.id); for (const b of t.bolalar) avlod(b); };
  const yur = (t: StornoTugun) => {
    if (qidiruvdaBor(`${t.q?.kod ?? ''} ${t.nom}`, qidir)) {
      avlod(t);
      for (let o = t.ota; o != null; o = byId.get(o)?.ota ?? null) { korinadi.add(o); ochiq.add(o); }
      return;
    }
    for (const b of t.bolalar) yur(b);
  };
  for (const t of ildiz) yur(t);
  return { korinadi, ochiq };
}

/* ── Pereraschet qoralamasidagi storno blokini tahrirlash (egasi 2026-11-06) ───────────────────────────────────── */
/** Qoralamadagi storno qatori (t2_akt_qator shakli, `stornoBlokniSaqla` kirishi). */
export type StornoSaqlanganQator = SaqlanganAktQator & {
  hajm: number | string | null; certified_quantity: number | string | null; certified_unit_price: number | string | null;
  certified_amount: number | string | null; provenance_status: string | null;
};
const sonS = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const stornoOfi = (x: { raw_snapshot?: unknown }): number | null => {
  const v = Number((x.raw_snapshot as { stornoOf?: unknown } | null)?.stornoOf);
  return Number.isSafeInteger(v) && v > 0 ? v : null;
};

/** Saqlangan storno qatorlaridan joriy tanlov (kalit) va mutlaq storno hajmi. */
export function stornoBlokHolati(saqlangan: readonly SaqlanganAktQator[], kalit: (aktId: number, qatorId: number) => string): { tanlangan: Set<string>; hajm: Map<string, number>; manbaAktlar: number[] } {
  const tanlangan = new Set<string>(); const hajm = new Map<string, number>(); const aktlar: number[] = [];
  for (const x of saqlangan) {
    if (!stornoQatorimi(x)) continue;
    const a = stornoOfi(x); if (a == null) continue;
    if (!aktlar.includes(a)) aktlar.push(a);
    const k = kalit(a, x.qator_id); tanlangan.add(k);
    const q = sonS((x as { certified_quantity?: unknown }).certified_quantity) ?? sonS((x as { hajm?: unknown }).hajm);
    if (q != null) hajm.set(k, Math.abs(q));
  }
  return { tanlangan, hajm, manbaAktlar: aktlar };
}

/**
 * Tahrirlangan tanlov/hajmdan storno blokini qayta quradi (saqlash — mavjud `stornoBlokniSaqla` → `t2_f2_qoralama_yangila_v1`).
 *  - O'zgarmagan qator — saqlangan nusxa AYNAN (raw_snapshot ham).
 *  - Yangi/qayta storno — `stornoQator` (eski F2 qiymati aynan); qisman hajm — summa = yadro `qatorSumma(−h, narx)`; narx yo'q — noma'lum qoladi.
 *  - Hajm 0 < h ≤ eski F2 hajmi (oshsa — eski hajm).
 *  - Bir qator hujjatda bitta storno qatori (server qoidasi): ikkinchi eski F2 dagisi tashlanadi (`toqnashdi`).
 *  - Manbasi o'qilmagan saqlangan storno qatori hech qachon jim tashlanmaydi — aynan qoladi.
 */
export function stornoBlokQur(
  manba: ReadonlyArray<{ aktId: number; qatorlar: readonly StornoManbaQator[] }>,
  tanlangan: ReadonlySet<string>, hajm: ReadonlyMap<string, number>,
  saqlangan: readonly SaqlanganAktQator[], kalit: (aktId: number, qatorId: number) => string,
): { qatorlar: StornoSaqlanganQator[]; toqnashdi: number; qisman: number } {
  const eski = new Map<string, SaqlanganAktQator>();
  for (const x of saqlangan) { const a = stornoQatorimi(x) ? stornoOfi(x) : null; if (a != null) eski.set(kalit(a, x.qator_id), x); }
  const qamrov = new Set<string>();
  const band = new Set<number>();
  const out: StornoSaqlanganQator[] = [];
  let toqnashdi = 0; let qisman = 0;
  for (const b of manba) {
    for (const x of b.qatorlar) {
      const k = kalit(b.aktId, x.qator_id); qamrov.add(k);
      if (!tanlangan.has(k)) continue;
      const s = stornoQator(x, b.aktId);
      if (s.tur !== 'qator') continue;
      if (band.has(x.qator_id)) { toqnashdi++; continue; }
      band.add(x.qator_id);
      const toliq = Math.abs(s.qator.certifiedQuantity);
      const h0 = hajm.get(k);
      const h = h0 != null && h0 > 0 && h0 < toliq ? h0 : toliq;
      if (h < toliq) qisman++;
      const saq = eski.get(k);
      const saqQ = saq ? sonS((saq as { certified_quantity?: unknown }).certified_quantity) : null;
      if (saq && saqQ != null && Math.abs(saqQ) === h) { out.push(saq as StornoSaqlanganQator); continue; }
      const narx = s.qator.certifiedUnitPrice ?? null;
      const summa = h === toliq ? (s.qator.certifiedAmount ?? null) : (narx != null && s.qator.certifiedAmount != null ? qatorSumma(-h, narx) : null);
      const aniq = narx != null && summa != null;
      const qty = h === 0 ? 0 : -h;
      out.push({
        qator_id: x.qator_id, hajm: qty, certified_quantity: qty,
        certified_unit_price: aniq ? narx : null, certified_amount: aniq ? summa : null,
        provenance_status: aniq ? null : 'price_intentionally_absent',
        raw_snapshot: { ...s.qator.rawSnapshot, enteredQuantity: qty, enteredUnitPrice: aniq ? narx : undefined, enteredAmount: aniq ? summa : undefined, ...(h < toliq ? { stornoAslHajm: -toliq } : {}) },
      });
    }
  }
  // Manbasi o'qilmagan (yoki manbada topilmagan) saqlangan storno qatorlari — aynan qoladi.
  for (const [k, x] of eski) if (!qamrov.has(k) && !band.has(x.qator_id)) { band.add(x.qator_id); out.push(x as StornoSaqlanganQator); }
  return { qatorlar: out, toqnashdi, qisman };
}