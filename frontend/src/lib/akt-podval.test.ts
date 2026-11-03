import { describe, expect, it } from 'vitest';
import { nakrutkaPodvaliniOqi } from './smeta-anatomiya/nakrutka';
import type { KirishKitob } from './smeta-anatomiya/turlar';
import { aktPodvalYuki, aktPodvalRpcYuki } from './akt-podval';

/** SINTETIK F2 podvali (haqiqiy hujjat emas): foiz katakda yo‘q — hujjat summalari nisbatidan isbotlanadi. */
const kitob = (rows: Array<Array<string | number | null>>): KirishKitob => ({ fayl: 'sintetik.xlsx', varaqlar: [{ nom: 'F2', rows }] });
const JAMI = { pryamye: 1000, nds: 132, vsego: 1232 };

describe('aktPodvalYuki — F2 hujjat podvali', () => {
  it('foiz summa nisbatidan isbotlanadi (prochie 10 %, НДС 12 %), itogo qatorlari saqlanadi', () => {
    const o = nakrutkaPodvaliniOqi(kitob([
      [null, 'ИТОГО-1 (прямые затраты)', 'СУМ', 1000],
      [null, 'Прочие расходы подрядчика, %', 'СУМ', 100],
      [null, 'ИТОГО-2', 'СУМ', 1100],
      [null, 'ИТОГО-3 (с оборудованием)', 'СУМ', 1100],
      [null, 'ИТОГО-4 (без НДС)', 'СУМ', 1100],
      [null, 'НДС, %', 'СУМ', 132],
      [null, 'ВСЕГО К ОПЛАТЕ (с НДС)', 'СУМ', 1232],
    ]));
    const y = aktPodvalYuki(o, JAMI);
    expect(y).not.toBeNull();
    expect(y!.nk.ПРОЧИЕ_ПОДРЯДЧИК).toBe(10);
    expect(y!.nk.НДС).toBe(12);
    expect(y!.itogo1).toBe(1000);
    expect(y!.itogo4).toBe(1100);
    expect(y!.hujjat.vsego).toBe(1232);
    expect(y!.tekshiruv.toliq).toBe(true);
    expect(aktPodvalRpcYuki(y!).nk).toEqual(y!.nk);
  });

  it('isbotsiz summali qator — to‘liq emas (foiz to‘qilmaydi, smeta podvali qoladi)', () => {
    const o = nakrutkaPodvaliniOqi(kitob([
      [null, 'ИТОГО-1', 'СУМ', 1000],
      [null, 'Транспортные расходы - материалы', 'СУМ', 50],
      [null, 'ИТОГО-4 (без НДС)', 'СУМ', 1050],
      [null, 'НДС, %', 'СУМ', 126],
    ]));
    const y = aktPodvalYuki(o, JAMI);
    expect(y).not.toBeNull();
    expect(y!.tekshiruv.toliq).toBe(false);
    expect(y!.tekshiruv.isbotsiz).toContain('tr_mat');
  });

  it('podval topilmasa — null', () => {
    expect(aktPodvalYuki(nakrutkaPodvaliniOqi(kitob([[null, 'oddiy qator', 'шт', 5]])), JAMI)).toBeNull();
  });
});
