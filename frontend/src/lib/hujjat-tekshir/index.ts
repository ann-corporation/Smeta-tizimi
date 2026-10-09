/**
 * Hujjatni o'zi tekshirish (T2-HUJJAT-OZINI-TEKSHIRISH): har bir formula hujjatning O'Z kirish qiymatlari bilan qayta
 * bajariladi va hujjatda saqlangan natija bilan tiyingacha solishtiriladi. Natija: qaysi katak mos, qaysi biri farqli
 * (aniq manzil, hujjatdagi va hisoblangan qiymat), qaysi formula hali tushunilmagan (taxmin yo'q). Summalarga ta'sir
 * qiladigan har bir foiz qator yorlig'i va bazasi bilan tushuntiriladi ("ТРАНСПОРТНЫЕ РАСХОДЫ = 6% × ИТОГО (G213)").
 *
 * Manba hujjat O'ZGARTIRILMAYDI — faqat o'qiladi. Foizning biznes ma'nosi (qaysi koeffitsient kodiga mosligi) — Codex
 * `document-understanding` (rate-dependencies) qatlami; bu modul bajarish va isbot qatlami.
 */
import type { KirishKitob, KirishVaraq } from '../smeta-anatomiya/turlar';
import { bajar, foizKopaytuvchi, formulaniOqi, FormulaXato, type Qiymat, type Ref, type Tugun } from './formula';

/** `yaxlitlash` — farq ≤ 0,05 so'm (keshlangan qiymat yaxlitlangan eksport); `farq` — undan katta. */
export type FormulaHolat = 'mos' | 'yaxlitlash' | 'farq' | 'tushunilmadi';

export type FormulaNatija = {
  varaq: string;
  /** Excel manzili, masalan "G214". */
  manzil: string;
  /** Qator yorlig'i (o'sha qatordagi birinchi matn), masalan "ИТОГО ТРАНСПОРТНЫ РАСХОДЫ ПО СТРОИТЕЛЬНЫМ МАТЕРИАЛАМ:". */
  yorliq: string;
  formula: string;
  hujjatda: number | null;
  hisoblandi: number | null;
  holat: FormulaHolat;
  izoh?: string;
};

export type FoizIzoh = {
  varaq: string;
  manzil: string;
  yorliq: string;
  /** Foiz (6 = 6%). */
  foiz: number;
  /** Baza ta'rifi: "ИТОГО (G213)" yoki ifoda. */
  baza: string;
  bazaQiymat: number | null;
  natija: number | null;
  formula: string;
};

export type VaraqTekshiruv = {
  varaq: string;
  formulalar: number;
  mos: number;
  farq: number;
  yaxlitlash: number;
  tushunilmadi: number;
  /** Faqat farq va tushunilmagan formulalar (mos bo'lganlari son bilan). */
  muammolar: FormulaNatija[];
  foizlar: FoizIzoh[];
};

export type KitobTekshiruv = {
  varaqlar: VaraqTekshiruv[];
  jami: { formulalar: number; mos: number; yaxlitlash: number; farq: number; tushunilmadi: number; foizlar: number };
  /** Hujjat formulalari to'liq tushunildi va har biri hujjatdagi natija bilan tiyingacha mos. */
  toliqMos: boolean;
  /** Jiddiy farq yo'q, faqat yaxlitlash darajasidagi (≤ 0,05) farqlar bor. */
  deyarliMos: boolean;
};

const harf = (c: number): string => { let s = ''; for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
export const manzilMatni = (r: number, c: number) => `${harf(c)}${r + 1}`;

function yorliqOl(v: KirishVaraq, r: number): string {
  for (const x of v.rows[r] ?? []) if (typeof x === 'string' && /[A-Za-zА-Яа-яЁё]/.test(x) && x.trim().length > 1) return x.trim();
  return '';
}

const sonmi = (x: Qiymat): x is number => typeof x === 'number' && Number.isFinite(x);
/** Tiyingacha: 0,005 so'm yoki juda katta sonlarda nisbiy 1e-12 (float shovqini). */
const tengmi = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.005, Math.abs(b) * 1e-12);

