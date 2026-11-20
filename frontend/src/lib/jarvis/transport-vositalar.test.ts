import { describe, expect, it } from 'vitest';
import { F2_VOSITALAR, OQISH_NOMLARI, YOZISH_NOMLARI, vositaSorov, vositaTop } from './f2-vositalar';
import { jarvisF2WriteIntent, jarvisWriteSchemas, jarvisWriteTools, parseJarvisWriteCall } from './write-tools';
import { jarvisToolNames, jarvisTools, parseJarvisToolCall } from './tool-registry';
import { F2_MCP_VOSITALARI, previewMatni } from '../yordamchi/vosita/f2-mcp-liniya';

// Faqat sintetik raqamlar.
const guruh = { material: 'Sintetik shag‘al', zichlik: 1.5, km: 20, miqdor: 10, hisob_tkm: 300, kodlar: ['12303'] };
const taqsimla = { obyekt_id: 5, rz_id: 9, tkm_narx: 100, qatorlar: [guruh] };

describe('Jarvis: transport vositalari ro‘yxatdan o‘tgan', () => {
  it('o‘qish (transport_tekshir) va ikki yozuvchi preview vositasi (taqsimla, belgila); yozuvchilar tasdiq talab qiladi', () => {
    expect(OQISH_NOMLARI).toContain('transport_tekshir');
    expect(YOZISH_NOMLARI).toEqual(expect.arrayContaining(['transport_taqsimla', 'transport_belgila']));
    expect(vositaTop('transport_tekshir')).toMatchObject({ yozadi: false, tasdiqKerak: false, ruxsat: ['smeta.read'] });
    for (const n of ['transport_taqsimla', 'transport_belgila']) expect(vositaTop(n)).toMatchObject({ yozadi: false, tasdiqKerak: true, ruxsat: ['smeta.write'] });
    expect(F2_VOSITALAR.filter((v) => v.yozadi).map((v) => v.nom)).toEqual(['f2_tasdiq']);
  });
  it('tavsif o‘zbekcha va «ikki marta» qoidasini aytadi', () => {
    expect(vositaTop('transport_taqsimla')!.tavsif).toMatch(/IKKI MARTA/);
    expect(vositaTop('transport_taqsimla')!.tavsif).toMatch(/majburiy/);
    expect(vositaTop('transport_belgila')!.tavsif).toMatch(/foiz.*tkm.*narx_ichida/s);
  });
  it('Jarvis LLM yozuv sxemasida ikkalasi bor; f2_tasdiq hech qachon model vositasi emas', () => {
    const nomlar = jarvisWriteTools.map((t) => t.nom);
    expect(nomlar).toEqual(expect.arrayContaining(['transport_taqsimla', 'transport_belgila']));
    expect(nomlar).not.toContain('f2_tasdiq');
    expect(jarvisWriteSchemas.map((s) => s.properties.name.const)).toEqual(expect.arrayContaining(['transport_taqsimla', 'transport_belgila']));
  });
  it('o‘qish yo‘lida ham ro‘yxatdan o‘tgan (transport_tekshir, smeta.read)', () => {
    expect(jarvisToolNames).toContain('transport_tekshir');
    expect(jarvisTools.transport_tekshir).toMatchObject({ mode: 'read', permissions: ['smeta.read'] });
    expect(parseJarvisToolCall({ name: 'transport_tekshir', arguments: { query: 'Transport tekshir' } })).toEqual({ name: 'transport_tekshir', query: 'Transport tekshir' });
  });
  it('MCP buyruq qatlamida (mcp transport_...) ham bor; taqsimla pulga ta‘sir qiluvchi (ikkinchi tasdiq)', () => {
    const t = F2_MCP_VOSITALARI.find((v) => v.id === 'mcp_transport_taqsimla');
    expect(t).toMatchObject({ tur: 'yozish', pul: true });
    expect(F2_MCP_VOSITALARI.find((v) => v.id === 'mcp_transport_tekshir')).toMatchObject({ tur: 'oqish' });
    expect(F2_MCP_VOSITALARI.find((v) => v.id === 'mcp_transport_belgila')).toMatchObject({ tur: 'yozish' });
  });
});

