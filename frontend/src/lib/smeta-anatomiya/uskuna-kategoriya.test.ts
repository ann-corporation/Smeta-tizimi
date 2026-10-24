import { describe, expect, it } from 'vitest';
import { varaqniTahlilQil } from './varaq';
import { anatomiyadanAktDaraxt } from './akt-daraxt';
import { smetaDaraxtniYoy } from '../smeta-flatten';
import type { Katak } from './turlar';

/**
 * Regressiya (JONLI_SINOV #24, PR #40/#59): uskuna qatorlari import oqimida `ob` turida qoladi.
 * Server import RPC lari tur='ob' -> kat='ОБ' qiladi (migratsiya 20261106870000); shu yerda frontend
 * tomonidagi shart: «ОБОРУДОВАНИЕ» bo'limidagi ish `ob` bo'lib yoyiladi, material `mat` bo'lib qoladi.
 */
const ROWS: Katak[][] = [
  ['НАИМЕНОВАНИЕ ОБЪЕКТА: ТЕСТ'],
  ['ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ № 02'],
  ['ОБОРУДОВАНИЕ'],
  ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', 'ЕД.ИЗМ', 'КОЛ-ВО'],
  [null, null, null, null, 'НА ЕДИНИЦУ', 'ПО ПРОЕКТУ'],
  [1, 2, 3, 4, 5, 6],
  ['РАЗДЕЛ: ОБОРУДОВАНИЕ'],
  ['1', '', 'АТТРАКЦИОН КАРУСЕЛЬ', 'ШТ', '2'],
  ['РАЗДЕЛ: МОНТАЖ'],
  ['2', '615-1', 'БЕТОН КЛ. В12,5', 'М3', '3,6'],
];

describe('uskuna kategoriyasi regressiyasi (#24)', () => {
  const v = varaqniTahlilQil('k.xls', { nom: 'LRV', rows: ROWS });
  const flat = smetaDaraxtniYoy(anatomiyadanAktDaraxt(v).tree);

  it('ОБОРУДОВАНИЕ bo‘limidagi qator tur=ob (server uni kat=ОБ qiladi), boshqa bo‘lim mat', () => {
    expect(flat.find((q) => q.nom === 'АТТРАКЦИОН КАРУСЕЛЬ')?.tur).toBe('ob');
    expect(flat.find((q) => q.nom === 'БЕТОН КЛ. В12,5')?.tur).toBe('mat');
  });
});
