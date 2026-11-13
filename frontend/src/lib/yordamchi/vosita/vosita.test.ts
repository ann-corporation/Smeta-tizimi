import { describe, expect, it, vi } from 'vitest';
import { kimMendan } from '../kim';
import { niyatAniqla } from '../niyat';
import { summaOl, sanaOl, tanlovTop } from './yordam';
import { VOSITALAR, vositaTop } from './reestr';
import { davomBekorMi, ruxsatBormi, vositaIshla } from './ishla';
import type { VositaApi, VositaKont } from './tur';

const OBYEKTLAR = [{ id: 12, nom: 'Yevropa 1' }, { id: 13, nom: 'Amfiteatr' }];
const KIM = kimMendan({ foydalanuvchi: { login: 'sinov', ism: 'Sinov' }, context_kompaniyalar: [{ kompaniya_id: 5, nom: 'Sinov MChJ', effective_role: 'boss', permissions: ['f2.approve', 'f2.cancel', 'financial.write', 'financial.read'] }], azoliklar: [] }, 5);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function api(o: Partial<VositaApi> = {}): any {
  const ok = async () => ({ ok: true });
  return {
    bugun: vi.fn(async () => [{ nom: 'Menga ochiq murojaatlar', soni: 2, yol: '/admin/murojaatlar' }, { nom: 'To‘lov xabarlari', soni: 0 }]),
    solishtiruv: vi.fn(async () => ({ ok: true as const, hisob: { yuqori_ochiq: 1, ochiq: 2, tushuntirildi: 0 }, royxat: [{ nom: 'F2 ≠ fakt', tavsif: 'farq bor', jiddiylik: 'high', obyekt_nom: 'Yevropa 1', havola: '/admin/x' }] })),
    aktlar: vi.fn(async () => [
      { id: 101, raqam: '7', oy: '2026-10-01', holat: 'qoralama', versiya: 3 },
      { id: 102, raqam: '6', oy: '2026-09-01', holat: 'tasdiqlangan', versiya: 5 },
    ]),
    aktTasdiqla: vi.fn(ok), aktBekorQoralama: vi.fn(ok), aktBekorLifecycle: vi.fn(ok),
    shartnomalar: vi.fn(async () => [{ id: 31, raqam: '12-A', nom: 'Asosiy' }, { id: 32, raqam: '15', nom: 'Qo‘shimcha' }]),
    tolovYoz: vi.fn(ok), xarajatYoz: vi.fn(ok),
    aloqalar: vi.fn(async () => [{ id: 1, nom: 'Texnadzor Markaz', rol: 'texnadzor', faol: true }, { id: 2, nom: 'Buyurtmachi Plus', rol: 'buyurtmachi', faol: true }]),
    murojaatTurlari: vi.fn(async () => [{ kalit: 'remark', nom: 'Remark' }, { kalit: 'predpisaniya', nom: 'Predpisaniya' }]),
    murojaatYarat: vi.fn(ok), taqdimResurslari: vi.fn(async () => [{ kalit: 'f2', nom: 'F2 akt' }]), taqdimYubor: vi.fn(ok), friksiya: vi.fn(),
    ...o,
  } as never;
}
const kont = (a: VositaApi, obyekt: { id: number; nom: string } | null = OBYEKTLAR[0], kim = KIM): VositaKont => ({
  kompaniyaId: 5, kim, obyekt, obyektlar: OBYEKTLAR, sahifalar: [{ yol: '/admin/f2-tarix', nom: 'F2 tarixi', guruh: 'x' }], api: a, opId: () => '00000000-0000-4000-8000-000000000001', bugun: new Date(2026, 10, 13),
});
const id = (m: string) => vositaTop(m)?.id ?? null;

describe('vosita ta’rifi — yagona naqsh', () => {
  it('har vositada id, tavsif, parametr sxemasi, o‘qish|yozish va pul bayrog‘i bor; id takrorlanmaydi', () => {
    expect(new Set(VOSITALAR.map((v) => v.id)).size).toBe(VOSITALAR.length);
    for (const v of VOSITALAR) { expect(v.tavsif.length).toBeGreaterThan(10); expect(['oqish', 'yozish']).toContain(v.tur); expect(typeof v.pul).toBe('boolean'); expect(v.parametrlar).toBeTypeOf('object'); }
    // pulga/hujjatga ta'sir qiluvchi yozuvlar hammasi pul=true (ikkinchi tasdiq)
    for (const k of ['f2_tasdiqla', 'f2_bekor', 'xarajat_yoz', 'tolov_yoz', 'taqdim_yubor']) expect(VOSITALAR.find((v) => v.id === k)?.pul).toBe(true);
  });
  it('hech qaysi vositaning parametrida aktor yo‘q (aktor sessiyadan)', () => {
    for (const v of VOSITALAR) expect(Object.keys(v.parametrlar).some((k) => /aktor|actor|foydalanuvchi/i.test(k))).toBe(false);
  });
});

