import { describe, expect, it } from 'vitest';
import { TEKSHIRUV_SHABLONLAR, bandlarniBoshlash, kunlikJurnalXlsx, muddatKunTaklif, tekshiruvShabloni, tekshiruvXulosa } from './tekshiruv';
import type { TekshiruvBand, TekshiruvQisqa } from '../../api/t2-nazorat';

describe('tekshiruv checklisti', () => {
  it('har shablonda noyob band kodlari; boshlang‘ich holat - tekshirilmadi', () => {
    for (const s of TEKSHIRUV_SHABLONLAR) {
      const kodlar = s.bandlar.map((b) => b.kod);
      expect(new Set(kodlar).size).toBe(kodlar.length);
      expect(bandlarniBoshlash(s).every((b) => b.natija === 'yoq')).toBe(true);
    }
    expect(tekshiruvShabloni('yoq-shablon')).toBeNull();
  });
  it('xulosa: nomuvofiq band izoh va foto talab qiladi; hech narsa tekshirilmasa tayyor emas', () => {
    const b = bandlarniBoshlash(tekshiruvShabloni('beton')!);
    expect(tekshiruvXulosa(b).tayyor).toBe(false);
    const mos: TekshiruvBand[] = b.map((x, i) => (i === 0 ? { ...x, natija: 'mos' } : x));
    expect(tekshiruvXulosa(mos)).toMatchObject({ mos: 1, mosEmas: 0, tayyor: true });
    const bad: TekshiruvBand[] = mos.map((x, i) => (i === 1 ? { ...x, natija: 'mos_emas' } : x));
    const x = tekshiruvXulosa(bad);
    expect(x.tayyor).toBe(false);
    expect(x.muammolar).toHaveLength(2);
    const ok = bad.map((y, i) => (i === 1 ? { ...y, izoh: 'Qatlam 15 mm', document_ids: [5] } : y));
    expect(tekshiruvXulosa(ok).tayyor).toBe(true);
  });
  it('muddat taklifi: kritik 3, qolgani 7 kun', () => {
    expect(muddatKunTaklif('kritik')).toBe(3);
    expect(muddatKunTaklif('yuqori')).toBe(7);
  });
  it('kunlik jurnal: faqat yakunlangan tekshiruvlar xlsx ga chiqadi', () => {
    const t = (id: number, holat: TekshiruvQisqa['holat']): TekshiruvQisqa => ({
      id, sana: '2026-11-10', obyekt_id: 1, obyekt_nom: 'Obyekt', aloqa_id: 2, ish_turi: 'Beton ishlari', joy: 'A', holat, natija: holat === 'yakunlandi' ? 'mos_emas' : null, izoh: null,
      bandlar: [{ kod: 'b', nom: 'Band', natija: 'mos_emas', izoh: 'x' }], predpisaniya_soni: 1, yaratildi: '2026-11-10T08:00:00Z', yakunlandi_vaqti: null,
    });
    const { bytes, faylNomi } = kunlikJurnalXlsx([t(1, 'yakunlandi'), t(2, 'qoralama')], { davr: '10.11.2026' });
    expect(bytes.length).toBeGreaterThan(500);
    expect(faylNomi).toMatch(/\.xlsx$/);
  });
});
