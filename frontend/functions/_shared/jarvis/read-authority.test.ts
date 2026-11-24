import { beforeEach, expect, it, vi } from 'vitest';
import { jarvisReadTools } from './read-tools';
import { jarvisTools, jarvisToolNames } from '../../../src/lib/jarvis/tool-registry';
import type { RpcNatija } from '../agent-rpc';
import type { JarvisEnv } from './chat';

const m = vi.hoisted(() => ({ rpc: vi.fn(), metric: vi.fn(), get: vi.fn() }));
vi.mock('../agent-rpc', () => ({ rpcData: m.rpc }));
vi.mock('../ai-telemetriya', () => ({ telemetriyaYoz: m.metric }));
const env = { R2_CANONICAL: { get: m.get } } as unknown as JarvisEnv;
const scope = { actor: 901, company: 902, question: 'Synthetic', objectId: 903, history: [] };
const categories = ['smeta_pul', 'f2_fakt_pul'];
const context = (permissions: string[], extra = {}): RpcNatija => ({ ok: true, status: 200,
  data: { context_kompaniyalar: [{ kompaniya_id: 902, permissions, ...extra }] } });
const allPermissions = [...new Set(Object.values(jarvisTools).flatMap(tool => [...tool.permissions]))];
beforeEach(() => { vi.clearAllMocks(); });

// Same boundary for deterministic and model callers; neither may reach a source on denial.
it.each(jarvisToolNames.flatMap(name => [false, true].map(model => ({ name, model }))))(
  '$name model=$model denies a foreign tenant before source access', async ({ name, model }) => {
    const tools = jarvisReadTools(env, scope, context(allPermissions, { kompaniya_id: 999 }), categories);
    expect(tools.visible(name)).toBe(false);
    expect(await tools.run({ name, args: 50 }, model)).toMatchObject({ rad: true });
    expect(m.rpc).not.toHaveBeenCalled(); expect(m.get).not.toHaveBeenCalled();
    expect(m.metric).toHaveBeenLastCalledWith(env, expect.objectContaining({
      vositalar: [name], ok: false, xatoKod: 'FORBIDDEN', vositaXato: 1,
    }));
  });

it.each([false, true])('catalog model=%s respects an explicit company.read denial before R2', async model => {
  const tools = jarvisReadTools(env, scope, context(allPermissions, { explicit_denials: ['company.read'] }), categories);
  expect(await tools.run({ name: 'catalog_price', args: 50 }, model)).toMatchObject({ rad: true });
  expect(m.get).not.toHaveBeenCalled(); expect(m.rpc).not.toHaveBeenCalled();
});

it.each([null, { ok: false, status: 503, data: {} }, context([]), {
  ok: true, status: 200, data: { context_kompaniyalar: [
    { kompaniya_id: 902, permissions: allPermissions }, { kompaniya_id: 902, permissions: allPermissions },
  ] },
}] as Array<RpcNatija | null>)('fails closed for missing, failed or conflicting authority %#', async men => {
  const tools = jarvisReadTools(env, scope, men, categories);
  expect(await tools.run({ name: 'catalog_price', args: 50 })).toMatchObject({ rad: true });
  expect(m.get).not.toHaveBeenCalled(); expect(m.rpc).not.toHaveBeenCalled();
});

it('preserves an authorized deterministic catalog read and records success', async () => {
  m.get.mockResolvedValue(null);
  const tools = jarvisReadTools(env, scope, context(['company.read']), categories);
  expect(tools.visible('catalog_price')).toBe(true);
  const reply = await tools.run({ name: 'catalog_price', args: 50 });
  expect(reply?.rad).not.toBe(true);
  expect(m.get).toHaveBeenCalled();
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.metric).toHaveBeenLastCalledWith(env, expect.objectContaining({ vositalar: ['catalog_price'], ok: true }));
});
