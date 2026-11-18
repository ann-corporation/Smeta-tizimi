import { describe, expect, it, vi } from 'vitest';
import { kimMendan } from '../kim';
import { VOSITALAR, vositaTop } from './reestr';
import { barchaVositalar } from '../vositalar-reestr';
import { f2ArgAjrat, f2XatoMatni, previewMatni } from './f2-mcp-liniya';
import type { VositaKont } from './tur';
import type { F2Javob } from '../../jarvis/f2-javob';

// Faqat sintetik ma'lumot.
const KIM = kimMendan({ foydalanuvchi: { login: 'sinov', ism: 'Sinov' }, context_kompaniyalar: [{ kompaniya_id: 5, nom: 'Sinov MChJ', effective_role: 'boss', permissions: ['fakt.write'] }], azoliklar: [] }, 5);
const kont = (f2Mcp?: (nom: string, a: Record<string, unknown>) => Promise<F2Javob>): VositaKont => ({
  kompaniyaId: 5, kim: KIM, obyekt: { id: 12, nom: 'Sintetik obyekt' }, obyektlar: [{ id: 12, nom: 'Sintetik obyekt' }], sahifalar: [],
  api: { f2Mcp } as never, opId: () => '00000000-0000-4000-8000-000000000001',
});
const PREVIEW: F2Javob = { ok: true, holat: 'tasdiq_kerak', token: 'tok-1', tavsif: 'Fakt yozish: 1 qator (delta)', birlik_soni: 3, ogohlantirish: ['sinov ogohlantirish'],
  preview: { qatorlar: [{ qator_id: 11, kod: 'K11', nom: 'Qator 11', birlik: 'm3', ozgarish: [{ maydon: 'fakt_hajm', oldin: 2, keyin: 7 }] }],
    jami: { oldin: { qqs_bilan: 1120, ustamali: 1000, ustamasiz: 800 }, keyin: { qqs_bilan: 1344, ustamali: 1200, ustamasiz: 960 }, farq: { qqs_bilan: 224, ustamali: 200, ustamasiz: 160 } }, natijalar: [{ rpc: 't2_fakt_yoz_v2', ok: true }] } };

