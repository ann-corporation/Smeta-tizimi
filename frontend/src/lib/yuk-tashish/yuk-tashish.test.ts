import { describe, expect, it } from 'vitest';
import { chiziqMasofaKm, dunyoPiksel, pikseldanNuqta } from './geo';
import { keyingiQadam, masofaBilanTartib, QADAM_NOM, SUKUT_NARX_REJIMI } from './qadam';
import { MASHINA_SINF, narxQator } from './shipper';
import { SUKUT_PARAMETR, tavsiyaNarx } from '../yuk-birjasi/narx';

describe('qadamlar (server bilan bir xil tartib)', () => {
  it('bron -> keldi -> yuklandi -> yolda -> yetkazdi, oxirida yo\'q', () => {
    expect(QADAM_NOM).toEqual(['bron', 'keldi', 'yuklandi', 'yolda', 'yetkazdi']);
    expect(keyingiQadam('bron')).toBe('keldi');
    expect(keyingiQadam('yolda')).toBe('yetkazdi');
    expect(keyingiQadam('yetkazdi')).toBeNull();
    expect(keyingiQadam('noma\'lum')).toBeNull();
  });
  it('sukut narx rejimi — qat\'iy narx (bitta sozlama)', () => { expect(SUKUT_NARX_REJIMI).toBe('qat_iy'); });
  it('yaqin yuk birinchi; teng masofada kichik id', () => {
    const q = masofaBilanTartib([{ id: 3, joydan_km: 9 }, { id: 2, joydan_km: 1 }, { id: 1, joydan_km: 1 }]);
    expect(q.map((x) => x.id)).toEqual([1, 2, 3]);
  });
});

describe('xarita matematikasi', () => {
  it('piksel <-> nuqta aylanishi aniq', () => {
    const p = { lat: 41.3111, lng: 69.2797 };
    for (const z of [6, 10, 14]) {
      const d = dunyoPiksel(p, z); const q = pikseldanNuqta(d.x, d.y, z);
      expect(q.lat).toBeCloseTo(p.lat, 5); expect(q.lng).toBeCloseTo(p.lng, 5);
    }
  });
  it('Toshkent-Navoiy to\'g\'ri chiziq masofasi ~ 340-380 km; bir nuqta 0', () => {
    const km = chiziqMasofaKm({ lat: 41.311, lng: 69.279 }, { lat: 40.103, lng: 65.372 });
    expect(km).toBeGreaterThan(330); expect(km).toBeLessThan(400);
    expect(chiziqMasofaKm({ lat: 41, lng: 69 }, { lat: 41, lng: 69 })).toBe(0);
  });
});

describe('narx qatori (QQS siz; noma\'lum = «—», 0 emas)', () => {
  it('stavka kiritilmagan bo\'lsa narx yo\'q va sabab aytiladi', () => {
    const b = tavsiyaNarx({ masofaKm: 100, tonna: 5, parametr: SUKUT_PARAMETR });
    const q = narxQator(b);
    expect(q.tayyor).toBe(false); expect(q.matn).toContain('—'); expect(q.matn).toContain('stavka');
  });
  it('stavka bor bo\'lsa bir qatorli tarkib va QQS siz yorlig\'i', () => {
    const b = tavsiyaNarx({ masofaKm: 100, tonna: 5, parametr: { ...SUKUT_PARAMETR, stavkaTkm: 1000 } });
    const q = narxQator(b);
    expect(q.tayyor).toBe(true); expect(q.matn).toContain('QQS siz'); expect(q.matn).toContain('t·km');
  });
  it('mashina sinflari — serverdagi CHECK qiymatlari bilan bir xil', () => {
    expect(MASHINA_SINF.map((x) => x.kod).sort()).toEqual(['katta', 'kichik', 'orta', 'ref', 'samosval', 'tent', 'yengil']);
  });
});
