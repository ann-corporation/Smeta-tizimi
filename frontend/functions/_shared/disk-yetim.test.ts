// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const ai = vi.hoisted(() => ({ hisobli: vi.fn() }));
vi.mock('./agent-hisob', async (orig) => ({ ...(await orig<object>()), aiHisobli: ai.hisobli }));
import { yetimAi, yetimKochir, yetimRoyxat } from './disk-yetim';

afterEach(() => { vi.unstubAllGlobals(); ai.hisobli.mockReset(); });

const env = { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: 's', R2_CANONICAL: {} as R2Bucket };
const obyektlar = [
  { id: 10, nom: 'Fast Food', loyiha_id: 1, loyiha_nom: 'Navoiy bog‘', shartnoma_id: 5, shartnoma_raqam: '15-A' },
  { id: 11, nom: 'Karting', loyiha_id: 1, loyiha_nom: 'Navoiy bog‘', shartnoma_id: 5, shartnoma_raqam: '15-A' },
];
const royxat = {
  ok: true, papka_id: 70, daraja: 4, loyihalar: [{ id: 1, nom: 'Navoiy bog‘' }], obyektlar,
  fayllar: [
    { id: 1, nom: 'Nakopitelniy — Karting — 2026-11.xlsx', bayt: 100, versiya: 1, yangilandi: '2026-11-18T10:00:00Z', hujjat_turi: 'nakopitelniy' },
    { id: 2, nom: 'Noma‘lum hujjat 7.pdf', bayt: 50, versiya: 1, yangilandi: '2026-11-18T10:00:00Z' },
  ],
};
function rpcMock(j: Record<string, unknown>) {
  const c: Array<{ nom: string; args: any }> = [];
  vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
    const nom = String(u).split('/rpc/')[1]; c.push({ nom, args: JSON.parse(String(init?.body ?? '{}')) });
    const v = j[nom];
    return v && typeof v === 'object' && 'status' in (v as object) ? Response.json((v as any).body, { status: (v as any).status }) : Response.json((v as object) ?? { ok: true });
  }));
  return c;
}

describe('yetimRoyxat', () => {
  it('fayllar deterministik taklif bilan: aniq / taklif yo‘q; nomzodlar qo‘lda tanlash uchun qaytadi', async () => {
    const c = rpcMock({ t2_disk_yetim_royxat_v1: royxat });
    const r = await yetimRoyxat(env, 7, 17);
    const j: any = await r.json();
    expect(c[0]).toMatchObject({ nom: 't2_disk_yetim_royxat_v1', args: { p_actor: 7, p_kompaniya: 17 } });
    expect(j.ok).toBe(true);
    expect(j.fayllar[0].taklif).toMatchObject({ daraja: 'aniq', obyektId: 11, loyihaId: 1 });
    expect(j.fayllar[1].taklif).toMatchObject({ daraja: 'yoq', obyektId: null });
    expect(j.obyektlar).toHaveLength(2); expect(j.papka_id).toBe(70);
  });
  it('RPC xatosi (ruxsat yo‘q) javobga o‘tadi', async () => {
    rpcMock({ t2_disk_yetim_royxat_v1: { ok: false, code: 'RUXSAT_YOQ' } });
    const r = await yetimRoyxat(env, 7, 17);
    expect(r.status).toBe(403); expect(((await r.json()) as any).code).toBe('RUXSAT_YOQ');
  });
});

