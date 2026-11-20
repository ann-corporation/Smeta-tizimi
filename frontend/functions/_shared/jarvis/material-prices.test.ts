import { expect, it, vi } from 'vitest';
import { materialPriceAnswer, materialPriceIntent } from './material-prices';
import { firstReadTool, jarvisReadTools } from './read-tools';
import { jarvisToolNames } from '../../../src/lib/jarvis/tool-registry';
import { qidiruvSozlari } from '../../../src/lib/jarvis/qidiruv-sozlari';
import type { JarvisObjectScope, JarvisReadRpc } from './object-scope';
import type { RpcNatija } from '../agent-rpc';
import type { JarvisEnv } from './chat';

const boundary = vi.hoisted(() => ({ read: vi.fn(), metric: vi.fn() }));
vi.mock('../ai-telemetriya', () => ({ telemetriyaYoz: boundary.metric }));
vi.mock('../agent-rpc', () => ({ rpcData: (...args: unknown[]) => boundary.read(...args) }));

const scope: JarvisObjectScope = { actor: 801, company: 802, question: 'Obyektlar bo‘yicha M200 beton narxlari', history: [], objectId: 999 };
const authority: RpcNatija = { ok: true, status: 200, data: { context_kompaniyalar: [{ kompaniya_id: 802, permissions: ['smeta.read'] }] } };
const reply = (data: Record<string, unknown>) => ({ ok: true, status: 200, data });
const objects = [{ id: 811, nom: 'Sinov A' }, { id: 812, nom: 'Sinov B' }];
const price = (object: string, min: number | undefined, max = min) => ({ obyekt: object, nom: 'БЕТОН М200', birlik: 'м3', tur: 'mat',
  narx_min: min, narx_max: max, narxsiz_qator: min === undefined ? 1 : 0, qator_soni: 1 });
