import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LrvResSverkaPanel } from './LrvResSverkaPanel';
import type { Katak } from '../../lib/smeta-anatomiya/turlar';

const LRV: Katak[][] = [
  ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', 'ЕД.ИЗМ', 'КОЛ-ВО'],
  [null, null, null, null, 'НА ЕДИНИЦУ', 'ПО ПРОЕКТУ'],
  [1, 2, 3, 4, 5, 6],
  ['1', 'E6-1-1', 'БЕТОНИРОВАНИЕ', '100М3', '1'],
  ['1.1', '1', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', '20', '20'],
  ['1.2', '615-1', 'БЕТОН КЛ. В12,5', 'М3', '101,5', '101,5'],
];
const RES: Katak[][] = [
  ['№', 'КОД', 'НАИМЕНОВАНИЕ', 'ЕД. ИЗМ.', 'КОЛ-ВО', 'ЦЕНА', 'СУММА'],
  [1, 2, 3, 4, 5, 6, 7],
  ['ТРУДОВЫЕ РЕСУРСЫ'],
  ['1', '1', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', 20, 100, 2000],
  ['МАТЕРИАЛЫ'],
  ['1', '615-1', 'БЕТОН КЛ. В12,5', 'М3', 100, 700, 70000],
];

afterEach(cleanup);

describe('LrvResSverkaPanel', () => {
  it('avtomatik hisoblaydi: jamlanma, farqli qator, faqat farqlilar filtri', async () => {
    render(<LrvResSverkaPanel lrvlar={[{ nom: 'LRV', rows: LRV }]} reslar={[{ nom: 'RES', rows: RES }]} obyektNomi="Объект" />);
    expect(await screen.findByText(/2 ta resurs:/)).toBeTruthy();
    expect(screen.getByText('1 farq bor')).toBeTruthy();
    expect(screen.getByText('БЕТОН КЛ. В12,5')).toBeTruthy();
    expect(screen.queryByText('ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ')).toBeNull();
    fireEvent.click(screen.getByLabelText('faqat farqlilar'));
    expect(screen.getByText('ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ')).toBeTruthy();
    expect(screen.getByRole('button', { name: '«Сверка ЛРВ и РС» Excel' })).toBeTruthy();
  });

  it('RES yo‘q — aniq ogohlantirish', async () => {
    render(<LrvResSverkaPanel lrvlar={[{ nom: 'LRV', rows: LRV }]} reslar={[]} obyektNomi="Объект" />);
    expect(await screen.findByText(/RES topilmadi/)).toBeTruthy();
  });
});
