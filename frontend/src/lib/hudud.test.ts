import { describe, expect, it } from 'vitest';
import { joylashuvdanHudud } from './hudud';
import { narxTakliflari } from './narx-dalil/taklif';
import type { NarxTaklif } from '../api/t2-narx-dalil';

describe('Obyekt hududi (chel.-soat narxi shu hududdan)', () => {
  it('xaritadagi nuqtadan taxminiy hudud', () => {
    expect(joylashuvdanHudud(41.30, 69.25)).toBe('toshkent_sh');      // Toshkent markazi
    expect(joylashuvdanHudud(41.55, 70.02)).toBe('toshkent_vil');     // Chirchiq tomoni
    expect(joylashuvdanHudud(40.10, 65.38)).toBe('navoiy');           // Navoiy
    expect(joylashuvdanHudud(39.65, 66.97)).toBe('samarqand');
    expect(joylashuvdanHudud(42.46, 59.60)).toBe('qoraqalpogiston');  // Nukus
    expect(joylashuvdanHudud(null, 69)).toBeNull();
    expect(joylashuvdanHudud(55.75, 37.61)).toBeNull();               // Moskva — O'zbekiston emas
  });

  it('ЧЕЛ: hudud mosligi, eng yangi davr, bir davrda 12% ijtimoiy soliq birinchi', () => {
    const T = (p: Partial<NarxTaklif>): NarxTaklif => ({
      kompaniya_id: 17, obyekt_id: 80, qator_id: 1, tur: 'rs', kat: 'ЧЕЛ', kod: '1', nom: 'Затраты труда рабочих', birlik: 'чел.-ч', smeta_narx: 29421,
      manba_qator_id: 1, manba_id: 3, manba_tur: 'chel_chas', manba_nom: 'Иш хаки', manba_raqam: null, manba_sana: null,
      yil: 2025, kvartal: 1, region: 'Навоийская область', yetkazuvchi: null, nds_holati: 'nomalum', manba_kod: null,
      manba_nom_qator: 'Навоийская область', manba_birlik: 'ЧЕЛ.-Ч', manba_narx: 44495, moslik: 'hudud', narx_varianti: 'ijtimoiy_25', ...p,
    });
    const n = narxTakliflari([T({ manba_qator_id: 1 }), T({ manba_qator_id: 2, narx_varianti: 'ijtimoiy_12', manba_narx: 39900 })]);
    expect(n[0].tavsiya.manba_qator_id).toBe(2);
    expect(n[0].boshqalar.map((x) => x.manba_qator_id)).toEqual([1]);
  });
});