export function varaqFormulalariniTekshir(v: KirishVaraq, kitob: KirishKitob): VaraqTekshiruv {
  const natija: VaraqTekshiruv = { varaq: v.nom, formulalar: 0, mos: 0, yaxlitlash: 0, farq: 0, tushunilmadi: 0, muammolar: [], foizlar: [] };
  const fs = v.formulalar ?? [];
  const varaqlar = new Map(kitob.varaqlar.map((x) => [x.nom.toUpperCase(), x]));
  const oqi = (ref: Ref): Qiymat => {
    const w = ref.varaq ? varaqlar.get(ref.varaq.toUpperCase()) : v;
    if (!w) throw new FormulaXato('QOLLAB_BOLMAYDI', `varaq topilmadi: ${ref.varaq}`);
    const x = w.rows[ref.r]?.[ref.c];
    return x == null || typeof x === 'boolean' ? (x === true ? 1 : x === false ? 0 : null) : x;
  };
  const tavsif = (e: Tugun): { matn: string; qiymat: number | null } => {
    if (e.t === 'ref') {
      const w = e.ref.varaq ? varaqlar.get(e.ref.varaq.toUpperCase()) ?? v : v;
      const q = oqi(e.ref);
      return { matn: `${yorliqOl(w, e.ref.r) || 'katak'} (${e.ref.varaq ? `${e.ref.varaq}!` : ''}${manzilMatni(e.ref.r, e.ref.c)})`, qiymat: sonmi(q) ? q : null };
    }
    let q: Qiymat = null;
    try { q = bajar(e, oqi, v.nom); } catch { /* tavsif uchun */ }
    return { matn: 'ifoda', qiymat: sonmi(q) ? q : null };
  };
  for (let r = 0; r < fs.length; r++) {
    const qator = fs[r];
    if (!qator) continue;
    for (let c = 0; c < qator.length; c++) {
      const f = qator[c];
      if (!f) continue;
      natija.formulalar++;
      const hujjatdaXom = v.rows[r]?.[c];
      const hujjatda = typeof hujjatdaXom === 'number' ? hujjatdaXom : null;
      const asos: Omit<FormulaNatija, 'hisoblandi' | 'holat'> = { varaq: v.nom, manzil: manzilMatni(r, c), yorliq: yorliqOl(v, r), formula: f, hujjatda };
      if (f.startsWith('#')) { natija.tushunilmadi++; natija.muammolar.push({ ...asos, hisoblandi: null, holat: 'tushunilmadi', izoh: f }); continue; }
      let e: Tugun;
      let q: Qiymat;
      try { e = formulaniOqi(f); q = bajar(e, oqi, v.nom); if (q === null) q = 0; /* =A1 (bo'sh) Excelda 0 */ }
      catch (x) {
        natija.tushunilmadi++;
        natija.muammolar.push({ ...asos, hisoblandi: null, holat: 'tushunilmadi', izoh: x instanceof Error ? x.message : String(x) });
        continue;
      }
      // Matnli natija (masalan IF(...,"")): hujjatdagi matn bilan solishtiriladi.
      if (!sonmi(q)) {
        const hujjatMatn = hujjatdaXom == null ? '' : String(hujjatdaXom);
        if ((q ?? '') === hujjatMatn) natija.mos++;
        else { natija.farq++; natija.muammolar.push({ ...asos, hisoblandi: null, holat: 'farq', izoh: `natija "${q ?? ''}", hujjatda "${hujjatMatn}"` }); }
        continue;
      }
      if (hujjatda != null && tengmi(q, hujjatda)) natija.mos++;
      else if (hujjatda != null && Math.abs(q - hujjatda) <= 0.05) { natija.yaxlitlash++; natija.muammolar.push({ ...asos, hisoblandi: q, holat: 'yaxlitlash', izoh: `yaxlitlash farqi ${(q - hujjatda).toFixed(4)}` }); }
      else if (hujjatda == null && Math.abs(q) < 0.005 && (hujjatdaXom == null || hujjatdaXom === '')) natija.mos++;
      else { natija.farq++; natija.muammolar.push({ ...asos, hisoblandi: q, holat: 'farq', izoh: hujjatda == null ? 'hujjatda natija yo‘q' : `farq ${(q - hujjatda).toFixed(2)}` }); }
      const fz = foizKopaytuvchi(e);
      if (fz) {
        const b = tavsif(fz.baza);
        natija.foizlar.push({ varaq: v.nom, manzil: asos.manzil, yorliq: asos.yorliq, foiz: fz.foiz, baza: b.matn, bazaQiymat: b.qiymat, natija: q, formula: f });
      }
    }
  }
  return natija;
}

export function kitobniTekshir(kitob: KirishKitob): KitobTekshiruv {
  const varaqlar = kitob.varaqlar.filter((v) => v.formulalar?.some((r) => r?.some(Boolean))).map((v) => varaqFormulalariniTekshir(v, kitob));
  const jami = varaqlar.reduce((s, v) => ({
    formulalar: s.formulalar + v.formulalar, mos: s.mos + v.mos, yaxlitlash: s.yaxlitlash + v.yaxlitlash, farq: s.farq + v.farq, tushunilmadi: s.tushunilmadi + v.tushunilmadi, foizlar: s.foizlar + v.foizlar.length,
  }), { formulalar: 0, mos: 0, yaxlitlash: 0, farq: 0, tushunilmadi: 0, foizlar: 0 });
  const asosiyMos = jami.formulalar > 0 && jami.farq === 0 && jami.tushunilmadi === 0;
  return { varaqlar, jami, toliqMos: asosiyMos && jami.yaxlitlash === 0, deyarliMos: asosiyMos };
}

export { qiymatTekshir, type QiymatNatija, type QiymatTekshiruv } from './qiymat';
import { varaqniTahlilQil } from '../smeta-anatomiya/varaq';
import { qiymatTekshir as qiymatTekshirV, type QiymatNatija as QN } from './qiymat';

/** Kitobning LRV/RES varaqlari bo'yicha qiymat isboti (formulasiz eksportlar uchun asosiy dalil). */
export function kitobQiymatTekshir(kitob: KirishKitob): QN[] {
  const out: QN[] = [];
  for (const v of kitob.varaqlar) {
    const a = varaqniTahlilQil(kitob.fayl, v);
    if (a.rol !== 'lrv' && a.rol !== 'res') continue;
    const t = qiymatTekshirV(a);
    if (t.qatorlar.jami || t.ishlar.jami || t.jamilar.jami) out.push(t);
  }
  return out;
}