describe('Jarvis: transport kirishi', () => {
  it('taqsimla: tozalangan kirish, majburiy faqat aniq true', () => {
    expect(vositaSorov('transport_taqsimla', taqsimla)).toMatchObject({ amal: 'taklif', a: { obyekt_id: 5, rz_id: 9, tkm_narx: 100, majburiy: false } });
    expect(vositaSorov('transport_taqsimla', { ...taqsimla, majburiy: true })).toMatchObject({ a: { majburiy: true } });
  });
  it('taqsimla: narx/bo‘lim/zichlik yo‘q yoki guruh juda ko‘p bo‘lsa rad (hech narsa taxmin qilinmaydi)', () => {
    expect(vositaSorov('transport_taqsimla', { ...taqsimla, tkm_narx: undefined })).toMatchObject({ xato: 'TKM_NARX_KERAK' });
    expect(vositaSorov('transport_taqsimla', { ...taqsimla, rz_id: undefined })).toMatchObject({ xato: 'BOLIM_KERAK' });
    expect(vositaSorov('transport_taqsimla', { ...taqsimla, qatorlar: [{ ...guruh, zichlik: undefined }] })).toMatchObject({ xato: 'GURUH_NOTOGRI' });
    expect(vositaSorov('transport_taqsimla', { ...taqsimla, qatorlar: Array(41).fill(guruh) })).toMatchObject({ xato: 'QATORLAR_NOTOGRI' });
  });
  it('belgila: usul va idlar; aktor/kompaniya maydoni taqiq', () => {
    expect(vositaSorov('transport_belgila', { obyekt_id: 5, qator_idlar: [3, 4], usul: 'narx_ichida' })).toMatchObject({ amal: 'taklif', a: { qator_idlar: [3, 4], usul: 'narx_ichida' } });
    expect(vositaSorov('transport_belgila', { obyekt_id: 5, qator_idlar: [3], usul: 'ish' })).toMatchObject({ xato: 'USUL_NOTOGRI' });
    expect(vositaSorov('transport_belgila', { obyekt_id: 5, qator_idlar: [3], usul: 'tkm', actor_id: 1 })).toMatchObject({ xato: 'ARGUMENT_TAQIQLANGAN' });
    expect(vositaSorov('transport_tekshir', {})).toEqual({ xato: 'OBYEKT_KERAK' });
    expect(vositaSorov('transport_tekshir', { obyekt_id: 5 })).toMatchObject({ amal: 'oqish', a: { obyekt_id: 5 } });
  });
  it('model chaqiruvi: parseJarvisWriteCall tasdiq/aktor maydonlarini rad etadi', () => {
    expect(parseJarvisWriteCall({ name: 'transport_belgila', arguments: { obyekt_id: 5, qator_idlar: [3], usul: 'tkm' } })).toMatchObject({ name: 'transport_belgila' });
    expect(parseJarvisWriteCall({ name: 'transport_belgila', arguments: { obyekt_id: 5, qator_idlar: [3], usul: 'tkm', token: 'x' } })).toBeNull();
    expect(parseJarvisWriteCall({ name: 'transport_taqsimla', arguments: { ...taqsimla, tasdiqlayman: true } })).toBeNull();
  });
  it('yozuv niyati transport buyruqlarini yozuv yo‘liga yo‘naltiradi, «tekshir» — yo‘q', () => {
    for (const q of ['Transportni hisob aktidan taqsimla', 'Shu materialni t·km ga o‘zgartir', 'Транспорт распредели по расчёту']) expect(jarvisF2WriteIntent(q)).toBe(true);
    expect(jarvisF2WriteIntent('Transport tekshir')).toBe(false);
  });
  it('preview matni: transport vositalarida tayyor matn ishlatiladi', () => {
    expect(previewMatni({ tavsif: 'Sintetik', korinish: '- guruh: Tayyor', ogohlantirish: ['diqqat'] })).toBe('**Sintetik**\n- guruh: Tayyor\n⚠ diqqat');
  });
});
