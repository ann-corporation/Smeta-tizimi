import { describe, expect, it, vi } from 'vitest';
import { taskCommand, type TaskCheck } from './task-command';

const secret = 'synthetic-only-secret';
const operation = '11111111-1111-4111-8111-111111111111';
const now = Date.UTC(2026, 10, 21);
const args = { sarlavha: 'Tekshir ish', obyekt_id: 31, ijrochi_foydalanuvchi_id: 8 };
const check: TaskCheck = async () => ({ obyekt_nom: 'Bino A', ijrochi_nom: 'Ali' });
async function preview(overrides: Record<string, unknown> = {}, key = secret) {
  return taskCommand(key, 7, 17, { amal: 'jarvis_preview', kompaniya_id: 17, operation_id: operation, args, ...overrides }, check, now);
}
const confirm = (token: unknown, overrides: Record<string, unknown> = {}) =>
  taskCommand(secret, 7, 17, { amal: 'jarvis_confirm', kompaniya_id: 17, tasdiqlayman: true, token, ...overrides }, check, now);
const tokenOf = async () => {
  const r = await preview();
  if (r.kind !== 'preview') throw new Error('expected preview');
  return r.value.token;
};

describe('Jarvis task command crypto boundary', () => {
  it('previews without returning a write body; confirmation requires explicit true', async () => {
    const p = await preview();
    expect(p.kind).toBe('preview');
    if (p.kind !== 'preview') return;
    expect(p.value.holat).toBe('tasdiq_kerak');
    expect(p.value.args.muddat).toBeNull();
    expect(p.value).not.toHaveProperty('amal', 'ber');
    expect(await confirm(p.value.token, { tasdiqlayman: false })).toMatchObject({ kind: 'error' });
    const c = await confirm(p.value.token);
    expect(c).toEqual({ kind: 'confirmed', body: { amal: 'ber', kompaniya_id: 17, operation_id: p.value.operation_id,
      ...p.value.args, ijrochi_kompaniya_id: 17 } });
  });

  it('rejects altered, expired, and other-secret tokens before source recheck', async () => {
    const token = await tokenOf();
    const spy = vi.fn(check);
    const run = (key: string, tok: unknown, time = now) => taskCommand(key, 7, 17,
      { amal: 'jarvis_confirm', kompaniya_id: 17, tasdiqlayman: true, token: tok }, spy, time);
    expect(await run(secret, token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'))).toMatchObject({ kind: 'error', code: 'TASK_PREVIEW_INVALID' });
    expect(await run(secret, token, now + 15 * 60000)).toMatchObject({ kind: 'error', code: 'TASK_PREVIEW_INVALID' });
    expect(await run('different-secret', token)).toMatchObject({ kind: 'error', code: 'TASK_PREVIEW_INVALID' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects cross-actor/company confirmation and injected or invalid draft fields', async () => {
    const token = await tokenOf();
    expect(await taskCommand(secret, 9, 17, { amal: 'jarvis_confirm', kompaniya_id: 17, tasdiqlayman: true, token }, check, now))
      .toMatchObject({ kind: 'error', code: 'TASK_PREVIEW_INVALID' });
    expect(await taskCommand(secret, 7, 18, { amal: 'jarvis_confirm', kompaniya_id: 18, tasdiqlayman: true, token }, check, now))
      .toMatchObject({ kind: 'error', code: 'TASK_PREVIEW_INVALID' });
    for (const bad of [
      { args: { ...args, actor_id: 99 } }, { kompaniya_id: 18 },
      { args: { ...args, obyekt_id: -1 } }, { args: { ...args, ijrochi_foydalanuvchi_id: 0 } },
      { args: { ...args, muddat: '2026-02-30' } }, { due_date: '2099-01-01' },
    ]) expect((await preview(bad)).kind).toBe('error');
  });

  it('derives stable operation IDs from repeated payloads, changes IDs for edits, and has no phantom date', async () => {
    const first = await preview(); const again = await preview(); const edited = await preview({ args: { ...args, sarlavha: 'Yangi sarlavha' } });
    expect(first.kind).toBe('preview'); expect(again.kind).toBe('preview'); expect(edited.kind).toBe('preview');
    if (first.kind !== 'preview' || again.kind !== 'preview' || edited.kind !== 'preview') return;
    expect(again.value.operation_id).toBe(first.value.operation_id);
    expect(again.value.token).toBe(first.value.token);
    expect(edited.value.operation_id).not.toBe(first.value.operation_id);
    const otherActor = await taskCommand(secret, 9, 17, { amal: 'jarvis_preview', kompaniya_id: 17, operation_id: operation, args }, check, now);
    const otherCompany = await taskCommand(secret, 7, 18, { amal: 'jarvis_preview', kompaniya_id: 18, operation_id: operation, args }, check, now);
    expect(otherActor.kind).toBe('preview'); expect(otherCompany.kind).toBe('preview');
    if (otherActor.kind !== 'preview' || otherCompany.kind !== 'preview') return;
    expect(otherActor.value.operation_id).not.toBe(first.value.operation_id);
    expect(otherCompany.value.operation_id).not.toBe(first.value.operation_id);
    expect(first.value.args.muddat).toBeNull();
  });

  it('round-trips a maximum-size Cyrillic draft and requires names to match selected IDs', async () => {
    const longName = 'Ж'.repeat(500);
    const largeCheck: TaskCheck = async () => ({ obyekt_nom: longName, ijrochi_nom: longName });
    const large = await taskCommand(secret, 7, 17, { amal: 'jarvis_preview', kompaniya_id: 17, operation_id: operation,
      args: { ...args, sarlavha: 'Ж'.repeat(200), matn: 'Ж'.repeat(4000) } }, largeCheck, now);
    expect(large.kind).toBe('preview');
    if (large.kind !== 'preview') return;
    expect(large.value.token.length).toBeLessThanOrEqual(24000);
    expect((await taskCommand(secret, 7, 17, { amal: 'jarvis_confirm', kompaniya_id: 17, tasdiqlayman: true,
      token: large.value.token }, largeCheck, now)).kind).toBe('confirmed');
    expect(await taskCommand(secret, 7, 17, { amal: 'jarvis_preview', kompaniya_id: 17, operation_id: operation,
      args: { ...args, obyekt_id: null } }, check, now)).toMatchObject({ kind: 'error', code: 'TASK_SOURCE_UNAVAILABLE' });
    expect(await taskCommand(secret, 7, 17, { amal: 'jarvis_preview', kompaniya_id: 17, operation_id: operation,
      args: { ...args, ijrochi_foydalanuvchi_id: null } }, check, now)).toMatchObject({ kind: 'error', code: 'TASK_SOURCE_UNAVAILABLE' });
  });

  it('blocks write body if object/assignee check fails, names changed, or the source throws', async () => {
    const token = await tokenOf();
    expect(await taskCommand(secret, 7, 17, { amal: 'jarvis_confirm', kompaniya_id: 17, tasdiqlayman: true, token },
      async () => ({ code: 'OBJECT_SCOPE_DENIED', status: 403 }), now)).toMatchObject({ kind: 'error', code: 'OBJECT_SCOPE_DENIED' });
    expect(await taskCommand(secret, 7, 17, { amal: 'jarvis_confirm', kompaniya_id: 17, tasdiqlayman: true, token },
      async () => ({ obyekt_nom: 'Bino renamed', ijrochi_nom: 'Ali' }), now)).toMatchObject({ kind: 'error', code: 'TASK_PREVIEW_CHANGED' });
    expect(await taskCommand(secret, 7, 17, { amal: 'jarvis_preview', kompaniya_id: 17, operation_id: operation, args },
      async () => { throw new Error('synthetic source unavailable'); }, now)).toMatchObject({ kind: 'error', code: 'TASK_SOURCE_UNAVAILABLE', status: 503 });
  });
  it('rejects a JSON-escaped payload that cannot fit the confirmation envelope instead of issuing a broken token', async () => {
    expect(await preview({ args: { ...args, matn: '\0'.repeat(4000) } }))
      .toMatchObject({ kind: 'error', code: 'TASK_PREVIEW_TOO_LARGE', status: 413 });
  });
});
