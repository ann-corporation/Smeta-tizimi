import { describe, expect, it } from 'vitest';
import type { BugunObyekt } from '../../api/t2-tomon';
import { etiborBelgisi, kutishJami, nullJami, portfelJami, pudratchiBoyicha } from './bugun-yordam';

const ob = (o: Partial<BugunObyekt> = {}): BugunObyekt => ({
  aloqa_id: 1, qarshi_kompaniya_id: 9, qarshi_nom: 'Pudratchi A', obyekt_id: 1, obyekt_nom: 'Obyekt 1', shartnoma_id: 5, shartnoma_raqam: '12', shartnoma_summa: 1000,
  smeta: null, fakt: null, f2: null, f3: null, tolangan: null, qarz: null, xabar_kutilmoqda: 0, kutayotgan_taqdim: 0, ochiq_murojaat: 0, ...o,
});

describe('buyurtmachi portfeli — null ≠ 0', () => {
  it('hammasi noma‘lum bo‘lsa jami null, aks holda faqat ma‘lumlar yig‘iladi', () => {
    expect(nullJami([null, undefined])).toEqual({ summa: null, nomalum: 2 });
    expect(nullJami([0.1, 0.2, null])).toEqual({ summa: 0.3, nomalum: 1 });
    expect(nullJami([0])).toEqual({ summa: 0, nomalum: 0 });
  });

  it('ustunlar alohida: ruxsat bo‘lmagan obyekt jamga 0 bo‘lib kirmaydi', () => {
    const j = portfelJami([
      ob({ obyekt_id: 1, f3: { soni: 1, summa: 500, oxirgi_sana: null }, tolangan: { soni: 1, summa: 200, oxirgi_sana: null }, qarz: 300 }),
      ob({ obyekt_id: 2, shartnoma_summa: 2000 }),
    ]);
    expect(j.shartnoma).toEqual({ summa: 3000, nomalum: 0 });
    expect(j.f3).toEqual({ summa: 500, nomalum: 1 });
    expect(j.qarz).toEqual({ summa: 300, nomalum: 1 });
    expect(j.fakt_qqs).toEqual({ summa: null, nomalum: 2 });
  });

  it('paket ustunlari: QQS bilan, ustamali, ustamasiz alohida; paket null bo‘lsa noma‘lum', () => {
    const f2 = { soni: 2, oxirgi_oy: '2026-10-01', qqs_bilan: 112, ustamali: 100, ustamasiz: 80, narxsiz_soni: 0, qator_soni: 5 };
    const j = portfelJami([ob({ f2 }), ob({ obyekt_id: 2, f2: null })]);
    expect(j.f2_qqs).toEqual({ summa: 112, nomalum: 1 });
    expect(j.f2_ustamali.summa).toBe(100);
    expect(j.f2_ustamasiz.summa).toBe(80);
    expect(portfelJami([ob({ f2: { soni: 0, oxirgi_oy: null } })]).f2_qqs.summa).toBeNull();
  });
});
describe('kutish va e‘tibor', () => {
  it('kutish jami: hujjat + javob + tekshiruv; kechikkan alohida', () => {
    expect(kutishJami({ taqdim: { f2: 2, aosr: 1 }, murojaat_menga_ochiq: 3, murojaat_tekshiruv: 1, murojaat_kechikkan: 2, tolov_xabar_kutilmoqda: 4 }))
      .toEqual({ hujjat: 3, murojaatJavob: 3, murojaatTekshiruv: 1, kechikkan: 2, jami: 7 });
  });
  it('e‘tibor tartibi: qaror > qarz > murojaat', () => {
    expect(etiborBelgisi(ob({ kutayotgan_taqdim: 1, qarz: 5 }))).toBe('qaror');
    expect(etiborBelgisi(ob({ qarz: 5, ochiq_murojaat: 2 }))).toBe('qarz');
    expect(etiborBelgisi(ob({ ochiq_murojaat: 2 }))).toBe('murojaat');
    expect(etiborBelgisi(ob({ qarz: 0 }))).toBeNull();
  });
  it('pudratchi bo‘yicha guruhlash tartibni saqlaydi', () => {
    const g = pudratchiBoyicha({ sana: '2026-11-11', kutayotgan: { taqdim: {}, murojaat_menga_ochiq: 0, murojaat_tekshiruv: 0, murojaat_kechikkan: 0, tolov_xabar_kutilmoqda: 0 },
      obyektlar: [ob({ obyekt_id: 1 }), ob({ obyekt_id: 2, qarshi_kompaniya_id: 8, qarshi_nom: 'B' }), ob({ obyekt_id: 3 })] });
    expect(g.map((x) => [x.id, x.obyektlar.length])).toEqual([[9, 2], [8, 1]]);
  });
});
