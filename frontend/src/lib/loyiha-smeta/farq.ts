/**
 * farq.ts — Loyiha | Smeta | Fakt farqlari va pul ta'siri. Hamma pul faqat lib/hisob-yadro orqali (qatorSumma, qqsBilan, yigindi2):
 * smeta birlik narxi (QQS siz) x farq; jami avval QQS bilan, so'ng QQS siz. Narx noma'lum -> null («—»), hech qachon 0 emas.
 * Faqat TASDIQLANGAN miqdorlar keladi (DB `t2_loyiha_farq_v1`); «taklif» sanoqi alohida va pulga kirmaydi.
 */
import { qatorSumma, qqsBilan, yigindi2, NDS_SUKUT_FOIZ } from '../hisob-yadro';
import { birlikkaQaytar } from './birlik';
import { kalitRaqamlar, bolimXaritasi, type SmetaQator } from './moslash';

export type FarqTuri = 'loyihada_bor_smetada_yoq' | 'smetada_bor_loyihada_yoq' | 'hajm_farqi' | 'almashgan' | 'fakt_oshgan';
export type QarorTuri = 'boglandi' | 'zamena' | 'qoshimcha' | 'pereraschet' | 'etibor_yoq';

export type Bog = { qator_id: number; kod: string | null; nom: string; birlik: string | null; hajm: number | null; narx: number | null; hajm_norm: number | null; fakt: number | null; fakt_norm: number | null };
export type FarqMiqdor = {
  miqdor_id: number; varaq: string; nom: string; belgi: string | null; tur: string; birlik: string; miqdor: number | null; miqdor_norm: number | null; baza: string | null;
  qaror: { tur: QarorTuri; eskirgan: boolean; sabab: string | null } | null; boglar: Bog[];
};

export type FarqQator = {
  tur: FarqTuri;
  varaq: string | null;
  miqdorId: number | null;
  qatorId: number | null;
  nom: string;
  birlik: string;
  loyiha: number | null;
  smeta: number | null;
  fakt: number | null;
  /** Farq smeta qatori birligida (musbat = loyihada/faktda ko'p). */
  farq: number | null;
  pulQQSsiz: number | null;
  pulQQSbilan: number | null;
  narxsiz: boolean;
  qaror: QarorTuri | null;
  qarorEskirgan: boolean;
  izoh: string[];
};

export type FarqSozlama = { tol: number; qqsFoiz: number; taxminiyNarx?: (miqdorId: number) => number | null; /** Kompaniya bo'yicha sozlangan varaq belgisi regexi (bo'lim nomidan). */ belgiRegex?: string };
export const FARQ_STANDART: FarqSozlama = { tol: 0.02, qqsFoiz: NDS_SUKUT_FOIZ };

const pul = (farq: number | null, narx: number | null, qqs: number): { s: number | null; b: number | null } => {
  const s = qatorSumma(farq, narx);
  return { s, b: s == null ? null : qqsBilan(s, qqs) };
};

