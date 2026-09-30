import { describe, expect, it } from 'vitest';
import { tanlanganLrvVaraqlaridanDaraxtQur, type AnatomiyaHisobot } from './SmetaYuklaNative';
import { f2FaylOqiCore, type F2ColumnConfig, type SheetGrid } from '../../lib/f2-import-parse';
import type { AktNode } from '../../lib/f2-match-engine';

/** ABC4 lokal LRV: РАЗДЕЛ → blok ichma-ich, oxirida ВЕДОМОСТЬ РЕСУРСОВ. */
const ROWS: SheetGrid = [
  ['НАИМЕНОВАНИЕ ОБЪЕКТА: ИСКУССТВЕННАЯ ОЗЕРА'],
  ['ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ № 01-04'],
  ['КОЛОДЦЕВ (ПРОФИЛЬ К1)'],
  ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', 'ЕД.ИЗМ', 'КОЛ-ВО'],
  [null, null, null, null, 'НА ЕДИНИЦУ', 'ПО ПРОЕКТУ'],
  [1, 2, 3, 4, 5, 6],
  ['РАЗДЕЛ: КОЛОДЕЦ (ЛИСТ .-39)'],
  ['ЗЕМЛЯНЫЕ РАБОТЫ'],
  ['1', 'E1-1-195-20', 'РАЗРАБОТКА ГРУНТА', '1000М3', 0.01017],
  ['1.1', '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', 5.02, 0.0510534],
  ['КОЛОДЕЦ К1'],
  ['2', 'E11-1-13-3', 'УСТРОЙСТВО ПОКРЫТИЙ', '100М2', 0.04],
  ['2.1', '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', 28.4, 1.136],
  ['ВЕДОМОСТЬ РЕСУРСОВ'],
  ['ТРУДОВЫЕ РЕСУРСЫ'],
  ['1', '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', 1.1870534],
];

function cols(): F2ColumnConfig {
  const d = f2FaylOqiCore(ROWS);
  if (!('cols' in d)) throw new Error('ustunlar aniqlanmadi');
  return d.cols;
}

function rzYollari(nodes: readonly AktNode[], yol: string[] = [], out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.type === 'rz') rzYollari(n.children ?? [], [...yol, n.nom ?? ''], out);
    else if (n.type !== 'rs') out.push(`${yol.join(' → ')} ⇒ ${n.nom}`);
  }
  return out;
}

describe('Smeta yuklash — ichma-ich RZ (SMETA_ANATOMIYA_V1)', () => {
  it('ketma-ket RZ lar saqlanadi, vedomost ish sifatida kirmaydi, hisobot beriladi', () => {
    const hisobot: AnatomiyaHisobot[] = [];
    const tree = tanlanganLrvVaraqlaridanDaraxtQur([{ name: 'LRV', rows: ROWS, cols: cols() }], { hisobot: (h) => hisobot.push(h) });
    expect(hisobot).toHaveLength(1);
    expect(hisobot[0]).toMatchObject({ ierarxiya: true, sabab: null });
    expect(hisobot[0].vedomostChiqarildi).toBeGreaterThan(0);
    expect(rzYollari(tree)).toEqual([
      'КОЛОДЦЕВ (ПРОФИЛЬ К1) → РАЗДЕЛ: КОЛОДЕЦ (ЛИСТ .-39) → ЗЕМЛЯНЫЕ РАБОТЫ ⇒ РАЗРАБОТКА ГРУНТА',
      'КОЛОДЦЕВ (ПРОФИЛЬ К1) → РАЗДЕЛ: КОЛОДЕЦ (ЛИСТ .-39) → КОЛОДЕЦ К1 ⇒ УСТРОЙСТВО ПОКРЫТИЙ',
    ]);
  });

  it('operator ustunni o\'zgartirsa (mazmun farq qiladi) — eski daraxt va sababi', () => {
    const c = { ...cols(), obyom: cols().norma }; // hajm ustuni noto'g'ri tanlangan
    const hisobot: AnatomiyaHisobot[] = [];
    tanlanganLrvVaraqlaridanDaraxtQur([{ name: 'LRV', rows: ROWS, cols: c }], { hisobot: (h) => hisobot.push(h) });
    expect(hisobot[0].ierarxiya).toBe(true);
    expect(hisobot[0].sabab).toMatch(/operator ustunlari anatomiyaga berildi/);
  });
});
