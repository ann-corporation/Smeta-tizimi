/**
 * «Fakt savati» — kiritilganlar ro'yxati (egasi 2026-10-24). Ish + uning mat/ob resurslari BITTA guruh (resurslar
 * ish hajmiga proporsional avtomatik, har biri alohida tuzatilishi mumkin); mehnat/mashina (rs) fakt hisobida
 * ish faktidan norma bo'yicha o'zi hosil bo'ladi (savatga qo'shilmaydi). Hajm BLOKLANMAYDI — oshsa faqat belgi.
 * Yozish: BITTA fakt hujjati (`fakt_yoz_v2`), asl smeta qatorlariga tegilmaydi.
 */
import type { T2Qator } from '../../api/supabase';
import type { NakrutkaKoeffitsientlar } from '../../api/t2-nakrutka';
import { kategoriyaKf, nakrutkaKat, NAKRUTKA_KATLAR, type NakrutkaKat } from '../nakrutka-podval';
import type { MiqdorTuri } from './parse';
import type { XotiraNomzod } from './moslash';

export interface SavatQator {
  qatorId: number;
  tur: string;
  kod: string | null;
  nom: string;
  birlik: string | null;
  /** Fakt ga qo'shiladigan hajm (smeta birligida). */
  hajm: number;
  smetaHajm: number | null;
  qoldiq: number | null;
  /** Birlik narx (ish uchun — resurslari bo'yicha 1 birlik summa; resurs uchun — o'z narxi). */
  narx: number | null;
  kat: string | null;
  /** Guruh: ish qatori id si (resurs shu ishga tegishli) yoki null (ish/mustaqil). */
  guruh: number | null;
  /** Operator hajmni qo'lda o'zgartirgan — ish hajmi o'zgarganda qayta hisoblanmaydi. */
  qolda: boolean;
  manba: 'matn' | 'qidiruv' | 'boshqa';
  /** Hajm qoldiqdan oshdi (faqat belgi). */
  oshdi: boolean;
  /** Ish (bl) uchun: 1 birlik ishning kategoriyalar bo'yicha summasi (ustama hisobi uchun). */
  birlikKat?: Partial<Record<NakrutkaKat, number>>;
}

const yaxlit = (x: number) => Math.round(x * 1e6) / 1e6;
const son = (v: unknown): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

/** So'rov miqdori → smeta birligidagi hajm. foiz — qoldiqdan %; hammasi — butun qoldiq. */
export function hajmniHisobla(turi: MiqdorTuri, qiymat: number | null, n: Pick<XotiraNomzod, 'qoldiq' | 'miqdor'>): number | null {
  if (turi === 'hammasi') return n.qoldiq != null && n.qoldiq > 0 ? yaxlit(n.qoldiq) : null;
  if (turi === 'foiz') return qiymat == null || n.qoldiq == null ? null : yaxlit(n.qoldiq * qiymat / 100);
  if (turi === 'son') return n.miqdor != null ? yaxlit(n.miqdor) : qiymat != null ? yaxlit(qiymat) : null;
  return null;
}

/** Ish (bl) ostidagi 1 birlik ish uchun kategoriyalar bo'yicha summa (barcha resurslar: ЧЕЛ/МАШ/МАТ/ОБ…). */
export function birlikKatSummalari(rows: readonly T2Qator[], ishId: number): { narx: number | null; kat: Partial<Record<NakrutkaKat, number>> } {
  const ish = rows.find((r) => r.id === ishId);
  const h = son(ish?.hajm);
  const kat: Partial<Record<NakrutkaKat, number>> = {};
  if (!ish || !h) return { narx: null, kat };
  const bolalar = new Map<number, T2Qator[]>();
  for (const r of rows) if (r.ota_id != null) { const a = bolalar.get(r.ota_id); if (a) a.push(r); else bolalar.set(r.ota_id, [r]); }
  let jami = 0;
  const yur = (id: number) => {
    for (const c of bolalar.get(id) ?? []) {
      if (c.tur === 'rs' || c.tur === 'mat' || c.tur === 'ob') {
        const s = son(c.summa);
        if (s != null) { jami += s; const k = nakrutkaKat(c.kat) ?? (c.tur === 'ob' ? 'ОБ' : c.tur === 'mat' ? 'МАТ' : null); if (k) kat[k] = (kat[k] ?? 0) + s / h; }
      }
      if (c.tur === 'rz') yur(c.id);
    }
  };
  yur(ishId);
  return { narx: jami ? jami / h : null, kat };
}

function savatQatori(r: T2Qator, hajm: number, manba: SavatQator['manba'], guruh: number | null, n?: XotiraNomzod): SavatQator {
  const smeta = son(r.hajm);
  const qoldiq = n?.qoldiq ?? null;
  return { qatorId: r.id, tur: r.tur ?? 'bl', kod: r.kod, nom: r.nom ?? '', birlik: r.birlik, hajm, smetaHajm: n?.smetaHajm ?? smeta, qoldiq,
    narx: n?.narx ?? son(r.narx), kat: r.kat ?? null, guruh, qolda: false, manba, oshdi: qoldiq != null && (qoldiq >= 0 ? hajm > qoldiq * 1.001 + 1e-9 : hajm < qoldiq * 1.001 - 1e-9) };
}

/**
 * Savatga qo'shish. Ish (bl) bo'lsa — uning mat/ob resurslari ham guruh bo'lib proporsional hajm bilan qo'shiladi.
 * Shu qator allaqachon savatda bo'lsa — hajm qo'shiladi.
 */
