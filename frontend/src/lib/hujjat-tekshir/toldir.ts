/**
 * Keshsiz formulalarni to‘ldirish: ba’zi dasturlar (openpyxl va h.k.) formulani yozadi, lekin natijasini (kesh) yozmaydi —
 * Excelda ochilganda hisoblanadi, bizning o‘quvchi esa bo‘sh katak ko‘radi va summa 0 chiqadi. Bu yerda faqat shunday
 * kataklar mavjud formula baholovchisi (`formula.ts`) bilan hisoblanadi. Hisoblab bo‘lmasa — katak o‘zgarmaydi va
 * `hisoblanmadi` sanaladi (taxmin yo‘q). Keshli kataklarga TEGILMAYDI.
 */
import { bajar, formulaniOqi, FormulaXato, type Qiymat, type Ref } from './formula';

type Katak = string | number | boolean | null | undefined;
export type ToldirVaraq = { nom: string; rows: Katak[][]; formulalar?: Array<Array<string | null | undefined>> };
export type ToldirNatija = {
  /** Keshsiz formulalar soni. */
  jami: number;
  hisoblandi: number;
  hisoblanmadi: number;
  /** Hisoblanmagan formulalar sababi (qisqa, birinchi 10 ta). */
  sabablar: string[];
};

const bosh = (x: Katak) => x == null || x === '';

export function keshsizFormulalarniToldir(varaqlar: readonly ToldirVaraq[]): ToldirNatija {
  const xarita = new Map(varaqlar.map((v) => [v.nom.toUpperCase(), v]));
  const natija: ToldirNatija = { jami: 0, hisoblandi: 0, hisoblanmadi: 0, sabablar: [] };
  const keshsiz = (v: ToldirVaraq, r: number, c: number): string | null => {
    const f = v.formulalar?.[r]?.[c];
    return f && bosh(v.rows[r]?.[c]) ? f : null;
  };
  for (const v of varaqlar) v.formulalar?.forEach((qator, r) => qator?.forEach((_, c) => { if (keshsiz(v, r, c)) natija.jami++; }));
  if (!natija.jami) return natija;

  const holat = new Map<string, 'ishlamoqda' | 'tayyor' | 'xato'>();
  const kalit = (v: ToldirVaraq, r: number, c: number) => `${v.nom.toUpperCase()}!${r},${c}`;
  const qiymatOl = (v: ToldirVaraq, r: number, c: number): Qiymat => {
    const f = keshsiz(v, r, c);
    const k = kalit(v, r, c);
    if (f && holat.get(k) !== 'tayyor') {
      const h = holat.get(k);
      if (h === 'ishlamoqda') throw new FormulaXato('QOLLAB_BOLMAYDI', 'formulalar bir-biriga aylanma bog‘langan');
      if (h === 'xato') throw new FormulaXato('QOLLAB_BOLMAYDI', 'bog‘liq formula hisoblanmadi');
      hisobla(v, r, c, f);
    }
    const x = v.rows[r]?.[c];
    return x == null || typeof x === 'boolean' ? (x === true ? 1 : x === false ? 0 : null) : x;
  };
  const hisobla = (v: ToldirVaraq, r: number, c: number, f: string) => {
    const k = kalit(v, r, c);
    holat.set(k, 'ishlamoqda');
    try {
      if (f.startsWith('#')) throw new FormulaXato('QOLLAB_BOLMAYDI', 'umumiy (shared) formula hal qilinmagan');
      const oqi = (ref: Ref): Qiymat => {
        const w = ref.varaq ? xarita.get(ref.varaq.toUpperCase()) : v;
        if (!w) throw new FormulaXato('QOLLAB_BOLMAYDI', `varaq topilmadi: ${ref.varaq}`);
        return qiymatOl(w, ref.r, ref.c);
      };
      let q = bajar(formulaniOqi(f), oqi, v.nom);
      if (q === null) q = 0;
      (v.rows[r] ??= [])[c] = q;
      holat.set(k, 'tayyor');
    } catch (e) {
      holat.set(k, 'xato');
      throw e;
    }
  };

  for (const v of varaqlar) {
    v.formulalar?.forEach((qator, r) => qator?.forEach((_, c) => {
      const f = keshsiz(v, r, c);
      const h = holat.get(kalit(v, r, c));
      if (!f && h !== 'tayyor' && h !== 'xato') return;
      if (h === 'tayyor') { natija.hisoblandi++; return; }
      try { hisobla(v, r, c, f as string); natija.hisoblandi++; }
      catch (e) {
        natija.hisoblanmadi++;
        if (natija.sabablar.length < 10) natija.sabablar.push(`${v.nom}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }));
  }
  return natija;
}