describe('F2 MCP vositalari Jarvis reestrida', () => {
  it('12 ta vosita (7 o\'qish + 5 yozish) VOSITALAR va katalogda; id takrorlanmaydi; yozuvchilari pul/tasdiq belgisi bilan', () => {
    const ids = ['f2_royxat', 'f2', 'fakt_jurnal', 'obyekt_holat', 'qator_qidir', 'nakopitelniy', 'ostatka', 'fakt_yoz', 'f2_qoralama_tahrir', 'zamena_qosh', 'bajarilmadi', 'narx_tuzat'];
    for (const n of ids) expect(VOSITALAR.some((v) => v.id === `mcp_${n}`), n).toBe(true);
    expect(new Set(VOSITALAR.map((v) => v.id)).size).toBe(VOSITALAR.length);
    const kat = barchaVositalar().filter((v) => v.id.includes('.mcp_'));
    expect(kat).toHaveLength(12);
    expect(kat.filter((v) => v.tur === 'yozuv').every((v) => v.tasdiq !== 'yoq')).toBe(true);
    expect(kat.find((v) => v.id === 'yozuv.mcp_narx_tuzat')!.tasdiq).toBe('kartaPul');
    expect(vositaTop('mcp fakt_yoz {"obyekt_id":1}')?.id).toBe('mcp_fakt_yoz');
    expect(vositaTop('oddiy gap')?.id).not.toBe('mcp_fakt_yoz');
  });
  it('buyruq argumentlari: JSON ajratish, bo\'sh va noto\'g\'ri', () => {
    expect(f2ArgAjrat('mcp qator_qidir {"matn":"beton"}', 'qator_qidir')).toEqual({ matn: 'beton' });
    expect(f2ArgAjrat('mcp obyekt_holat', 'obyekt_holat')).toEqual({});
    expect(f2ArgAjrat('mcp fakt_yoz {xato', 'fakt_yoz')).toBeNull();
  });
  it('o\'qish: joriy obyekt avtomatik, natija ixcham matn; xato — tushunarli matn', async () => {
    const f = vi.fn(async () => ({ ok: true, obyekt: { nom: 'Sintetik obyekt' }, smeta: { qqs_bilan: 1120, ustamali: 1000, ustamasiz: 800 }, fakt: null, f2: null, f2_qoralama: null } as F2Javob));
    const r = await vositaTop('mcp obyekt_holat')!.ishla(kont(f), {}, 'mcp obyekt_holat');
    expect(f).toHaveBeenCalledWith('obyekt_holat', { obyekt_id: 12 });
    expect(r).toMatchObject({ tur: 'javob' }); expect((r as { matn: string }).matn).toMatch(/QQS bilan.*ustamali.*ustamasiz/);
    const rad = await vositaTop('mcp obyekt_holat')!.ishla(kont(async () => ({ ok: false, code: 'PERMISSION_DENIED' })), {}, 'mcp obyekt_holat');
    expect(rad).toMatchObject({ tur: 'javob', xato: true }); expect((rad as { matn: string }).matn).toMatch(/ruxsat/);
  });
  it('YOZUV: vosita faqat preview oladi (f2_tasdiq chaqirilmaydi) va taklif kartasi qaytaradi; tasdiqlanganda AYNAN shu token bilan yozadi', async () => {
    const f = vi.fn(async (nom: string) => (nom === 'f2_tasdiq' ? { ok: true, sarflandi: 1 } as F2Javob : PREVIEW));
    const r = await vositaTop('mcp fakt_yoz')!.ishla(kont(f), {}, 'mcp fakt_yoz {"qatorlar":[{"qator_id":11,"hajm":5}]}');
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith('fakt_yoz', { qatorlar: [{ qator_id: 11, hajm: 5 }], obyekt_id: 12 });
    expect(r.tur).toBe('taklif');
    if (r.tur !== 'taklif') return;
    expect(r.izoh).toMatch(/fakt_hajm 2 → 7/); expect(r.izoh).toMatch(/Oldin/); expect(r.izoh).toMatch(/Keyin/); expect(r.izoh).toMatch(/Farq: \+224/);
    expect(r.matn).toMatch(/Hali yozilmagan/);
    expect(f.mock.calls.some(([n]) => n === 'f2_tasdiq')).toBe(false);   // «Tasdiqlash» bosilmaguncha YOZUV YO'Q
    const nat = await r.bajar();
    expect(f).toHaveBeenLastCalledWith('f2_tasdiq', { token: 'tok-1', tasdiqlayman: true });
    expect(nat[0]).toMatch(/yozildi/);
  });
  it('pulga ta\'sir qiluvchi yozuv (narx_tuzat, F2 qoralama) ikkinchi tasdiq (pul=true) talab qiladi; fakt_yoz — oddiy karta', async () => {
    const f = async () => PREVIEW;
    expect((await vositaTop('mcp narx_tuzat')!.ishla(kont(f), {}, 'mcp narx_tuzat {}')) as { pul: boolean }).toMatchObject({ pul: true });
    expect((await vositaTop('mcp f2_qoralama_tahrir')!.ishla(kont(f), {}, 'mcp f2_qoralama_tahrir {"akt_id":1}')) as { pul: boolean }).toMatchObject({ pul: true });
    expect((await vositaTop('mcp fakt_yoz')!.ishla(kont(f), {}, 'mcp fakt_yoz {}')) as { pul: boolean }).toMatchObject({ pul: false });
  });
  it('server rad etsa (ruxsat yo\'q / dry_run rad / token yetmaydi) karta chiqmaydi va yozuv yo\'q', async () => {
    for (const j of [{ ok: false, code: 'PERMISSION_DENIED' }, { ok: true, holat: 'rad', xabar: 'Qator bloklangan', preview: PREVIEW.preview }, { ok: false, code: 'DRY_RUN_YOQ' }] as F2Javob[]) {
      const f = vi.fn(async () => j);
      const r = await vositaTop('mcp fakt_yoz')!.ishla(kont(f), {}, 'mcp fakt_yoz {}');
      expect(r.tur).toBe('javob'); expect(f).toHaveBeenCalledTimes(1);
    }
    const tasdiqRad = await (await vositaTop('mcp fakt_yoz')!.ishla(kont(async (n) => (n === 'f2_tasdiq' ? { ok: false, code: 'TOKEN_YETMAYDI' } : PREVIEW)), {}, 'mcp fakt_yoz {}') as { bajar: () => Promise<string[]> }).bajar();
    expect(tasdiqRad[0]).toMatch(/Tokenlar yetarli emas/);
  });
  it('api ulanmagan bo\'lsa halol xabar; aktor argumenti yuborilsa server rad etadi (mijoz o\'zgartirmaydi)', async () => {
    expect(await vositaTop('mcp fakt_yoz')!.ishla(kont(undefined), {}, 'mcp fakt_yoz {}')).toMatchObject({ tur: 'javob', xato: true });
    expect(f2XatoMatni({ ok: false, code: 'ARGUMENT_TAQIQLANGAN' })).toMatch(/sessiyadan/);
  });
  it('preview matni: qator oldin→keyin, jami tartibi QQS bilan → ustamali → ustamasiz, NULL ≠ 0', () => {
    const m = previewMatni(PREVIEW);
    expect(m.indexOf('QQS bilan')).toBeLessThan(m.indexOf('ustamali')); expect(m.indexOf('ustamali')).toBeLessThan(m.indexOf('ustamasiz'));
    expect(m).toMatch(/sinov ogohlantirish/);
    expect(previewMatni({ ...PREVIEW, preview: { ...PREVIEW.preview!, jami: { oldin: null, keyin: null, farq: null } } })).toMatch(/noma'lum, 0 emas/);
  });
});
