// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const chaqiruvlar: { api: string; json?: Record<string, unknown> }[] = [];
let javoblar: { status: number; body: Record<string, unknown> | null }[] = [];
vi.mock('./telegram-amal', () => ({
  botChaqiruv: vi.fn(async (_env: unknown, _uid: number, c: { api: string; json?: Record<string, unknown> }) => { chaqiruvlar.push(c); return javoblar.shift() ?? { status: 500, body: null }; }),
}));
vi.mock('../api/_middleware', () => ({ onRequest: vi.fn() }));
vi.mock('../api/ombor-buyruq', () => ({ onRequestPost: vi.fn() }));

import { omborBuyruq, omborSavolCallback, savolCallbackOl } from './telegram-ombor';
import { tokenYarat } from './ombor-buyruq-yadro';

const env = { SESSIYA_KALIT: 'synthetic-only'.repeat(3) } as never;
const kontekst = { status: 200, body: { omborlar: [{ id: 3, kompaniya_id: 8, nomi: 'Sintetik ombor', yozish: true }] } };
const savolJavob = { status: 200, body: { ok: true, holat: 'savol', savol: 'Bu — kirimmi yoki chiqimmi?', variantlar: [{ yorliq: 'Kirim', tanlov: { amal: 'prixod' } }, { yorliq: 'Chiqim', tanlov: { amal: 'chiqim' } }] } };
type Kb = { inline_keyboard: { text: string; callback_data: string }[][] };
beforeEach(() => { chaqiruvlar.length = 0; javoblar = []; });

describe('savolCallbackOl: callback_data tahlili', () => {
  it('to\'g\'ri shakllar', () => {
    expect(savolCallbackOl('os:v:0')).toEqual({ tur: 'v', i: 0 });
    expect(savolCallbackOl('os:v:12')).toEqual({ tur: 'v', i: 12 });
    expect(savolCallbackOl('os:r:b')).toEqual({ tur: 'r', rejim: 'bilan' });
    expect(savolCallbackOl('os:r:s')).toEqual({ tur: 'r', rejim: 'siz' });
  });
  it.each(['os:v:', 'os:v:-1', 'os:v:1x', 'os:r:x', 'os:', 'ob:y', 'os:v:123', 'os:v:1:2', undefined, 5, null])('yaroqsiz %j rad etiladi', (d) => {
    expect(savolCallbackOl(d)).toBeNull();
  });
});

