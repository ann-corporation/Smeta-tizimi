import { describe, expect, it, vi } from 'vitest';
import { navigationCall, navigationIntent, navigationPages, navigationTarget, navigationUrl } from '../../../src/lib/jarvis/navigation';
import { navigationAnswer, navigationVisible, verifiedPageContext } from './navigation';
import { jarvisText } from './reply-language';
import type { RpcNatija } from '../agent-rpc';
const men = (permissions = ['smeta.read', 'f2.read'], extra = {}): RpcNatija => ({ ok: true, status: 200, data: {
  context_kompaniyalar: [{ kompaniya_id: 17, effective_role: 'pto', permissions, ...extra }],
} });
const scope = { actor: 7, company: 17, question: 'F2 № S-5 ni och', history: [], objectId: 3, text: jarvisText() };
const act = { id: 41, obyekt_id: 3, kompaniya_id: 17, tur: 'f2', raqam: 'S-5', oy: '2026-06', holat: 'qoralama' };
const rpc = (rows = [act]) => vi.fn(async (name: string) => ({ ok: true, status: 200, data: name === 't2_agent_fakt_v1'
  ? { fakt: { obyektlar: [{ id: 3, nom: 'Synthetic object' }] } } : { qatorlar: rows } }));

describe('registered navigation', () => {
  it.each(['F2 ni och', 'Ф2 ни оч', 'Открой диск', 'Diskka olib bor'])('recognizes %s', question => {
    expect(navigationIntent(question)).toBe(true);
  });
  it('finds F2 and Disk in the existing registry', () => {
    expect(navigationPages('F-2 ni och')).toContain('f2-tarix');
    expect(navigationPages('Дискни оч')).toContain('documents');
  });
  it.each(['Omborga 10 qop sement kirim qil keyin och', 'F2 ni och va narxni o‘zgartir', 'Создай Ф2 и открой'])('keeps writes out of navigation: %s', question => {
    expect(navigationIntent(question)).toBe(false);
  });
  it('rejects arbitrary URLs, companies and model arguments', () => {
    expect(navigationCall({ name: 'navigate', arguments: { page_key: 'documents' } })).toBe('documents');
    for (const args of [{ page_key: 'https://example.invalid' }, { page_key: 'documents', company: 99 }, { page_key: 'missing' }])
      expect(navigationCall({ name: 'navigate', arguments: args })).toBeNull();
    expect(navigationTarget('missing')).toBeNull();
    expect(navigationTarget('f2-tarix', { obyekt: -1 })).toBeNull();
    expect(navigationTarget('f2-tarix', { kompaniya_id: 99 })).toBeNull();
    expect(navigationUrl(navigationTarget('f2-tarix', { obyekt: 3, akt: 41 })!)).toBe('/admin/f2-tarix?obyekt=3&akt=41');
  });
  it('uses existing menu role, explicit-denial and module rules', () => {
    expect(navigationVisible(men(), 17, 'f2-tarix')).toBe(true);
    expect(navigationVisible(men(), 99, 'f2-tarix')).toBe(false);
    expect(navigationVisible(men([], {}), 17, 'f2-tarix')).toBe(false);
    expect(navigationVisible(men(undefined, { explicit_denials: ['f2.read'] }), 17, 'f2-tarix')).toBe(false);
    expect(navigationVisible(men(['warehouse.read']), 17, 'logistika')).toBe(true);
    expect(navigationVisible(men(['warehouse.read'], { modullar_off: ['module.erp'] }), 17, 'logistika')).toBe(false);
    expect(navigationVisible(men(['control.company.read']), 17, 'boshqaruv')).toBe(false);
  });
  it('rejects duplicate company contexts', () => {
    const context = men();
    context.data.context_kompaniyalar = [...context.data.context_kompaniyalar as unknown[], ...context.data.context_kompaniyalar as unknown[]];
    expect(navigationVisible(context, 17, 'f2-tarix')).toBe(false);
  });
  it('offers an exact actor-verified F2 link without a write', async () => {
    const call = rpc();
    const result = await navigationAnswer(call, scope, men());
    expect(result).toMatchObject({ ochish: { kalit: 'f2-tarix', parametrlar: { obyekt: 3, akt: 41 } } });
    expect(call.mock.calls.every(([name]) => ['t2_agent_fakt_v1', 't2_akt_reestr_obyekt_v1'].includes(name))).toBe(true);
  });
  it('does not choose the first act when the number is ambiguous', async () => {
    expect(await navigationAnswer(rpc([act, { ...act, id: 42 }]), scope, men())).not.toHaveProperty('ochish');
  });
  it('does not query a forbidden F2 or accept a foreign-company result', async () => {
    const call = rpc();
    expect(await navigationAnswer(call, scope, men([]))).toMatchObject({ rad: true });
    expect(call).not.toHaveBeenCalled();
    expect(await navigationAnswer(rpc([{ ...act, kompaniya_id: 99 }]), scope, men())).not.toHaveProperty('ochish');
  });
  it('returns a shared key and backward-compatible page link', async () => {
    const call = rpc();
    expect(await navigationAnswer(call, { ...scope, question: 'Disk ni och' }, men(), 'documents')).toMatchObject({
      ochish: { kalit: 'documents', yol: '/admin/documents', parametrlar: {} }, sahifalar: [{ yol: '/admin/documents', nom: 'Disk' }],
    });
    expect(call).not.toHaveBeenCalled();
  });
});
describe('verified current F2 context', () => {
  it('returns only source values after actor/company/object verification', async () => {
    expect(await verifiedPageContext(rpc(), scope, men(), 41, '/admin/f2-tarix')).toEqual({ obyekt_id: 3, akt_id: 41, raqam: 'S-5', oy: '2026-06' });
  });
  it.each([99, '41', null, -1])('rejects invalid or absent act %s', async id => {
    expect(await verifiedPageContext(rpc(), scope, men(), id, '/admin/f2-tarix')).toBeNull();
  });
  it('rejects foreign company, object, wrong page, duplicate act and denied read', async () => {
    for (const rows of [[{ ...act, kompaniya_id: 99 }], [{ ...act, obyekt_id: 9 }], [act, act]])
      expect(await verifiedPageContext(rpc(rows), scope, men(), 41, '/admin/f2-tarix')).toBeNull();
    const call = rpc();
    expect(await verifiedPageContext(call, scope, men(), 41, '/admin/pult')).toBeNull();
    expect(await verifiedPageContext(call, scope, men([]), 41, '/admin/f2-tarix')).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });
});
