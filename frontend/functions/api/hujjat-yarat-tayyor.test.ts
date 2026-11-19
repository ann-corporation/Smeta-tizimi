import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ tayyor: vi.fn(), sarf: vi.fn(), yasa: vi.fn(), arxiv: vi.fn() }));
vi.mock('../_shared/hujjat-tayyor', () => ({ f2DiskdanTayyor: mocks.tayyor }));
vi.mock('../_shared/hujjat-sarf', async (orig) => ({ ...(await orig<object>()), serverSarfla: mocks.sarf, serverQaytar: async () => true }));
vi.mock('../_shared/hujjat-f2', async (orig) => ({ ...(await orig<object>()), f2Yasa: mocks.yasa }));
vi.mock('../_shared/disk-yoz', async (orig) => ({ ...(await orig<object>()), diskArxivla: mocks.arxiv }));
vi.mock('../../src/api/f2-hujjat-kontekst', async (orig) => ({ ...(await orig<object>()), hujjatDizayniniYukla: async () => undefined }));
vi.mock('../../src/lib/hujjat-yozuvchi/tizim-imzo', async (orig) => ({ ...(await orig<object>()), tizimImzosiniQoy: (b: Uint8Array) => b }));
import { onRequestPost } from './hujjat-yarat';

const base = { turi: 'f2_hujjat', obyektId: 79, davr: '2026-10', xesh: 'f2:79:2026-10:1', manba: { turi: 'f2', id: 246, kalit: 'f2:246', nom: 'F-2' } };
const so = (body: unknown) => ({ request: new Request('https://t2.test/api/hujjat-yarat', { method: 'POST', headers: { Cookie: 'sess=x', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  env: { SUPABASE_URL: 'https://x', SUPABASE_KEY: 'k', SESSIYA_KALIT: 's', R2_CANONICAL: {} }, data: { roleAuthority: { foydalanuvchi_id: 9, rol: 'pto' } } }) as never;
const Q = { amal: 'yarat', tur: 'f2', format: 'xlsx', kompaniya_id: 17, obyekt_id: 79, akt_id: 246 };

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.sarf.mockResolvedValue({ ok: true, sarflandi: 7, bepulTakror: false, operationId: 'op-1' });
  mocks.arxiv.mockResolvedValue({ ok: true, documentId: 1, disk: { ok: true, faylId: 1, versiya: 2, takror: false, yangi: false } });
  mocks.yasa.mockResolvedValue({ ...base, bytes: new Uint8Array([7]), faylNomi: 'yangi.xlsx', arxivla: true, akt: { id: 246 }, moliya: null });
});

describe('hujjat-yarat: Diskdagi tayyor F-2 (disk_afzal)', () => {
  it('tayyor Disk versiyasi beriladi: qayta yasalmaydi, qayta Diskka yozilmaydi, TOKEN yuklab olishda (mazmun kaliti) yechiladi', async () => {
    mocks.tayyor.mockResolvedValue({ ...base, bytes: new Uint8Array([1, 2]), faylNomi: 'disk.xlsx', arxivla: false, diskVersiya: 5, yangilandi: null });
    const r = await onRequestPost(so({ ...Q, disk_afzal: 1 }));
    expect(r.status).toBe(200);
    expect(r.headers.get('X-Hujjat-Manba')).toBe('disk');
    expect(r.headers.get('X-Hujjat-Sarf')).toBe('7');
    expect(mocks.yasa).not.toHaveBeenCalled();
    expect(mocks.arxiv).not.toHaveBeenCalled();
    expect(mocks.sarf).toHaveBeenCalledTimes(1);
    expect(mocks.sarf.mock.calls[0][1]).toMatchObject({ actorId: 9, kompaniyaId: 17, turi: 'f2_hujjat', xesh: 'f2:79:2026-10:1' });
  });
  it('eskirgan/yo‘q (null) - mavjud yo‘l: yangidan yasaladi, Diskka yoziladi, token baribir bitta marta', async () => {
    mocks.tayyor.mockResolvedValue(null);
    const r = await onRequestPost(so({ ...Q, disk_afzal: 1 }));
    expect(r.headers.get('X-Hujjat-Manba')).toBe('yasaldi');
    expect(mocks.yasa).toHaveBeenCalledTimes(1);
    expect(mocks.arxiv).toHaveBeenCalledTimes(1);
    expect(mocks.sarf).toHaveBeenCalledTimes(1);
  });
  it('disk_afzal berilmasa Disk tekshirilmaydi (eski xatti-harakat)', async () => {
    await onRequestPost(so(Q));
    expect(mocks.tayyor).not.toHaveBeenCalled();
    expect(mocks.yasa).toHaveBeenCalledTimes(1);
  });
});
