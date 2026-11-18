// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { telemetriyaYoz, xatoKodi, yuzaAniqla } from './ai-telemetriya';

afterEach(() => vi.unstubAllGlobals());
const env = { SUPABASE_URL: 'https://t.supabase.co', SUPABASE_KEY: 'k' };

describe('ai-telemetriya', () => {
  it('yuzaAniqla: amal/profil bo\'yicha yuza', () => {
    expect(yuzaAniqla('jarvis_eski', 'company_access')).toBe('jarvis');
    expect(yuzaAniqla('kasb_savol')).toBe('jarvis');
    expect(yuzaAniqla('smeta_narx_tanlash', 'smeta_ai')).toBe('smeta_ai');
    expect(yuzaAniqla('ai_ishchi', 'kunlik_nazoratchi')).toBe('ai_ishchi');
    expect(yuzaAniqla('ombor_buyruq')).toBe('ombor');
    expect(yuzaAniqla('x', null, 'workers')).toBe('workers_ai');
    expect(yuzaAniqla('faktura_parse', 'document_control')).toBe('boshqa');
  });
  it('xatoKodi: kod/code, aks holda AI_XATO; yomon qiymat tozalanadi', () => {
    expect(xatoKodi({ kod: 'BYUDJET_TUGADI' })).toBe('BYUDJET_TUGADI');
    expect(xatoKodi({ code: 'timeout' })).toBe('timeout');
    expect(xatoKodi(new Error('secret text here'))).toBe('AI_XATO');
    expect(xatoKodi({ code: 'bad code with spaces' })).toBe('AI_XATO');
    expect(xatoKodi(null)).toBe('AI_XATO');
  });
  it('telemetriyaYoz: faqat sonlar/kodlar yuboriladi (matn yo\'q), xato bo\'lsa false va throw yo\'q', async () => {
    const f = vi.fn(async () => Response.json({ ok: true })); vi.stubGlobal('fetch', f);
    const ok = await telemetriyaYoz(env, { actor: 7, kompaniyaId: 17, yuza: 'jarvis', model: 'm/x', kechikishMs: 1234.6, ok: false, xatoKod: 'timeout', niyat: 'kasb_savol',
      vositalar: ['qidir', 'bad tool!', 'holat'], vositaXato: 1, kirish: 10, chiqish: 5, manba: 'model' });
    expect(ok).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toContain('/rpc/t2_ai_telemetriya_yoz_v1');
    const b = JSON.parse(init.body);
    expect(b).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 17, p_yuza: 'jarvis', p_kechikish_ms: 1235, p_ok: false, p_xato_kod: 'timeout', p_niyat: 'kasb_savol', p_vositalar: ['qidir', 'holat'], p_vosita_xato: 1, p_manba: 'model' });
    expect(Object.keys(b).some((k) => /matn|text|savol|javob|prompt/.test(k))).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('tarmoq'); }));
    await expect(telemetriyaYoz(env, { yuza: 'jarvis', ok: true })).resolves.toBe(false);
    await expect(telemetriyaYoz({}, { yuza: 'jarvis', ok: true })).resolves.toBe(false);
  });
  it('ok=true bo\'lsa xato kodi yuborilmaydi; noto\'g\'ri yuza -> boshqa', async () => {
    const f = vi.fn(async () => Response.json({ ok: true })); vi.stubGlobal('fetch', f);
    await telemetriyaYoz(env, { yuza: 'BAD YUZA', ok: true, xatoKod: 'X' });
    const b = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(b.p_xato_kod).toBeNull(); expect(b.p_yuza).toBe('boshqa');
  });
});