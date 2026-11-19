import { expect, it, vi } from 'vitest';
import { warehouseCommand } from './warehouse-command';
import { warehouseCall } from '../../../src/lib/jarvis/warehouse-command';
const store = (id: number, company = 17) => ({ id, kompaniya_id: company, nomi: `Ombor ${id}`, yozish: true });
it('uses only the selected company warehouse and preserves the original user command', async () => {
  const query = '10 qop sement kirim qil';
  const call = vi.fn().mockResolvedValueOnce({ ok: true, omborlar: [store(3, 99), store(7)] })
    .mockResolvedValueOnce({ ok: true, holat: 'tasdiq_kerak', token: 'synthetic' });
  const reply = await warehouseCommand(call, 17, query);
  expect(reply.warehouses.map(row => row.id)).toEqual([7]);
  expect(call.mock.calls.map(([body]) => body)).toEqual([{ amal: 'kontekst' }, { amal: 'tahlil', kompaniya_id: 17, sklad_id: 7, matn: query }]);
  expect(reply.result).toMatchObject({ holat: 'tasdiq_kerak' });
});
it('asks instead of selecting the first of several warehouses', async () => {
  const call = vi.fn().mockResolvedValue({ ok: true, omborlar: [store(3), store(7)] });
  expect((await warehouseCommand(call, 17, 'sement kirim qil')).warehouseId).toBeNull();
  expect(call).toHaveBeenCalledTimes(1);
});
it.each([99, 0])('rejects an unavailable warehouse %s before analysis', async id => {
  const call = vi.fn().mockResolvedValue({ ok: true, omborlar: [store(3)] });
  expect((await warehouseCommand(call, 17, '10 kg mix chiqim qil', id)).result).toMatchObject({ ok: false });
  expect(call).toHaveBeenCalledTimes(1);
});
it.each(['actor_id', 'kompaniya_id', 'query', 'token', 'tasdiqlayman'])('never accepts model supplied field %s', field => {
  expect(warehouseCall({ name: 'warehouse_command', arguments: { [field]: 7 } })).toBeNull();
});
it('preserves missing-data questions and does not write', async () => {
  const call = vi.fn().mockResolvedValueOnce({ ok: true, omborlar: [store(3)] })
    .mockResolvedValueOnce({ ok: true, holat: 'savol', savol: 'Qaysi birlik?', variantlar: [{ yorliq: 'kg', tanlov: { birligi: 'kg' } }] });
  expect((await warehouseCommand(call, 17, 'mix kirim qil')).result).toMatchObject({ holat: 'savol', savol: 'Qaysi birlik?' });
  expect(call.mock.calls.some(([body]) => body.amal === 'tasdiq' || body.amal === 'yoz')).toBe(false);
});
