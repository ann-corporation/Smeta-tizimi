import { beforeEach, expect, it, vi } from 'vitest';
import { kasbQuvur } from './chat';
const boundary = vi.hoisted(() => ({ context: vi.fn(), model: vi.fn(), rpc: vi.fn() }));
vi.mock('../agent-kontekst-kesh', () => ({ kontekstOl: boundary.context }));
vi.mock('./model', () => ({ callJarvisModel: boundary.model }));
vi.mock('../agent-rpc', () => ({ rpcData: boundary.rpc }));
vi.mock('../jarvis-xotira', () => ({ xotiraOqi: async () => ({ tizim: [], kompaniya: [], foydalanuvchi: [] }) }));
vi.mock('../ai-telemetriya', () => ({ telemetriyaYoz: async () => true }));
beforeEach(() => {
  vi.clearAllMocks();
  boundary.context.mockResolvedValue({ kasb: { ok: true, data: { nom: 'PTO', rol: 'pto', profil: 'pto_smeta', vazifa: '', kategoriyalar: ['ombor'], boshqalar: [], namuna_savollar: [], harakatlar: [] } },
    shaxsiy: { data: { til: 'uz' } }, uslub: null, men: { ok: true, data: { context_kompaniyalar: [{ kompaniya_id: 17, permissions: ['warehouse.write'] }] } } });
  boundary.rpc.mockResolvedValue({ ok: true, status: 200, data: { fakt: {}, ishlatilgan: ['ombor'], qoidalar: [], xotira: [], manbalar: [] } });
  boundary.model.mockResolvedValue({ model: 'synthetic', provider: 'stub', text: JSON.stringify({ javob: '', harakatlar: [], tool_call: { name: 'warehouse_command', arguments: {} } }) });
});
it('reports an unavailable tool with a valid page instead of claiming write is impossible', async () => {
  boundary.model.mockResolvedValue({ model: 'synthetic', text: JSON.stringify({ tool_call: { name: 'unavailable_action', arguments: {} } }) });
  const result = await kasbQuvur({ jarvisWarehouse: vi.fn() } as never, 7, 17, { savol: '10 qop sement kirim qil' }, () => {});
  expect(result.body).toMatchObject({ code: 'TOOL_YOQ' });
  expect(result.body.javob).toContain('Bu amal hali Jarvis’da yo‘q');
  expect(result.body.javob).toContain('(/admin');
});
it.each(['interactive', 'read-only'] as const)('shared core mode %s enforces warehouse preview access', async mode => {
  const transport = vi.fn().mockResolvedValueOnce({ ok: true, omborlar: [{ id: 3, kompaniya_id: 17, nomi: 'Ombor', yozish: true }] })
    .mockResolvedValueOnce({ ok: true, holat: 'tasdiq_kerak', token: 'signed', preview: { nomi: 'sement', miqdor: 10, birligi: 'qop', tur: 'prixod' } });
  const result = await kasbQuvur({ jarvisWarehouse: transport } as never, 7, 17, { savol: '10 qop sement kirim qil' }, () => {}, mode);
  if (mode === 'interactive') {
    expect(result.body.warehouse_reply).toMatchObject({ company: 17, warehouseId: 3, result: { token: 'signed' } });
    expect(transport).toHaveBeenLastCalledWith({ amal: 'tahlil', kompaniya_id: 17, sklad_id: 3, matn: '10 qop sement kirim qil' });
  } else { expect(transport).not.toHaveBeenCalled(); expect(result.body.warehouse_reply).toBeUndefined(); }
});
