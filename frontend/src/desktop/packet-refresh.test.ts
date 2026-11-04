// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { DesktopPacketRefresh } from './packet-refresh';
import { ObyektOmbor } from '../ombor/obyekt-ombor';
import { son, type PaketXom } from '../ombor/paket';
import type { Saqlash } from '../ombor/saqlash';

function fixture(): PaketXom {
  return {
    format: 't2-paket/1', obyekt_id: 1, obyekt_nom: 'SYNTHETIC', kompaniya_id: 1, soni: 1,
    lugat: { nom: ['SYNTHETIC'], kod: [], birlik: [], tur: ['rs'], kat: [] },
    q: { id: [1], ota_id: [null], daraja: [0], tartib: [1], tur: [0], kat: [null],
      kod: [null], nom: [0], birlik: [null], hajm: [1], narx: [null], summa: [null],
      norma: [null], narx_usul: [null], versiya: [1], qoshimcha: [0], zamena: [0], xom_qator: {} },
    h: { fakt_hajm: [0], fakt_summa: [null], f2_hajm: [0], f2_summa: [null], f2_summa_yoq: [null],
      f2_summa_nomalum: [null], direct_fakt_hajm: [0], fakt_manbasi: [0],
      almashtirilgan_hajm: {}, almashtirilgan_summa: {} },
    f2: [], meta: { akt_podval: [{ akt_id: 5, jami: null }] },
  };
}

const setup = () => ({
  och: vi.fn(async () => ({ paket: {}, serverTasdiq: false })),
  serverdan: vi.fn(async () => {}),
  yop: vi.fn(async () => {}),
});

describe('desktop packet refresh trust boundary', () => {
  it('stores encrypted 200, restores authorized 304 and preserves unknown F2 and own footer', async () => {
    const bytes = new Map<string, Uint8Array>();
    const disk: Saqlash = { ol: async k => bytes.get(k), yoz: async (k, v) => { bytes.set(k, v); },
      ochir: async k => { bytes.delete(k); }, kalitlar: async () => [...bytes.keys()] };
    const secret = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const scope = { kompaniyaId: 1, foydalanuvchiId: 2 };
    const store = new ObyektOmbor(disk, scope, secret);
    const read = vi.fn().mockResolvedValueOnce({ ok: true, notModified: false, etag: 'v1', paket: fixture() })
      .mockResolvedValueOnce({ ok: true, notModified: true, etag: 'v1' });
    const reader = new DesktopPacketRefresh(1, store, read);
    const fresh = await reader.refresh(1);
    expect(fresh?.f2SummaYoq).toEqual([null]);
    expect(son(fresh!.paket.f2_summa, 0)).toBeNull();
    expect(bytes.size).toBe(1);
    expect(new TextDecoder().decode([...bytes.values()][0])).not.toContain('SYNTHETIC');
    const conditional = await reader.refresh(1);
    expect(read).toHaveBeenLastCalledWith(1, 'v1');
    expect(conditional?.f2SummaYoq).toEqual([null]);
    expect(conditional?.paket.meta.akt_podval).toEqual(fixture().meta.akt_podval);
    const restored = await new ObyektOmbor(disk, scope, secret).och(1);
    expect(restored?.serverTasdiq).toBe(false);
    expect(restored?.paket?.meta.akt_podval).toEqual(fixture().meta.akt_podval);
    await reader.close();
    expect(bytes.size).toBe(0);
  });

  it('rejects missing F2 evidence before writing storage', async () => {
    const store = setup(), raw = fixture();
    delete raw.h.f2_summa_yoq;
    const reader = new DesktopPacketRefresh(1, store as never,
      async () => ({ ok: true, notModified: false, etag: 'v1', paket: raw }));
    await expect(reader.refresh(1)).rejects.toThrow('DESKTOP_PACKET_SCHEMA');
    expect(store.serverdan).not.toHaveBeenCalled();
  });
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
