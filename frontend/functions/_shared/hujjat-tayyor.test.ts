import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ reestr: vi.fn() }));
vi.mock('../../src/api/supabase', () => ({ sbT2AktReestrOl: m.reestr }));
import { f2DiskdanTayyor, type TayyorOlDeps } from './hujjat-tayyor';
import { f2HujjatKaliti } from '../../src/api/f2-hujjat-kontekst';

const akt = { id: 100, raqam: '3', oy: '2031-03', holat: 'tasdiqlangan', obyekt: 'Obyekt', kompaniya_id: 17 };
const deps = (tayyor: Record<string, unknown>, bytes: Uint8Array | null = new Uint8Array([1, 2, 3])): TayyorOlDeps => ({
  rpc: vi.fn(async (nom: string) => nom === 't2_hujjat_tayyor_ol_v1' ? { httpOk: true, body: { ok: true, ...tayyor } } : { httpOk: true, body: { ok: true, kalit: 'r2/k', nom: 'F-2_3.xlsx' } }),
  r2Bayt: vi.fn(async () => bytes),
});

describe('f2DiskdanTayyor (Disk tayyor versiya, token yo‘q)', () => {
  it('yangi versiya: Diskdan beradi; xesh - obyekt+oy+raqam kaliti (token faqat bir marta, qayta yuklash bepul); qayta yozilmaydi', async () => {
    m.reestr.mockResolvedValue({ ok: true, qatorlar: [akt] });
    const d = deps({ fayl_id: 5, versiya: 5, yangilandi: '2031-03-10T00:00:00Z', eskirgan: false });
    const a = await f2DiskdanTayyor(d, { actorId: 9, kompaniyaId: 17, obyektId: 5, aktId: 100 });
    expect(a).toMatchObject({ faylNomi: 'F-2_3.xlsx', arxivla: false, turi: 'f2_hujjat', diskVersiya: 5, xesh: f2HujjatKaliti(5, '2031-03', '3') });
    // mazmun boshqacha bo‘lsa ham (yangi versiya) kalit bir xil -> qayta yuklash/yangi versiya token yechmaydi
    const b = await f2DiskdanTayyor(deps({ fayl_id: 5, versiya: 6, eskirgan: false }, new Uint8Array([9, 9])), { actorId: 9, kompaniyaId: 17, obyektId: 5, aktId: 100 });
    expect(b?.xesh).toBe(a?.xesh);
  });
  it('eskirgan (navbatda), Diskda yo‘q, bekor, bayt yo‘q - null (chaqiruvchi qayta yasaydi)', async () => {
    m.reestr.mockResolvedValue({ ok: true, qatorlar: [akt] });
    expect(await f2DiskdanTayyor(deps({ fayl_id: 5, eskirgan: true }), { actorId: 9, kompaniyaId: 17, obyektId: 5, aktId: 100 })).toBeNull();
    expect(await f2DiskdanTayyor(deps({ fayl_id: null, eskirgan: true }), { actorId: 9, kompaniyaId: 17, obyektId: 5, aktId: 100 })).toBeNull();
    expect(await f2DiskdanTayyor(deps({ fayl_id: 5, eskirgan: false }, null), { actorId: 9, kompaniyaId: 17, obyektId: 5, aktId: 100 })).toBeNull();
    m.reestr.mockResolvedValue({ ok: true, qatorlar: [{ ...akt, holat: 'bekor' }] });
    expect(await f2DiskdanTayyor(deps({ fayl_id: 5, eskirgan: false }), { actorId: 9, kompaniyaId: 17, obyektId: 5, aktId: 100 })).toBeNull();
    m.reestr.mockResolvedValue({ ok: true, qatorlar: [{ ...akt, kompaniya_id: 99 }] });
    expect(await f2DiskdanTayyor(deps({ fayl_id: 5, eskirgan: false }), { actorId: 9, kompaniyaId: 17, obyektId: 5, aktId: 100 })).toBeNull();
  });
});
