import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), ai: vi.fn(), Xato: class extends Error { constructor(readonly kod: string, readonly xabar: string) { super(kod); } } }));
vi.mock('../_shared/auth', () => ({ tekshir: m.auth }));
vi.mock('../_shared/ai-hisobli', () => ({ aiHisobli: m.ai, AiByudjetXatosi: m.Xato }));
vi.mock('../_shared/agent-rpc', () => ({ rpcData: async () => ({ ok: false, status: 502, data: {} }) }));
import { onRequestPost } from './smeta-ai';

const MATN = "2 qavatli g'isht uy, lenta poydevor, perimetr 36 m, tom profnastil";
const run = (body: Record<string, unknown>) => onRequestPost({ request: new Request('https://test/api/smeta-ai', { method: 'POST', body: JSON.stringify({ amal: 'ustasi_scope', kompaniya_id: 17, matn: MATN, ...body }) }), env: { SESSIYA_KALIT: 'test' } } as never);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const js = async (r: Response): Promise<any> => r.json();
const javob = (o: unknown) => ({ provider: 'openrouter', model: 'test-model', text: JSON.stringify(o) });

beforeEach(() => { m.auth.mockResolvedValue({ foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17 }] }); m.ai.mockReset(); });

describe('ustasi_scope (AI smeta ustasi): model Scope beradi, ishlar KOD bilan', () => {
  it('boshqa kompaniya — model chaqirilmaydi (tenant default-deny)', async () => {
    const r = await run({ kompaniya_id: 99 });
    expect(r.status).toBe(403); expect(m.ai).not.toHaveBeenCalled();
  });
  it('qisqa matn va fayl dalillari (keyingi bosqich) rad etiladi', async () => {
    expect((await js(await run({ matn: 'uy' }))).code).toBe('SOROV_INVALID');
    expect((await js(await run({ fayl_idlar: ['a1'] }))).code).toBe('FAYL_HALI_YOQ');
    expect(m.ai).not.toHaveBeenCalled();
  });
  it('hisobli chaqiruv (smeta_ai / smeta_ustasi_scope); Scope tekshiriladi, hajm kodda hisoblanadi, yetishmagan parametr savolga aylanadi', async () => {
    m.ai.mockResolvedValue(javob({
      elementlar: [{ id: 'yer_ishlari', manba: 'user' }, { id: 'tom', manba: 'user' }],
      olchamlar: [{ param: 'poydevor_turi', qiymat: 'lenta', birlik: null, manba: 'user' }, { param: 'perimetr', qiymat: '36', birlik: 'm', manba: 'user' },
        { param: 'poydevor_kengligi', qiymat: '0,5', birlik: 'm', manba: 'user' } /* matnda yo'q -> taxmin */, { param: 'tom_turi', qiymat: 'profnastil', birlik: null, manba: 'user' }],
      taxminlar: [], savollar: [] }));
    const j = await js(await run({}));
    expect(m.ai.mock.calls[0].slice(1, 5)).toEqual([7, 17, 'smeta_ai', 'smeta_ustasi_scope']);
    expect(m.ai.mock.calls[0][5].text).toContain(MATN);
    expect(j.ok).toBe(true); expect(j.tushunildi).toBe(true);
    expect(j.shablon).toMatchObject({ id: 'xususiy-uy', holat: 'EGASI_TEKSHIRISHI_KERAK' });
    expect(j.scope.olchamlar.poydevor_kengligi.source).toBe('assumed');
    const ids = j.kengaytma.ishlar.map((i: { id: string }) => i.id);
    expect(ids).toContain('tom-profnastil');
    // poydevor_chuqurligi aytilmagan -> transheya HAJM_KERAK + savol (jim sukut qiymat yo'q)
    expect(j.kengaytma.ishlar.find((i: { id: string }) => i.id === 'yer-transheya')).toMatchObject({ holat: 'HAJM_KERAK', hajmIfoda: null });
    expect(j.kengaytma.savollar.some((s: { param?: string }) => s.param === 'poydevor_chuqurligi')).toBe(true);
    expect(j.kengaytma.ishlar.find((i: { id: string }) => i.id === 'tom-profnastil')).toMatchObject({ holat: 'HAJM_KERAK' }); // tom_maydoni yo'q
  });
  it('model JSON bermasa — bo\'sh Scope, tushunildi:false, ishlar yo\'q', async () => {
    m.ai.mockResolvedValue({ provider: 'openrouter', model: 'test-model', text: 'kechirasiz' });
    const j = await js(await run({}));
    expect(j.tushunildi).toBe(false); expect(j.kengaytma.ishlar).toEqual([]);
  });
  it('byudjet yo\'q — 402', async () => {
    m.ai.mockRejectedValue(new m.Xato('BYUDJET_YOQ', 'limit yo\'q'));
    const r = await run({});
    expect(r.status).toBe(402);
  });
});