export function savatgaQosh(savat: readonly SavatQator[], rows: readonly T2Qator[], n: XotiraNomzod, hajm: number, manba: SavatQator['manba']): SavatQator[] {
  const r = rows.find((x) => x.id === n.qatorId);
  if (!r || !(Number.isFinite(hajm)) || hajm === 0) return [...savat];
  const out = savat.map((x) => ({ ...x }));
  const qosh = (q: SavatQator) => {
    const i = out.findIndex((x) => x.qatorId === q.qatorId);
    if (i < 0) { out.push(q); return; }
    const yangiHajm = yaxlit(out[i].hajm + q.hajm);
    const qoldiq = out[i].qoldiq;
    out[i] = { ...out[i], hajm: yangiHajm, oshdi: qoldiq != null && (qoldiq >= 0 ? yangiHajm > qoldiq * 1.001 + 1e-9 : yangiHajm < qoldiq * 1.001 - 1e-9) };
  };
  const ish = savatQatori(r, hajm, manba, null, n);
  if (r.tur === 'bl') {
    const b = birlikKatSummalari(rows, r.id);
    ish.birlikKat = b.kat; ish.narx = b.narx;
  }
  qosh(ish);
  if (r.tur === 'bl') {
    const ishSmeta = son(r.hajm);
    if (ishSmeta) {
      for (const c of rows) {
        if (c.ota_id !== r.id || (c.tur !== 'mat' && c.tur !== 'ob')) continue;
        const ch = son(c.hajm);
        if (!ch) continue;
        qosh(savatQatori(c, yaxlit(ch * hajm / ishSmeta), manba, r.id));
      }
    }
  }
  return out;
}

export function savatdanOlish(savat: readonly SavatQator[], qatorId: number): SavatQator[] {
  return savat.filter((x) => x.qatorId !== qatorId && x.guruh !== qatorId);
}

/** Hajmni qo'lda o'zgartirish; ish hajmi o'zgarsa qo'lda tegilmagan resurslar qayta proporsional hisoblanadi. */
export function savatHajmi(savat: readonly SavatQator[], rows: readonly T2Qator[], qatorId: number, hajm: number): SavatQator[] {
  const bor = savat.find((x) => x.qatorId === qatorId);
  if (!bor) return [...savat];
  const ishSmeta = bor.tur === 'bl' ? son(rows.find((r) => r.id === qatorId)?.hajm) : null;
  return savat.map((x) => {
    if (x.qatorId === qatorId) {
      const oshdi = x.qoldiq != null && (x.qoldiq >= 0 ? hajm > x.qoldiq * 1.001 + 1e-9 : hajm < x.qoldiq * 1.001 - 1e-9);
      return { ...x, hajm: yaxlit(hajm), qolda: x.guruh != null ? true : x.qolda, oshdi };
    }
    if (x.guruh === qatorId && !x.qolda && ishSmeta) {
      const ch = son(rows.find((r) => r.id === x.qatorId)?.hajm);
      return ch ? { ...x, hajm: yaxlit(ch * hajm / ishSmeta) } : x;
    }
    return x;
  });
}

/** fakt_yoz_v2 paketi: bitta hujjat, faqat nolmas hajm. */
export const savatPaketi = (savat: readonly SavatQator[]): Array<{ qator_id: number; hajm: number }> =>
  savat.filter((x) => x.hajm !== 0).map((x) => ({ qator_id: x.qatorId, hajm: x.hajm }));

export interface SavatJami { asos: number; ustamali: number | null; narxsiz: number }

/**
 * Savat jami: asos = to'g'ridan-to'g'ri xarajat; ustamali = kategoriya koeffitsientlari (obyekt shartnomasi) bilan.
 * Ish — o'z resurslari bo'yicha (kategoriyalar bilan); ish guruhidagi mat/ob alohida qo'shilmaydi (ikki marta sanalmasin).
 */
export function savatJami(savat: readonly SavatQator[], nk: Partial<NakrutkaKoeffitsientlar> | null): SavatJami {
  const kat = Object.fromEntries(NAKRUTKA_KATLAR.map((k) => [k, 0])) as Record<NakrutkaKat, number>;
  let asos = 0, narxsiz = 0, ustamaBor = true;
  for (const x of savat) {
    if (x.guruh != null) continue;   // ish guruhidagi resurs — ish summasiga kiradi
    if (x.tur === 'bl') {
      const bk = x.birlikKat ?? {};
      const kk = Object.keys(bk) as NakrutkaKat[];
      if (!kk.length) { narxsiz += 1; continue; }
      for (const k of kk) { const s = (bk[k] ?? 0) * x.hajm; kat[k] += s; asos += s; }
      continue;
    }
    if (x.narx == null) { narxsiz += 1; continue; }
    const s = x.narx * x.hajm; asos += s;
    const k = nakrutkaKat(x.kat) ?? (x.tur === 'ob' ? 'ОБ' : x.tur === 'mat' ? 'МАТ' : null);
    if (k) kat[k] += s; else ustamaBor = false;
  }
  let ustamali: number | null = null;
  if (nk && ustamaBor) { const kf = kategoriyaKf(nk); ustamali = NAKRUTKA_KATLAR.reduce((t, k) => t + kat[k] * kf[k], 0); }
  return { asos: Math.round(asos * 100) / 100, ustamali: ustamali == null ? null : Math.round(ustamali * 100) / 100, narxsiz };
}
