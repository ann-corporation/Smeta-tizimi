import { beforeEach, expect, it, vi } from 'vitest';
import { jarvisReadTools, readToolCall } from './read-tools';
import { approvalsVisible } from './approvals';
import { parseJarvisToolCall } from '../../../src/lib/jarvis/tool-registry';
import type { RpcNatija } from '../agent-rpc';
import type { JarvisEnv } from './chat';

const m = vi.hoisted(() => ({ rpc: vi.fn(), money: vi.fn(), metric: vi.fn() }));
vi.mock('../agent-rpc', () => ({ rpcData: (...args: unknown[]) => m.rpc(...args) }));
vi.mock('../ai-telemetriya', () => ({ telemetriyaYoz: m.metric }));
vi.mock('../agent-pul-javob', async load => ({ ...(await load<typeof import('../agent-pul-javob')>()), pulJavobi: m.money }));
const scope = { actor: 901, company: 902, question: 'Synthetic', objectId: null, history: [{ rol: 'user', matn: 'Original goal' }] };
const env = {} as JarvisEnv;
const context = (permissions = ['company.read', 'document.read', 'smeta.read'], role = 'pto', company = 902): RpcNatija => ({ ok: true, status: 200,
  data: { context_kompaniyalar: [{ kompaniya_id: company, permissions, effective_role: role }] } });
beforeEach(() => { vi.clearAllMocks(); });

it('routes model-selected task reads through the existing actor-filtered source', async () => {
  m.rpc.mockResolvedValue({ ok: true, status: 200, data: { ok: true, qatorlar: [], keyingi_id: null } });
  const tools = jarvisReadTools(env, scope, context(), []);
  expect(tools.visible('task_list')).toBe(true);
  const result = await tools.run({ name: 'task_list', args: 'open' }, true);
  expect(result?.javob).toContain('topshiriq');
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith(env, 't2_topshiriqlar_v1', expect.objectContaining({
    p_actor_id: 901, p_kompaniya_id: 902, p_yonalish: 'menga', p_obyekt_id: null,
  }), expect.any(AbortSignal));
  expect(m.metric).toHaveBeenLastCalledWith(env, expect.objectContaining({ vositalar: ['task_list'], ok: true }));
});
it('uses the existing scoped approval inbox and hides the tool from non-decision roles', async () => {
  m.rpc.mockResolvedValue({ ok: true, status: 200, data: { ok: true, zanjirlar: [] } });
  expect(approvalsVisible(context(), 902)).toBe(true);
  const tools = jarvisReadTools(env, scope, context(), []);
  expect(tools.visible('approval_queue')).toBe(true);
  expect((await tools.run({ name: 'approval_queue', args: true }, true))?.javob).toContain('Tasdiqlash navbati');
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith(env, 't2_hujjat_kiruvchi_v1', { p_actor_id: 901, p_kompaniya_id: 902 }, expect.any(AbortSignal));
  expect(approvalsVisible(context(undefined, 'worker'), 902)).toBe(false);
  expect(jarvisReadTools(env, scope, context(undefined, 'worker'), []).visible('approval_queue')).toBe(false);
});
it('delegates estimate money to the existing footer/markup/VAT core without recomputing it', async () => {
  m.money.mockResolvedValue({ javob: 'Verified source money', dalil: { tur: 'smeta-qiymat' } });
  const tools = jarvisReadTools(env, scope, context(), ['smeta_pul']);
  expect(tools.visible('estimate_total')).toBe(true);
  expect(await tools.run({ name: 'estimate_total', args: 'Smeta qiymati QQS bilan' }, true)).toEqual({ javob: 'Verified source money', dalil: { tur: 'smeta-qiymat' } });
  expect(m.money).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ actor: 901, kid: 902,
    savol: 'Smeta qiymati QQS bilan', tarix: scope.history, obyektId: null, ruxsat: ['smeta_pul'] }));
  expect(m.rpc).not.toHaveBeenCalled();
});
it.each(['task_list', 'approval_queue', 'estimate_total'] as const)('denies foreign company context before %s reaches a source', async name => {
  const tools = jarvisReadTools(env, scope, context(undefined, 'pto', 999), ['smeta_pul']);
  expect(tools.visible(name)).toBe(false);
  expect(await tools.run({ name, args: 'open' }, true)).toMatchObject({ rad: true });
  expect(m.rpc).not.toHaveBeenCalled(); expect(m.money).not.toHaveBeenCalled();
});
it('does not expose money when the category or explicit permission is absent, including non-model callers', async () => {
  const noCategory = jarvisReadTools(env, scope, context(), []);
  expect(noCategory.visible('estimate_total')).toBe(false);
  expect(await noCategory.run({ name: 'estimate_total', args: 'Smeta qiymati QQS bilan' })).toMatchObject({ rad: true });
  const denied = context(); (denied.data.context_kompaniyalar as Array<Record<string, unknown>>)[0].explicit_denials = ['smeta.read'];
  expect(jarvisReadTools(env, scope, denied, ['smeta_pul']).visible('estimate_total')).toBe(false);
  expect(m.money).not.toHaveBeenCalled();
});
it('rejects actor/company overrides and write actions in the read registry', () => {
  expect(parseJarvisToolCall({ name: 'estimate_total', arguments: { query: 'Smeta qiymati QQS bilan', company: 999 } })).toBeNull();
  expect(parseJarvisToolCall({ name: 'approval_queue', arguments: { query: 'Tasdiqlash navbati', actor: 999 } })).toBeNull();
  expect(parseJarvisToolCall({ name: 'task_create', arguments: { query: 'Create task' } })).toBeNull();
});
it('keeps the common money follow-up resolver for model-selected queries', () => {
  expect(readToolCall('estimate_total', 'QQS siz-chi', [{ rol: 'user', matn: 'Smeta qiymati ustama bilan qancha?' }]))
    .toEqual({ name: 'estimate_total', args: 'QQS siz-chi' });
  expect(readToolCall('estimate_total', 'QQS siz-chi', [])).toBeNull();
});