describe('yetimAi - faqat deterministik taklifi yo‘q fayllar uchun, mavjud aiHisobli orqali', () => {
  it('ishonchli javob qaytadi; model faqat «yoq» fayllarni ko‘radi (aniq fayl AI ga yuborilmaydi)', async () => {
    rpcMock({ t2_disk_yetim_royxat_v1: royxat });
    ai.hisobli.mockResolvedValue({ text: JSON.stringify({ natija: [{ fayl_id: 2, obyekt_id: 10, ishonch: 0.8 }] }), model: 'm' });
    const r = await yetimAi(env, 7, 17, [1, 2]);
    const j: any = await r.json();
    expect(j.ai_chaqirildi).toBe(true);
    expect(j.takliflar).toEqual([expect.objectContaining({ faylId: 2, obyektId: 10, manba: 'ai', daraja: 'taxminiy' })]);
    const [, actor, kid, profil, amal, req] = ai.hisobli.mock.calls[0];
    expect([actor, kid, profil, amal]).toEqual([7, 17, null, 'disk_yetim_taklif']);
    expect(req.text).toContain('Noma‘lum hujjat 7.pdf');
    expect(req.text).not.toContain('Nakopitelniy — Karting');
    expect(req.jsonSchema.name).toBe('disk_yetim_taklif');
  });
  it('model o‘ylab topgan id rad etiladi', async () => {
    rpcMock({ t2_disk_yetim_royxat_v1: royxat });
    ai.hisobli.mockResolvedValue({ text: JSON.stringify({ natija: [{ fayl_id: 2, obyekt_id: 999, ishonch: 0.99 }] }), model: 'm' });
    const j: any = await (await yetimAi(env, 7, 17, [2])).json();
    expect(j.takliflar).toEqual([]);
  });
  it('taklifi bor (aniq) fayl tanlansa AI chaqirilmaydi, token sarflanmaydi', async () => {
    rpcMock({ t2_disk_yetim_royxat_v1: royxat });
    const j: any = await (await yetimAi(env, 7, 17, [1])).json();
    expect(j).toMatchObject({ ok: true, ai_chaqirildi: false, takliflar: [] });
    expect(ai.hisobli).not.toHaveBeenCalled();
  });
  it('AI limiti/token yo‘q -> 402 xato javobi, ro‘yxat buzilmaydi', async () => {
    rpcMock({ t2_disk_yetim_royxat_v1: royxat });
    const { ByudjetXatosi } = await vi.importActual<typeof import('./agent-hisob')>('./agent-hisob');
    ai.hisobli.mockRejectedValue(new ByudjetXatosi('TOKEN_YETMAYDI', 'x'));
    const r = await yetimAi(env, 7, 17, [2]);
    expect(r.status).toBe(402); expect(((await r.json()) as any).code).toBe('TOKEN_YETMAYDI');
  });
  it('buzuq JSON javob -> bo‘sh taklif (xato emas)', async () => {
    rpcMock({ t2_disk_yetim_royxat_v1: royxat });
    ai.hisobli.mockResolvedValue({ text: 'bu json emas', model: 'm' });
    const j: any = await (await yetimAi(env, 7, 17, [2])).json();
    expect(j).toMatchObject({ ok: true, takliflar: [] });
  });
});

describe('yetimKochir - SQL RPC ga aynan', () => {
  it('actor sessiyadan, id lar RPC ga o‘tadi; muvaffaqiyat javobi', async () => {
    const c = rpcMock({ t2_disk_yetim_kochir_v1: { ok: true, fayl_id: 1, papka_id: 90 } });
    const r = await yetimKochir(env, 7, 17, 1, 1, 11);
    expect(c[0]).toEqual({ nom: 't2_disk_yetim_kochir_v1', args: { p_actor: 7, p_kompaniya: 17, p_fayl_id: 1, p_loyiha_id: 1, p_obyekt_id: 11 } });
    expect(((await r.json()) as any).papka_id).toBe(90);
  });
  it('SQL rad kodlari foydalanuvchi matni bilan qaytadi', async () => {
    rpcMock({ t2_disk_yetim_kochir_v1: { ok: false, code: 'YETIM_EMAS' } });
    const r = await yetimKochir(env, 7, 17, 1, null, 11);
    expect(r.status).toBe(409); const j: any = await r.json(); expect(j.code).toBe('YETIM_EMAS'); expect(j.xato).toMatch(/biriktirilgan/);
  });
});
