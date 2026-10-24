import { describe, expect, it } from 'vitest';
import type { F2Tugun } from '../smeta-anatomiya/f2';
import { BOSHQA_BOLIM_USUL, f2MoslashV3, type SmetaQator } from './index';
import { f2Indeks, ishlarResurslariniBogla, smetaIndeks, type IshJoyi } from './ishJoyi';
import { MUSTAQIL_ANIQ_USUL, MUSTAQIL_TAKLIF_USUL, qatorMosmi } from './mustaqil';
import { gradeFarq } from './index';

// SINTETIK (real mijoz ma'lumoti emas): F2 parseri razdeldagi mustaqil materiallarni ish RESURSI qilib qo'ygan;
// smetada ular o'sha bo'limda, ish ostida emas, xuddi shu tartibda mustaqil qator.
const man = { varaq: 'v', qator: 1, ustun: 1 };
function tugun(p: Partial<F2Tugun> & { uid: string; tur: F2Tugun['tur'] }): F2Tugun {
  return { kod: null, nom: p.uid, birlik: null, hajm: null, narx: null, summa: null, norma: null, bolalar: [], barg: false, yol: [], manzil: man, ...p } as unknown as F2Tugun;
}
const sq = (id: number, otaId: number | null, tur: string, kod: string | null, nom: string, birlik: string | null, hajm: number | null, tartib: number): SmetaQator =>
  ({ id, otaId, tur, kod, nom, birlik, hajm, narx: 10, tartib });

const ISSIQ = 'РАЗДЕЛ: СМЕТА № 01-10 НА ГОРЯЧИЙ ТЕСТОВЫЙ КОНТУР';
const SOVUQ = 'РАЗДЕЛ: СМЕТА № 01-09 НА ХОЛОДНЫЙ ОПЫТНЫЙ КОНТУР';
const smeta: SmetaQator[] = [
  sq(100, null, 'rz', null, ISSIQ, null, null, 100),
  sq(101, 100, 'bl', 'T9-5-5', 'ПРОКЛАДКА ОПЫТНЫХ КОНТУРОВ', '100М', 5, 101),
  sq(102, 101, 'rs', '1', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 10, 102),
  sq(110, 100, 'mat', '90-1-13', 'ТЕСТ-ВЕНТИЛЬ Д-110ММ', 'ШТ', 1, 110),
  sq(111, 100, 'mat', '90-1-14', 'ТЕСТ-ТРОЙНИК РАВНЫЙ Д-20ММ', 'ШТ', 3, 111),
  sq(112, 100, 'mat', '90-1-15', 'ТЕСТ-ТРОЙНИК РАВНЫЙ Д-25ММ', 'ШТ', 2, 112),
  sq(113, 100, 'mat', '90-1-16', 'ТЕСТ-ТРОЙНИК РАВНЫЙ Д-32ММ', 'ШТ', 2, 113),
  sq(114, 100, 'mat', '90-1-20', 'ТЕСТ-ТРОЙНИК ПЕРЕХОДНОЙ Д-25Х20Х25ММ', 'ШТ', 64, 114),
  sq(200, null, 'rz', null, SOVUQ, null, null, 200),
  sq(201, 200, 'bl', 'T9-1-2', 'ИСПЫТАНИЕ ТЕСТОВЫХ ТРУБ ДО 100 ММ', '100М', 2, 201),
  sq(202, 201, 'rs', '1', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 4, 202),
  sq(210, 200, 'mat', '90-2-14', 'ТЕСТ-ТРОЙНИК РАВНЫЙ Д-20ММ', 'ШТ', 5, 210),
];
const mat = (uid: string, kod: string, nom: string, hajm: number) => tugun({ uid, tur: 'rs', kod, nom, birlik: 'ШТ', hajm, barg: true });
/** F2 ishi: «ДО 100 ММ» — issiq bo'limda bunday ish YO'Q, faqat sovuqda (ota-ish boshqa bo'limga ◐ ketadi). */
const f2Ish = (bolalar: F2Tugun[]) => tugun({ uid: 'ish', tur: 'bl', kod: 'T9-1-2', nom: 'ИСПЫТАНИЕ ТЕСТОВЫХ ТРУБ ДО 100 ММ', birlik: '100М', hajm: 1.5,
  yol: [ISSIQ], bolalar: [tugun({ uid: 'rs0', tur: 'rs', kod: '1', nom: 'ЗАТРАТЫ ТРУДА', birlik: 'ЧЕЛ-Ч', hajm: 3, barg: true }), ...bolalar] });
const toliq = () => [mat('a', '90-1-14', 'ТЕСТ-ТРОЙНИК РАВНЫЙ Д-20ММ', 3), mat('b', '90-1-15', 'ТЕСТ-ТРОЙНИК РАВНЫЙ Д-25ММ', 2),
  mat('c', '90-1-16', 'ТЕСТ-ТРОЙНИК РАВНЫЙ Д-32ММ', 2), mat('d', '90-1-20', 'ТЕСТ-ТРОЙНИК ПЕРЕХОДНОЙ Д-25Х20Х25ММ', 64)];
const akt = (bolalar: F2Tugun[]) => [tugun({ uid: 'z', tur: 'rz', nom: ISSIQ, bolalar: [f2Ish(bolalar)] })];

