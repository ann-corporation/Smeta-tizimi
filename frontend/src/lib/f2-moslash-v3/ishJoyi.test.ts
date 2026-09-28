import { describe, expect, it } from 'vitest';
import type { F2Tugun } from '../smeta-anatomiya/f2';
import { f2MoslashV3, type SmetaQator } from './index';
import {
  bogla, boshlangich, f2Indeks, hisobla, ishniBogla, korinish, oshaQatormi, otkazibYubor, smetaIndeks, tasdiqla, uz, yozishManbasi,
} from './ishJoyi';

const S: SmetaQator[] = [
  { id: 1, otaId: null, tur: 'rz', kod: null, nom: 'РАЗДЕЛ: ФУНДАМЕНТ', birlik: null, hajm: null, tartib: 1 },
  { id: 2, otaId: 1, tur: 'bl', kod: 'E6-1-1-22', nom: 'УСТРОЙСТВО ФУНДАМЕНТОВ', birlik: '100М3', hajm: 2, tartib: 2 },
  { id: 3, otaId: 2, tur: 'rs', kod: '000001', nom: 'ЗАТРАТЫ ТРУДА', birlik: 'ЧЕЛ-Ч', hajm: 360, tartib: 3 },
  { id: 4, otaId: 2, tur: 'mat', kod: '12-575-5', nom: 'БЕТОН В25 W6', birlik: 'М3', hajm: 203, tartib: 4 },
  { id: 5, otaId: 1, tur: 'bl', kod: 'E14-1-1', nom: 'ПРОВОЛОКА ВЯЗАЛЬНАЯ', birlik: 'Т', hajm: 0.5, tartib: 5 },
];
const SI = smetaIndeks(S);

let q = 0;
function t(tur: F2Tugun['tur'], kod: string | null, nom: string, birlik: string | null, hajm: number | null, narx: number | null, summa: number | null, bolalar: F2Tugun[] = []): F2Tugun {
  q++;
  return { uid: `A!${q}`, tur, kod, nom, birlik, hajm, narx, summa, manzil: { fayl: 'f', varaq: 'A', qator: q }, yol: ['РАЗДЕЛ: ФУНДАМЕНТ'], bolalar, barg: tur !== 'rz' && !bolalar.length };
}
const r1 = t('rs', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 180, 10, 1800);
const r2 = t('rs', '12-575-3', 'БЕТОН В15 W6', 'М3', 101.5, 100, 10150); // smetada В25 — zamena material
const ish = t('bl', 'E6-1-1-22', 'УСТРОЙСТВО ФУНДАМЕНТОВ', '100М3', 1, null, 11950, [r1, r2]);
const sim = t('bl', 'E14-1-1', 'ПРОВОЛОКА ВЯЗАЛЬНАЯ', 'Т', 0.2, 5000, 1000);
const rz = { ...t('rz', null, 'РАЗДЕЛ: ФУНДАМЕНТ', null, null, null, null, [ish, sim]), yol: [], barg: false };
const IND = f2Indeks([rz]);

