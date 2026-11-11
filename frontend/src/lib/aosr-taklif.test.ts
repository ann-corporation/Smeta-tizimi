import { describe, expect, it } from 'vitest';
import { bogChaqiruvlari, boglanmaganEskiAktlar, ildizlar, ishNomzodlari, razdelBoyicha, takliflarQur } from './aosr-taklif';
import type { QatorMeta } from './ijro-tayyorla';

/* Soxta smeta: ikki razdel, bir nechta bir xil nomli qator. Haqiqiy obyekt ma'lumoti emas. */
const meta: QatorMeta[] = [
  { id: 1, ota_id: null, tartib: 1, tur: 'rz', nom: 'Фундаменты' },
  { id: 2, ota_id: 1, tartib: 1, tur: 'bl', nom: 'Армирование фундаментной плиты' },
  { id: 3, ota_id: 1, tartib: 2, tur: 'bl', nom: 'Бетонирование фундаментной плиты' },
  { id: 4, ota_id: 1, tartib: 3, tur: 'bl', nom: 'Гидроизоляция фундаментов обмазочная' },
  { id: 5, ota_id: null, tartib: 2, tur: 'rz', nom: 'Стены и перегородки' },
  { id: 6, ota_id: 5, tartib: 1, tur: 'bl', nom: 'Кладка стен из кирпича' },
  { id: 7, ota_id: 5, tartib: 2, tur: 'bl', nom: 'Армирование стен' },
  { id: 8, ota_id: 5, tartib: 3, tur: 'bl', nom: 'Армирование стен' }, // bir xil nomli ikkinchi qator
  { id: 9, ota_id: 2, tartib: 1, tur: 'mat', nom: 'Арматура А500' },
];
const fakt = new Set<number>([8]);
const ishlar = ishNomzodlari(meta, fakt);
const akt = (id: number, ish_nomi: string, ish_tavsifi: string | null = null) => ({ id, ish_nomi, ish_tavsifi });

describe('aosr-taklif', () => {
  it('ildizlar: rus/o‘zbek so‘zlar qisqartiriladi, stop-so‘zlar tushadi', () => {
    expect(ildizlar('Армирование плиты для фундамента')).toEqual(['армир', 'плиты', 'фунда']);
    expect(ildizlar('Poydevor armaturasi')).toEqual(['poyde', 'armat']);
  });

  it('faqat faol ISH (bl) qatorlari nomzod; razdel nomi bog‘lanadi', () => {
    expect(ishlar.map((i) => i.id)).toEqual([2, 3, 4, 6, 7, 8]);
    expect(ishlar.find((i) => i.id === 6)?.razdelNom).toBe('Стены и перегородки');
  });

  it('ish turi + element + razdel bo‘yicha to‘g‘ri qator birinchi', () => {
    const t = takliflarQur([akt(100, 'Армирование плиты фундамента')], ishlar);
    const r = t.get(100)!;
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].qatorId).toBe(2);
    expect(r[0].sabab).toContain('ish turi mos');
    expect(r.length).toBeLessThanOrEqual(3);
  });

  it('ish turi zid bo‘lsa (betonlash ≠ armirovka) ball tushadi', () => {
    const t = takliflarQur([akt(101, 'Бетонирование плиты')], ishlar).get(101)!;
    expect(t[0].qatorId).toBe(3);
    const arm = t.find((x) => x.qatorId === 2);
    if (arm) expect(arm.ball).toBeLessThan(t[0].ball);
  });

  it('bir xil nomli qatorlarda fakt>0 qator oldinda', () => {
    const t = takliflarQur([akt(102, 'Армирование стен')], ishlar).get(102)!;
    expect(t[0].qatorId).toBe(8);
    expect(t[0].faktBor).toBe(true);
    expect(t.map((x) => x.qatorId)).toContain(7);
  });

  it('o‘xshashlik yo‘q — taklif yo‘q (taxmin qilinmaydi)', () => {
    expect(takliflarQur([akt(103, 'Благоустройство территории')], ishlar).has(103)).toBe(false);
    expect(takliflarQur([akt(104, '')], ishlar).has(104)).toBe(false);
    expect(takliflarQur([akt(105, 'Армирование')], []).size).toBe(0);
  });

  it('boglanmaganEskiAktlar: faqat ESKI-REESTR, bekor emas, bog‘siz', () => {
    const r = boglanmaganEskiAktlar([
      { id: 1, izoh: 'ESKI-REESTR 12', holat: 'yangi', boglangan_ish_soni: 0 },
      { id: 2, izoh: 'eski-reestr', holat: 'tasdiqlangan', boglangan_ish_soni: 2 },
      { id: 3, izoh: 'ESKI-REESTR', holat: 'bekor', boglangan_ish_soni: 0 },
      { id: 4, izoh: 'boshqa', holat: 'yangi', boglangan_ish_soni: 0 },
      { id: 5, izoh: null, holat: 'yangi', boglangan_ish_soni: 0 },
    ]);
    expect(r).toEqual([1]);
  });

  it('razdelBoyicha: eng yuqori taklif razdeli; taklifsizlar alohida', () => {
    const t = takliflarQur([akt(1, 'Армирование плиты фундамента'), akt(2, 'Кладка стен кирпичных'), akt(3, 'Бетонирование плиты'), akt(4, 'Что-то boshqa')], ishlar);
    const g = razdelBoyicha([1, 2, 3, 4], t);
    expect(g.taklifsiz).toEqual([4]);
    const fund = g.guruhlar.find((x) => x.razdelId === 1);
    expect(fund?.aktlar).toEqual([1, 3]);
    expect(g.guruhlar.find((x) => x.razdelId === 5)?.aktlar).toEqual([2]);
  });

  it('bogChaqiruvlari: har qator alohida chaqiruv — kesishma (M:N) noto‘g‘ri bog‘lamasin', () => {
    const c = bogChaqiruvlari([{ aktId: 1, qatorId: 2 }, { aktId: 3, qatorId: 3 }, { aktId: 5, qatorId: 2 }]);
    expect(c).toEqual([{ aosrIds: [1, 5], qatorIds: [2] }, { aosrIds: [3], qatorIds: [3] }]);
    expect(bogChaqiruvlari([])).toEqual([]);
  });
});
