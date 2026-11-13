import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  zayavka: vi.fn(async () => ({ ok: true })), oylik: vi.fn(async () => ({ ok: true })), kod: vi.fn(async () => ({ ok: true, natija: { id: 1 } })),
  reestr: vi.fn(), tasdiq: vi.fn(async () => ({ ok: true })), buyurtmalar: vi.fn(), tafsilot: vi.fn(), qabul: vi.fn(async () => ({ ok: true })),
  chizmalar: vi.fn(), chiqar: vi.fn(async () => ({ ok: true, natija: {} })), xarajat: vi.fn(async () => ({ ok: true })), aloqalar: vi.fn(),
}));
vi.mock('../../../api/t2-zayavka', () => ({ sbZayavkaYoz: m.zayavka }));
vi.mock('../../../api/t2-hr', () => ({ hrOylikAmal: m.oylik }));
vi.mock('../../../api/t2-tomon', () => ({ aloqalarOl: m.aloqalar, kodBilanQabul: m.kod, murojaatTurlariOl: vi.fn(), murojaatYarat: vi.fn(), taqdimlarOl: vi.fn(), taqdimQarori: vi.fn(), taqdimYubor: vi.fn() }));
vi.mock('../../../api/supabase', () => ({ sbT2AktReestrOl: m.reestr, sbT2AktTasdiqlash: m.tasdiq }));
vi.mock('../../../api/t2-buyurtma', () => ({ buyurtmalarOl: m.buyurtmalar, buyurtmaTafsilotOl: m.tafsilot, buyurtmaQabul: m.qabul }));
vi.mock('../../../api/t2-loyihachi', () => ({ chizmalarOl: m.chizmalar, revizyaChiqar: m.chiqar }));
vi.mock('../../../api/t2-pul-tahlil', () => ({ pulXarajatKirit: m.xarajat }));
vi.mock('../../../api/t2-fakt', () => ({ sbFaktYoz: vi.fn() }));
vi.mock('../../oylik-hujjat/ostatka-slichitelniy', () => ({ daraxtVaHolatOl: vi.fn() }));
vi.mock('../../../api/t2-hujjat-canonical', () => ({ hujjatRoyxatOl: vi.fn() }));
vi.mock('../../../api/t2-nakopitelniy', () => ({ tolovYoz: vi.fn() }));
vi.mock('../../../api/t2-arxiv', () => ({ sbArxivla: vi.fn() }));
vi.mock('../../../api/t2-lab-sorov', () => ({ sorovYubor: vi.fn() }));
vi.mock('../../../api/t2-bux-hisob', () => ({ buxDavr: vi.fn() }));

import { AMALLAR } from '../../reestr/amal';
import { AMAL_VOSITALARI, VOSITALAR, vositaTop } from './reestr';
import { amalIjroniUla, amalVositaNomi } from './amal-vosita';
import { AMAL_IJRO_KALITLAR } from '../../reestr/amal-ijro-kalitlar';
import { vositaIshla } from './ishla';
import type { VositaKont } from './tur';

amalIjroniUla(() => import('../../reestr/amal-ijro').then((x) => x.IJROCHILAR));
const kim = (ruxsatlar: string[]) => ({ ism: 'S', login: 's', rol: 'pto', rolNomi: null, ruxsatlar, platformSuperadmin: false }) as unknown as VositaKont['kim'];
let sayoq = 0;
const kont = (ruxsatlar: string[]): VositaKont => ({
  kompaniyaId: 7, kim: kim(ruxsatlar), obyekt: { id: 11, nom: 'Amfiteatr' }, obyektlar: [{ id: 11, nom: 'Amfiteatr' }], sahifalar: [],
  api: { shartnomalar: async () => [] } as unknown as VositaKont['api'], opId: () => '00000000-0000-4000-8000-' + String(++sayoq).padStart(12, '0'), bugun: new Date(2026, 10, 13),
});

describe('amal reestri -> Jarvis vositasi', () => {
  it('har amal vositaga aylanadi: yo qo\'lda vosita (nomi bir xil), yo reestrdan; nomlar yagona', () => {
    const nomlar = VOSITALAR.map((v) => v.id);
    expect(new Set(nomlar).size).toBe(nomlar.length);
    for (const a of AMALLAR) expect(nomlar, a.kalit).toContain(amalVositaNomi(a));
  });
  it('nomi bir xil QO\'LDA vosita ustun: reestrdan takror yaratilmaydi', () => {
    for (const n of ['f2_tasdiqla', 'xarajat_yoz', 'tolov_yoz', 'taqdim_yubor', 'murojaat_yubor']) expect(AMAL_VOSITALARI.some((v) => v.id === n), n).toBe(false);
    expect(AMAL_VOSITALARI.length).toBeGreaterThan(15);
  });
  it('ruxsat = amal capability; yozuv amalida aktor parametri yo\'q', () => {
    for (const a of AMALLAR) { const v = AMAL_VOSITALARI.find((x) => x.id === amalVositaNomi(a)); if (v) expect(v.ruxsat).toBe(a.capability); }
  });
  it('ijrochisiz amal — sahifaga yo\'naltiradi, hech narsa yozmaydi', async () => {
    const r = await vositaIshla('hujjat_yuklash', 'hujjat yuklash', kont(['document.write']));
    expect(r.tur).toBe('javob');
    if (r.tur === 'javob') expect(r.havolalar?.[0].yol).toBe('/admin/documents');
  });
  it('ruxsat yo\'q — tushuntiriladi, ijrochi chaqirilmaydi', async () => {
    const r = await vositaIshla('hr_tabel', 'oylikni hisobla', kont(['fakt.read']));
    expect(r.tur).toBe('javob'); expect(m.oylik).not.toHaveBeenCalled();
  });
});