describe('F2 V3 ish joyi holati', () => {
  it('ish resurslari bilan bog‘lanadi; marka farqli material bog‘lanmaydi (zamena)', () => {
    const bosh = { bog: new Map(), otkaz: new Set<string>() };
    const r = ishniBogla(bosh, ish, 2, SI);
    expect(r.ij.bog.get(ish.uid)?.qatorId).toBe(2);
    expect(r.ij.bog.get(r1.uid)?.qatorId).toBe(3);
    expect(r.ij.bog.has(r2.uid)).toBe(false);
    expect(r).toMatchObject({ boglandi: 1, qoldi: 1 });
    expect(korinish(r.ij, r2.uid)).toBe('topilmadi');
  });

  it('hal qilinmagan qator bor ekan — yozish to‘xtaydi; zamena bog‘langach ish faqat hajm, resurslar pul', () => {
    let ij = ishniBogla({ bog: new Map(), otkaz: new Set() }, ish, 2, SI).ij;
    ij = bogla(ij, sim.uid, 5);
    expect(yozishManbasi(IND, ij).toxtatish[0]).toMatch(/1 ta qator hal qilinmagan/);
    ij = bogla(ij, r2.uid, 99); // masalan yangi zamena qatori
    const y = yozishManbasi(IND, ij);
    expect(y.toxtatish).toEqual([]);
    expect(y.nodes.find((n) => n.uid === ish.uid)).toMatchObject({ hajm: 1, narx: undefined, summa: undefined });
    expect(y.nodes.find((n) => n.uid === r2.uid)).toMatchObject({ summa: 10150, narx: 100 });
    expect(y.nodes.find((n) => n.uid === sim.uid)).toMatchObject({ summa: 1000 });
    expect(y.imzolar.size).toBe(4);
    const h = hisobla(IND, ij);
    expect(h).toMatchObject({ jami: 4, tayyor: 4, boglanganSumma: 12950, hujjatSumma: 12950 });
  });

  it('avtomatik topilgan, oldingi qarordan olingan va operator tasdiqlagan bog‘lanishlarni alohida sanaydi', () => {
    const ij = { bog: new Map([
      [ish.uid, { qatorId: 2, holat: 'aniq' as const, usul: 'ball' }],
      [r1.uid, { qatorId: 3, holat: 'xotira' as const, usul: 'xotira' }],
      [r2.uid, { qatorId: 4, holat: 'qolda' as const, usul: 'qolda' }],
      [sim.uid, { qatorId: 5, holat: 'qolda' as const, usul: 'taklif_tasdiq' }],
    ]), otkaz: new Set<string>() };
    expect(hisobla(IND, ij)).toMatchObject({
      jami: 4, tayyor: 4, tizimTopdi: 1, avvalgiQaror: 1, operatorTasdiqladi: 2,
    });
  });

  it('o‘tkazib yuborilgan ish resurslari bilan chiqadi, summa alohida ko‘rinadi', () => {
    let ij = bogla({ bog: new Map(), otkaz: new Set() }, sim.uid, 5);
    ij = otkazibYubor(ij, ish, true);
    expect(korinish(ij, r1.uid)).toBe('otkazildi');
    expect(yozishManbasi(IND, ij).toxtatish).toEqual([]);
    expect(hisobla(IND, ij)).toMatchObject({ otkazildi: 3, otkazilganSumma: 11950 });
    ij = otkazibYubor(ij, ish, false);
    expect(korinish(ij, ish.uid)).toBe('topilmadi');
  });

  it('taklif tasdiqlanmaguncha yozilmaydi; qayta hisoblashda qo‘lda qarorlar saqlanadi', () => {
    const n = f2MoslashV3([rz], S, { avtoMin: 999 }); // hammasini ◐ yoki ✕ ga majburlaymiz
    let ij = boshlangich(n);
    const takliflar = [...ij.bog.entries()].filter(([, b]) => b.holat === 'taklif').map(([u]) => u);
    expect(takliflar.length).toBeGreaterThan(0);
    ij = tasdiqla(ij, takliflar);
    expect(takliflar.every((u) => korinish(ij, u) === 'qolda')).toBe(true);
    const qayta = boshlangich(f2MoslashV3([rz], S, { avtoMin: 999 }), ij);
    expect(takliflar.every((u) => korinish(qayta, u) === 'qolda')).toBe(true);
  });

  it('uzish — ish bilan birga resurslari ham', () => {
    const ij = uz(ishniBogla({ bog: new Map(), otkaz: new Set() }, ish, 2, SI).ij, ish);
    expect(ij.bog.size).toBe(0);
  });

  it('"o‘sha qator" tekshiruvi: kod teng → ha; birlik yoki marka farqli → so‘raladi', () => {
    expect(oshaQatormi(ish, S[1])).toBe(true);
    expect(oshaQatormi(r2, S[3])).toBe(false);
    expect(oshaQatormi({ ...sim, birlik: 'КГ' }, S[4])).toBe(false);
  });

  it('#REF! katakli qator o‘tkazilmaguncha yozish to‘xtaydi', () => {
    const xato = { ...sim, uid: 'A!x', hajm: null, ogohlantirish: ['katakda #REF!'] };
    const rz2 = { ...rz, bolalar: [xato] };
    const ind = f2Indeks([rz2]);
    const ij = bogla({ bog: new Map(), otkaz: new Set() }, xato.uid, 5);
    expect(yozishManbasi(ind, ij).toxtatish.join()).toMatch(/qiymat noma'lum/);
    expect(yozishManbasi(ind, otkazibYubor(ij, xato, true)).toxtatish).toEqual(['Aktga kiradigan qator yo‘q.']);
  });
});
