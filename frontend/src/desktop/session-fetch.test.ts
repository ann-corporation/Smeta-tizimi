// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { desktopEntryFetch, desktopSessionFetch } from './session-fetch';

it('lets Tauri IPC used by route persistence bypass the application fetch lifecycle', async () => {
  const original = vi.fn(async () => Response.json({ device_id: 'synthetic' }));
  const pages = vi.fn(async () => Response.json({ ok: true }));
  const remember = vi.fn(async () => {
    await request('http://ipc.localhost/desktop_session_info', { method: 'POST' });
  });
  const request = desktopEntryFetch(original, pages, 'http://tauri.localhost', remember);
  await expect(request('/api/sb', { method: 'POST' })).resolves.toHaveProperty('status', 200);
  expect(remember).toHaveBeenCalledTimes(1);
  expect(pages).toHaveBeenCalledTimes(1);
  expect(original).toHaveBeenCalledExactlyOnceWith('http://ipc.localhost/desktop_session_info', { method: 'POST' });
});
it.each([200, 401])('successful login retires old %s bodies/callbacks without ending the new session', async status => {
  const events = { status: vi.fn(), invalidate: vi.fn(), ended: vi.fn() }, callbacks: { status: (v: boolean) => void; invalidate: () => void }[] = [];
  let finish!: (response: Response) => void;
  const old = vi.fn(async (input: RequestInfo | URL) => String(input) === '/api/sessiya' ? new Promise<Response>(r => { finish = r; }) : Response.json({ ok: true }));
  const fresh = vi.fn(async () => Response.json({ ok: true, actor: 2 }));
  const f = desktopSessionFetch(e => { callbacks.push(e); return callbacks.length === 1 ? old : fresh; }, events);
  const stale = f('/api/sessiya'); await f('/api/kirish', { method: 'POST' });
  callbacks[0].status(true); callbacks[0].invalidate(); finish(Response.json({ oldActorData: true }, { status })); await expect(stale).rejects.toThrow('DESKTOP_SESSION_CHANGED');
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
