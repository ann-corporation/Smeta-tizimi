import { describe, expect, it } from 'vitest';
import { f2Ierarxiya, type F2IerSmeta } from './f2-ierarxiya';

const s = (id: number, ota_id: number | null, tur: string, nom: string, extra: Partial<F2IerSmeta> = {}): F2IerSmeta =>
  ({ id, ota_id, tartib: id, tur, kod: null, nom, birlik: null, ...extra });

describe('F2 tasdiqlash — ierarxik ko‘rinish', () => {
  const smeta = [
    s(1, null, 'rz', 'ФУНДАМЕНТ'), s(2, 1, 'bl', 'БЕТОНИРОВАНИЕ'), s(3, 2, 'rs', 'БЕТОН'), s(4, 2, 'rs', 'АРМАТУРА'),
    s(5, 1, 'bl', 'ГИДРОИЗОЛЯЦИЯ'), s(6, 5, 'rs', 'МАСТИКА'),
    s(7, null, 'rz', 'КРОВЛЯ'), s(8, 7, 'mat', 'ПРОФНАСТИЛ', { zamena: true }),
  ];
  const lines = [{ qator_id: 3, summa: 100 }, { qator_id: 4, summa: 50 }, { qator_id: 8, summa: 7 }];
  it('faqat F2 qatorlari va ota-bobolari, tartib va oraliq jamilar bilan', () => {
    const r = f2Ierarxiya(lines, smeta, (l) => l.summa);
    expect(r.map((q) => [q.nom, q.daraja, q.summa])).toEqual([
      ['ФУНДАМЕНТ', 0, 150], ['БЕТОНИРОВАНИЕ', 1, 150], ['БЕТОН', 2, 100], ['АРМАТУРА', 2, 50],
      ['КРОВЛЯ', 0, 7], ['ПРОФНАСТИЛ', 1, 7],
    ]);
    expect(r.find((q) => q.nom === 'ПРОФНАСТИЛ')!.zamena).toBe(true);
  });
  it('narxsiz qator jamini bo‘shatmaydi — ota ma’lum summalar yig‘indisini ko‘rsatadi (egasi qoidasi)', () => {
    const r = f2Ierarxiya([{ qator_id: 3, summa: null }, { qator_id: 4, summa: 50 }], smeta, (l) => l.summa);
    expect(r[0].summa).toBe(50);
  });
});
