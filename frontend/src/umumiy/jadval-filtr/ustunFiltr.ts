/**
 * Excel uslubidagi ustun filtrlari (egasi 2026-10-27: «hamma ustunlarda professional, xuddi Excel'dagidek
 * filtr bo'lishi kerak»). Sof funksiyalar — UI (UstunFiltrTugma) va hook (useJadvalFiltr) shu yerga tayanadi.
 *
 * Qoidalar:
 * - Bo'sh qiymat (null/undefined/'') — alohida «(bo'sh)» qiymati; NULL ≠ 0 (0 — haqiqiy son).
 * - Bir nechta ustun filtri — VA (hammasi bajarilishi kerak), Excel'dagidek.
 * - Daraxtli jadvalda mos qator topilsa, uning barcha ota qatorlari (razdel/blok) ham ko'rsatiladi.
 */
export type UstunTur = 'matn' | 'son';
export type Qiymat = string | number | null | undefined;

export type Ustun<R> = {
  kalit: string;
  nom: string;
  tur: UstunTur;
  qiymat: (r: R) => Qiymat;
};

export type SonAmal = '>' | '>=' | '<' | '<=' | '=' | '!=' | 'oraliq';
export type MatnAmal = 'ichida' | 'ichida_emas' | 'boshlanadi' | 'teng';

export type UstunFiltr = {
  /** Belgilangan qiymatlar (kalit ko'rinishida). undefined — hammasi. */
  tanlangan?: string[];
  son?: { amal: SonAmal; a: number; b?: number };
  matn?: { amal: MatnAmal; q: string };
};
export type FiltrHolat = Record<string, UstunFiltr | undefined>;
export type Saralash = { kalit: string; yonalish: 'osish' | 'kamayish' } | null;

export const BOSH = '\u0000bo‘sh';

export function qiymatKalit(v: Qiymat): string {
  if (v == null || v === '') return BOSH;
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : BOSH;
  return String(v).trim() || BOSH;
}

export function filtrFaol(f: UstunFiltr | undefined): boolean {
  return !!f && (f.tanlangan != null || f.son != null || (f.matn != null && f.matn.q.trim() !== ''));
}

export function faolSoni(h: FiltrHolat): number {
  return Object.values(h).filter(filtrFaol).length;
}

function sonMos(v: Qiymat, s: NonNullable<UstunFiltr['son']>): boolean {
  if (v == null || v === '') return false;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return false;
  switch (s.amal) {
    case '>': return n > s.a;
    case '>=': return n >= s.a;
    case '<': return n < s.a;
    case '<=': return n <= s.a;
    case '=': return Math.abs(n - s.a) < 1e-9;
    case '!=': return Math.abs(n - s.a) >= 1e-9;
    case 'oraliq': return n >= Math.min(s.a, s.b ?? s.a) && n <= Math.max(s.a, s.b ?? s.a);
  }
}

function matnMos(v: Qiymat, m: NonNullable<UstunFiltr['matn']>): boolean {
  const q = m.q.trim().toLowerCase();
  if (!q) return true;
  const s = v == null ? '' : String(v).toLowerCase();
  switch (m.amal) {
    case 'ichida': return s.includes(q);
    case 'ichida_emas': return !s.includes(q);
    case 'boshlanadi': return s.startsWith(q);
    case 'teng': return s.trim() === q;
  }
}

export function ustunMos<R>(r: R, u: Ustun<R>, f: UstunFiltr | undefined): boolean {
  if (!filtrFaol(f)) return true;
  const v = u.qiymat(r);
  if (f!.tanlangan && !f!.tanlangan.includes(qiymatKalit(v))) return false;
  if (f!.son && !sonMos(v, f!.son)) return false;
  if (f!.matn && !matnMos(v, f!.matn)) return false;
  return true;
}

export function qatorMos<R>(r: R, ustunlar: readonly Ustun<R>[], h: FiltrHolat, istisno?: string): boolean {
  for (const u of ustunlar) if (u.kalit !== istisno && !ustunMos(r, u, h[u.kalit])) return false;
  return true;
}

export type Daraxt<R> = { id: (r: R) => number | string; ota: (r: R) => number | string | null | undefined; /** Faqat barg (ish) qatorlar filtrlanadi; ota qatorlar mos bolasi bo'lsa ko'rinadi. */ barg?: (r: R) => boolean };

/** Filtr + saralash. Daraxtda: mos qatorlar + ularning ota-bobolari; saralash daraxtda qo'llanmaydi (tartib buzilmasin). */
export function filtrla<R>(rows: readonly R[], ustunlar: readonly Ustun<R>[], h: FiltrHolat, saralash: Saralash = null, daraxt?: Daraxt<R>): R[] {
  const faol = faolSoni(h) > 0;
  let natija: R[];
  if (!faol) natija = rows.slice();
  else if (!daraxt) natija = rows.filter((r) => qatorMos(r, ustunlar, h));
  else {
    const byId = new Map(rows.map((r) => [daraxt.id(r), r]));
    const qol = new Set<number | string>();
    for (const r of rows) {
      if (daraxt.barg && !daraxt.barg(r)) continue;
      if (!qatorMos(r, ustunlar, h)) continue;
      qol.add(daraxt.id(r));
      for (let o = daraxt.ota(r); o != null && !qol.has(o); o = byId.get(o) ? daraxt.ota(byId.get(o)!) : null) qol.add(o);
    }
    natija = rows.filter((r) => qol.has(daraxt.id(r)));
  }
  if (saralash && !daraxt) {
    const u = ustunlar.find((x) => x.kalit === saralash.kalit);
    if (u) {
      const k = saralash.yonalish === 'osish' ? 1 : -1;
      natija.sort((a, b) => {
        const va = u.qiymat(a); const vb = u.qiymat(b);
        const ba = va == null || va === ''; const bb = vb == null || vb === '';
        if (ba || bb) return ba === bb ? 0 : ba ? 1 : -1; // bo'shlar doim oxirida
        if (u.tur === 'son') return (Number(va) - Number(vb)) * k;
        return String(va).localeCompare(String(vb), 'ru', { numeric: true }) * k;
      });
    }
  }
  return natija;
}

/** Ustundagi noyob qiymatlar va soni — boshqa ustunlar filtri hisobga olinadi (Excel'dagidek kaskad). */
export function noyobQiymatlar<R>(rows: readonly R[], ustunlar: readonly Ustun<R>[], u: Ustun<R>, h: FiltrHolat, barg?: (r: R) => boolean): { kalit: string; v: Qiymat; soni: number }[] {
  const m = new Map<string, { kalit: string; v: Qiymat; soni: number }>();
  for (const r of rows) {
    if (barg && !barg(r)) continue;
    if (!qatorMos(r, ustunlar, h, u.kalit)) continue;
    const v = u.qiymat(r); const k = qiymatKalit(v);
    const x = m.get(k); if (x) x.soni++; else m.set(k, { kalit: k, v, soni: 1 });
  }
  const arr = [...m.values()];
  arr.sort((a, b) => {
    if (a.kalit === BOSH || b.kalit === BOSH) return a.kalit === BOSH ? 1 : -1;
    return u.tur === 'son' ? Number(a.v) - Number(b.v) : String(a.v).localeCompare(String(b.v), 'ru', { numeric: true });
  });
  return arr;
}
