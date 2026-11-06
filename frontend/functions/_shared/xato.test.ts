import { describe, expect, it, vi } from 'vitest';
import { bazaBiznesKodi, xavfsizUpstream, xavfsizXato } from './xato';

describe('xavfsizUpstream', () => {
  it('hides PostgREST internals while keeping the stable response shape', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = xavfsizUpstream(400, JSON.stringify({
      code: 'PGRST125', message: 'relation internal_secret does not exist',
    }));
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ ok: false, code: 'UPSTREAM' });
    expect(body.error).toBe(body.xato);
    expect(JSON.stringify(body)).not.toContain('PGRST125');
    expect(JSON.stringify(body)).not.toContain('internal_secret');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('preserves stable application codes for conflict handling', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = xavfsizUpstream(409, JSON.stringify({ code: 'STALE_VERSION' }));
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ ok: false, code: 'STALE_VERSION' });
    expect(body.error).toBe('Ma’lumot boshqa joyda o‘zgargan — sahifani yangilang.');
    log.mockRestore();
  });

  it('keeps a gateway status override without exposing the upstream body', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = xavfsizUpstream(200, JSON.stringify({
      code: 'AUTHORIZATION_DENIED', message: 'internal relation detail',
    }), 403);
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(body).toMatchObject({ ok: false, code: 'AUTHORIZATION_DENIED' });
    expect(JSON.stringify(body)).not.toContain('internal relation detail');
    log.mockRestore();
  });
});

describe('bazaBiznesKodi — F2 baza qoidalari sababli kod bilan (audit A-8)', () => {
  it('23514 hajm CHECK → F2_HAJM_NOL; P0001 QATOR_ALMASHTIRILGAN → o‘z kodi; boshqalari — null', async () => {
    expect(bazaBiznesKodi(JSON.stringify({ code: '23514', message: 'new row violates check constraint "t2_akt_qator_hajm_check"' }))).toBe('F2_HAJM_NOL');
    expect(bazaBiznesKodi(JSON.stringify({ code: 'P0001', message: 'QATOR_ALMASHTIRILGAN: qator 5 yangi smeta versiyasi bilan almashtirilgan' }))).toBe('QATOR_ALMASHTIRILGAN');
    expect(bazaBiznesKodi(JSON.stringify({ code: '23514', message: 'other_check' }))).toBeNull();
    expect(bazaBiznesKodi('<html>')).toBeNull();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const j = await xavfsizXato('F2_HAJM_NOL', 409, 'xom').json() as { code: string; error: string };
    expect(j.code).toBe('F2_HAJM_NOL'); expect(j.error).toMatch(/hajm 0/); expect(JSON.stringify(j)).not.toContain('xom');
    log.mockRestore();
  });
});