export function farqlarniHisobla(miqdorlar: FarqMiqdor[], smeta: SmetaQator[], bogliQatorlar: ReadonlySet<number>, sozlama: Partial<FarqSozlama> = {}): FarqQator[] {
  const S = { ...FARQ_STANDART, ...sozlama };
  const out: FarqQator[] = [];
  const asos = (m: FarqMiqdor) => ({ varaq: m.varaq, miqdorId: m.miqdor_id, qaror: m.qaror ? m.qaror.tur : null, qarorEskirgan: m.qaror?.eskirgan ?? false });
  for (const m of miqdorlar) {
    const a = asos(m);
    if (m.boglar.length === 0) {
      const narx = S.taxminiyNarx ? S.taxminiyNarx(m.miqdor_id) : null;
      const p = pul(m.miqdor, narx, S.qqsFoiz);
      out.push({ tur: 'loyihada_bor_smetada_yoq', ...a, qatorId: null, nom: m.nom, birlik: m.birlik, loyiha: m.miqdor, smeta: null, fakt: null, farq: m.miqdor,
        pulQQSsiz: p.s, pulQQSbilan: p.b, narxsiz: p.s == null, izoh: narx != null ? ['taxminiy_narx'] : [] });
      continue;
    }
    const asosiy = [...m.boglar].sort((x, y) => (y.hajm_norm ?? -1) - (x.hajm_norm ?? -1))[0];
    const smetaNorm = m.boglar.every((b) => b.hajm_norm != null) ? m.boglar.reduce((s, b) => s + (b.hajm_norm as number), 0) : null;
    const faktBor = m.boglar.some((b) => b.fakt_norm != null);
    const faktNorm = faktBor ? m.boglar.reduce((s, b) => s + (b.fakt_norm ?? 0), 0) : null;
    const smetaQBirlik = birlikkaQaytar(smetaNorm, asosiy.birlik);
    const faktQBirlik = birlikkaQaytar(faktNorm, asosiy.birlik);
    const baza = { ...a, qatorId: asosiy.qator_id, nom: m.nom, birlik: asosiy.birlik ?? m.birlik, loyiha: birlikkaQaytar(m.miqdor_norm, asosiy.birlik), smeta: smetaQBirlik, fakt: faktQBirlik };
    const ek = kalitRaqamlar(`${m.nom} ${m.belgi ?? ''}`); const qk = kalitRaqamlar(asosiy.nom);
    if (ek.sinf && qk.sinf && ek.sinf !== qk.sinf) {
      out.push({ tur: 'almashgan', ...baza, farq: null, pulQQSsiz: null, pulQQSbilan: null, narxsiz: true, izoh: [`sinf:${ek.sinf}>${qk.sinf}`] });
    }
    if (m.miqdor_norm != null && smetaNorm != null) {
      const d = m.miqdor_norm - smetaNorm;
      const rel = Math.abs(d) / Math.max(Math.abs(smetaNorm), 1e-9);
      if (rel > S.tol) {
        const f = birlikkaQaytar(d, asosiy.birlik);
        const p = pul(f, asosiy.narx, S.qqsFoiz);
        out.push({ tur: 'hajm_farqi', ...baza, farq: f, pulQQSsiz: p.s, pulQQSbilan: p.b, narxsiz: p.s == null, izoh: [] });
      }
    }
    if (m.miqdor_norm != null && faktNorm != null && faktNorm > m.miqdor_norm * (1 + S.tol)) {
      const f = birlikkaQaytar(faktNorm - m.miqdor_norm, asosiy.birlik);
      const p = pul(f, asosiy.narx, S.qqsFoiz);
      out.push({ tur: 'fakt_oshgan', ...baza, farq: f, pulQQSsiz: p.s, pulQQSbilan: p.b, narxsiz: p.s == null, izoh: [] });
    }
  }
  // Smetada bor — loyihada yo'q: faqat loyihasi (tasdiqlangan) yuklangan varaqlardagi bo'limlarning bog'lanmagan ish qatorlari.
  const yuklanganVaraq = new Set(miqdorlar.map((m) => m.varaq.toUpperCase()));
  const xarita = bolimXaritasi(smeta, S.belgiRegex);
  for (const q of smeta) {
    if (q.tur !== 'bl' || bogliQatorlar.has(q.id)) continue;
    const belgilar = xarita.get(q.id)?.belgilar;
    if (!belgilar || ![...belgilar].some((b) => yuklanganVaraq.has(b))) continue;
    const p = pul(q.hajm, q.narx, S.qqsFoiz);
    out.push({ tur: 'smetada_bor_loyihada_yoq', varaq: [...belgilar].find((b) => yuklanganVaraq.has(b)) ?? null, miqdorId: null, qatorId: q.id, nom: q.nom, birlik: q.birlik ?? '', loyiha: null,
      smeta: q.hajm, fakt: null, farq: q.hajm == null ? null : -q.hajm, pulQQSsiz: p.s, pulQQSbilan: p.b, narxsiz: p.s == null, qaror: null, qarorEskirgan: false, izoh: [] });
  }
  return out;
}

export type FarqJami = {
  /** Smetaga kirmagan (hal qilinmagan, loyiha/fakt ko'p) ishlar. */
  kirmaganQQSbilan: number; kirmaganQQSsiz: number; kirmaganSoni: number;
  /** Hujjatlashtirilgan (zamena / qo'shimcha / pereraschet / bog'langan qarori bor). */
  hujjatQQSbilan: number; hujjatQQSsiz: number; hujjatSoni: number;
  narxsizSoni: number;
  smetadaOrtiqchaQQSbilan: number;
};

const HUJJAT: QarorTuri[] = ['zamena', 'qoshimcha', 'pereraschet', 'boglandi'];

/** Jami hisobiga kiruvchi qatorlar: smetaga kirmagan (hal qilinmagan) va hujjatlashtirilgan. Ustamali summa uchun kategoriya kesimi shundan yig'iladi. */
export function farqJamiTarkibi(r: FarqQator[]): { kirmagan: FarqQator[]; hujjat: FarqQator[] } {
  const faol = (x: FarqQator) => x.qaror && !x.qarorEskirgan ? x.qaror : null;
  const musbat = r.filter((x) => x.tur !== 'smetada_bor_loyihada_yoq' && x.tur !== 'almashgan' && (x.farq ?? 0) > 0);
  return { kirmagan: musbat.filter((x) => !faol(x)), hujjat: musbat.filter((x) => { const q = faol(x); return q != null && HUJJAT.includes(q); }) };
}

export function farqJami(r: FarqQator[]): FarqJami {
  const faol = (x: FarqQator) => x.qaror && !x.qarorEskirgan ? x.qaror : null;
  const ortiqcha = (x: FarqQator) => x.tur === 'smetada_bor_loyihada_yoq';
  const { kirmagan: kir, hujjat: hujj } = farqJamiTarkibi(r);
  const n = (xs: FarqQator[], k: 'pulQQSbilan' | 'pulQQSsiz') => yigindi2(xs.map((x) => x[k]));
  return {
    kirmaganQQSbilan: n(kir, 'pulQQSbilan'), kirmaganQQSsiz: n(kir, 'pulQQSsiz'), kirmaganSoni: kir.length,
    hujjatQQSbilan: n(hujj, 'pulQQSbilan'), hujjatQQSsiz: n(hujj, 'pulQQSsiz'), hujjatSoni: hujj.length,
    narxsizSoni: r.filter((x) => x.narxsiz && !faol(x)).length,
    smetadaOrtiqchaQQSbilan: n(r.filter((x) => ortiqcha(x) && !faol(x)), 'pulQQSbilan'),
  };
}
