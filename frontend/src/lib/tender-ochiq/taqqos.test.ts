import { describe, expect, it } from 'vitest';
import { taqqosQatorlari } from './taqqos';

const qatorlar = [{ qator_no: 1, nom: 'A', birlik: 'm3', miqdor: 10, golib_taklif_qator_id: null }, { qator_no: 2, nom: 'B', birlik: 'm2', miqdor: 5, golib_taklif_qator_id: null }];
const taklif = (id: number, holat: string, narxlar: Array<number | null>) => ({
  taklif_id: id, kompaniya: 'K' + id, holat, qqs_foiz: 12, amal_kun: null, kafolat_oy: null, yetkazish_narx: null, yaratildi: '2026-11-12',
  qatorlar: narxlar.map((narx, i) => ({ qator_no: i + 1, nom: 'x', birlik: 'x', miqdor: 1, narx, muddat_kun: i === 0 ? 7 : null })),
});

describe('tender ochiq taqqos', () => {
  it('jami hajm x narx (hisob-yadro), arzonidan boshlab; qaytarilgan taklif kirmaydi', () => {
    const r = taqqosQatorlari({ qatorlar, takliflar: [taklif(1, 'berildi', [100, 200]), taklif(2, 'berildi', [90, 190]), taklif(3, 'qaytarib_olindi', [1, 1])] });
    expect(r.map((x) => x.taklif_id)).toEqual([2, 1]);
    expect(r[0].jami).toBe(1850);
    expect(r[1].jami).toBe(2000);
    expect(r[0].muddat_kun_max).toBe(7);
  });
  it('narxsiz qator bo\'lsa jami NULL (0 emas) va oxirida', () => {
    const r = taqqosQatorlari({ qatorlar, takliflar: [taklif(1, 'berildi', [100, null]), taklif(2, 'berildi', [90, 190])] });
    expect(r.map((x) => x.taklif_id)).toEqual([2, 1]);
    expect(r[1].jami).toBeNull();
  });
});
