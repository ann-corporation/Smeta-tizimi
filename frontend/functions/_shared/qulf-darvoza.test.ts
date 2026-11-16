import { describe, expect, it } from 'vitest';
import { imzola } from './auth';
import { qulfDarvoza } from './qulf-darvoza';
import { QulfYoq } from './qulf-store';
import type { QulfStore } from './qulf-amal';
import { tasdiqYarat, type Talab } from './qulf';
import { xotiraStore } from './qulf-xotira';
import { STEP_UP_API_AMALLAR, STEP_UP_BUYRUQLAR, WRITE_COMMAND_POLICY, stepUpKerak } from './write-command-policy';

const KALIT = 'test-kalit-0123456789abcdef-test';
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KALIT };
const sess = () => imzola({ rol: 'pto', foydalanuvchi_id: 11 }, KALIT);
const so = (talab: Partial<Talab>): QulfStore => ({ ...xotiraStore(), talab: async () => ({ talab: true, rejim: 'pin', pin: true, kalit: false, ...talab }) });
async function sorov(extra: Record<string, string> = {}) {
  const c = await sess();
  return new Request('https://qur.uz/api/sb-yoz', { method: 'POST', headers: { Cookie: 'sess=' + c, ...extra } });
}
async function jtiOl(c: string) { return JSON.parse(atob(c.split('.')[0])).jti as string; }

describe('stepUpKerak (policy)', () => {
  it('pul buyruqlari reyestrda ro\'yxatdan o\'tgan', () => {
    for (const n of STEP_UP_BUYRUQLAR) expect(WRITE_COMMAND_POLICY[n], n).toBeTruthy();
  });
  it('pul/imzo/tasdiq ha, oddiy yozuv yo\'q', () => {
    expect(stepUpKerak('sb-yoz', { amal: 'bux_kassa_yoz_v1' })).toBe(true);
    expect(stepUpKerak('sb-yoz', { amal: 'akt_tasdiqlash' })).toBe(true);
    expect(stepUpKerak('sb-yoz', { amal: 'qator_tahrir' })).toBe(false);
    expect(stepUpKerak('sb-yoz', { amal: 'akt_lifecycle_transition_v1', to_status: 'approved' })).toBe(true);
    expect(stepUpKerak('sb-yoz', { amal: 'akt_lifecycle_transition_v1', to_status: 'submitted' })).toBe(false);
    expect(stepUpKerak('sb-yoz', { amal: 'akt_lifecycle_transition_v1', to_status: 'cancelled' })).toBe(false);
    expect(stepUpKerak('imzo', { amal: 'yoz' })).toBe(true);
    expect(stepUpKerak('imzo', { amal: 'kalit_yarat' })).toBe(true);
    expect(stepUpKerak('imzo', { amal: 'tayyorla' })).toBe(false);
    expect(stepUpKerak('hujjat-aylanish', { amal: 'zanjir_qaror' })).toBe(true);
    expect(stepUpKerak('hujjat-aylanish', { amal: 'bildirishnoma_oqildi' })).toBe(false);
    expect(stepUpKerak('sb', { amal: 'bux_kassa_yoz_v1' })).toBe(false);
    expect(Object.keys(STEP_UP_API_AMALLAR)).toEqual(['imzo', 'hujjat-aylanish']);
  });
});

