import { beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { NAKRUTKA_STANDART } from '../../src/lib/nakrutka-kaskad';
import { bosKiritma, f2Qatorlar, f2Qur, f2Yuk } from '../../src/lib/f2-tayyor';
import { AKT246_HAJM, AKT246_HOLAT, AKT246_ROWS } from '../../src/lib/f2-hujjat.fixture';
import type { F2Tafsilot } from '../../src/api/t2-narx';
import { f2Hujjat } from '../../src/lib/f2-hujjat';
import { f2AktTayyorla } from '../../src/lib/f2-akt-eksport';

const SVOD = { ok: true as const, natija: { ok: true, generated_at: '', shartnomalar: [{ id: 5, loyiha_id: null, raqam: 'L-2', nom: null, asosiy: true, holat: 'faol', jami_nds_bilan: 1000, obyektlar: [{ id: 79, nom: 'Fast Food 1-etaj' }], ds: [], f2: [], f3: [], tolovlar: [] }] } };
const AKT = { id: 246, obyekt_id: 79, kompaniya_id: 17, obyekt: 'Fast Food 1-etaj', tur: 'f2', raqam: '1', oy: '2026-10-01', holat: 'tasdiqlangan', hujjat_jami: 150026606.32 };
const mocks = vi.hoisted(() => ({ reestr: vi.fn(), malumot: vi.fn(), svod: vi.fn(), sarf: vi.fn(), qaytar: vi.fn() }));

vi.mock('../../src/api/supabase', async (orig) => ({ ...(await orig<object>()), sbT2AktReestrOl: mocks.reestr, sbT2KompaniyalarOl: async () => ({ ok: true, qatorlar: [{ id: 17, nom: 'NEW TIMES BUILDINGS' }] }) }));
vi.mock('../../src/api/f2-oylik-paket', async (orig) => ({ ...(await orig<object>()), portfelObyektOl: mocks.malumot }));
vi.mock('../../src/api/t2-nakopitelniy', async (orig) => ({ ...(await orig<object>()), shartnomaSvodOl: mocks.svod }));
vi.mock('../_shared/hujjat-sarf', async (orig) => ({ ...(await orig<object>()), serverSarfla: mocks.sarf, serverQaytar: mocks.qaytar }));

import { onRequestPost } from './hujjat-yarat';
import { ichkiRejimda, ichkiSorov, ICHKI_YOLLAR } from '../_shared/hujjat-ichki';

const b = f2Qur(AKT246_ROWS, AKT246_HOLAT);
const q = f2Qatorlar(b, { ...bosKiritma(), hajm: AKT246_HAJM });
const rowMap = new Map(AKT246_ROWS.map((r) => [r.id, r]));
const tafsilot = f2Yuk(q, '1').map((p, i) => {
  const r = rowMap.get(p.qatorId)!;
  return { akt_id: 246, obyekt_id: 79, kompaniya_id: 17, tur: 'f2', oy: '2026-10-01', akt_holat: 'tasdiqlangan', raqam: '1', akt_kim: null, akt_sana: '2026-10-02', akt_qator_id: 1000 + i,
    qator_id: p.qatorId, kod: r.kod, nom: r.nom, birlik: r.birlik, kat: r.kat, qator_tur: r.tur, hajm: p.certifiedQuantity ?? 0, narx: p.certifiedUnitPrice ?? null, summa: p.certifiedAmount ?? null, izoh: null,
    certified_quantity: p.certifiedQuantity ?? null, certified_unit_price: p.certifiedUnitPrice ?? null, certified_amount: p.certifiedAmount ?? null } as F2Tafsilot;
});
const kontekst = { imzo: {}, shartnoma: null, nakrutka: NAKRUTKA_STANDART, podval: null };
const M = { smeta: AKT246_ROWS, tafsilot, kontekst, aktQatorlar: new Map(), podvallar: new Map() };

const so = (body: unknown) => ({ request: new Request('https://t2.test/api/hujjat-yarat', { method: 'POST', headers: { Cookie: 'sess=x', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  env: { SUPABASE_URL: 'https://x', SUPABASE_KEY: 'k', SESSIYA_KALIT: 's' }, data: { roleAuthority: { foydalanuvchi_id: 9, rol: 'pto' } } }) as never;

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.reestr.mockResolvedValue({ ok: true, qatorlar: [AKT, { ...AKT, id: 247, holat: 'bekor' }] });
  mocks.malumot.mockResolvedValue(M);
  mocks.svod.mockResolvedValue(SVOD);
  mocks.sarf.mockResolvedValue({ ok: true, sarflandi: 12, bepulTakror: false, operationId: 'op-1' });
  mocks.qaytar.mockResolvedValue(true);
});

describe('/api/hujjat-yarat — yagona hujjat dvigateli', () => {
  it('royxat: serverdan mavjud hujjatlar (F-2 bekorsiz + F3 yo\'q bo\'lsa faqat F-2), formatlar bilan', async () => {
    const r = await onRequestPost(so({ amal: 'royxat', kompaniya_id: 17, obyekt_id: 79 }));
    const j = await r.json() as { ok: boolean; hujjatlar: Array<{ kalit: string; tur: string; formatlar: string[]; parametrlar: Record<string, number> }> };
    expect(j.ok).toBe(true);
    expect(j.hujjatlar.map((h) => h.kalit)).toEqual(['f2:246']);
    expect(j.hujjatlar[0].formatlar).toEqual(['xlsx', 'pdf']);
    expect(j.hujjatlar[0].parametrlar).toEqual({ akt_id: 246 });
  });

  it('GOLDEN: xlsx — F2 tarixi generatori (web) bilan bayt-ma-bayt bir xil; token f2 kaliti bilan bir marta', async () => {
    const r = await onRequestPost(so({ amal: 'yarat', tur: 'f2', format: 'xlsx', kompaniya_id: 17, obyekt_id: 79, akt_id: 246 }));
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toContain('spreadsheetml');
    const bytes = new Uint8Array(await r.arrayBuffer());
    const k = f2AktTayyorla({ smeta: AKT246_ROWS, lines: tafsilot, aktQatorlar: [], podvallar: new Map(), kontekst, akt: AKT, obyektNom: 'Fast Food 1-etaj', raqamlar: new Map([[246, '1']]) })!;
    const web = f2Hujjat(k.bolimlar, k.qatorlar, k.opsiya);
    expect([...bytes]).toEqual([...web.bytes]);
    expect(mocks.malumot).toHaveBeenCalledWith(17, 79, [246], 246);
    expect(mocks.sarf).toHaveBeenCalledTimes(1);
    expect(mocks.sarf.mock.calls[0][1]).toMatchObject({ actorId: 9, kompaniyaId: 17, turi: 'f2_hujjat', obyektId: 79, xesh: 'f2:79:2026-10:1' });
    expect(r.headers.get('X-Hujjat-Sarf')).toBe('12');
    expect(strFromU8(unzipSync(bytes)['[Content_Types].xml'])).toContain('worksheet');
  });

  it('pdf: haqiqiy PDF; sarlavha xlsx fayl nomidan; bepul takror sarlavhasi', async () => {
    mocks.sarf.mockResolvedValue({ ok: true, sarflandi: 0, bepulTakror: true, operationId: null });
    const r = await onRequestPost(so({ amal: 'yarat', tur: 'f2', format: 'pdf', kompaniya_id: 17, obyekt_id: 79, akt_id: 246 }));
    expect(r.headers.get('Content-Type')).toBe('application/pdf');
    expect(r.headers.get('X-Hujjat-Bepul-Takror')).toBe('1');
    expect(decodeURIComponent(r.headers.get('Content-Disposition') ?? '')).toMatch(/\.pdf$/);
    const pdf = new Uint8Array(await r.arrayBuffer());
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  });

  it('token yetmasa 402 va fayl berilmaydi', async () => {
    mocks.sarf.mockResolvedValue({ ok: false, status: 402, code: 'TOKEN_YETMAYDI', xato: 'Token yetmaydi', kerak: 5, balans: 1 });
    const r = await onRequestPost(so({ amal: 'yarat', tur: 'f2', format: 'xlsx', kompaniya_id: 17, obyekt_id: 79, akt_id: 246 }));
    expect(r.status).toBe(402);
    expect((await r.json() as { code: string }).code).toBe('TOKEN_YETMAYDI');
  });

  it('rad etishlar: bekor akt, begona kompaniya, noma\'lum tur/format, parametr yo\'q — token yechilmaydi', async () => {
    const cases: Array<[Record<string, unknown>, number, string]> = [
      [{ tur: 'f2', akt_id: 247 }, 409, 'AKT_BEKOR'],
      [{ tur: 'f2', akt_id: 999 }, 404, 'AKT_TOPILMADI'],
      [{ tur: 'f2', kompaniya_id: 18, akt_id: 246 }, 404, 'AKT_TOPILMADI'],
      [{ tur: 'f2' }, 400, 'PARAMETR_YOQ'],
      [{ tur: 'zzz', akt_id: 1 }, 400, 'TUR_NOMA_LUM'],
      [{ tur: 'f2', akt_id: 246, format: 'docx' }, 400, 'FORMAT_NOMA_LUM'],
    ];
    for (const [ ext, status, code ] of cases) {
      const r = await onRequestPost(so({ amal: 'yarat', format: 'xlsx', kompaniya_id: 17, obyekt_id: 79, ...ext }));
      expect([r.status, (await r.json() as { code: string }).code]).toEqual([status, code]);
    }
    expect(mocks.sarf).not.toHaveBeenCalled();
  });

  it('sessiyasiz 401', async () => {
    const ctx = { request: new Request('https://t2.test/api/hujjat-yarat', { method: 'POST', body: '{}' }), env: { SESSIYA_KALIT: 's' }, data: {} } as never;
    expect((await onRequestPost(ctx)).status).toBe(401);
  });
});

describe('ichki rejim (yuklovchilar uchun nisbiy fetch)', () => {
  it('faqat ruxsat etilgan yo\'llar; mutloq URL asl fetch ga; tugagach fetch tiklanadi', async () => {
    expect(ICHKI_YOLLAR).toEqual(['/api/sb', '/api/sb-yoz', '/api/kompaniya-sozlama']);
    const asl = globalThis.fetch;
    const ctx = so({});
    let ichkida: typeof fetch | null = null;
    const natija = await ichkiRejimda(ctx, async () => { ichkida = globalThis.fetch; return (await fetch('/api/yopiq-yol')).status; });
    expect(natija).toBe(404);
    expect(ichkida).not.toBe(asl);
    expect(globalThis.fetch).toBe(asl);
    await expect(ichkiRejimda(ctx, async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(globalThis.fetch).toBe(asl);
  });

  it('bir vaqtda ikki yasash ketma-ket bajariladi (fetch aralashmaydi)', async () => {
    const tartib: string[] = [];
    const ish = (nom: string) => ichkiRejimda(so({}), async () => { tartib.push(nom + '+'); await new Promise((o) => setTimeout(o, 5)); tartib.push(nom + '-'); });
    await Promise.all([ish('a'), ish('b')]);
    expect(tartib).toEqual(['a+', 'a-', 'b+', 'b-']);
  });

  it('ichkiSorov chaqiruvchi sarlavhalarini uzatadi, begona yo\'lni rad etadi', async () => {
    const r = await ichkiSorov(so({}), '/api/ai-savol', { method: 'POST', body: '{}' });
    expect(r.status).toBe(404);
  });
});
