import { describe, expect, it, vi } from 'vitest';
import { kimMendan } from '../kim';
import { vositaTop } from './reestr';
import { vositaIshla } from './ishla';
import { moslashMatni, obyektHolatMatni } from './pto-liniya';
import type { ObyektHolatMalumot, VositaKont } from './tur';

const KIM = kimMendan({ foydalanuvchi: { login: 'sinov', ism: 'Sinov' }, context_kompaniyalar: [{ kompaniya_id: 5, nom: 'Sinov MChJ', effective_role: 'boss', permissions: ['f2.approve', 'f2.prepare', 'smeta.write', 'financial.read'] }], azoliklar: [] }, 5);
const OB = { id: 12, nom: 'Sinov obyekti' };
const HOLAT: ObyektHolatMalumot = {
  nom: 'Sinov obyekti', shartnoma: { raqam: 'S-1', qqs_bilan: 1120, umumiy: false },
  smeta: { qqs_bilan: 1120, ustamali: 1000, ustamasiz: 800 }, fakt: { qqs_bilan: 560, ustamali: 500, ustamasiz: 400, narxsiz_soni: 2 }, f2: null,
  f2Qoralama: { qqs_bilan: null, soni: 1 }, f3: null, tolangan: null, qarz: null, bajarilish: { fakt: 50, f2: null, f3: null }, signal: { soni: 0, kritik: 0 }, diqqat: [{ kod: 'fakt_topshirilmagan', soni: null }],
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const kont = (api: any): VositaKont => ({ kompaniyaId: 5, kim: KIM, obyekt: OB, obyektlar: [OB], sahifalar: [{ yol: '/admin/nakopitelniy', nom: 'Nakopitelniy', guruh: 'x' }, { yol: '/admin/ai-agentlar', nom: 'AI ishchilar', guruh: 'x' }], api, opId: () => '00000000-0000-4000-8000-000000000001', bugun: new Date(2026, 10, 14) });
const id = (m: string) => vositaTop(m)?.id ?? null;

describe('PTO liniyasi vositalari', () => {
  it('moslik: yangi vositalar mavjud niyatlarni buzmaydi', () => {
    expect(id('F2 ni tasdiqlashga yubor')).toBe('f2_yubor');
    expect(id('F2 ni tasdiqla')).toBe('f2_tasdiqla');
    expect(id('F2 ni texnadzorga yubor')).toBe('taqdim_yubor');
    expect(id('moslash qutisini ko‘rsat')).toBe('moslash');
    expect(id('kunlik nazoratchiga topshir')).toBe('ishchi_topshir');
    expect(id('AI ishchilar holati')).toBe('ishchi_holat');
    expect(id('F3 ni excelga yuklab ber')).toBe('hujjat_yasa');
    expect(id('F2 ni excelga yuklab ber')).toBe('yoq');
  });

  it('obyekt holati: tartib QQS bilan → ustamali → ustamasiz; NULL «—» (0 emas)', () => {
    const m = obyektHolatMatni(HOLAT);
    expect(m).toContain('F-2 (tasdiqlangan): —');
    expect(m.indexOf('(QQS bilan)')).toBeLessThan(m.indexOf('(ustamali, QQS siz)'));
    expect(m.indexOf('(ustamali, QQS siz)')).toBeLessThan(m.indexOf('(ustamasiz)'));
    expect(m).toContain('2 narxsiz qator');
    expect(m).toContain('To‘langan: — · qarz: —');
  });

  it('F-2 ni tasdiqlashga yuborish: taklif kartasi, tasdiqdan oldin yozmaydi, operation_id bilan', async () => {
    const f2TasdiqgaYubor = vi.fn(async () => ({ ok: true }));
    const api = { aktlar: vi.fn(async () => [{ id: 101, raqam: '7', oy: '2026-11-01', holat: 'qoralama', versiya: 3, lifecycle_status: 'draft' }]), f2TasdiqgaYubor, friksiya: vi.fn() };
    const r = await vositaIshla('f2_yubor', 'F2 ni tasdiqlashga yubor', kont(api));
    expect(r.tur).toBe('taklif');
    expect(f2TasdiqgaYubor).not.toHaveBeenCalled();
    if (r.tur === 'taklif') { const n = await r.bajar(); expect(f2TasdiqgaYubor).toHaveBeenCalledWith(101, 3, '00000000-0000-4000-8000-000000000001'); expect(n[0]).toContain('✓'); }
  });

  it('AI ishchiga topshirish: noaniq bo‘lsa savol, aniq bo‘lsa taklif; tasdiqdan keyingina ishga tushadi', async () => {
    const ishchiTopshir = vi.fn(async () => ({ ok: true }));
    const ishchilar = vi.fn(async () => [
      { kod: 'kunlik_nazoratchi', nom: 'Kunlik nazoratchi', doira: 'kompaniya' as const, yoqilgan: true, jadval: 'kunlik', yangiNatija: 0, oxirgiHolat: null, oxirgiVaqt: null },
      { kod: 'hujjat_tekshiruvchi', nom: 'Hujjat tekshiruvchi', doira: 'kompaniya' as const, yoqilgan: true, jadval: 'qolda', yangiNatija: 1, oxirgiHolat: 'tugadi', oxirgiVaqt: null },
    ]);
    const r = await vositaIshla('ishchi_topshir', 'kunlik nazoratchiga topshir', kont({ ishchilar, ishchiTopshir }));
    expect(r.tur).toBe('taklif');
    expect(ishchiTopshir).not.toHaveBeenCalled();
    if (r.tur === 'taklif') { await r.bajar(); expect(ishchiTopshir).toHaveBeenCalledWith('kunlik_nazoratchi', '00000000-0000-4000-8000-000000000001'); }
    const q = await vositaIshla('ishchi_topshir', 'ishchiga topshir ishga tushir', kont({ ishchilar, ishchiTopshir }));
    expect(q.tur).toBe('savol');
  });

  it('hujjat yasash: sahifani ochadi, token haqida halol aytadi, yozmaydi', async () => {
    const r = await vositaIshla('hujjat_yasa', 'nakopitelniy excelga yuklab ber', kont({ friksiya: vi.fn() }));
    expect(r.tur).toBe('javob');
    if (r.tur === 'javob') { expect(r.havolalar?.[0].yol).toContain('/admin/nakopitelniy'); expect(r.matn).toContain('token'); }
  });

  it('slichitelniy sikli: к доплате → F-2 qoralama taklifi (tasdiqsiz yozmaydi), raqam so‘raladi, takror raqam rad', async () => {
    const slichitelniyYarat = vi.fn(async () => ({ ok: true }));
    const api = { slichitelniyHisob: vi.fn(async () => ({ doplata: { soni: 3, jami: 1000 }, snyatie: { soni: 0, jami: 0 }, sigmadi: 0, nomalum: 0 })), slichitelniyYarat, aktlar: vi.fn(async () => [{ id: 1, raqam: '9-Д', oy: '2026-11-01', holat: 'qoralama', versiya: 1 }]) };
    expect(id('slichitelniy sikli doplata qoralama')).toBe('slichitelniy_tsikl');
    const s = await vositaIshla('slichitelniy_tsikl', 'slichitelniy sikli doplata qoralama', kont(api));
    expect(s.tur).toBe('savol');
    const dup = await vositaIshla('slichitelniy_tsikl', 'slichitelniy sikli doplata raqam: 9', kont(api));
    expect(dup.tur === 'javob' && dup.xato).toBe(true);
    const r = await vositaIshla('slichitelniy_tsikl', 'slichitelniy sikli doplata raqam: 12-П', kont(api));
    expect(r.tur).toBe('taklif');
    expect(slichitelniyYarat).not.toHaveBeenCalled();
    if (r.tur === 'taklif') { await r.bajar(); expect(slichitelniyYarat).toHaveBeenCalledWith({ obyektId: 12, tur: 'doplata', oy: '2026-11', raqam: '12-П', operationId: '00000000-0000-4000-8000-000000000001' }); }
  });

  it('zamena/qo‘shimcha saqlash: belgilangan sintaksis, kam maydon so‘raladi, taklif tasdiqdan keyin yozadi; resurs qatori rad', async () => {
    const zamenaSaqla = vi.fn(async () => ({ ok: true }));
    const qator = { id: 5, kod: '1.1', nom: 'Beton quyish', birlik: 'm3', tur: 'bl', otaId: 2, versiya: 4 };
    const api = { qatorTop: vi.fn(async () => [qator]), zamenaSaqla };
    const toliq = 'zamena saqla asl: beton yangi: Monolit quyish birlik: m3 hajm: 12,5 sabab: loyihada yoq ish';
    expect(id(toliq)).toBe('zamena_saqla');
    const kam = await vositaIshla('zamena_saqla', 'zamena saqla asl: beton yangi: Monolit', kont(api));
    expect(kam.tur).toBe('savol');
    const r = await vositaIshla('zamena_saqla', toliq, kont(api));
    expect(r.tur).toBe('taklif');
    expect(zamenaSaqla).not.toHaveBeenCalled();
    if (r.tur === 'taklif') { await r.bajar(); expect(zamenaSaqla).toHaveBeenCalledWith(expect.objectContaining({ rejim: 'zamena', hajm: 12.5, nom: 'Monolit quyish', qator })); }
    const res = await vositaIshla('zamena_saqla', toliq, kont({ ...api, qatorTop: vi.fn(async () => [{ ...qator, tur: 'rs' }]) }));
    expect(res.tur === 'javob' && res.matn).toContain('Resurs zamenasi');
    expect(id('zamena haqida tushuntir')).not.toBe('zamena_saqla');
  });

  it('hujjat yasash: slichitelniy va АОСР kitobi sahifani ochadi', async () => {
    expect(id('slichitelniy excelga yuklab ber')).toBe('hujjat_yasa');
    expect(id('АОСР kitobini pechat qil')).toBe('hujjat_yasa');
  });

  it('Moslash qutisi: hisoblanmagan bo‘lsa «tafovut yo‘q» DEMAYDI', async () => {
    const r = await vositaIshla('moslash', 'moslash qutisini ko‘rsat', kont({ moslash: vi.fn(async () => ({ jami: 0, tur_soni: {}, bandlar: [], hisoblandi: null, hisoblanmagan: true })) }));
    expect(r.tur === 'javob' && r.matn).toContain('hali hisoblanmagan');
  });

  it('Moslash qutisi: bandlar tur bo‘yicha, o‘qilmasa «0 ta» DEMAYDI, faqat aniqlaydi', async () => {
    const band = { tur: 'f2_podval_farq', obyekt_id: 12, obyekt_nom: 'Sinov obyekti', akt_id: 101, akt_raqam: '7', summa: 1000, farq: 5.5, izoh: 'x', havola: '/admin/f2-tarix?obyekt=12' };
    const r = await vositaIshla('moslash', 'moslash qutisini ko‘rsat', kont({ moslash: vi.fn(async () => ({ jami: 1, tur_soni: { f2_podval_farq: 1 }, bandlar: [band], hisoblandi: null })) }));
    expect(r.tur === 'javob' && r.matn).toContain('tizim faqat aniqlaydi');
    if (r.tur === 'javob') expect(r.havolalar?.[0].yol).toBe('/admin/f2-tarix?obyekt=12');
    const x = await vositaIshla('moslash', 'moslash qutisini ko‘rsat', kont({ moslash: vi.fn(async () => null) }));
    expect(x.tur === 'javob' && x.xato).toBe(true);
    expect(moslashMatni([], 0).matn).toContain('tafovut yo‘q');
  });
});
