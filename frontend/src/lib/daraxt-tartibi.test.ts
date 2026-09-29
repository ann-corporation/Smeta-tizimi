import { describe, expect, it } from 'vitest';
import { daraxtTartibida } from './daraxt-tartibi';

type R = { qator_id: number; ota_id: number | null; nom: string };
const r = (qator_id: number, ota_id: number | null, nom: string): R => ({ qator_id, ota_id, nom });

describe('daraxtTartibida — qo‘shimcha/zamena o‘z razdelida (Karting, egasi 2026-09-29)', () => {
  // Tartib bo'yicha: ПОЛЫ(10) → ish(11) → АРМОСЕТКА(12); НБШ(20) → ish(21); keyin F2 importda
  // yaratilganlar oxirida: АРМИРОВАНИЕ(30, ota 10) + resursi(31), СЕТКА(32, zamena 12, ota 10).
  const rows: R[] = [
    r(1, null, 'LRV'), r(10, 1, 'ПОЛЫ ИЗ БЕТОН'), r(11, 10, 'УПЛОТНЕНИЕ'), r(12, 10, 'АРМОСЕТКА'), r(13, 10, 'ПЕНОПЛЕКС'),
    r(20, 1, 'НБШ'), r(21, 20, 'НБШ ишi'),
    r(30, 10, 'АРМИРОВАНИЕ'), r(31, 30, 'ПРОВОЛОКА'), r(32, 10, 'СЕТКА'),
  ];
  it('qo‘shimcha ota razdel oxirida, zamena almashtirgan qatoridan keyin; boshqa razdelga o‘tmaydi', () => {
    const nomlar = daraxtTartibida(rows, new Map([[32, 12]])).map((x) => x.nom);
    expect(nomlar).toEqual(['LRV', 'ПОЛЫ ИЗ БЕТОН', 'УПЛОТНЕНИЕ', 'АРМОСЕТКА', 'СЕТКА', 'ПЕНОПЛЕКС', 'АРМИРОВАНИЕ', 'ПРОВОЛОКА', 'НБШ', 'НБШ ишi']);
  });
  it('ota ma’lumoti yo‘q — asl tartib; ota topilmagan qator yo‘qolmaydi', () => {
    expect(daraxtTartibida([{ qator_id: 1 }, { qator_id: 2 }]).map((x) => x.qator_id)).toEqual([1, 2]);
    expect(daraxtTartibida([r(1, null, 'a'), r(2, 99, 'b')]).map((x) => x.qator_id)).toEqual([1, 2]);
  });
});
