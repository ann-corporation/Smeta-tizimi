import { describe, expect, it } from 'vitest';
import { NAKRUTKA_STANDART, nakrutkaKaskad, pulYaxlitla } from './nakrutka-kaskad';
import { kategoriyaKf, standartPodval } from './hisob-yadro';

/* Oltin qiymatlar production Supabase'dagi `public.t2_nakrutka_hisobla_v1`
 * (immutable funksiya, 2026-09-23 execute_sql) natijasidan ko'chirilgan.
 * TS port SQL'dan bir tiyin ham farq qilmasligi shart. */
describe('nakrutka kaskadi — server shakli, hisob yadrosi orqali (SQL bilan ≤ 0,01)', () => {
  it('A: standart koeffitsientlar, barcha kategoriyalar', () => {
    const r = nakrutkaKaskad({ chel: 906363170.46, mash: 188652881.67, mat: 73766663.54, ob: 115010123, mk: 1234567.89, kab: 17630000.3, bez: 2500000 }, NAKRUTKA_STANDART);
    expect(r).toEqual({
      pryamye: 1283792838.67, tr_mat: 2806833.16, skl_mat: 1409901.17, tr_kab: 264450,
      // Yadro har qadamda ROUND 2 (Excel). SQL faqat oxirida: itogo1 …900,01, itogo2 …402,01, itogo3 …848,95, vsego …131,21 —
      // farq ≤ 0,01 (yaxlitlash bosqichi, hisob-yadro/paritet.test.ts).
      itogo1: 1173263900, prochie: 211187502, itogo2: 1384451402,
      tr_ob: 2300202.46, zag_ob: 1380121.48, itogo3: 1503141848.94,
      strax: 4810053.92, risk: 0, itogo4: 1507951902.86, nds: 180954228.34, vsego: 1688906131.2,
    });
  });

  it('B: kompaniya override (sklad 1%, risk 2.5%)', () => {
    const r = nakrutkaKaskad({ chel: 90191208.78, mash: 59639425.67, mat: 1307752332.1, ob: 25200000, mk: 0, kab: 1133579906.25, bez: 0 },
      { ...NAKRUTKA_STANDART, СКЛАДСКИЕ_МАТЕРИАЛ: 1, РИСК: 2.5 });
    expect(r.vsego).toBe(2063323357.32);
    expect(r.risk).toBe(44793157.89);
    expect(r.skl_mat).toBe(13077523.32);
    expect(r.tr_kab).toBe(17003698.59);
    expect(r.itogo1).toBe(1496372809.75); // SQL (oxirida yaxlitlash): …809,76
  });

  it('C: kategoriya koeffitsient jadvali (t2_nakrutka_koef_jadval_v1) — yadro Kf (yaxlitlashsiz) 2 xonagacha', () => {
    // SQL jadvali 1 so'mlik kaskadni OXIRIDA yaxlitlaydi; yadro Kf yaxlitlashsiz — 2 xonada aynan teng.
    // (1 so'mlik kaskadni har qadamda yaxlitlash 1,32 beradi — shuning uchun Kf kaskad orqali emas, chiziqli olinadi.)
    const kf = kategoriyaKf(standartPodval(NAKRUTKA_STANDART));
    const tab: Record<string, number | null> = { chel: kf.ЧЕЛ, mash: kf.МАШ, mat: kf.МАТ, ob: kf.ОБ, mk: kf['М/К'], kab: kf.КАБ, bez: kf['БЕЗ СКЛАД'] };
    const one = (p: Partial<Record<'chel' | 'mash' | 'mat' | 'ob' | 'mk' | 'kab' | 'bez', number>>) => pulYaxlitla(tab[p.mk ? 'mk' : p.kab ? 'kab' : p.bez ? 'bez' : Object.keys(p)[0]] as number);
    expect(one({ chel: 1 })).toBe(1.33);
    expect(one({ mash: 1 })).toBe(1.33);
    expect(one({ mat: 1 })).toBe(1.42);
    expect(one({ ob: 1 })).toBe(1.16);
    expect(one({ mat: 1, mk: 1 })).toBe(1.4);
    expect(one({ mat: 1, kab: 1 })).toBe(1.37);
    expect(one({ mat: 1, bez: 1 })).toBe(1.39);
  });

  it('trMatOverride berilmasa SQL bilan 1:1, berilsa faqat material transport qadami almashadi', () => {
    const a = { chel: 0, mash: 0, mat: 1000, ob: 0, mk: 0, kab: 0, bez: 0 };
    expect(nakrutkaKaskad(a, NAKRUTKA_STANDART).tr_mat).toBe(50);
    expect(nakrutkaKaskad(a, NAKRUTKA_STANDART, { trMatOverride: 77 }).tr_mat).toBe(77);
  });

  it('pulYaxlitla Excel ROUND kabi', () => {
    expect(pulYaxlitla(1.005)).toBe(1.01);
    expect(pulYaxlitla(-2.675)).toBe(-2.68);
    expect(pulYaxlitla(1111.0499999999)).toBe(1111.05);
  });
});
