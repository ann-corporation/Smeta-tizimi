/**
 * F2 tayyorlash - bo'limlarning TO'LIQ daraxti (egasi 2026-10-25, "Yo'l 2,5 km"): uchastka/fayl -> razdel -> ichki razdel.
 * f2Qur faqat ishi bor eng ichki bo'limlarni qaytaradi (ota yo'lisiz) - shu sabab ikki uchastkadagi bir xil nomli
 * «2.ЗЕМЛЯНЫЕ РАБОТЫ» aralashib ko'rinardi. Bu yerda smeta qatorlaridan ota zanjiri tiklanadi (sof funksiya, UI'siz;
 * Fakt jurnali daraxti ham shundan foydalanishi mumkin). Asl smeta o'zgarmaydi, narx to'qilmaydi.
 * Egasi qoidasi: har smeta fayli/varag'i = alohida F2 - eng yuqori razdel (ildiz) F2 chegarasi.
 */
import type { T2Qator } from '../api/supabase';
import { pulYaxlit } from './ish-abc';
import type { F2Bolim, F2Qator } from './f2-tayyor';
import { katKesimYigish, type KatKesim } from './ustamali-summa';

/** «Bo'limsiz» (razdelsiz) ishlar kaliti. */
export const BOLIMSIZ_KALIT = -1;

export type IerarxiyaTugun = {
  kalit: number; id: number | null; nom: string; ota: number | null; daraja: number;
  /** Eng yuqori razdel (uchastka/fayl) kaliti va nomi. */
  ildiz: number; ildizNom: string;
  /** Ildizdan shu tugunning o'zigacha nomlar (breadcrumb). */
  yol: string[];
  farzandlar: number[];
  /** Avlodlari bilan: smetadagi jami ish/material soni va F2 ga olish mumkinlari (fakt bor / jami). */
  jami: number; mumkin: number;
  /** F2 ga olish mumkin hajmning ustamasiz summasi (NDS siz, narxi bor resurslardan) va kategoriya kesimi (ustamali uchun). */
  summa: number; katKesim: KatKesim;
};
export type Ierarxiya = {
  tugunlar: IerarxiyaTugun[];
  byKalit: Map<number, IerarxiyaTugun>;
};

type Ulush = { kat: string | null; summa: number };

/** Bo'limdagi ishlar/alohida materiallarning mumkin hajm bo'yicha summalari (narxi yo'q resurs o'tkazib yuboriladi, 0 deb olinmaydi). */
function bolimUlushlari(b: F2Bolim): Ulush[] {
  const out: Ulush[] = [];
  for (const i of b.ishlar) {
    if (i.mumkin <= 0) continue;
    for (const r of i.resurslar) {
      if (!r.avto || r.norma == null || r.norma <= 0 || r.taklifNarx == null) continue;
      out.push({ kat: r.kat, summa: i.mumkin * r.norma * r.taklifNarx });
    }
  }
  for (const r of b.alohida) if (r.mumkin > 0 && r.taklifNarx != null) out.push({ kat: r.kat, summa: r.mumkin * r.taklifNarx });
  return out;
}

