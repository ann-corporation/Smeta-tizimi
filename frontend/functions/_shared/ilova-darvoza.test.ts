// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ilovaDarvozasi, ilovaKeshTozala } from './ilova-darvoza';

const ENV = { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k' };
const sess = { rol: 'boss', foydalanuvchi_id: 5 };
function modullar(off: string[], ok = true) {
  const f = vi.fn(async () => ok
    ? Response.json({ ok: true, modullar: ['module.moliya', 'module.sotuv', 'module.narx'].map((kod) => ({ kod, holat: off.includes(kod) ? 'off' : 'on' })) })
    : new Response('x', { status: 500 }));
  vi.stubGlobal('fetch', f);
  return f;
}
beforeEach(() => ilovaKeshTozala());
afterEach(() => vi.unstubAllGlobals());

describe('ilova darvozasi (ILOVA_YOQILMAGAN)', () => {
  it('o\'chirilgan ilova — 403 ILOVA_YOQILMAGAN', async () => {
    modullar(['module.sotuv']);
    const r = await ilovaDarvozasi(ENV, sess, 'sotuv', 17);
    expect(r?.status).toBe(403);
    expect(await r?.json()).toMatchObject({ ok: false, code: 'ILOVA_YOQILMAGAN', ilova: 'sotuv', modul: 'module.sotuv' });
  });
  it('yoqiq ilova — o\'tadi; boshqa ilova o\'chirilgani ta\'sir qilmaydi', async () => {
    modullar(['module.sotuv']);
    expect(await ilovaDarvozasi(ENV, sess, 'moliya', 17)).toBeNull();
  });
  it('yadro ilovalari (pto, ff) va ilovaga bog\'lanmagan amal — hech qachon bloklanmaydi, RPC ham chaqirilmaydi', async () => {
    const f = modullar(['module.sotuv']);
    expect(await ilovaDarvozasi(ENV, sess, 'pto', 17)).toBeNull();
    expect(await ilovaDarvozasi(ENV, sess, 'ff', 17)).toBeNull();
    expect(await ilovaDarvozasi(ENV, sess, null, 17)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it('platforma superadmini to\'siqsiz', async () => {
    modullar(['module.sotuv']);
    expect(await ilovaDarvozasi(ENV, { rol: 'superadmin', foydalanuvchi_id: 1 }, 'sotuv', 17)).toBeNull();
  });
  it('kompaniya_id yo\'q yoki noto\'g\'ri — tekshirilmaydi', async () => {
    const f = modullar(['module.sotuv']);
    expect(await ilovaDarvozasi(ENV, sess, 'sotuv', undefined)).toBeNull();
    expect(await ilovaDarvozasi(ENV, sess, 'sotuv', 'abc')).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it('holatni o\'qib bo\'lmasa — fail-open (capability tekshiruvi baribir qo\'llanadi)', async () => {
    modullar([], false);
    expect(await ilovaDarvozasi(ENV, sess, 'sotuv', 17)).toBeNull();
  });
  it('20 soniya kesh: ikki chaqiruv — bitta RPC; RPC ga actor va kompaniya beriladi', async () => {
    const f = modullar(['module.sotuv']);
    await ilovaDarvozasi(ENV, sess, 'sotuv', 17);
    await ilovaDarvozasi(ENV, sess, 'sotuv', 17);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/rest/v1/rpc/t2_modul_holat_v1');
    expect(JSON.parse(String(init.body))).toEqual({ p_kompaniya_id: 17, p_actor_id: 5 });
  });
});