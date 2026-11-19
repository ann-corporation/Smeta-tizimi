import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import { bolimOlRejasi, bosKiritma, f2Jami, f2MumkinHajmlarniOl, f2Qatorlar, f2Qur, type F2Holat } from './f2-tayyor';
import { f2BolimIerarxiya, korinadiganTugunlar } from './f2-bolim-daraxti';
import { f2Kontekst, type F2Malumot } from './ai-yordamchi/f2-vositalar';

/** Egasi 2026-11-19: minus qatorlar (normaga keltirish) F2 ga ishorasi bilan kiradi, hech qaysi yo'lda jim tashlanmaydi. */
const q = (o: Partial<T2Qator> & { id: number; tur: string; norma?: number | null }): T2Qator => ({
  obyekt_id: 1, ota_id: null, tartib: o.id, kod: null, nom: `q${o.id}`, birlik: 'm3', hajm: null, narx: null, ...o,
} as unknown as T2Qator);

// Razdel 1: faqat minus ishlar (ISKLYUCHIT + qalinlik tuzatishi); razdel 2: oddiy plyus ish.
const rows = [
  q({ id: 1, tur: 'rz', nom: 'MINUS' }),
  q({ id: 2, tur: 'bl', ota_id: 1, kod: 'E6-1-97-1', nom: 'ISKLYUCHIT ZAT/TRUDA', hajm: -30.57 }),
  q({ id: 3, tur: 'rs', ota_id: 2, kat: 'ЧЕЛ', nom: 'Trud', norma: 2, narx: 15000 } as Partial<T2Qator> & { id: number; tur: string }),
  q({ id: 4, tur: 'bl', ota_id: 1, nom: 'NA KAZHDYE 10 MM IZMENENIYA TOLSHCHINY', hajm: -5 }),
  q({ id: 5, tur: 'rz', nom: 'PLYUS' }),
  q({ id: 6, tur: 'bl', ota_id: 5, nom: 'Oddiy', hajm: 10 }),
  q({ id: 7, tur: 'rs', ota_id: 6, kat: 'МАТ', nom: 'Mat', norma: 1, narx: 100000 } as Partial<T2Qator> & { id: number; tur: string }),
];
// Eski server: f2_mumkin >= 0 (minus qatorda 0) - fakt manfiy bo'lsa ham.
const holat: F2Holat[] = [
  { qator_id: 2, fakt_hajm: -6.617, f2_hajm: 0, f2_mumkin_hajm: 0, smeta_hajm: -30.57 },
  { qator_id: 3, fakt_hajm: -13.234, f2_hajm: 0, f2_mumkin_hajm: 0, smeta_hajm: -61.14 },
  { qator_id: 4, fakt_hajm: -5, f2_hajm: 0, f2_mumkin_hajm: 0, smeta_hajm: -5 },
  { qator_id: 6, fakt_hajm: 10, f2_hajm: 0, f2_mumkin_hajm: 10, smeta_hajm: 10 },
  { qator_id: 7, fakt_hajm: 10, f2_hajm: 0, f2_mumkin_hajm: 10, smeta_hajm: 10 },
];

describe('F2: minus (manfiy qoldiq) qatorlar jim tashlanmaydi', () => {
  it('daraxt: faqat minus ishli razdel ko\'rinadi va «faqat mumkin» filtrida ham qoladi', () => {
    const b = f2Qur(rows, holat);
    const ier = f2BolimIerarxiya(rows, b);
    const t = ier.byKalit.get(1);
    expect(t?.mumkin).toBe(2);
    const kor = korinadiganTugunlar(ier, new Set(), null, true);
    expect(kor.map((x) => x.kalit).sort()).toEqual([1, 5]);
  });

  it('«hamma mumkin»: minus ish va uning rs bolasi manfiy hajm bilan olinadi', () => {
    const b = f2Qur(rows, holat);
    const ishlar = new Map(b.flatMap((x) => x.ishlar).map((i) => [i.id, i]));
    expect(ishlar.get(2)?.mumkin).toBe(-6.617);
    expect(ishlar.get(4)?.mumkin).toBe(-5);
    const reja = bolimOlRejasi(b);
    expect(reja.hajm[2]).toBe('-6.617');
    expect(reja.hajm[4]).toBe('-5');
    expect(reja.hajm[6]).toBe('10');
    expect(reja.olindi).toBe(3);
    const k = f2MumkinHajmlarniOl(b, bosKiritma());
    const qs = f2Qatorlar(b, k);
    const by = new Map(qs.map((x) => [x.id, x]));
    expect(by.get(2)).toMatchObject({ hajm: -6.617 });
    expect(by.get(3)).toMatchObject({ hajm: -13.234, summa: -198510 }); // rs ishorasi bilan
    expect(by.get(4)).toMatchObject({ hajm: -5 });
    expect(by.get(6)).toMatchObject({ hajm: 10 });
    expect(by.get(2)!.xato).toBeUndefined();
    expect(f2Jami(qs).summa).toBe(801490); // -198510 + 1 000 000
  });

  it('yangi server: f2_mumkin manfiy, fakt ustuni yo\'q - Math.max(0) tashlamaydi', () => {
    const h2: F2Holat[] = [{ qator_id: 4, f2_hajm: 0, f2_mumkin_hajm: -5, smeta_hajm: -5 }, { qator_id: 6, f2_mumkin_hajm: 10, smeta_hajm: 10 }];
    const ishlar = f2Qur(rows, h2).flatMap((x) => x.ishlar);
    expect(ishlar.find((i) => i.id === 4)?.mumkin).toBe(-5);
    expect(ishlar.find((i) => i.id === 6)?.mumkin).toBe(10);
  });

  it('plyus qator o\'zgarmaydi: manfiy server qoldig\'i plyus smetada 0 ga tushadi', () => {
    const h3: F2Holat[] = [{ qator_id: 6, fakt_hajm: 4, f2_hajm: 9, f2_mumkin_hajm: -5, smeta_hajm: 10 }];
    expect(f2Qur(rows, h3).flatMap((x) => x.ishlar).find((i) => i.id === 6)).toBeUndefined();
  });

  it('AI kontekst: «F2 ga olinadigan ishlar» minus ishlarni ham sanaydi', () => {
    const bolimlar = f2Qur(rows, holat);
    const m = { bolimlar, ier: f2BolimIerarxiya(rows, bolimlar), oy: '2026-11', manba: 'fakt', ndsFoiz: null, qatorlar: [], jami: { ish: 0, qator: 0, xato: 0, ogoh: 0, narxsiz: 0, summa: 0, kat: {} }, k: bosKiritma(), uchastkalar: [], qatorBolim: new Map(), katKesim: {} } as unknown as F2Malumot;
    expect(f2Kontekst(m)).toContain('F2 ga olinadigan ishlar: 3 / 3.');
  });
});
