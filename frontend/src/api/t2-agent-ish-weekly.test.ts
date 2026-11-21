import { afterEach, expect, it, vi } from 'vitest';
import { agentYoz, rivojlanishTahlil } from './t2-agent-ish';
const operation = '11111111-1111-4111-8111-111111111111';
const receipt = { ok: true, yaratildi: true, taklif_id: '9007199254740993' };
afterEach(() => vi.unstubAllGlobals());
it('retains only a validated report receipt across a legacy HTTP failure without converting its bigint ID', async () => {
  const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) => Response.json({ ok: false, error: 'Synthetic legacy failure',
    jarvis_hafta: { ...receipt, private_detail: 'must not be copied' } }, { status: 502 })); vi.stubGlobal('fetch', fetcher);
  expect(await rivojlanishTahlil(operation)).toEqual({ ok: false, error: 'Synthetic legacy failure', jarvis_hafta: receipt });
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).operation_id).toBe(operation);
  expect(await agentYoz('unrelated', null)).not.toHaveProperty('jarvis_hafta');
});
it.each([{ ...receipt, taklif_id: '0' }, { ...receipt, taklif_id: 123 }, { ...receipt, yaratildi: 'true' }, { ...receipt, ok: false }])('does not advertise malformed receipt %#', async invalid => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: false, error: 'Synthetic', jarvis_hafta: invalid }, { status: 500 })));
  expect(await rivojlanishTahlil(operation)).not.toHaveProperty('jarvis_hafta');
});