describe('moslik (mahalliy, bepul)', () => {
  it.each([
    ['bugun menga nima kutyapti?', 'bugun'], ['что меня ждет', 'bugun'], ['bugungi topshiriqlarim', 'bugun'],
    ['solishtiruvni ko‘rsat', 'solishtiruv'], ['сверка покажи', 'solishtiruv'],
    ['F2 ni tasdiqla', 'f2_tasdiqla'], ['ф2 утверди', 'f2_tasdiqla'], ['oktabr F2 sini tasdiqlab ber', 'f2_tasdiqla'],
    ['F2 ni bekor qil', 'f2_bekor'], ['отмени ф2', 'f2_bekor'],
    ['xarajat yoz 12 mln', 'xarajat_yoz'], ['расход внеси 5 млн', 'xarajat_yoz'],
    ['to‘lov yoz 50 mln 12-A shartnoma', 'tolov_yoz'], ['avans kirit 100 mln', 'tolov_yoz'],
    ['texnadzorga murojaat yubor', 'murojaat_yubor'], ['remark yoz: beton sifati', 'murojaat_yubor'],
    ['F2 ni texnadzorga yubor', 'taqdim_yubor'], ['f2 taqdim qil', 'taqdim_yubor'],
    ['F2 ni excelga yuklab ber', 'yoq'], ['slichitelniy tayyorla', 'yoq'],
  ])('%s -> %s', (m, k) => { expect(id(m)).toBe(k); });

  it('oddiy navigatsiya/o‘qish/yozuv vositaga o‘tib ketmaydi', () => {
    for (const m of ['mindmapni och', 'F2 tarixini och', 'narxsiz qatorlar', '+5 beton', 'F2 qoralamasini tayyorla', 'АОСР qoralamasini tayyorla', 'qarzdorlikni ko‘rsat', 'Yevropa 1 holati']) expect(id(m)).toBeNull();
  });
  it('niyat aniqlagich vositani beradi', () => {
    expect(niyatAniqla('F2 ni tasdiqla', { sahifalar: [], obyektlar: OBYEKTLAR })).toMatchObject({ tur: 'vosita', id: 'f2_tasdiqla' });
  });
});

describe('slot yordamchilari', () => {
  it('summa', () => {
    expect(summaOl('12 mln')).toBe(12_000_000); expect(summaOl('1,5 mlrd')).toBe(1_500_000_000); expect(summaOl('250 ming')).toBe(250_000);
    expect(summaOl('250 000')).toBe(250000); expect(summaOl('5 млн')).toBe(5_000_000);
    expect(summaOl('F2 2026-10-05 sanasi')).toBeNull(); expect(summaOl('shartnoma 12 ga')).toBeNull(); expect(summaOl('yoz')).toBeNull();
  });
  it('sana va tanlov', () => {
    expect(sanaOl('2026-10-05', new Date(2026, 10, 13))).toBe('2026-10-05'); expect(sanaOl('05.10.2026')).toBe('2026-10-05');
    expect(sanaOl('kecha', new Date(2026, 10, 13))).toBe('2026-11-12'); expect(sanaOl('', new Date(2026, 10, 13))).toBe('2026-11-13');
    expect(tanlovTop('2', [{ nom: 'a' }, { nom: 'b' }])).toEqual({ nom: 'b' }); expect(tanlovTop('amfi', OBYEKTLAR)?.id).toBe(13); expect(tanlovTop('9', OBYEKTLAR)).toBeNull();
  });
  it('bekor so‘zlari va ruxsat', () => {
    expect(davomBekorMi('yo‘q')).toBe(true); expect(davomBekorMi('отмена')).toBe(true); expect(davomBekorMi('12 mln')).toBe(false);
    expect(ruxsatBormi('f2.approve', KIM)).toBe(true);
    expect(ruxsatBormi('f2.approve', { ...KIM, ruxsatlar: ['fakt.read'] })).toBe(false);
    expect(ruxsatBormi('f2.approve', { ...KIM, ruxsatlar: [] })).toBe(true);
  });
});

