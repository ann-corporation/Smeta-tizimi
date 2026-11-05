// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { desktopSessionFetch } from './session-fetch';
it('successful login replaces bound cache; old expiry/late401 cannot end the new session', async () => {
  const events = { status: vi.fn(), invalidate: vi.fn(), ended: vi.fn() }, callbacks: { status: (v: boolean) => void; invalidate: () => void }[] = [];
  let finish!: (response: Response) => void;
  const old = vi.fn(async (input: RequestInfo | URL) => String(input) === '/api/sessiya' ? new Promise<Response>(r => { finish = r; }) : Response.json({ ok: true }));
  const fresh = vi.fn(async () => Response.json({ ok: true, actor: 2 }));
  const f = desktopSessionFetch(e => { callbacks.push(e); return callbacks.length === 1 ? old : fresh; }, events);
  const stale = f('/api/sessiya'); await f('/api/kirish', { method: 'POST' });
  callbacks[0].status(true); callbacks[0].invalidate(); finish(new Response(null, { status: 401 })); await stale;
  expect(events.status).not.toHaveBeenCalled(); expect(events.invalidate).not.toHaveBeenCalled(); expect(events.ended).not.toHaveBeenCalled();
  expect(await (await f('/api/sessiya')).json()).toEqual({ ok: true, actor: 2 }); expect(fresh).toHaveBeenCalledTimes(1);
  callbacks[1].status(true); callbacks[1].invalidate(); expect(events.status).toHaveBeenCalledWith(true); expect(events.invalidate).toHaveBeenCalledTimes(1);
});
it('failed login retains identity; a current401 still invalidates access', async () => {
  const events = { status: vi.fn(), invalidate: vi.fn(), ended: vi.fn() };
  const create = vi.fn(() => (async () => new Response(null, { status: 401 })) as typeof fetch);
  const f = desktopSessionFetch(create, events); await f('/api/kirish', { method: 'POST' });
  expect(create).toHaveBeenCalledTimes(1); expect(events.ended).toHaveBeenCalledTimes(1);
});
