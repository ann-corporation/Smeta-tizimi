// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { F2_VOSITALAR, OQISH_NOMLARI, YOZISH_NOMLARI, vositaSorov, vositaTop } from './f2-vositalar';
import { WRITE_COMMAND_POLICY } from './write-command-policy';

// Faqat sintetik raqamlar: haqiqiy summa/nom yo'q.
describe('F2 vositalar reyestri', () => {
  it('MCP ning 8 ta o\'qish va 7 ta yozish vositasi bor (transport bilan), hammasi o\'zbekcha tavsif va kirish sxemasi bilan', () => {
    expect([...OQISH_NOMLARI].sort()).toEqual(['f2', 'f2_royxat', 'fakt_jurnal', 'nakopitelniy', 'obyekt_holat', 'ostatka', 'qator_qidir', 'transport_tekshir']);
    expect([...YOZISH_NOMLARI].sort()).toEqual(['bajarilmadi', 'f2_qoralama_tahrir', 'fakt_yoz', 'narx_tuzat', 'transport_belgila', 'transport_taqsimla', 'zamena_qosh']);
    for (const v of F2_VOSITALAR) { expect(v.tavsif.length).toBeGreaterThan(30); expect(Object.keys(v.kirish).length).toBeGreaterThan(0); expect(v.versiya).toBe(1); }
    expect(new Set(F2_VOSITALAR.map((v) => v.nom)).size).toBe(F2_VOSITALAR.length);
  });
  it('FAQAT f2_tasdiq yozadi; yozuvchi vositalar tasdiq talab qiladi, o\'qish vositalari yo\'q', () => {
    expect(F2_VOSITALAR.filter((v) => v.yozadi).map((v) => v.nom)).toEqual(['f2_tasdiq']);
    for (const n of YOZISH_NOMLARI) expect(vositaTop(n)!.tasdiqKerak).toBe(true);
    for (const n of OQISH_NOMLARI) expect(vositaTop(n)!.tasdiqKerak).toBe(false);
  });
  it('yozuvchi vosita ruxsati yozish reyestridagi (sb-yoz) amal ruxsati bilan bir xil', () => {
    expect(vositaTop('fakt_yoz')!.ruxsat).toContain(WRITE_COMMAND_POLICY.fakt_yoz_v2);
    expect(vositaTop('f2_qoralama_tahrir')!.ruxsat).toContain(WRITE_COMMAND_POLICY.f2_qoralama_yangila_v1);
    expect(vositaTop('zamena_qosh')!.ruxsat).toContain(WRITE_COMMAND_POLICY.ish_abc_saqla_v1);
    expect(vositaTop('bajarilmadi')!.ruxsat).toContain(WRITE_COMMAND_POLICY.bajarilmadi_belgila);
    expect(vositaTop('narx_tuzat')!.ruxsat).toEqual(expect.arrayContaining([WRITE_COMMAND_POLICY.qator_tahrir, 'narx.write']));
  });
});

