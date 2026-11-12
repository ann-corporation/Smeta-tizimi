/**
 * topilmagan.ts — «Belgisi smetada topilmagan varaqlar»: chizma varag'ining belgisi (КР-N) hech bir smeta bo'limi nomida yo'q.
 * Mazmun bo'yicha tasniflaydi: (a) boshqa nom ostida bo'lim bor — beton/armatura miqdori shu bo'lim ish qatorlari bilan ±tol ichida teng;
 * (b) ehtimol smetada yo'q — hech qaysi miqdor mos kelmaydi; (c) noaniq — qisman mos. Faqat TAKLIF: odam bir bosishda tasdiqlaydi (xarita eslab qolinadi).
 * Tasodifiy mos kelishdan saqlanish: juda kichik miqdor sanalmaydi; bitta miqdor ko'p bo'limga mos kelsa — ovozi bo'linadi.
 */
import { normMiqdor } from './birlik';
import type { SmetaQator } from './moslash';

export type VaraqElement = { tur: string; nom: string; birlik: string; miqdor: number | null };
export type BolimTaklifi = { bolimId: number; bolimNomi: string; mos: number; ball: number };
export type VaraqTasnifi = {
  varaq: string; turi: 'boshqa_nom' | 'smetada_yoq' | 'noaniq' | 'miqdorsiz'; elementSoni: number; mosSoni: number; takliflar: BolimTaklifi[];
};

/** Mazmun solishtiriladigan turlar -> smeta qatori nomidagi belgi (beton/armatura: nomda sinf yo'q, shuning uchun miqdor asosiy dalil). */
const TUR_RE: Record<string, RegExp> = { beton: /бетон/i, armatura: /арматур|каркас|сетк/i };
const MIN_NORM = 0.3;

export function varaqTasnifi(varaq: string, elementlar: readonly VaraqElement[], smeta: readonly SmetaQator[], tol = 0.02): VaraqTasnifi {
  const bolimNomi = new Map(smeta.filter((s) => s.tur === 'rz' || s.tur === 'bl').map((s) => [s.id, s.nom]));
  const asos = elementlar.filter((e) => TUR_RE[e.tur] && normMiqdor(e.miqdor, e.birlik) != null && (normMiqdor(e.miqdor, e.birlik) as number) >= MIN_NORM);
  if (asos.length === 0) return { varaq, turi: 'miqdorsiz', elementSoni: elementlar.length, mosSoni: 0, takliflar: [] };
  const ovoz = new Map<number, { mos: number; ball: number }>();
  let mosSoni = 0;
  for (const e of asos) {
    const q = normMiqdor(e.miqdor, e.birlik) as number; const re = TUR_RE[e.tur];
    const topilgan = new Set<number>();
    for (const s of smeta) {
      if (s.tur !== 'bl' || s.ota_id == null || !re.test(s.nom)) continue;
      const v = normMiqdor(s.hajm, s.birlik);
      if (v != null && v > 0 && Math.abs(v - q) <= q * tol) topilgan.add(s.ota_id);
    }
    if (topilgan.size === 0) continue;
    mosSoni++;
    for (const b of topilgan) { const o = ovoz.get(b) ?? { mos: 0, ball: 0 }; o.mos++; o.ball += 1 / topilgan.size; ovoz.set(b, o); }
  }
  const takliflar = [...ovoz].map(([bolimId, o]) => ({ bolimId, bolimNomi: bolimNomi.get(bolimId) ?? '', mos: o.mos, ball: Math.round((o.ball / asos.length) * 1000) / 1000 }))
    .sort((a, b) => b.ball - a.ball || b.mos - a.mos).slice(0, 4);
  const turi = mosSoni === 0 ? 'smetada_yoq' : mosSoni === asos.length ? 'boshqa_nom' : 'noaniq';
  return { varaq, turi, elementSoni: asos.length, mosSoni, takliflar };
}

/** Belgisi hech bir smeta bo'limida bo'lmagan varaqlar tasnifi (mavjud belgilar to'plami — `bolimXaritasi` belgilaridan). */
export function belgisizVaraqlar(guruhlar: ReadonlyMap<string, readonly VaraqElement[]>, smeta: readonly SmetaQator[], smetaBelgilari: ReadonlySet<string>, tol = 0.02): VaraqTasnifi[] {
  return [...guruhlar].filter(([v]) => !smetaBelgilari.has(v)).map(([v, els]) => varaqTasnifi(v, els, smeta, tol))
    .sort((a, b) => ORD[a.turi] - ORD[b.turi] || b.mosSoni - a.mosSoni);
}
const ORD = { boshqa_nom: 0, noaniq: 1, smetada_yoq: 2, miqdorsiz: 3 } as const;
