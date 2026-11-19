import { expect, it, vi } from 'vitest';
import { contractAlias, resolveJarvisContract } from './contract-scope';
import { f2RegisterAnswer, f2RegisterIntent } from './f2-register';
import type { JarvisObjectScope, JarvisReadRpc } from './object-scope';

const scope: JarvisObjectScope = { actor: 701, company: 702, question: '8-lot bo‘yicha F-2 holati', history: [], objectId: 999 };
const source = () => ({ shartnomalar: [{ id: 730, raqam: 'C-41', nom: '8-lot Sinov', obyektlar: [711, 712] }],
  obyektlar: [{ id: 711, nom: 'Sinov A' }, { id: 712, nom: 'Sinov B' }] });
const reply = (data: Record<string, unknown>) => ({ ok: true, status: 200, data });
it.each(['8-lot bo‘yicha F-2 holati', 'lot 8 F2 holati', '8–лот ҳолати', 'Статус КС-2 по лот №8'])('recognizes a source-bound lot: %s', q => {
  expect(contractAlias(q)).toEqual({ kind: 'lot', value: '8' });
});
it.each(['shartnoma №C-41', 'шартнома C-41', 'договор C-41', '№C-41'])('recognizes contract number: %s', q => {
  expect(contractAlias(q)).toEqual({ kind: 'contract', value: 'c-41' });
});
it('does not confuse act number, an identifier prefix or a malformed lot with a contract', () => {
  expect(contractAlias('F2 №41 holati')).toBeNull();
  expect(contractAlias('pilot 8')).toBeNull();
  expect(contractAlias('lot 8abc')).toBeNull();
  expect(contractAlias('8-lot va 9-lot')).toEqual({ kind: 'ambiguous', value: '' });
  expect(f2RegisterIntent('shartnoma №C-41 F2 №A-9 holati')?.number).toBe('a-9');
  expect(f2RegisterIntent('lot №8 F2 holati')?.number).toBeNull();
});
it('binds only authenticated actor/company and returns IDs/names, never contract financial fields', async () => {
  const rpc = vi.fn<JarvisReadRpc>().mockResolvedValue(reply(source()));
  const result = await resolveJarvisContract(rpc, scope, contractAlias(scope.question)!);
  expect(rpc).toHaveBeenCalledExactlyOnceWith('t2_shartnoma_liniya_v1', { p_actor_id: 701, p_kompaniya_id: 702 });
  expect(result).toEqual({ tur: 'bor', contract: { id: 730, label: 'C-41' }, objects: source().obyektlar });
});
it('keeps exact contract matching: C-41 does not match C-410', async () => {
  const rpc = vi.fn<JarvisReadRpc>().mockResolvedValue(reply(source()));
  expect(await resolveJarvisContract(rpc, scope, { kind: 'contract', value: 'c-410' })).toEqual({ tur: 'yoq' });
});
it.each(['duplicate-contract', 'missing-object', 'duplicate-object', 'invalid-contract'] as const)('rejects incomplete or ambiguous source: %s', async defect => {
  const data = source();
  if (defect === 'duplicate-contract') data.shartnomalar.push({ ...data.shartnomalar[0], id: 731 });
  if (defect === 'missing-object') data.obyektlar.pop();
  if (defect === 'duplicate-object') data.obyektlar.push(data.obyektlar[0]);
  if (defect === 'invalid-contract') data.shartnomalar[0].obyektlar.push(-1);
  const rpc = vi.fn<JarvisReadRpc>().mockResolvedValue(reply(data));
  expect(await resolveJarvisContract(rpc, scope, { kind: 'lot', value: '8' })).toEqual({ tur: defect === 'duplicate-contract' ? 'noaniq' : 'unavailable' });
});
it('reads the register for every linked object instead of asking for an object or using current-page scope', async () => {
  const rpc = vi.fn<JarvisReadRpc>().mockImplementation(async (name, args) => {
    if (name === 't2_shartnoma_liniya_v1') return reply(source());
    expect(name).toBe('t2_akt_reestr_obyekt_v1');
    return reply({ qatorlar: [{ id: 800 + Number(args.p_obyekt_id), obyekt_id: args.p_obyekt_id, kompaniya_id: 702,
      tur: 'f2', raqam: 'T-9', oy: '2026-07-01', holat: 'qoralama', lifecycle_status: 'draft' }] });
  });
  const result = await f2RegisterAnswer(rpc, scope, f2RegisterIntent(scope.question)!);
  expect(result.javob).toContain('Sinov A');
  expect(result.javob).toContain('Sinov B');
  expect(result.javob).toContain('Qoralama');
  expect(result).toMatchObject({ dalil: { shartnoma_id: 730, truncated: false } });
  expect(rpc.mock.calls.map(call => call[1].p_obyekt_id).filter(Boolean)).toEqual([711, 712]);
});
it.each([403, 502])('does not fall back to the current object after source status %s', async status => {
  const rpc = vi.fn<JarvisReadRpc>().mockResolvedValue({ ok: false, status, data: {} });
  const result = await f2RegisterAnswer(rpc, scope, f2RegisterIntent(scope.question)!);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(result.javob).not.toContain('999');
  if (status === 403) expect(result).toMatchObject({ rad: true });
});
it('refuses a foreign company act returned for an otherwise linked object', async () => {
  const rpc = vi.fn<JarvisReadRpc>().mockImplementation(async name => name === 't2_shartnoma_liniya_v1' ? reply(source()) :
    reply({ qatorlar: [{ id: 800, obyekt_id: 711, kompaniya_id: 999, tur: 'f2', raqam: 'FOREIGN', holat: 'approved' }] }));
  expect((await f2RegisterAnswer(rpc, scope, f2RegisterIntent(scope.question)!)).javob).not.toContain('FOREIGN');
});
it('does not invent tenant-specific aliases absent from source names', async () => {
  const data = source(); data.shartnomalar[0].nom = 'Sinov';
  const rpc = vi.fn<JarvisReadRpc>().mockResolvedValue(reply(data));
  expect(await resolveJarvisContract(rpc, scope, { kind: 'lot', value: '8' })).toEqual({ tur: 'yoq' });
});
it('does not fall back to the page object for conflicting lot names', async () => {
  const rpc = vi.fn<JarvisReadRpc>();
  const s = { ...scope, question: '8-lot va 9-lot F2 holati' };
  expect((await f2RegisterAnswer(rpc, s, f2RegisterIntent(s.question)!)).javob).toContain('Shartnoma noaniq');
  expect(rpc).not.toHaveBeenCalled();
});
it('bounds contract fanout and clearly marks omitted objects', async () => {
  const data = source();
  data.obyektlar = Array.from({ length: 7 }, (_, i) => ({ id: 711 + i, nom: 'Sinov ' + i }));
  data.shartnomalar[0].obyektlar = data.obyektlar.map(row => row.id);
  const rpc = vi.fn<JarvisReadRpc>().mockImplementation(async name => name === 't2_shartnoma_liniya_v1' ? reply(data) : reply({ qatorlar: [] }));
  const result = await f2RegisterAnswer(rpc, scope, f2RegisterIntent(scope.question)!);
  expect(rpc).toHaveBeenCalledTimes(6);
  expect(result.javob).toContain('Birinchi 5');
  expect(result).toMatchObject({ dalil: { truncated: true } });
});