describe('Telegram ombor: aniqlovchi savol tugmalari (to\'liq oqim)', () => {
  it('savol → variant tugmalari + imzolangan token; tugma bosilganda matn tanlov bilan qayta yuboriladi', async () => {
    javoblar = [kontekst, savolJavob];
    const j = await omborBuyruq(env, 7, 'uz', { matn: 'sement 10 qop' });
    const kb = (j!.markup as Kb).inline_keyboard;
    expect(kb.map((q) => q[0].text)).toEqual(['Kirim', 'Chiqim']);
    expect(kb.map((q) => q[0].callback_data)).toEqual(['os:v:0', 'os:v:1']);
    expect(kb.every((q) => new TextEncoder().encode(q[0].callback_data).length <= 64)).toBe(true);
    expect(j!.matn).toMatch(/#OS:[\w-]+\.[\w-]+$/);

    javoblar = [{ status: 200, body: { ok: true, holat: 'tasdiq_kerak', token: 'a.b', preview: { tur: 'prixod', nomi: 'Sement', birligi: 'qop', miqdor: 10, sana: '2026-11-18', narx: null, ogohlantirish: [] } } }];
    const r = await omborSavolCallback(env, 7, 'uz', { data: 'os:v:0', message: { text: j!.matn } });
    expect(r.amal).toBe('ombor_savol');
    expect(r.tugmalarniOlibTashla).toBe(true);
    const so = chaqiruvlar.at(-1)!.json!;
    expect(so).toMatchObject({ amal: 'tahlil', kompaniya_id: 8, sklad_id: 3, matn: 'sement 10 qop', tanlov: { amal: 'prixod' } });
    expect(r.xabar!.matn).toContain('KIRIM');
    expect((r.xabar!.markup as Kb).inline_keyboard[0].map((x) => x.callback_data)).toEqual(['ob:y', 'ob:n']);
  });

  it('ru tilida server javob_til=ru oladi', async () => {
    javoblar = [kontekst, savolJavob];
    await omborBuyruq(env, 7, 'ru', { matn: 'sement 10' });
    expect(chaqiruvlar.at(-1)!.json!.javob_til).toBe('ru');
    javoblar = [kontekst, savolJavob];
    await omborBuyruq(env, 7, 'uz', { matn: 'sement 10' });
    expect(chaqiruvlar.at(-1)!.json!.javob_til).toBeUndefined();
  });

  it('narx savoli: «QQS bilan / QQS siz» tugmalari, bosilganda narx_rejim yuboriladi va oldingi tanlov saqlanadi', async () => {
    const tasdiq = (rej: boolean) => ({ status: 200, body: { ok: true, holat: 'tasdiq_kerak', token: 'a.b', preview: { tur: 'prixod', nomi: 'Sement', birligi: 'qop', miqdor: 10, sana: '2026-11-18', narx: 1000, narx_bilan: 1120, narx_rejim_sorov: rej, ogohlantirish: [] } } });
    javoblar = [kontekst, tasdiq(true)];
    const j = await omborBuyruq(env, 7, 'uz', { matn: 'sement 10 qop 1120 dan keldi' });
    const kb = (j!.markup as Kb).inline_keyboard;
    expect(kb[0].map((x) => x.callback_data)).toEqual(['ob:y', 'ob:n']);
    expect(kb[1].map((x) => [x.text, x.callback_data])).toEqual([['QQS bilan', 'os:r:b'], ['QQS siz', 'os:r:s']]);
    expect(j!.matn).toMatch(/#OS:[\w-]+\.[\w-]+\n#OB:a\.b$/);

    javoblar = [tasdiq(false)];
    const r = await omborSavolCallback(env, 7, 'uz', { data: 'os:r:s', message: { text: j!.matn } });
    expect(chaqiruvlar.at(-1)!.json).toMatchObject({ amal: 'tahlil', matn: 'sement 10 qop 1120 dan keldi', narx_rejim: 'siz' });
    expect((r.xabar!.markup as Kb).inline_keyboard).toHaveLength(1); // rejim aniq — qayta so'ralmaydi
  });

  it('ketma-ket savollarda oldingi tanlov (amal) keyingi so\'rovga qo\'shiladi', async () => {
    javoblar = [kontekst, savolJavob];
    const j1 = await omborBuyruq(env, 7, 'uz', { matn: 'x' });
    javoblar = [{ status: 200, body: { ok: true, holat: 'savol', savol: 'Qaysi yetkazuvchi?', variantlar: [{ yorliq: 'Alfa', tanlov: { kontragent: 'Alfa' } }] } }];
    const r1 = await omborSavolCallback(env, 7, 'uz', { data: 'os:v:1', message: { text: j1!.matn } });
    javoblar = [{ status: 200, body: { ok: true, holat: 'javob', nomzodlar: [] } }];
    await omborSavolCallback(env, 7, 'uz', { data: 'os:v:0', message: { text: r1.xabar!.matn } });
    expect(chaqiruvlar.at(-1)!.json!.tanlov).toEqual({ amal: 'chiqim', kontragent: 'Alfa' });
  });

  it('variantsiz savol (matn kerak): tugma yo\'q, oddiy matn', async () => {
    javoblar = [kontekst, { status: 200, body: { ok: true, holat: 'savol', savol: 'Qancha?', variantlar: [] } }];
    const j = await omborBuyruq(env, 7, 'uz', { matn: 'sement' });
    expect(j!.markup).toBeUndefined();
    expect(j!.matn).toBe('Qancha?');
  });
});

describe('Telegram ombor: savol tugmalari xavfsizligi', () => {
  const xabar = async (uid: number, op = 'sv', ms?: number) => {
    const tok = await tokenYarat(String((env as { SESSIYA_KALIT: string }).SESSIYA_KALIT), { a: uid, k: 8, s: 3, op, p: { matn: 'sement 10', t: {}, n: 'Ombor', v: [{ amal: 'prixod' }] } }, ms ?? 60_000);
    return { text: `Savol\n\n#OS:${tok}` };
  };
  it('begona foydalanuvchi tokeni rad etiladi (serverga so\'rov yo\'q)', async () => {
    const r = await omborSavolCallback(env, 99, 'uz', { data: 'os:v:0', message: await xabar(7) });
    expect(r.amal).toBe('ombor_begona');
    expect(r.tugmalarniOlibTashla).toBeFalsy();
    expect(chaqiruvlar).toHaveLength(0);
  });
  it('muddati o\'tgan token rad etiladi', async () => {
    const r = await omborSavolCallback(env, 7, 'uz', { data: 'os:v:0', message: await xabar(7, 'sv', -1000) });
    expect(r.amal).toBe('ombor_muddat');
    expect(chaqiruvlar).toHaveLength(0);
  });
  it('tokensiz, buzilgan, boshqa kalit bilan imzolangan yoki boshqa turdagi (tasdiq) token — eskirgan', async () => {
    expect((await omborSavolCallback(env, 7, 'uz', { data: 'os:v:0', message: { text: 'oddiy' } })).amal).toBe('ombor_eskirgan');
    expect((await omborSavolCallback(env, 7, 'uz', { data: 'os:v:0', message: { text: '#OS:AAAA.BBBB' } })).amal).toBe('ombor_eskirgan');
    const boshqa = await tokenYarat('another-synthetic-key-0123456789', { a: 7, k: 8, s: 3, op: 'sv', p: { matn: 'x', t: {}, n: 'O', v: [] } });
    expect((await omborSavolCallback(env, 7, 'uz', { data: 'os:v:0', message: { text: '#OS:' + boshqa } })).amal).toBe('ombor_eskirgan');
    expect((await omborSavolCallback(env, 7, 'uz', { data: 'os:v:0', message: await xabar(7, 'boshqa-op') })).amal).toBe('ombor_eskirgan');
    expect((await omborSavolCallback(env, 7, 'uz', { data: 'os:v:5', message: await xabar(7) })).amal).toBe('ombor_eskirgan'); // variant indeksi yo'q
    expect((await omborSavolCallback(env, 7, 'uz', { data: 'os:zzz', message: await xabar(7) })).amal).toBe('ombor_eskirgan');
    expect(chaqiruvlar).toHaveLength(0);
  });
  it('server rad etsa (ruxsat) — yozilmaydi, xato matni', async () => {
    javoblar = [{ status: 403, body: { ok: false, code: 'PERMISSION_DENIED' } }];
    const r = await omborSavolCallback(env, 7, 'uz', { data: 'os:v:0', message: await xabar(7) });
    expect(r.amal).toBe('ombor_rad');
    expect(r.xabar!.matn).toBe('Ruxsat yo‘q');
  });
});
