import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), ai: vi.fn(), Xato: class extends Error { constructor(readonly kod: string, readonly xabar: string) { super(kod); } } }));
vi.mock('../_shared/auth', () => ({ tekshir: m.auth }));
vi.mock('../_shared/ai', () => ({ aiPublicError: () => ({ code: 'provider_unavailable', message: 'AI hozir javob bera olmadi' }) }));
vi.mock('../_shared/ai-hisobli', () => ({ aiHisobli: m.ai, AiByudjetXatosi: m.Xato }));
import { AI_LOYIHA_AMAL, AI_LOYIHA_PROFIL, AI_LOYIHA_STANDART_MODEL, keshKaliti, onRequestPost } from './ai-loyiha';
import { AI_LOYIHA_VERSIYA } from '../../src/lib/ai-loyiha/sxema';

const RASM = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5]);
const B64 = btoa(String.fromCharCode(...RASM));
let RASM_SHA = '';
const FAYL_SHA = 'a'.repeat(64);
const JAVOB = JSON.stringify({
  varaq: { shifr: 'КЖ-1', nomi: null, turi: 'KJ', masshtab: null },
  parametrlar: { uzunlik_m: 120, qadam_m: 4, yopiq_kontur: null, belgi_past_m: null, belgi_yuqori_m: null },
  elementlar: [{ marka: 'Ф1', tur: 'fundament_stakan', nom: 'Стакан', kesim: null, olcham_m: [0.5, 0.5, 0.4], uzunlik_m: null, soni: 2, miqdor: 0.2, birlik: 'м3', birlik_massa_kg: null, doira: 'bir_oraliq', varaq: 'КЖ-1', pozitsiya: '1', jadvaldan: true, ishonch: 0.9, izoh: null }],
  ogohlantirishlar: [],
});

class R2Soxta {
  store = new Map<string, string>();
  async get(k: string) { const v = this.store.get(k); return v == null ? null : { json: async () => JSON.parse(v) }; }
  async put(k: string, v: string) { this.store.set(k, v); return {}; }
}

const tana = (o: Record<string, unknown> = {}) => ({
  versiya: AI_LOYIHA_VERSIYA, kompaniya_id: 17, fayl_sha256: FAYL_SHA, varaq_turi: 'KJ',
  sahifa: { raqam: 1, jami: 2, mimeType: 'image/jpeg', base64: B64, sha256: RASM_SHA, matn: '' }, ...o,
});
const run = (body: unknown, env: Record<string, unknown> = {}) => onRequestPost({
  request: new Request('https://x/api/ai-loyiha', { method: 'POST', body: JSON.stringify(body) }),
  env: { SESSIYA_KALIT: 't', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'k', AI_LOYIHA_YOQILGAN: '1', ...env },
} as never);

beforeEach(async () => {
  RASM_SHA = [...new Uint8Array(await crypto.subtle.digest('SHA-256', RASM))].map((b) => b.toString(16).padStart(2, '0')).join('');
  m.auth.mockReset(); m.ai.mockReset();
  m.auth.mockResolvedValue({ foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17 }] });
  m.ai.mockResolvedValue({ text: JAVOB, provider: 'openrouter', model: AI_LOYIHA_STANDART_MODEL, finishReason: 'stop' });
});

it('flag o‘chiq (standart) → 404, sessiya ham tekshirilmaydi, model chaqirilmaydi', async () => {
  const r = await run(tana(), { AI_LOYIHA_YOQILGAN: undefined });
  expect(r.status).toBe(404);
  expect(m.auth).not.toHaveBeenCalled(); expect(m.ai).not.toHaveBeenCalled();
});
it('fail-closed: sessiyasiz 401; begona kompaniya 403', async () => {
  m.auth.mockResolvedValueOnce(null);
  expect((await run(tana())).status).toBe(401);
  expect((await run(tana({ kompaniya_id: 99 }))).status).toBe(403);
  expect(m.ai).not.toHaveBeenCalled();
});
it('kirish tekshiruvi: eski versiya 409, rasm emas 400, xesh mos emas 400 — AI ga bormaydi', async () => {
  expect((await run(tana({ versiya: 'eski' }))).status).toBe(409);
  expect((await run(tana({ sahifa: { ...tana().sahifa, mimeType: 'application/pdf' } }))).status).toBe(400);
  expect((await run(tana({ sahifa: { ...tana().sahifa, sha256: 'b'.repeat(64) } }))).status).toBe(400);
  expect((await run(tana({ fayl_sha256: 'yoq' }))).status).toBe(400);
  expect(m.ai).not.toHaveBeenCalled();
});
it('hisobli chaqiruv: profil/amal, vision modeli, rasm ilova; natija validatsiyadan o‘tadi + kesishma', async () => {
  const r = await run(tana());
  expect(r.status).toBe(200);
  expect(m.ai.mock.calls[0].slice(1, 5)).toEqual([7, 17, AI_LOYIHA_PROFIL, AI_LOYIHA_AMAL]);
  expect(m.ai.mock.calls[0][5]).toMatchObject({ model: AI_LOYIHA_STANDART_MODEL, temperature: 0, attachment: { mimeType: 'image/jpeg', data: B64 }, jsonSchema: { name: 'ai_loyiha_sahifa' } });
  const j = await r.json() as any;
  expect(j).toMatchObject({ ok: true, kesh: false, natija: { sahifa: 1, elementlar: [{ birlik: 'm3', soni: 2 }] } });
  expect(j.kesishma.tekshiruvlar.map((t: any) => t.kod)).toContain('IKKI_MARTA_SANALGAN');
});
it('kesh: shu fayl+sahifa+rasm qayta o‘qilsa model chaqirilmaydi (token yechilmaydi); boshqa kompaniya keshi alohida', async () => {
  const R2 = new R2Soxta();
  expect((await run(tana(), { R2_CANONICAL: R2 })).status).toBe(200);
  expect(R2.store.has(keshKaliti(17, FAYL_SHA, 1, 'KJ'))).toBe(true);
  const ikkinchi = await run(tana(), { R2_CANONICAL: R2 });
  expect(await ikkinchi.json()).toMatchObject({ ok: true, kesh: true });
  expect(m.ai).toHaveBeenCalledTimes(1);
  expect(keshKaliti(18, FAYL_SHA, 1, 'KJ')).not.toBe(keshKaliti(17, FAYL_SHA, 1, 'KJ'));
});
it('AI javobi buzuq → 422; kesilgan javob → 422 KESILDI; byudjet yo‘q → 402', async () => {
  m.ai.mockResolvedValueOnce({ text: 'not json', provider: 'openrouter', model: 'x' });
  expect((await run(tana())).status).toBe(422);
  m.ai.mockResolvedValueOnce({ text: '{', provider: 'openrouter', model: 'x', finishReason: 'length' });
  expect(await (await run(tana())).json()).toMatchObject({ code: 'KESILDI' });
  m.ai.mockRejectedValueOnce(new m.Xato('TOKEN_YETMAYDI', 'Tokenlar yetarli emas'));
  expect((await run(tana())).status).toBe(402);
});
