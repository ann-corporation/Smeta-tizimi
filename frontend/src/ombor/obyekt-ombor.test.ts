// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ObyektOmbor } from './obyekt-ombor';
import type { Saqlash } from './saqlash';
import { shifrOch } from './ombor-idb';
import type { PaketXom } from './paket';

function fixture(id = 4, kompaniya = 8): PaketXom {
  const fields = ['id', 'ota_id', 'daraja', 'tartib', 'tur', 'kat', 'kod', 'nom', 'birlik', 'hajm', 'narx', 'summa', 'norma', 'narx_usul', 'versiya', 'qoshimcha', 'zamena'];
  const hs = ['fakt_hajm', 'fakt_summa', 'f2_hajm', 'f2_summa', 'f2_summa_nomalum', 'direct_fakt_hajm', 'fakt_manbasi'];
  return { format: 't2-paket/1', obyekt_id: id, obyekt_nom: 'SYNTHETIC', kompaniya_id: kompaniya, soni: 0,
    lugat: { nom: [], kod: [], birlik: [], tur: [], kat: [] },
    q: { ...Object.fromEntries(fields.map(k => [k, []])), xom_qator: {} },
    h: { ...Object.fromEntries(hs.map(k => [k, []])), almashtirilgan_hajm: {}, almashtirilgan_summa: {} },
    f2: [], meta: { unknown: null, zero: 0 } } as unknown as PaketXom;
}
function disk() {
  const m = new Map<string, Uint8Array>();
  const port: Saqlash = { ol: async k => m.get(k), yoz: async (k, v) => { m.set(k, v); },
    ochir: async k => { m.delete(k); }, kalitlar: async () => [...m.keys()] };
  return { m, port };
}
const key = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
describe('D1a — shifrlangan snapshot ombori', () => {
  it('server tasdiqlaydi, diskdan qayta ochilish tasdiqlamaydi; NULL saqlanadi', async () => {
    const d = disk(), k = await key(), scope = { kompaniyaId: 8, foydalanuvchiId: 2 };
    const a = new ObyektOmbor(d.port, scope, k); await a.serverdan(fixture());
    expect(a.getSnapshot(4)?.serverTasdiq).toBe(true);
    const b = new ObyektOmbor(d.port, scope, k); const restored = await b.och(4);
    expect(restored?.serverTasdiq).toBe(false);
    expect(restored?.paket?.meta).toEqual({ unknown: null, zero: 0 });
    expect((await a.och(4))?.serverTasdiq).toBe(false);
  });
  it('begona tenant/payload, user va kalit yopiq', async () => {
    const d = disk(), k = await key(), a = new ObyektOmbor(d.port, { kompaniyaId: 8, foydalanuvchiId: 2 }, k);
    await expect(a.serverdan(fixture(4, 9))).rejects.toThrow('SCOPE_MISMATCH');
    await a.serverdan(fixture());
    expect(await new ObyektOmbor(d.port, { kompaniyaId: 8, foydalanuvchiId: 3 }, k).och(4)).toBeUndefined();
    expect(await new ObyektOmbor(d.port, { kompaniyaId: 8, foydalanuvchiId: 2 }, await key()).och(4)).toBeUndefined();
    await expect(shifrOch('paket/9/2/4', d.m.get('paket/8/2/4')!, k)).rejects.toThrow();
  });
  it('logout davom etayotgan yozuvni qayta tiriltirmaydi va boshqa user diskini o‘chirmaydi', async () => {
    const d = disk(), k = await key(), a = new ObyektOmbor(d.port, { kompaniyaId: 8, foydalanuvchiId: 2 }, k);
    d.m.set('paket/8/3/4', new Uint8Array([1]));
    const writing = a.serverdan(fixture()); await a.yop(); await writing;
    expect(d.m.has('paket/8/2/4')).toBe(false);
    expect(d.m.has('paket/8/3/4')).toBe(true);
    expect(a.getSnapshot(4)).toBeUndefined();
    await expect(a.serverdan(fixture())).rejects.toThrow('CLOSED');
  });
  it('xotirada 3, diskda 30 obyekt chegarasi', async () => {
    const d = disk(), a = new ObyektOmbor(d.port, { kompaniyaId: 8, foydalanuvchiId: 2 }, await key());
    for (let i = 1; i <= 32; i++) await a.serverdan(fixture(i));
    expect(d.m.size).toBe(30); expect(a.getSnapshot(29)).toBeUndefined(); expect(a.getSnapshot(32)).toBeDefined();
  });
  it('buzilgan ciphertext jim bo‘sh yoki authoritative paketga aylanmaydi', async () => {
    const d = disk(), k = await key(); d.m.set('paket/8/2/4', new Uint8Array([1, 2]));
    expect(await new ObyektOmbor(d.port, { kompaniyaId: 8, foydalanuvchiId: 2 }, k).och(4)).toBeUndefined();
  });
  it('kech disk javobi yangi server snapshotini bosmaydi', async () => {
    const d = disk(), k = await key(), scope = { kompaniyaId: 8, foydalanuvchiId: 2 };
    await new ObyektOmbor(d.port, scope, k).serverdan(fixture());
    const bytes = d.m.get('paket/8/2/4');
    let finish!: (v: Uint8Array | undefined) => void;
    let started!: () => void;
    const ready = new Promise<void>(r => { started = r; });
    const a = new ObyektOmbor({ ...d.port, ol: async () => { started(); return new Promise(r => { finish = r; }); } }, scope, k);
    const opening = a.och(4); await ready;
    const fresh = fixture(); fresh.meta = { generation: 2 }; await a.serverdan(fresh);
    finish(bytes); const result = await opening;
    expect(result?.paket?.meta).toEqual({ generation: 2 }); expect(result?.serverTasdiq).toBe(true);
  });
});
