import { describe, expect, it } from 'vitest';
import { exactWrite } from './f2-exact-write';

describe('ТН·КМ qatori F2 qatori sifatida (smeta т·км qatoriga bog‘langan)', () => {
  it('hajm = taklif, narx = smeta narxi, summa = hajm × narx; qo‘shimcha ish emas (mavjud smeta qatori id)', () => {
    const rows = exactWrite(
      [{ uid: 'tkm:900', hajm: 600, narx: 1227.1, summa: 736260, tur: 'rs', summaYozilgan: true }],
      new Map([['tkm:900', 900]]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ qatorId: 900, certifiedQuantity: 600, certifiedUnitPrice: 1227.1, certifiedAmount: 736260 });
  });
});