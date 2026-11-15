import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JarvisTask } from '../lib/ai-yordamchi/vazifa';
import { vazifaOl, vazifaRoyxat, vazifaSaqla } from './jarvis-vazifa';

const scope = { actorId: 987, companyId: 12, objectId: 34 };
const vazifa: JarvisTask = {
  id: 'task-1', goal: 'Vazifani tekshirish',
  scope,
  revision: 3, cancelled: false, steps: [],
};

afterEach(() => vi.unstubAllGlobals());

describe('Jarvis task HTTP client', () => {
  it('lists tasks with bounded scope and same-origin credentials', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, tasks: [vazifa] }));
    vi.stubGlobal('fetch', fetch);

    expect(await vazifaRoyxat(scope)).toEqual({ ok: true, tasks: [vazifa] });
    expect(fetch).toHaveBeenCalledWith('/api/agent-ish', expect.objectContaining({
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amal: 'vazifa_royxat', kompaniya_id: 12, obyekt_id: 34 }),
    }));
  });

  it('loads a task by id within its company and object scope', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, task: vazifa }));
    vi.stubGlobal('fetch', fetch);

    expect(await vazifaOl(scope, vazifa.id)).toEqual({ ok: true, task: vazifa });
    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({
      amal: 'vazifa_ol', kompaniya_id: 12, obyekt_id: 34, id: 'task-1',
    });
  });

  it('saves the task with expected revision and removes actorId from the payload', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, task: { ...vazifa, revision: 4 } }));
    vi.stubGlobal('fetch', fetch);

    expect(await vazifaSaqla(vazifa, 3)).toEqual({ ok: true, task: { ...vazifa, revision: 4 } });
    const [url, init] = fetch.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(url).toBe('/api/agent-ish');
    expect(body).toEqual({
      amal: 'vazifa_saqla', kompaniya_id: 12, obyekt_id: 34, id: 'task-1', expected_revision: 3,
      task: { ...vazifa, scope: { companyId: 12, objectId: 34 } },
    });
    expect(JSON.stringify(body)).not.toContain('actorId');
  });

  it('returns typed server errors including the conflict code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(
      { ok: false, error: 'Revision mos kelmadi', code: 'REVISION_CONFLICT' }, { status: 409 },
    )));
    expect(await vazifaOl(scope, 'task-1')).toEqual({
      ok: false, error: 'Revision mos kelmadi', code: 'REVISION_CONFLICT', status: 409,
    });
  });

  it('reports HTTP, malformed JSON, and network failures explicitly', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: 'Ruxsat yo‘q' }, { status: 403 }))
      .mockResolvedValueOnce(new Response('not-json', { status: 502 }))
      .mockRejectedValueOnce(new TypeError('offline'));
    vi.stubGlobal('fetch', fetch);

    expect(await vazifaRoyxat(scope)).toMatchObject({ ok: false, error: 'Ruxsat yo‘q', status: 403 });
    expect(await vazifaRoyxat(scope)).toMatchObject({ ok: false, error: expect.stringContaining('HTTP 502'), status: 502 });
    expect(await vazifaRoyxat(scope)).toMatchObject({ ok: false, error: 'Tarmoq xatosi: offline' });
  });
});