describe('kirish sxemasi', () => {
  it('nomalum vosita va noto\'g\'ri argument turi rad', () => {
    expect(vositaSorov('yoq_vosita', {})).toEqual({ xato: 'VOSITA_NOMALUM' });
    expect(vositaSorov('f2_royxat', [1])).toEqual({ xato: 'ARGUMENT_NOTOGRI' });
  });
  it('aktor va kompaniya maydonlari HECH QAYSI vositada qabul qilinmaydi (faqat sessiyadan)', () => {
    for (const k of ['actor_id', 'p_actor_id', 'aktor', 'kim', 'kompaniya_id']) {
      for (const v of F2_VOSITALAR.filter((x) => x.nom !== 'f2_tasdiq')) expect(vositaSorov(v.nom, { obyekt_id: 1, [k]: 7 })).toMatchObject({ xato: 'ARGUMENT_TAQIQLANGAN' });
    }
  });
  it('o\'qish vositalari: majburiy obyekt/akt, chegaralar, filtrlar', () => {
    expect(vositaSorov('f2_royxat', {})).toEqual({ xato: 'OBYEKT_KERAK' });
    expect(vositaSorov('f2_royxat', { obyekt_id: '5', limit: 9999 })).toMatchObject({ amal: 'oqish', a: { obyekt_id: 5, tur: 'f2', limit: 200 } });
    expect(vositaSorov('f2', {})).toEqual({ xato: 'AKT_KERAK' });
    expect(vositaSorov('qator_qidir', { obyekt_id: 5 })).toMatchObject({ xato: 'QIDIRUV_BOSH' });
    expect(vositaSorov('qator_qidir', { obyekt_id: 5, matn: 'beton M300  armatura', tur: 'rs' })).toMatchObject({ a: { sozlar: ['beton', 'M300', 'armatura'], tur: 'rs' } });
    expect(vositaSorov('qator_qidir', { obyekt_id: 5, tur: 'xx' })).toEqual({ xato: 'TUR_NOTOGRI' });
    expect(vositaSorov('nakopitelniy', { obyekt_id: 5, davr: '2026-13' })).toEqual({ xato: 'DAVR_NOTOGRI' });
    expect(vositaSorov('fakt_jurnal', { obyekt_id: 5, sana_dan: '2026-02-31x' })).toEqual({ xato: 'SANA_NOTOGRI' });
    expect(vositaSorov('ostatka', { obyekt_id: 5, faqat: 'ortiqcha' })).toMatchObject({ amal: 'oqish' });
  });
  it('fakt_yoz: hajm 0, takror qator, bo\'sh ro\'yxat rad; to\'g\'ri kirish taklif amaliga o\'tadi', () => {
    expect(vositaSorov('fakt_yoz', { obyekt_id: 5, qatorlar: [] })).toMatchObject({ xato: 'QATORLAR_NOTOGRI' });
    expect(vositaSorov('fakt_yoz', { obyekt_id: 5, qatorlar: [{ qator_id: 1, hajm: 0 }] })).toMatchObject({ xato: 'QATOR_NOTOGRI' });
    expect(vositaSorov('fakt_yoz', { obyekt_id: 5, qatorlar: [{ qator_id: 1, hajm: 2 }, { qator_id: 1, hajm: 3 }] })).toMatchObject({ xato: 'QATOR_TAKROR' });
    const r = vositaSorov('fakt_yoz', { obyekt_id: 5, sana: '2026-11-01', qatorlar: [{ qator_id: 1, hajm: '-2,5' }] });
    expect(r).toMatchObject({ amal: 'taklif', a: { obyekt_id: 5, sana: '2026-11-01', qatorlar: [{ qator_id: 1, hajm: -2.5 }] } });
  });
  it('f2_qoralama_tahrir: o\'zgarish yo\'q, narx+narxsiz birga, hajm 0 rad', () => {
    expect(vositaSorov('f2_qoralama_tahrir', { akt_id: 3 })).toMatchObject({ xato: 'OZGARISH_YOQ' });
    expect(vositaSorov('f2_qoralama_tahrir', { akt_id: 3, ozgartir: [{ qator_id: 1, narx: 5, narxsiz: true }] })).toMatchObject({ xato: 'OZGARTIR_QATOR_NOTOGRI' });
    expect(vositaSorov('f2_qoralama_tahrir', { akt_id: 3, ozgartir: [{ qator_id: 1, hajm: 0 }] })).toMatchObject({ xato: 'OZGARTIR_QATOR_NOTOGRI' });
    expect(vositaSorov('f2_qoralama_tahrir', { akt_id: 3, ozgartir: [{ qator_id: 1, hajm: 4 }], olib_tashla: [2] })).toMatchObject({ amal: 'taklif', a: { akt_id: 3, olib_tashla: [2] } });
  });
  it('zamena_qosh: sabab majburiy, resursda norma yoki hajm kerak', () => {
    const asos = { obyekt_id: 5, almashtirilayotgan_qator_id: 9 };
    expect(vositaSorov('zamena_qosh', asos)).toEqual({ xato: 'SABAB_KERAK' });
    expect(vositaSorov('zamena_qosh', { ...asos, sabab: 'xx' })).toEqual({ xato: 'SABAB_KERAK' });
    expect(vositaSorov('zamena_qosh', { ...asos, sabab: 'buyurtmachi talabi', resurslar: [{ nom: 'a', birlik: 'kg' }] })).toMatchObject({ xato: 'RESURS_NOTOGRI' });
    expect(vositaSorov('zamena_qosh', { ...asos, sabab: 'buyurtmachi talabi', resurslar: [{ nom: 'a', birlik: 'kg', norma: 2 }] })).toMatchObject({ amal: 'taklif' });
  });
  it('bajarilmadi: sabab kodi, «boshqa» uchun izoh, bekor uchun idlar', () => {
    expect(vositaSorov('bajarilmadi', { obyekt_id: 5, qator_idlar: [1], sabab_kod: 'xx' })).toMatchObject({ xato: 'SABAB_KOD_NOTOGRI' });
    expect(vositaSorov('bajarilmadi', { obyekt_id: 5, qator_idlar: [1], sabab_kod: 'boshqa' })).toEqual({ xato: 'SABAB_IZOH_MAJBURIY' });
    expect(vositaSorov('bajarilmadi', { obyekt_id: 5, amal: 'bekor' })).toEqual({ xato: 'BEKOR_IDLAR_KERAK' });
    expect(vositaSorov('bajarilmadi', { obyekt_id: 5, qator_idlar: [1, 2], sabab_kod: 'texnik_sabab' })).toMatchObject({ amal: 'taklif', a: { qatorlar: [{ qator_id: 1 }, { qator_id: 2 }] } });
  });
  it('narx_tuzat: manfiy/bo\'sh narx rad (NULL ≠ 0), sabab majburiy', () => {
    expect(vositaSorov('narx_tuzat', { obyekt_id: 5, narxlar: [{ qator_id: 1, narx: -1 }], sabab: 'tuzatish' })).toMatchObject({ xato: 'NARX_NOTOGRI' });
    expect(vositaSorov('narx_tuzat', { obyekt_id: 5, narxlar: [{ qator_id: 1 }], sabab: 'tuzatish' })).toMatchObject({ xato: 'NARX_NOTOGRI' });
    expect(vositaSorov('narx_tuzat', { obyekt_id: 5, narxlar: [{ qator_id: 1, narx: 10 }] })).toEqual({ xato: 'SABAB_KERAK' });
    expect(vositaSorov('narx_tuzat', { obyekt_id: 5, narxlar: [{ qator_id: 1, narx: 0 }], sabab: 'tuzatish' })).toMatchObject({ amal: 'taklif' });
  });
  it('f2_tasdiq: aniq tasdiqlayman:true va token talab qilinadi', () => {
    expect(vositaSorov('f2_tasdiq', { token: 'x' })).toEqual({ xato: 'TASDIQ_KERAK' });
    expect(vositaSorov('f2_tasdiq', { tasdiqlayman: 'ha', token: 'x' })).toEqual({ xato: 'TASDIQ_KERAK' });
    expect(vositaSorov('f2_tasdiq', { tasdiqlayman: true })).toEqual({ xato: 'TOKEN_KERAK' });
    expect(vositaSorov('f2_tasdiq', { tasdiqlayman: true, token: 'x' })).toMatchObject({ amal: 'tasdiq' });
  });
});