export function f2BolimIerarxiya(rows: readonly T2Qator[], bolimlar: readonly F2Bolim[]): Ierarxiya {
  const bolimById = new Map<number, F2Bolim>();
  for (const b of bolimlar) bolimById.set(b.id ?? BOLIMSIZ_KALIT, b);
  const bolalar = new Map<number | null, T2Qator[]>();
  for (const r of rows) { const k = r.ota_id ?? null; if (!bolalar.has(k)) bolalar.set(k, []); bolalar.get(k)!.push(r); }
  for (const a of bolalar.values()) a.sort((p, q) => (p.tartib ?? 0) - (q.tartib ?? 0) || p.id - q.id);

  const tugunlar: IerarxiyaTugun[] = [];
  const byKalit = new Map<number, IerarxiyaTugun>();
  const ulushlar = new Map<number, Ulush[]>();
  /** Razdel to'g'ridan-to'g'ri ostidagi ish (bl) va alohida material (mat/ob) soni - f2Qur bilan bir xil yurish. */
  const oziJami = (ota: number | null) => (bolalar.get(ota) ?? []).filter((r) => r.tur === 'bl' || r.tur === 'mat' || r.tur === 'ob').length;

  const yarat = (kalit: number, id: number | null, nom: string, ota: IerarxiyaTugun | null, daraja: number): IerarxiyaTugun => {
    const b = bolimById.get(kalit);
    const u = b ? bolimUlushlari(b) : [];
    const t: IerarxiyaTugun = {
      kalit, id, nom, ota: ota?.kalit ?? null, daraja,
      ildiz: ota ? ota.ildiz : kalit, ildizNom: ota ? ota.ildizNom : nom, yol: [...(ota?.yol ?? []), nom], farzandlar: [],
      jami: oziJami(id), mumkin: b ? b.ishlar.length + b.alohida.length : 0, summa: 0, katKesim: katKesimYigish([], () => null, () => null),
    };
    ulushlar.set(kalit, u);
    tugunlar.push(t); byKalit.set(kalit, t);
    ota?.farzandlar.push(kalit);
    return t;
  };
  const yur = (ota: IerarxiyaTugun | null, otaId: number | null, daraja: number) => {
    for (const r of bolalar.get(otaId) ?? []) {
      if (r.tur !== 'rz') continue;
      const t = yarat(r.id, r.id, r.nom || 'Bo‘lim', ota, daraja);
      yur(t, r.id, daraja + 1);
    }
  };
  yur(null, null, 0);
  // Razdelsiz ishlar (ildiz darajada bl/mat/ob) - alohida «Bo'limsiz» tugun, f2Qur bilan bir xil.
  const yetim = oziJami(null);
  if (yetim > 0 || bolimById.has(BOLIMSIZ_KALIT)) {
    const t = yarat(BOLIMSIZ_KALIT, null, 'Bo‘limsiz', null, 0);
    t.jami = oziJami(null);
  }

  // Pastdan yuqoriga yig'ish: avlodlar jami/mumkin/summa ota tugunga qo'shiladi (tugunlar DFS tartibida - teskari yurish).
  for (let i = tugunlar.length - 1; i >= 0; i--) {
    const t = tugunlar[i];
    t.katKesim = katKesimYigish(ulushlar.get(t.kalit) ?? [], (x) => x.kat, (x) => x.summa);
    t.summa = pulYaxlit((ulushlar.get(t.kalit) ?? []).reduce((s, x) => s + x.summa, 0));
    if (t.ota != null) {
      const o = byKalit.get(t.ota)!;
      o.jami += t.jami; o.mumkin += t.mumkin;
      ulushlar.get(o.kalit)!.push(...(ulushlar.get(t.kalit) ?? []));
    }
  }
  // Ichida hech narsa (ish/material) yo'q razdellar daraxtdan olib tashlanadi.
  const bor = tugunlar.filter((t) => t.jami > 0 || t.mumkin > 0);
  const borSet = new Set(bor.map((t) => t.kalit));
  const out = bor.map((t) => ({ ...t, farzandlar: t.farzandlar.filter((k) => borSet.has(k)) }));
  const m = new Map(out.map((t) => [t.kalit, t]));
  return { tugunlar: out, byKalit: m };
}

/** Tugun va uning barcha avlodlari kalitlari (tanlangan razdelning hamma ichki ishlari ko'rinsin). */
export function avlodKalitlari(ier: Ierarxiya, kalit: number): Set<number> {
  const out = new Set<number>();
  const stek = [kalit];
  while (stek.length) {
    const k = stek.pop()!;
    if (out.has(k)) continue;
    out.add(k);
    for (const f of ier.byKalit.get(k)?.farzandlar ?? []) stek.push(f);
  }
  return out;
}

/**
 * Chap daraxtda ko'rinadigan tugunlar: ota zanjiri to'liq ochiq; tanlangan tugunning ajdodlari doim ochiq.
 * `faqatMumkin` - F2 ga olish mumkin ishi bo'lmagan tugunlar yashiriladi.
 */
export function korinadiganTugunlar(ier: Ierarxiya, kengaygan: ReadonlySet<number>, tanlangan: number | null, faqatMumkin = false): IerarxiyaTugun[] {
  const ochiq = new Set(kengaygan);
  for (let k = tanlangan != null ? ier.byKalit.get(tanlangan)?.ota ?? null : null; k != null; k = ier.byKalit.get(k)?.ota ?? null) ochiq.add(k);
  return ier.tugunlar.filter((t) => {
    if (faqatMumkin && t.mumkin <= 0) return false;
    for (let o = t.ota; o != null; o = ier.byKalit.get(o)?.ota ?? null) if (!ochiq.has(o)) return false;
    return true;
  });
}

/** Bo'lim (f2Qur natijasi) uchun breadcrumb va ildiz: bo'lim id (null = bo'limsiz) -> tugun. */
export function bolimTuguni(ier: Ierarxiya, bolimId: number | null): IerarxiyaTugun | undefined {
  return ier.byKalit.get(bolimId ?? BOLIMSIZ_KALIT);
}

export type UchastkaUlushi = { ildiz: number; nom: string; soni: number };

/**
 * Tanlangan (kiritmasi bor) qatorlar qaysi uchastkalarga (eng yuqori razdel) tegishli. Bir nechta bo'lsa - ogohlantirish
 * va «uchastka bo'yicha alohida F2» tavsiyasi (bloklama emas). `qatorBolim`: ish/alohida resurs id -> bo'lim id.
 */
export function f2Uchastkalar(qatorlar: readonly F2Qator[], ier: Ierarxiya, qatorBolim: ReadonlyMap<number, number | null>): UchastkaUlushi[] {
  const m = new Map<number, UchastkaUlushi>();
  for (const q of qatorlar) {
    if (q.xato) continue;
    if (q.tur !== 'bl' && q.ishId != null) continue; // ishning resursi - ish bilan birga sanaladi
    const t = bolimTuguni(ier, qatorBolim.get(q.id) ?? null);
    if (!t) continue;
    const o = m.get(t.ildiz) ?? { ildiz: t.ildiz, nom: t.ildizNom, soni: 0 };
    o.soni++; m.set(t.ildiz, o);
  }
  return [...m.values()];
}