describe('o‘qish vositalari', () => {
  it('bugun: faqat soni bor qatorlar, havola bilan', async () => {
    const r = await vositaIshla('bugun', 'bugun menga nima kutyapti', kont(api()));
    expect(r).toMatchObject({ tur: 'javob' });
    expect((r as { matn: string }).matn).toContain('Menga ochiq murojaatlar: **2**');
    expect((r as { matn: string }).matn).not.toContain('To‘lov xabarlari');
  });
  it('solishtiruv: hisob va ro‘yxat', async () => {
    const a = api(); const r = await vositaIshla('solishtiruv', 'solishtiruv', kont(a));
    expect((r as { matn: string }).matn).toContain('ochiq 2'); expect(a.solishtiruv).toHaveBeenCalledWith(12);
  });
});

describe('yozuv vositalari: taklif + tasdiq, hech narsa o‘zi yozilmaydi', () => {
  it('F2 tasdiqlash: bitta qoralama -> taklif (pul), bajarilmaguncha API chaqirilmaydi; bajarilsa operation_id bilan', async () => {
    const a = api(); const r = await vositaIshla('f2_tasdiqla', 'F2 ni tasdiqla', kont(a));
    expect(r.tur).toBe('taklif'); if (r.tur !== 'taklif') return;
    expect(r.pul).toBe(true); expect(a.aktTasdiqla).not.toHaveBeenCalled();
    expect(await r.bajar()).toEqual([expect.stringContaining('tasdiqlandi')]);
    expect(a.aktTasdiqla).toHaveBeenCalledWith(101, 3, '00000000-0000-4000-8000-000000000001');
  });
  it('F2 tasdiqlash: tasdiqlanadigan yo‘q bo‘lsa halol javob', async () => {
    const r = await vositaIshla('f2_tasdiqla', 'sentabr F2 ni tasdiqla', kont(api()));
    expect(r.tur).toBe('javob'); expect((r as { matn: string }).matn).toContain('topilmadi');
  });
  it('F2 bekor: sabab so‘raladi; keyin qoralama eski yo‘l, tasdiqlangan — lifecycle', async () => {
    const a = api(); const c = kont(a);
    const s1 = await vositaIshla('f2_bekor', 'oktabr F2 ni bekor qil', c);
    expect(s1.tur).toBe('savol'); if (s1.tur !== 'savol') return;
    const s2 = await vositaIshla('f2_bekor', 'xato kiritilgan edi', c, s1.davom);
    expect(s2.tur).toBe('taklif'); if (s2.tur !== 'taklif') return;
    await s2.bajar();
    expect(a.aktBekorQoralama).toHaveBeenCalledWith(101, 'xato kiritilgan edi', 3); expect(a.aktBekorLifecycle).not.toHaveBeenCalled();
    const b = await vositaIshla('f2_bekor', 'sentabr F2 ni bekor qil sabab: dublikat akt', c);
    expect(b.tur).toBe('taklif'); if (b.tur !== 'taklif') return;
    await b.bajar();
    expect(a.aktBekorLifecycle).toHaveBeenCalledWith(102, 5, 'dublikat akt', '00000000-0000-4000-8000-000000000001');
  });
  it('F2 bekor: oy aytilmasa va bir nechta F2 bo‘lsa — BITTA aniqlashtiruvchi savol variantlar bilan', async () => {
    const r = await vositaIshla('f2_bekor', 'F2 ni bekor qil', kont(api()));
    expect(r.tur).toBe('savol'); if (r.tur === 'savol') { expect(r.variantlar?.length).toBe(2); expect(r.davom.kutilgan).toBe('akt'); }
  });
  it('obyekt tanlanmagan bo‘lsa — obyekt variantlari bilan savol; javob (nom) bilan davom etadi', async () => {
    const a = api(); const c = kont(a, null);
    const s = await vositaIshla('f2_tasdiqla', 'F2 ni tasdiqla', c);
    expect(s.tur).toBe('savol'); if (s.tur !== 'savol') return;
    const t = await vositaIshla('f2_tasdiqla', 'Yevropa 1', c, s.davom);
    expect(t.tur).toBe('taklif'); expect(a.aktlar).toHaveBeenCalledWith(12);
  });
  it('xarajat: summa yo‘q — so‘raydi; bor bo‘lsa taklif; takroriy bajarish bir xil operation_id', async () => {
    const a = api(); const c = kont(a);
    const s = await vositaIshla('xarajat_yoz', 'xarajat yoz', c); expect(s.tur).toBe('savol');
    const r = await vositaIshla('xarajat_yoz', 'xarajat yoz material 12 mln kecha', c);
    expect(r.tur).toBe('taklif'); if (r.tur !== 'taklif') return;
    await r.bajar(); await r.bajar();
    expect(a.xarajatYoz).toHaveBeenNthCalledWith(1, expect.objectContaining({ summa: 12_000_000, kat: 'МАТ', sana: '2026-11-12', obyektId: 12, operationId: '00000000-0000-4000-8000-000000000001' }));
    expect(a.xarajatYoz.mock.calls[0][0].operationId).toBe(a.xarajatYoz.mock.calls[1][0].operationId);
  });
  it('to‘lov: shartnoma raqami matndan; aniq bo‘lmasa variantlar', async () => {
    const a = api(); const c = kont(a);
    const r = await vositaIshla('tolov_yoz', 'to‘lov yoz 50 mln 12-A shartnoma bo‘yicha', c);
    expect(r.tur).toBe('taklif'); if (r.tur !== 'taklif') return;
    await r.bajar();
    expect(a.tolovYoz).toHaveBeenCalledWith(expect.objectContaining({ shartnomaId: 31, summa: 50_000_000, tur: 'tolov' }));
    const q = await vositaIshla('tolov_yoz', 'avans yoz 100 mln', c);
    expect(q.tur).toBe('savol'); if (q.tur !== 'savol') return;
    const w = await vositaIshla('tolov_yoz', '2', c, q.davom);
    expect(w.tur).toBe('taklif');
  });
  it('murojaat: tomon nomi matndan, matn so‘raladi, so‘ng taklif; bajarilsa murojaatYarat', async () => {
    const a = api(); const c = kont(a);
    const s = await vositaIshla('murojaat_yubor', 'texnadzorga murojaat yubor', c);
    expect(s.tur).toBe('savol'); if (s.tur !== 'savol') return;
    expect(s.davom.kutilgan).toBe('matn');
    const r = await vositaIshla('murojaat_yubor', 'beton sifati bo‘yicha laboratoriya xulosasi kerak', c, s.davom);
    expect(r.tur).toBe('taklif'); if (r.tur !== 'taklif') return;
    expect(r.pul).toBe(false);
    await r.bajar();
    expect(a.murojaatYarat).toHaveBeenCalledWith(expect.objectContaining({ aloqaId: 1, turi: 'remark', obyektId: 12 }));
  });
  it('taqdim: tasdiqlangan F2 + tomon -> taklif (hujjat, pul=true)', async () => {
    const a = api(); const r = await vositaIshla('taqdim_yubor', 'sentabr F2 ni texnadzorga yubor', kont(a));
    expect(r.tur).toBe('taklif'); if (r.tur !== 'taklif') return;
    expect(r.pul).toBe(true); expect(a.taqdimYubor).not.toHaveBeenCalled();
    await r.bajar(); expect(a.taqdimYubor).toHaveBeenCalledWith({ aloqaId: 1, resurs: 'f2', manbaId: 102, operationId: '00000000-0000-4000-8000-000000000001' });
  });
  it('API xatosi tushunarli ✗ qatori bo‘ladi', async () => {
    const a = api({ aktTasdiqla: vi.fn(async () => ({ ok: false, error: 'Versiya eskirgan' })) });
    const r = await vositaIshla('f2_tasdiqla', 'F2 ni tasdiqla', kont(a)); if (r.tur !== 'taklif') throw new Error('taklif kutilgan');
    expect(await r.bajar()).toEqual(['✗ Versiya eskirgan']);
  });
  it('API istisno tashlasa ham javob qaytadi (yiqilmaydi)', async () => {
    const r = await vositaIshla('f2_tasdiqla', 'F2 ni tasdiqla', kont(api({ aktlar: vi.fn(async () => { throw new Error('tarmoq'); }) })));
    expect(r).toMatchObject({ tur: 'javob', xato: true });
  });
});

describe('ruxsat va bo‘shliq', () => {
  it('ruxsati yo‘q rol: vosita ishlamaydi, API chaqirilmaydi', async () => {
    const a = api(); const kim = { ...KIM, ruxsatlar: ['fakt.read'] };
    const r = await vositaIshla('xarajat_yoz', 'xarajat yoz 5 mln', kont(a, OBYEKTLAR[0], kim));
    expect(r.tur).toBe('javob'); expect((r as { matn: string }).matn).toContain('ruxsat etilmagan'); expect(a.aktlar).not.toHaveBeenCalled(); expect(a.xarajatYoz).not.toHaveBeenCalled();
  });
  it('vositasi yo‘q ish: halol javob + sahifa + friksiya', async () => {
    const a = api(); const r = await vositaIshla('yoq', 'F2 ni excelga yuklab ber', kont(a));
    expect(r.tur).toBe('javob'); expect((r as { matn: string }).matn).toContain('sahifada qilasiz');
    expect(a.friksiya).toHaveBeenCalledWith('hujjat eksporti');
    expect((r as { havolalar?: unknown[] }).havolalar?.length).toBeGreaterThan(0);
  });
});
