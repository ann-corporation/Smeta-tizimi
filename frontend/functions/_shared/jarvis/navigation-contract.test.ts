import { expect, it, vi } from 'vitest';
import { navigationAnswer } from './navigation';
import { jarvisText } from './reply-language';
import type { JarvisReadRpc } from './object-scope';

const scope = { actor: 7, company: 17, objectId: 3, history: [], question: '8-lot F2 №S-5 ni och', text: jarvisText() };
const authority = { ok: true, status: 200, data: { context_kompaniyalar: [{ kompaniya_id: 17, effective_role: 'pto', permissions: ['smeta.read', 'f2.read'] }] } };
function source(bothMatch = false, secondUnavailable = false) {
  return vi.fn<JarvisReadRpc>().mockImplementation(async (name, args) => {
    expect(args.p_actor_id).toBe(7);
    if (name === 't2_shartnoma_liniya_v1') {
      expect(args.p_kompaniya_id).toBe(17);
      return { ok: true, status: 200, data: { shartnomalar: [{ id: 71, raqam: 'C-41', nom: '8-lot Synthetic', obyektlar: [3, 4] }],
        obyektlar: [{ id: 3, nom: 'Synthetic A' }, { id: 4, nom: 'Synthetic B' }] } };
    }
    expect(name).toBe('t2_akt_reestr_obyekt_v1');
    if (secondUnavailable && args.p_obyekt_id === 4) return { ok: false, status: 502, data: {} };
    return { ok: true, status: 200, data: { qatorlar: [{ id: 40 + Number(args.p_obyekt_id), obyekt_id: args.p_obyekt_id,
      kompaniya_id: 17, tur: 'f2', holat: 'qoralama', raqam: bothMatch || args.p_obyekt_id === 4 ? 'S-5' : 'OTHER', oy: '2026-06' }] } };
  });
}
it('opens the only matching act after checking both objects, rather than using the current object', async () => {
  const rpc = source();
  expect(await navigationAnswer(rpc, scope, authority)).toMatchObject({ ochish: { parametrlar: { obyekt: 4, akt: 44 } } });
  expect(rpc).toHaveBeenCalledTimes(3);
});
it('does not open the first act when the lot has two matches', async () => {
  const result = await navigationAnswer(source(true), scope, authority);
  expect(result).not.toHaveProperty('ochish');
  expect(result.javob).toContain('Synthetic A'); expect(result.javob).toContain('Synthetic B');
});
it('does not claim uniqueness when another object could not be checked', async () => {
  expect(await navigationAnswer(source(true, true), scope, authority)).not.toHaveProperty('ochish');
});