describe('mustaqil qatorlar: ish resursi bo‘lib kelgan, smetada bo‘limda mustaqil qator', () => {
  it('ota-ish boshqa bo‘limga ◐ ketgan bo‘lsa ham resurslar o‘z bo‘limidan: kod+nom+birlik+hajm aynan → hammasi ✓', () => {
    const n = f2MoslashV3(akt(toliq()), smeta);
    expect(n.natijalar.get('ish')).toMatchObject({ holat: 'taklif', qatorId: 201 });
    for (const [uid, id] of [['a', 111], ['b', 112], ['c', 113], ['d', 114]] as const) {
      expect(n.natijalar.get(uid)).toMatchObject({ holat: 'aniq', qatorId: id, usul: MUSTAQIL_ANIQ_USUL });
    }
    // Sovuq bo'limdagi bir xil nomli tройник (210) olinmadi.
    expect([...n.natijalar.values()].some((r) => r.qatorId === 210)).toBe(false);
  });

  it('hajm teng bo‘lmasa — ✓ emas, ◐ taklif (to‘g‘ri qator)', () => {
    const n = f2MoslashV3(akt([mat('a', '90-1-14', 'ТЕСТ-ТРОЙНИК РАВНЫЙ Д-20ММ', 1)]), smeta);
    expect(n.natijalar.get('a')).toMatchObject({ holat: 'taklif', qatorId: 111, usul: MUSTAQIL_TAKLIF_USUL });
  });

  it('kod siljigan (F2 90-1-14, nomi Д-25 qatorniki) — nom+birlik bo‘yicha to‘g‘ri qator, faqat ◐', () => {
    const n = f2MoslashV3(akt([mat('a', '90-1-14', 'ТЕСТ-ТРОЙНИК РАВНЫЙ Д-25ММ', 2)]), smeta);
    expect(n.natijalar.get('a')).toMatchObject({ holat: 'taklif', qatorId: 112 });
  });

  it('bo‘limda ikki aynan qator — noaniq: ✓ emas, ◐', () => {
    const egizak = [...smeta, sq(115, 100, 'mat', '90-1-14', 'ТЕСТ-ТРОЙНИК РАВНЫЙ Д-20ММ', 'ШТ', 3, 115)];
    const n = f2MoslashV3(akt([mat('a', '90-1-14', 'ТЕСТ-ТРОЙНИК РАВНЫЙ Д-20ММ', 3)]), egizak);
    expect(n.natijalar.get('a')?.holat).toBe('taklif');
    expect([111, 115]).toContain(n.natijalar.get('a')?.qatorId);
  });

  it('faqat boshqa bo‘limda bor (yagona) — ◐ boshqa bo‘lim usuli bilan, hech qachon ✓', () => {
    const faqatSovuq = smeta.filter((s) => s.id !== 111);
    const n = f2MoslashV3(akt([mat('a', '90-1-14', 'ТЕСТ-ТРОЙНИК РАВНЫЙ Д-20ММ', 5)]), faqatSovuq);
    expect(n.natijalar.get('a')).toMatchObject({ holat: 'taklif', qatorId: 210, usul: BOSHQA_BOLIM_USUL });
  });

  it('birlik farqli — juftlanmaydi', () => {
    const n = f2MoslashV3(akt([tugun({ uid: 'a', tur: 'rs', kod: '90-1-14', nom: 'ТЕСТ-ТРОЙНИК РАВНЫЙ Д-20ММ', birlik: 'КГ', hajm: 3, barg: true })]), smeta);
    expect(n.natijalar.get('a')?.qatorId ?? null).toBeNull();
  });

  it('«⇣ Ish resurslarini bog‘lash»: operator bog‘lagan ishning qolgan resurslari ham mustaqil qatorlardan', () => {
    const w = f2Ish(toliq());
    const ind = f2Indeks([tugun({ uid: 'z', tur: 'rz', nom: ISSIQ, bolalar: [w] })]);
    const S = smetaIndeks(smeta);
    // Operator ishni issiq bo'limdagi 101 ga bog'lagan; resurslar 101 ichida yo'q, razdelda mustaqil.
    const ij0: IshJoyi = { bog: new Map([['ish', { qatorId: 101, holat: 'qolda', usul: 'qolda' }]]), otkaz: new Set() };
    const r = ishlarResurslariniBogla(ij0, ind, S);
    expect(r.ij.bog.get('a')?.qatorId).toBe(111);
    expect(r.ij.bog.get('d')?.qatorId).toBe(114);
    // ◐ ish (operator tasdiqlamagan) — resurslar faqat ◐.
    const ij1: IshJoyi = { bog: new Map([['ish', { qatorId: 201, holat: 'taklif', usul: 'ball' }]]), otkaz: new Set() };
    const r1 = ishlarResurslariniBogla(ij1, ind, S);
    expect(r1.ij.bog.get('b')).toMatchObject({ holat: 'taklif' });
  });

  it('qatorMosmi: kod teng, lekin o‘lcham farqli — mos emas', () => {
    expect(qatorMosmi({ kod: '90-1-14', nom: 'ТЕСТ-ТРОЙНИК РАВНЫЙ Д-25ММ', birlik: 'ШТ' }, { kod: '90-1-14', nom: 'ТЕСТ-ТРОЙНИК РАВНЫЙ Д-20ММ', birlik: 'ШТ' }, gradeFarq)).toBeNull();
    expect(qatorMosmi({ kod: '90-1-14', nom: 'ТЕСТ ТРОЙНИК РАВНЫЙ Д20ММ', birlik: 'ШТ' }, { kod: '90-1-14', nom: 'ТЕСТ-ТРОЙНИК РАВНЫЙ Д-20ММ', birlik: 'шт' }, gradeFarq)).toBe('nom');
  });
});