describe('qulfDarvoza', () => {
  it('tasdiqsiz himoyalangan buyruq -> 403 STEP_UP_KERAK', async () => {
    const r = await qulfDarvoza(await sorov(), env, 'sb-yoz', { amal: 'bux_kassa_yoz_v1' }, so({}));
    expect(r!.status).toBe(403);
    expect(await r!.json()).toMatchObject({ ok: false, code: 'STEP_UP_KERAK', usullar: ['pin'] });
  });
  it('yaroqli tasdiq tokeni (cookie yoki sarlavha) -> o\'tadi', async () => {
    const c = await sess(); const t = await tasdiqYarat({ u: 11, j: await jtiOl(c), m: 'pin' }, KALIT);
    const r1 = new Request('https://qur.uz/api/sb-yoz', { method: 'POST', headers: { Cookie: `sess=${c}; qulf_tasdiq=${t}` } });
    expect(await qulfDarvoza(r1, env, 'sb-yoz', { amal: 'tolov_yoz' }, so({}))).toBeNull();
    const r2 = new Request('https://qur.uz/api/sb-yoz', { method: 'POST', headers: { Cookie: `sess=${c}`, 'X-Tasdiq': t } });
    expect(await qulfDarvoza(r2, env, 'sb-yoz', { amal: 'tolov_yoz' }, so({}))).toBeNull();
  });
  it('boshqa sessiya/foydalanuvchi tokeni, buzuq token rad', async () => {
    const c = await sess();
    const boshqa = await tasdiqYarat({ u: 11, j: 'boshqa-jti', m: 'pin' }, KALIT);
    const r = new Request('https://qur.uz/api/sb-yoz', { method: 'POST', headers: { Cookie: `sess=${c}`, 'X-Tasdiq': boshqa } });
    expect((await qulfDarvoza(r, env, 'sb-yoz', { amal: 'tolov_yoz' }, so({})))!.status).toBe(403);
    const ush = new Request('https://qur.uz/api/sb-yoz', { method: 'POST', headers: { Cookie: `sess=${c}`, 'X-Tasdiq': 'x.y' } });
    expect((await qulfDarvoza(ush, env, 'sb-yoz', { amal: 'tolov_yoz' }, so({})))!.status).toBe(403);
  });
  it('mobil kanal: token j=\'m\' bilan', async () => {
    const t = await tasdiqYarat({ u: 11, j: 'm', m: 'qurilma' }, KALIT);
    const r = await sorov({ 'X-Qulf-Kanal': 'mobil', 'X-Tasdiq': t });
    expect(await qulfDarvoza(r, env, 'sb-yoz', { amal: 'tolov_yoz' }, so({ rejim: 'biometric_or_pin', kalit: true }))).toBeNull();
    expect((await qulfDarvoza(await sorov({ 'X-Tasdiq': t }), env, 'sb-yoz', { amal: 'tolov_yoz' }, so({ rejim: 'biometric_or_pin', kalit: true })))!.status).toBe(403); // web kanalida 'm' token yaroqsiz
  });
  it('rejim pin: biometrik token qabul qilinmaydi; biometric_or_pin: qilinadi', async () => {
    const c = await sess(); const t = await tasdiqYarat({ u: 11, j: await jtiOl(c), m: 'passkey' }, KALIT);
    const r = () => new Request('https://qur.uz/api/sb-yoz', { method: 'POST', headers: { Cookie: `sess=${c}`, 'X-Tasdiq': t } });
    expect((await qulfDarvoza(r(), env, 'sb-yoz', { amal: 'tolov_yoz' }, so({ rejim: 'pin', kalit: true })))!.status).toBe(403);
    expect(await qulfDarvoza(r(), env, 'sb-yoz', { amal: 'tolov_yoz' }, so({ rejim: 'biometric_or_pin', kalit: true }))).toBeNull();
  });
  it('siyosat off yoki PIN/kalit sozlanmagan -> talab yo\'q (eski xatti-harakat)', async () => {
    expect(await qulfDarvoza(await sorov(), env, 'sb-yoz', { amal: 'tolov_yoz' }, so({ talab: false, rejim: 'off' }))).toBeNull();
    expect(await qulfDarvoza(await sorov(), env, 'sb-yoz', { amal: 'tolov_yoz' }, so({ talab: false, pin: false }))).toBeNull();
  });
  it('himoyalanmagan buyruq do\'konga ham murojaat qilmaydi', async () => {
    const s = so({}); s.talab = async () => { throw new Error('chaqirilmasligi kerak'); };
    expect(await qulfDarvoza(await sorov(), env, 'sb-yoz', { amal: 'qator_tahrir' }, s)).toBeNull();
  });
  it('migratsiya yo\'q -> o\'tkazadi; boshqa DB xatosi -> fail-closed 503', async () => {
    const yoq = so({}); yoq.talab = async () => { throw new QulfYoq(); };
    expect(await qulfDarvoza(await sorov(), env, 'sb-yoz', { amal: 'tolov_yoz' }, yoq)).toBeNull();
    const xato = so({}); xato.talab = async () => { throw new Error('QULF_DB_500'); };
    expect((await qulfDarvoza(await sorov(), env, 'sb-yoz', { amal: 'tolov_yoz' }, xato))!.status).toBe(503);
  });
  it('sessiyasiz so\'rov: boshqa qatlam rad etadi (bu yerda o\'tkazadi)', async () => {
    expect(await qulfDarvoza(new Request('https://qur.uz/api/sb-yoz', { method: 'POST' }), env, 'sb-yoz', { amal: 'tolov_yoz' }, so({}))).toBeNull();
  });
  it('imzo va zanjir qarori ham himoyalangan', async () => {
    expect((await qulfDarvoza(await sorov(), env, 'imzo', { amal: 'yoz' }, so({})))!.status).toBe(403);
    expect((await qulfDarvoza(await sorov(), env, 'hujjat-aylanish', { amal: 'zanjir_qaror' }, so({})))!.status).toBe(403);
  });
});

describe('qulfDarvoza: global o\'chirgich va PINsiz kalit', () => {
  it('QULF_YOQILGAN=0: step-up butunlay o\'chadi (default yoqiq)', async () => {
    const off = { ...env, QULF_YOQILGAN: '0' };
    expect(await qulfDarvoza(await sorov(), off, 'sb-yoz', { amal: 'bux_kassa_yoz_v1' }, so({}))).toBeNull();
    expect((await qulfDarvoza(await sorov(), { ...env, QULF_YOQILGAN: '1' }, 'sb-yoz', { amal: 'bux_kassa_yoz_v1' }, so({})))!.status).toBe(403);
  });
  it('kalit bor, PIN yo\'q (eski Windows Hello): talab yo\'q -- pul amali PINsiz tasdiqni so\'ramaydi', async () => {
    const st = xotiraStore();
    st.kl.push({ id: 1, foydalanuvchi_id: 11, tur: 'webauthn', kredensial_id: 'cred-12345678', ochiq_kalit: 'x'.repeat(50), alg: -7, hisob: 0, transports: [], qurilma_nomi: 'Windows Hello', yaratildi: '', oxirgi_ishlatildi: null });
    expect(await qulfDarvoza(await sorov(), env, 'sb-yoz', { amal: 'bux_kassa_yoz_v1' }, st)).toBeNull();
  });
});