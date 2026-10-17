import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), ai: vi.fn(), Xato: class extends Error { constructor(readonly kod: string, readonly xabar: string) { super(kod); } } }));
vi.mock('../_shared/auth', () => ({ tekshir: m.auth }));
vi.mock('../_shared/ai-hisobli', () => ({ aiHisobli: m.ai, AiByudjetXatosi: m.Xato }));
import { INTERNET_MODEL, onRequestPost } from './smeta-ai';

const run = (body: unknown) => onRequestPost({ request: new Request('https://x/api/smeta-ai', { method: 'POST', body: JSON.stringify(body) }),
  env: { SESSIYA_KALIT: 't', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'k' } } as never);
const SAHIFA: Record<string, string> = {
  'https://beton.uz/armatura-a500c-10': '<html><h1>Арматура A500C ф10мм</h1><p>Цена: 9 072 000 сум за тонну, с НДС</p></html>',
  'https://shop.uz/armatura': '<html><h1>Арматура A500C 10 мм</h1><p>Цена 7 777 777</p></html>',
};
beforeEach(() => {
  m.auth.mockResolvedValue({ foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17 }] });
  m.ai.mockReset();
  vi.stubGlobal('fetch', vi.fn(async (u: string) => SAHIFA[u] ? new Response(SAHIFA[u], { status: 200, headers: { 'content-type': 'text/html' } }) : new Response('nf', { status: 404, headers: { 'content-type': 'text/html' } })));
});
afterEach(() => vi.unstubAllGlobals());

it('veb-qidiruvli model bilan, hisobli; faqat sahifada TEKSHIRILGAN narx olinadi, QQSsiz va smeta birligida', async () => {
  m.ai.mockResolvedValue({ provider: 'openrouter', model: INTERNET_MODEL, text: JSON.stringify({ natijalar: [{ id: 'r0', izoh: '', manbalar: [
    { url: 'https://beton.uz/armatura-a500c-10', nom: 'Арматура A500C ф10', narx: 9_072_000, birlik: 'т', nds: 'bilan', sotuvchi: 'Beton.uz' },
    { url: 'https://shop.uz/armatura', nom: 'Арматура', narx: 8_000_000, birlik: 'т', nds: 'siz', sotuvchi: 'Shop' },   // narx sahifada yo'q
    { url: 'https://yoq.uz/x', nom: 'Арматура', narx: 8_100_000, birlik: 'т', nds: 'siz', sotuvchi: 'Yo‘q' } ] }] }) });
  const r = await run({ amal: 'narx_internet', kompaniya_id: 17, sorovlar: [{ id: 'r0', nom: 'Арматура А500С Д10', birlik: 'т', kat: 'МАТ' }] });
  expect(r.status).toBe(200);
  expect(m.ai.mock.calls[0].slice(1, 5)).toEqual([7, 17, 'smeta_ai', 'smeta_narx_internet']);
  expect(m.ai.mock.calls[0][5]).toMatchObject({ model: INTERNET_MODEL });
  const j = await r.json() as { natijalar: Array<{ narx: number; manbalar: Array<{ tekshirildi: boolean; sabab: string | null; smetaNarx: number }> }> };
  expect(j.natijalar[0].narx).toBe(8_100_000);   // 9 072 000 / 1,12
  expect(j.natijalar[0].manbalar.map(x => x.tekshirildi)).toEqual([true, false, false]);
  expect(j.natijalar[0].manbalar[1].sabab).toContain('narx topilmadi');
});
it('mehnat (ЧЕЛ) internetga yuborilmaydi; begona kompaniya 403', async () => {
  expect((await run({ amal: 'narx_internet', kompaniya_id: 17, sorovlar: [{ id: 'r0', nom: 'Затраты труда рабочих', birlik: 'чел.-ч', kat: 'ЧЕЛ' }] })).status).toBe(400);
  expect((await run({ amal: 'narx_internet', kompaniya_id: 99, sorovlar: [{ id: 'r0', nom: 'Цемент М400', birlik: 'т', kat: 'МАТ' }] })).status).toBe(403);
  expect(m.ai).not.toHaveBeenCalled();
});
it('birligi aniq o‘tmaydigan manba tekshirilmaydi va hisobga olinmaydi', async () => {
  m.ai.mockResolvedValue({ provider: 'openrouter', model: INTERNET_MODEL, text: JSON.stringify({ natijalar: [{ id: 'r0', izoh: '', manbalar: [
    { url: 'https://beton.uz/armatura-a500c-10', nom: 'x', narx: 9_072_000, birlik: 'м2', nds: 'bilan', sotuvchi: 'B' }] }] }) });
  const j = await (await run({ amal: 'narx_internet', kompaniya_id: 17, sorovlar: [{ id: 'r0', nom: 'Арматура А500С Д10', birlik: 'т', kat: 'МАТ' }] })).json() as { natijalar: Array<{ narx: number | null; manbalar: Array<{ sabab: string }> }> };
  expect(j.natijalar[0].narx).toBeNull();
  expect(j.natijalar[0].manbalar[0].sabab).toContain('birlik');
});
