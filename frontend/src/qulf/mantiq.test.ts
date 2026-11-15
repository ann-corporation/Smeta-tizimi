import { describe, expect, it, vi } from 'vitest';
import { b64uDan, b64uGa, keyingiTekshiruvMs, muddatMs, pinBosh, pinOchir, pinRaqam, pinTayyor, qulfKerakmi } from './mantiq';
import { interseptorOrnat } from './interseptor';

const t0 = 1_800_000_000_000;
const MIN = 60_000;

describe('qulfKerakmi (bo‘sh turish / yashirin varaq)', () => {
  const s = (o: Partial<Parameters<typeof qulfKerakmi>[0]> = {}) => ({ yoqilgan: true, oxirgiFaol: t0, yashirinBoshi: null, hozir: t0, daqiqa: 10, ...o });
  it('yoqilmagan bo‘lsa hech qachon qulflamaydi', () => { expect(qulfKerakmi(s({ yoqilgan: false, hozir: t0 + 999 * MIN }))).toBe(false); });
  it('muddatdan oldin qulflamaydi, muddatda qulflaydi', () => {
    expect(qulfKerakmi(s({ hozir: t0 + 9 * MIN + 59_000 }))).toBe(false);
    expect(qulfKerakmi(s({ hozir: t0 + 10 * MIN }))).toBe(true);
  });
  it('varaq N daqiqa yashirin tursa qulflaydi (harakat yangi bo‘lsa ham)', () => {
    expect(qulfKerakmi(s({ oxirgiFaol: t0 + 20 * MIN, yashirinBoshi: t0 + 15 * MIN, hozir: t0 + 21 * MIN }))).toBe(false);
    expect(qulfKerakmi(s({ oxirgiFaol: t0 + 20 * MIN, yashirinBoshi: t0 + 5 * MIN, hozir: t0 + 15 * MIN + 1 }))).toBe(true);
  });
  it('muddat 1..60 ga qisiladi, noto‘g‘ri qiymat standart 10', () => {
    expect(muddatMs(0)).toBe(10 * MIN); // NaN/0 -> standart
    expect(muddatMs(-5)).toBe(1 * MIN);
    expect(muddatMs(500)).toBe(60 * MIN);
    expect(muddatMs(1)).toBe(MIN);
  });
  it('taymer oralig‘i kamida 1 s', () => {
    expect(keyingiTekshiruvMs(t0, t0 + 10 * MIN, 10)).toBe(1000);
    expect(keyingiTekshiruvMs(t0, t0 + 4 * MIN, 10)).toBe(6 * MIN);
  });
});

describe('PIN klaviaturasi', () => {
  it('raqam qo‘shish, o‘chirish, 6 dan ortiq qabul qilinmaydi, raqam bo‘lmasa e‘tiborsiz', () => {
    let h = pinBosh();
    for (const d of '123456789') h = pinRaqam(h, d);
    expect(h.raqamlar).toBe('123456');
    expect(pinRaqam(h, 'a').raqamlar).toBe('123456');
    expect(pinOchir(h).raqamlar).toBe('12345');
    expect(pinTayyor(pinRaqam(pinBosh(), '1'))).toBe(false);
    expect(pinTayyor(h)).toBe(true);
    expect(pinRaqam({ ...h, band: true, raqamlar: '' }, '1').raqamlar).toBe('');
  });
});

describe('base64url', () => {
  it('aylanish', () => {
    const a = new Uint8Array([0, 250, 251, 255, 1, 2, 3]);
    expect(new Uint8Array(b64uDan(b64uGa(a)))).toEqual(a);
    expect(b64uGa(a)).not.toMatch(/[+/=]/);
  });
});

describe('step-up interseptori', () => {
  function sozla(javoblar: Response[]) {
    const chaqiruvlar: string[] = [];
    const f = vi.fn(async (input: RequestInfo | URL) => { chaqiruvlar.push(String(input)); return javoblar.shift()!; });
    const eski = window.fetch;
    window.fetch = f as unknown as typeof fetch;
    return { f, chaqiruvlar, tiklash: () => { window.fetch = eski; } };
  }
  const stepUp = () => new Response(JSON.stringify({ ok: false, code: 'STEP_UP_KERAK', usullar: ['pin'] }), { status: 403 });

  it('STEP_UP_KERAK -> oyna -> muvaffaqiyatda so‘rov qayta yuboriladi', async () => {
    const { f, tiklash } = sozla([stepUp(), new Response('{"ok":true}', { status: 200 })]);
    const sorov = vi.fn(async () => true);
    const yech = interseptorOrnat(sorov);
    const r = await window.fetch('/api/sb-yoz', { method: 'POST', body: '{"amal":"tolov_yoz"}' });
    expect(r.status).toBe(200);
    expect(sorov).toHaveBeenCalledWith(['pin']);
    expect(f).toHaveBeenCalledTimes(2);
    yech(); tiklash();
  });
  it('foydalanuvchi bekor qilsa asl 403 qaytadi, qayta yuborilmaydi', async () => {
    const { f, tiklash } = sozla([stepUp()]);
    const yech = interseptorOrnat(async () => false);
    const r = await window.fetch('/api/sb-yoz', { method: 'POST', body: '{}' });
    expect(r.status).toBe(403);
    expect(f).toHaveBeenCalledTimes(1);
    yech(); tiklash();
  });
  it('boshqa 403 xatolar va /api/qulf ga aralashmaydi', async () => {
    const { f, tiklash } = sozla([new Response('{"code":"PERMISSION_DENIED"}', { status: 403 }), stepUp()]);
    const sorov = vi.fn(async () => true);
    const yech = interseptorOrnat(sorov);
    expect((await window.fetch('/api/sb-yoz', { method: 'POST', body: '{}' })).status).toBe(403);
    expect((await window.fetch('/api/qulf', { method: 'POST', body: '{}' })).status).toBe(403);
    expect(sorov).not.toHaveBeenCalled();
    expect(f).toHaveBeenCalledTimes(2);
    yech(); tiklash();
  });
  it('tashqi origin so‘rovlariga tegmaydi', async () => {
    const { tiklash } = sozla([stepUp()]);
    const sorov = vi.fn(async () => true);
    const yech = interseptorOrnat(sorov);
    expect((await window.fetch('https://boshqa.example/api/x', { method: 'POST', body: '{}' })).status).toBe(403);
    expect(sorov).not.toHaveBeenCalled();
    yech(); tiklash();
  });
});
