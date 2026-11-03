// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { DesktopPacketRefresh } from './packet-refresh';

const setup = () => ({
  och: vi.fn(async () => ({ paket: {}, serverTasdiq: false })),
  serverdan: vi.fn(async () => {}),
  yop: vi.fn(async () => {}),
});

describe('desktop packet refresh trust boundary', () => {
  it('does not read cache on unsolicited 304', async () => {
    const store = setup();
    const reader = new DesktopPacketRefresh(1, store as never,
      async () => ({ ok: true, notModified: true, etag: 'wrong' }));
    await expect(reader.refresh(1)).rejects.toThrow('DESKTOP_PACKET_ETAG');
    expect(store.och).not.toHaveBeenCalled();
  });

  it('revocation closes cache without serving it', async () => {
    const store = setup();
    const reader = new DesktopPacketRefresh(1, store as never, async () => ({ ok: false, status: 403 }));
    await expect(reader.refresh(1)).rejects.toThrow('DESKTOP_PACKET_UNAVAILABLE');
    expect(store.yop).toHaveBeenCalledOnce();
    expect(store.och).not.toHaveBeenCalled();
    await expect(reader.refresh(1)).rejects.toThrow('DESKTOP_PACKET_SCOPE');
  });

  it('transport failure never authorizes disk read', async () => {
    const store = setup();
    const reader = new DesktopPacketRefresh(1, store as never, async () => { throw new Error('offline'); });
    await expect(reader.refresh(1)).rejects.toThrow('offline');
    expect(store.och).not.toHaveBeenCalled();
  });
});