function source(rows = objects) {
  return vi.fn<JarvisReadRpc>().mockImplementation(async (name, args) => {
    expect(args.p_actor_id).toBe(801);
    expect(args.p_kompaniya_id).toBe(802);
    if (name === 't2_agent_fakt_v1') return reply({ fakt: { obyektlar: rows } });
    expect(name).toBe('t2_agent_qidiruv_v1');
    const object = rows.find(row => row.id === args.p_obyekt_id)!;
    return reply({ ok: true, ruxsat: true, narx_ruxsat: true, obyektlar: [object], qatorlar: [price(object.nom, object.id === 811 ? 0 : undefined)] });
  });
}
it.each(['Obyektlar bo‘yicha M200 beton narxlari', 'Объектлар бўйича М200 бетон нархлари', 'Цены бетона М200 по объектам'])('routes source comparison: %s', question => {
  expect(firstReadTool(jarvisToolNames, question)).toEqual({ name: 'material_prices', args: expect.arrayContaining(['БЕТОН', 'М200']) });
});
it.each(['Obyektlar beton narxini ozgartir', 'Установи цены бетона по объектам', 'Obyektlar jami summa qancha', 'Smetada beton narxi',
  'Obyektlar bo‘yicha beton kirim narxlari', 'Цены прихода бетона по объектам'])('does not take over writes, totals or a different price source: %s', question => {
  expect(materialPriceIntent(question)).toBeNull();
});
it('shares inflection handling without converting another mineral into concrete', () => {
  expect(qidiruvSozlari('бетона').resurs).toEqual(['БЕТОН']);
  expect(qidiruvSozlari('арматуры').resurs).toEqual(['АРМАТУР']);
  expect(qidiruvSozlari('бетонит').resurs).not.toContain('БЕТОН');
});
it('preserves known zero and unknown price as distinct source values, and binds every object query', async () => {
  const rpc = source();
  const result = await materialPriceAnswer(rpc, scope, ['БЕТОН', 'М200'], authority, true);
  expect(result.javob).toContain('0 so‘m');
  expect(result.javob).toContain('Narx kiritilmagan');
  expect(result.javob).toContain('/admin/holat/811');
  expect(result.javob).toContain('/admin/holat/812');
  expect(result).toMatchObject({ dalil: { company_complete: false, qamrov: { smeta: true, prixod: false }, qatorlar: [
    { obyekt_id: 811, narx_min: 0, narx_max: 0 }, { obyekt_id: 812, narx_min: null, narx_max: null },
  ] } });
  expect(rpc.mock.calls.map(call => call[1].p_obyekt_id)).toEqual([null, 811, 812]);
});
it.each([false, true])('denies before any read when money visibility or the company capability is absent (%s)', async mayRead => {
  const rpc = source();
  const result = await materialPriceAnswer(rpc, scope, ['БЕТОН'], mayRead ? null : authority, mayRead);
  expect(result).toMatchObject({ rad: true });
  expect(rpc).not.toHaveBeenCalled();
  expect(jarvisReadTools({} as JarvisEnv, scope, authority, []).visible('material_prices')).toBe(false);
});
it('does not trust another company capability', async () => {
  const rpc = source();
  const other = reply({ context_kompaniyalar: [{ kompaniya_id: 999, permissions: ['smeta.read'] }] });
  expect(await materialPriceAnswer(rpc, scope, ['БЕТОН'], other, true)).toMatchObject({ rad: true });
  expect(rpc).not.toHaveBeenCalled();
});
it('bounds fanout and labels omitted objects instead of claiming a company-wide total', async () => {
  const rpc = source(Array.from({ length: 9 }, (_, i) => ({ id: 811 + i, nom: 'Sinov ' + i })));
  const result = await materialPriceAnswer(rpc, scope, ['БЕТОН'], authority, true);
  expect(rpc).toHaveBeenCalledTimes(6);
  expect(result).toMatchObject({ dalil: { partial: true, company_complete: false } });
  expect(result.javob).toContain('Natija qisman');
});
it('does not turn an unavailable price source into a missing or zero price', async () => {
  const rpc = source(); rpc.mockImplementationOnce(async () => reply({ fakt: { obyektlar: [objects[0]] } }));
  rpc.mockImplementationOnce(async () => ({ ok: false, status: 502, data: {} }));
  const result = await materialPriceAnswer(rpc, scope, ['БЕТОН'], authority, true);
  expect(result.javob).toContain('Manba tekshirilmadi');
  expect(result.javob).not.toContain('0 so‘m');
  expect(result.javob).not.toContain('Narx kiritilmagan');
  expect(result).toMatchObject({ source_unavailable: true, dalil: { partial: true, qatorlar: [] } });
});
it('rejects a foreign-object price and never substitutes it into the table', async () => {
  const rpc = source(); rpc.mockImplementationOnce(async () => reply({ fakt: { obyektlar: [objects[0]] } }));
  rpc.mockImplementationOnce(async () => reply({ ok: true, ruxsat: true, narx_ruxsat: true, obyektlar: [objects[1]], qatorlar: [price(objects[1].nom, 123)] }));
  const result = await materialPriceAnswer(rpc, scope, ['БЕТОН'], authority, true);
  expect(result.javob).not.toContain('123');
  expect(result).toMatchObject({ dalil: { qatorlar: [], partial: true } });
});
it('never returns one permitted object when another object explicitly denies read access', async () => {
  const rpc = source(); rpc.mockImplementationOnce(async () => reply({ fakt: { obyektlar: objects } }));
  rpc.mockImplementationOnce(async () => ({ ok: false, status: 403, data: {} }));
  expect(await materialPriceAnswer(rpc, scope, ['БЕТОН'], authority, true)).toMatchObject({ rad: true });
});
it('uses the existing material grade matcher rather than mixing nearby grades', async () => {
  const rpc = source(); rpc.mockImplementationOnce(async () => reply({ fakt: { obyektlar: [objects[0]] } }));
  rpc.mockImplementationOnce(async () => reply({ ok: true, ruxsat: true, narx_ruxsat: true, obyektlar: [objects[0]], qatorlar: [
    price(objects[0].nom, -2.75), { ...price(objects[0].nom, 777), nom: 'БЕТОН М250' },
  ] }));
  const result = await materialPriceAnswer(rpc, scope, ['БЕТОН', 'М200'], authority, true);
  expect(result).toMatchObject({ dalil: { qatorlar: [{ narx_min: -2.75, birlik: 'м3' }] } });
  expect(result.javob).not.toContain('777');
  expect(result.javob).not.toContain('М250');
});
it('records a source failure instead of a successful empty answer in tool telemetry', async () => {
  boundary.read.mockResolvedValueOnce({ ok: false, status: 502, data: {} });
  const tools = jarvisReadTools({} as JarvisEnv, scope, authority, ['smeta_pul']);
  expect(await tools.run({ name: 'material_prices', args: ['БЕТОН'] })).toMatchObject({ source_unavailable: true });
  expect(boundary.metric).toHaveBeenLastCalledWith({}, expect.objectContaining({ actor: 801, kompaniyaId: 802,
    vositalar: ['material_prices'], ok: false, xatoKod: 'SOURCE_UNAVAILABLE', vositaXato: 1 }));
});
