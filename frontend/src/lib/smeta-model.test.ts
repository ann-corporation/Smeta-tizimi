import { describe, expect, it } from 'vitest';
import { nomIzohBilan, ozgarishIzohi, smetaModeliQur, tartibla } from './smeta-model';

const q = (id: number, ota_id: number | null, extra: Partial<Parameters<typeof smetaModeliQur>[0][number]> = {}) => ({
  id, ota_id, daraja: null, tur: 'mat', kod: null, nom: 'n' + id, birlik: null, qoshimcha: false, zamena: false, ...extra,
});

describe('yagona smeta modeli — o‘zgarish izohi (egasi 2026-09-30)', () => {
  const model = smetaModeliQur([
    q(1, null, { tur: 'rz', nom: 'ПОЛЫ' }),
    q(2, 1, { kod: 'С', nom: 'СЕТКА ВР-1 4ММ' }),
    q(3, 1, { nom: 'СЕТКА ВР-1 Т-3,5ММ', zamena: true, almashtirgan: 2 }),
    q(4, 1, { nom: 'НБШ', qoshimcha: true }),
  ]);
  it('zamena — qaysi qator o‘rniga, qo‘shimcha — alohida izoh', () => {
    expect(ozgarishIzohi({ qator_id: 3, zamena: true }, model)).toBe('ЗАМЕНА: вместо «С СЕТКА ВР-1 4ММ»');
    expect(ozgarishIzohi({ qator_id: 4, qoshimcha: true }, model)).toBe('ДОПОЛНИТЕЛЬНАЯ РАБОТА (не предусмотрена сметой)');
    expect(ozgarishIzohi({ qator_id: 2 }, model)).toBeNull();
    expect(nomIzohBilan('СЕТКА', 'ЗАМЕНА')).toBe('СЕТКА [ЗАМЕНА]');
  });
  it('tartib: zamena almashtirgan qatoridan keyin', () => {
    const rows = [{ qator_id: 1, ota_id: null, tartib: 1 }, { qator_id: 3, ota_id: 1, tartib: 99 }, { qator_id: 2, ota_id: 1, tartib: 2 }, { qator_id: 4, ota_id: 1, tartib: 3 }];
    expect(tartibla(rows, model).map((r) => r.qator_id)).toEqual([1, 2, 3, 4]);
  });
});