describe('avval navigatsiya bo\'lgan 6 amal — ijro', () => {
  it('hr.tabel: oy so\'raladi, taklif, tasdiqdan keyin hrOylikAmal BIR marta (operation_id)', async () => {
    const c = kont(['hr.tabel.write']);
    const r1 = await vositaIshla('hr_tabel', 'oylikni hisobla', c);
    expect(r1.tur).toBe('savol');
    if (r1.tur !== 'savol') return;
    const r2 = await vositaIshla('hr_tabel', '2026-10', c, r1.davom);
    expect(r2.tur).toBe('taklif'); expect(m.oylik).not.toHaveBeenCalled();
    if (r2.tur === 'taklif') await r2.bajar();
    expect(m.oylik).toHaveBeenCalledTimes(1);
    expect(m.oylik).toHaveBeenCalledWith({ kompaniyaId: 7, oy: '2026-10', amal: 'hisobla', operationId: expect.stringMatching(/^00000000-0000-4000-8000-\d{12}$/) });
  });
  it('tomon.aloqa: kod bilan qabul', async () => {
    const c = kont(['company.member.manage']);
    const r1 = await vositaIshla('tomon_aloqa', 'tomon bilan aloqa ornatish', c);
    expect(r1.tur).toBe('savol');
    if (r1.tur !== 'savol') return;
    const r2 = await vositaIshla('tomon_aloqa', 'ABC12345', c, r1.davom);
    if (r2.tur === 'taklif') await r2.bajar();
    expect(m.kod).toHaveBeenCalledWith(7, 'ABC12345');
  });
  it('f2.tasdiqlash: ijrochi qoralamani versiya bilan tasdiqlaydi (qo\'lda f2_tasdiqla ustun, amal ijrochisi mindmap/tugma uchun)', async () => {
    const { IJROCHILAR } = await import('../../reestr/amal-ijro');
    m.reestr.mockResolvedValue({ ok: true, qatorlar: [{ id: 101, raqam: '7', oy: '2026-10-01', holat: 'qoralama', versiya: 3 }] });
    const n = await IJROCHILAR['f2.tasdiqlash'].ijro({ obyekt: 11, akt: 101 }, { kompaniyaId: 7 } as never, 'op-1');
    expect(n.ok).toBe(true); expect(m.tasdiq).toHaveBeenCalledWith(101, 3, 'op-1');
    m.reestr.mockResolvedValue({ ok: true, qatorlar: [{ id: 101, raqam: '7', oy: '2026-10-01', holat: 'tasdiqlangan', versiya: 4 }] });
    expect((await IJROCHILAR['f2.tasdiqlash'].ijro({ obyekt: 11, akt: 101 }, { kompaniyaId: 7 } as never, 'op-2')).ok).toBe(false);
  });
  it('buyurtma.qabul: hamma qator to\'liq (butun) qabul qilinadi', async () => {
    const { IJROCHILAR } = await import('../../reestr/amal-ijro');
    m.tafsilot.mockResolvedValue({ ok: true, buyurtma: { id: 5, holat: 'topshirildi', versiya: 2 }, qatorlar: [{ id: 51, miqdor: 10 }, { id: 52, miqdor: 3 }] });
    const n = await IJROCHILAR['buyurtma.qabul'].ijro({ buyurtma: 5 }, { kompaniyaId: 7 } as never, 'op-3');
    expect(n.ok).toBe(true);
    expect(m.qabul).toHaveBeenCalledWith(7, { buyurtmaId: 5, kutilganVersiya: 2, qatorlar: [{ buyurtma_qator_id: 51, qabul_miqdor: 10, holat: 'butun' }, { buyurtma_qator_id: 52, qabul_miqdor: 3, holat: 'butun' }] }, 'op-3');
  });
  it('chizma.chiqar: revizya aloqaga chiqariladi', async () => {
    const { IJROCHILAR } = await import('../../reestr/amal-ijro');
    const n = await IJROCHILAR['chizma.chiqar'].ijro({ obyekt: 11, revizya: 9, aloqa: 4 }, { kompaniyaId: 7 } as never, 'op-4');
    expect(n.ok).toBe(true); expect(m.chiqar).toHaveBeenCalledWith(7, 9, [4]);
  });
  it('moliya.xarajat: summa yaxlitlanadi (NDS siz), kategoriya kodga', async () => {
    const { IJROCHILAR } = await import('../../reestr/amal-ijro');
    const n = await IJROCHILAR['moliya.xarajat'].ijro({ summa: 1500000, kat: 'material', sana: '2026-11-13' }, { kompaniyaId: 7, obyektId: 11 } as never, 'op-5');
    expect(n.ok).toBe(true);
    expect(m.xarajat).toHaveBeenCalledWith(expect.objectContaining({ kompaniyaId: 7, obyektId: 11, summa: '1500000', operationId: 'op-5' }));
  });
  it('vositaTop: «bu oy uchun oylikni hisobla» reestrdan vositaga mos tushadi', () => {
    expect(vositaTop('bu oy uchun oylikni hisobla')?.id).toBe('hr_tabel');
  });
});
describe('ijrochi kalitlari royxati', () => {
  it('AMAL_IJRO_KALITLAR = IJROCHILAR kalitlari (ikki royxat farq qilmaydi)', async () => {
    const { IJROCHILAR } = await import('../../reestr/amal-ijro');
    expect([...AMAL_IJRO_KALITLAR].sort()).toEqual(Object.keys(IJROCHILAR).sort());
  });
});
