/**
 * /api/hujjat-yarat tur=forma3: server file === the web builder `forma3SotuvdanXlsx` byte for byte (GOLDEN), the list offers the
 * contract's sold Forma 3 documents, bad parameters are rejected. Synthetic data only (no real names or sums).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SvodShartnoma } from '../../src/lib/nakopitelniy-svod';

const D = vi.hoisted(() => ({ svod: [] as unknown[], sarf: vi.fn(), reestr: vi.fn() }));

vi.mock('../../src/api/supabase', async (orig) => ({
  ...(await orig<typeof import('../../src/api/supabase')>()),
  sbT2KompaniyalarOl: vi.fn(async () => ({ ok: true, qatorlar: [{ id: 1, nom: 'Firma', toliq_nom: 'Firma MChJ' }] })),
  sbT2AktReestrOl: D.reestr,
}));
vi.mock('../../src/api/t2-nakopitelniy', async (orig) => ({
  ...(await orig<typeof import('../../src/api/t2-nakopitelniy')>()),
  shartnomaSvodOl: vi.fn(async () => ({ ok: true, natija: { ok: true, generated_at: '', shartnomalar: D.svod } })),
}));
vi.mock('../_shared/hujjat-sarf', async (orig) => ({ ...(await orig<object>()), serverSarfla: D.sarf }));

import { forma3SotuvdanXlsx } from '../../src/lib/forma3-export';
import { onRequestPost } from './hujjat-yarat';
import { strFromU8, unzipSync } from 'fflate';
import { tengKolontitulsiz } from '../_shared/test-golden-yordam';

const SH: SvodShartnoma = {
  id: 11, loyiha_id: null, raqam: '1-T', nom: 'Namuna shartnoma', asosiy: true, holat: 'faol', jami_nds_bilan: 1_120_000,
  obyektlar: [{ id: 7, nom: 'Obyekt-A' }], ds: [], f2: [{ akt_id: 1, obyekt_id: 7, oy: '2026-09-01', raqam: '1', hujjat_jami: 560_000 }], tolovlar: [],
  f3: [{ id: 5, manba: 'sotuv', raqam: '3', sotuv_sana: '2026-09-30', sotuv_summa: 1_120_000, nds_foiz: 12, davr_boshi: '2026-09-01', davr_oxiri: '2026-09-30', holat: 'tayyor', bajarilgan_f2_summa: null, izoh: null, versiya: 1 }],
};

const so = (body: unknown) => ({ request: new Request('https://t2.test/api/hujjat-yarat', { method: 'POST', headers: { Cookie: 'sess=x', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  env: { SUPABASE_URL: 'https://x', SUPABASE_KEY: 'k', SESSIYA_KALIT: 's' }, data: { roleAuthority: { foydalanuvchi_id: 9, rol: 'pto' } } }) as never;
const yarat = (extra: Record<string, unknown>, format = 'xlsx') => onRequestPost(so({ amal: 'yarat', tur: 'forma3', format, kompaniya_id: 1, obyekt_id: 7, ...extra }));
/** GOLDEN: QURAI kolontituli (headerFooter + docProps) dan boshqa hammasi bayt-bayt teng; kolontitul albatta bor. */
const teng = tengKolontitulsiz;
const kolontitulBor = (b: Uint8Array) => Object.entries(unzipSync(b)).some(([n, v]) => /^xl\/worksheets\/[^/]+\.xml$/.test(n) && strFromU8(v).includes('qurai.uz'));
const baytlar = async (r: Response) => new Uint8Array(await r.arrayBuffer());

beforeEach(() => {
  D.svod = [SH];
  D.sarf.mockReset(); D.sarf.mockResolvedValue({ ok: true, sarflandi: 3, bepulTakror: false, operationId: 'op' });
  D.reestr.mockReset(); D.reestr.mockResolvedValue({ ok: true, qatorlar: [
    { id: 1, obyekt_id: 7, kompaniya_id: 1, obyekt: 'Obyekt-A', tur: 'f2', raqam: '1', oy: '2026-09-01', holat: 'qoralama', hujjat_jami: null }] });
});

describe('GOLDEN: Forma 3 server fayli === sayt quruvchisi (bayt-bayt)', () => {
  it('royxat: shartnomaning sotuv F3 hujjati forma3:<shartnoma>:<f3> kaliti bilan chiqadi', async () => {
    const j = await (await onRequestPost(so({ amal: 'royxat', kompaniya_id: 1, obyekt_id: 7 }))).json() as { hujjatlar: Array<{ kalit: string; tur: string; parametrlar: unknown }> };
    const f3 = j.hujjatlar.find((x) => x.tur === 'forma3');
    expect(f3?.kalit).toBe('forma3:11:5');
    expect(f3?.parametrlar).toEqual({ shartnoma_id: 11, f3_id: 5 });
  });

  it('xlsx: to\'liq shakl', async () => {
    const web = forma3SotuvdanXlsx(SH, 5, { tashkilot: 'Firma', shakl: 'toliq' });
    expect(web).not.toBeNull();
    const r = await yarat({ shartnoma_id: 11, f3_id: 5 });
    expect(r.status).toBe(200);
    const srv = await baytlar(r);
    expect(teng(srv, web!.bytes)).toBe(true);
    expect(kolontitulBor(srv)).toBe(true);
    expect(decodeURIComponent(r.headers.get('Content-Disposition') ?? '')).toContain(web!.faylNomi);
    expect(D.sarf.mock.calls[0][1]).toMatchObject({ actorId: 9, kompaniyaId: 1, turi: 'f3', obyektId: 7 });
  });

  it('xlsx: bir qatorli shakl', async () => {
    const web = forma3SotuvdanXlsx(SH, 5, { tashkilot: 'Firma', shakl: 'bir_qatorli' });
    const r = await yarat({ shartnoma_id: 11, f3_id: 5, shakl: 'bir_qatorli' });
    expect(r.status).toBe(200);
    const srv = await baytlar(r);
    expect(teng(srv, web!.bytes)).toBe(true);
    expect(kolontitulBor(srv)).toBe(true);
  });

  it('pdf: xlsx dan yasaladi, token bir marta', async () => {
    const r = await yarat({ shartnoma_id: 11, f3_id: 5 }, 'pdf');
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('application/pdf');
    expect(new TextDecoder().decode((await baytlar(r)).slice(0, 5))).toBe('%PDF-');
    expect(D.sarf).toHaveBeenCalledTimes(1);
  });

  it('noto\'g\'ri parametrlar rad etiladi; boshqa obyektning shartnomasi topilmaydi', async () => {
    expect((await yarat({})).status).toBe(400);
    expect((await yarat({ shartnoma_id: 11, f3_id: 99 })).status).toBe(409);
    const boshqa = await onRequestPost(so({ amal: 'yarat', tur: 'forma3', format: 'xlsx', kompaniya_id: 1, obyekt_id: 8, shartnoma_id: 11, f3_id: 5 }));
    expect([boshqa.status, (await boshqa.json() as { code: string }).code]).toEqual([404, 'SHARTNOMA_TOPILMADI']);
    expect(D.sarf).not.toHaveBeenCalled();
  });
});
