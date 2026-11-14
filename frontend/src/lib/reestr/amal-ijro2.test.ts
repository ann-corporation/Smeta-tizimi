import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { T2QatorHolat } from '../../api/supabase';

const m = vi.hoisted(() => ({
  fakt: vi.fn(async () => ({ ok: true })), daraxt: vi.fn(),
  aloqalar: vi.fn(), taqdimlar: vi.fn(), taqdimYubor: vi.fn(async () => ({ ok: true, natija: { id: 1, holat: 'yuborilgan' } })), qaror: vi.fn(async () => ({ ok: true, natija: {} })),
  turlar: vi.fn(), murojaat: vi.fn(async () => ({ ok: true, natija: { id: 9, holat: 'ochiq' } })), hujjat: vi.fn(), lab: vi.fn(async () => ({ ok: true, natija: { id: 3 } })), davr: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../api/t2-fakt', () => ({ sbFaktYoz: m.fakt }));
vi.mock('../oylik-hujjat/ostatka-slichitelniy', () => ({ daraxtVaHolatOl: m.daraxt }));
vi.mock('../../api/t2-tomon', () => ({ aloqalarOl: m.aloqalar, taqdimlarOl: m.taqdimlar, taqdimYubor: m.taqdimYubor, taqdimQarori: m.qaror, murojaatTurlariOl: m.turlar, murojaatYarat: m.murojaat }));
vi.mock('../../api/t2-hujjat-canonical', () => ({ hujjatRoyxatOl: m.hujjat }));
vi.mock('../../api/t2-lab-sorov', () => ({ sorovYubor: m.lab }));
vi.mock('../../api/t2-bux-hisob', () => ({ buxDavr: m.davr }));
vi.mock('../../api/t2-zayavka', () => ({ sbZayavkaYoz: vi.fn() }));
vi.mock('../../api/t2-nakopitelniy', () => ({ tolovYoz: vi.fn() }));
vi.mock('../../api/t2-arxiv', () => ({ sbArxivla: vi.fn() }));

import { IJROCHILAR, qatorNomzodlari } from './amal-ijro';
import { AMAL_MAP } from './amal';
import { amalKeshTozala, amalTopish, bajar, holatAsync, javobQabul, korinish, sessiyaBosh, type AmalKontekst, type AmalSessiya } from './amal-motor';

const qator = (id: number, kod: string, nom: string, birlik: string, smeta: number, fakt: number): T2QatorHolat => ({ id, qator_id: id, obyekt_id: 11, tur: 'bl', kod, nom, birlik, kat: null, smeta_hajm: smeta, smeta_summa: null, fakt_hajm: fakt, fakt_summa: 0 } as unknown as T2QatorHolat);
const STATES = [qator(101, 'КР-5', 'Beton B25 quyish', 'm3', 100, 90), qator(102, 'КР-6', 'Beton tayyorlash B15', 'm3', 50, 0), qator(103, 'АР-1', 'Armatura o‘rnatish', 't', 8, 1)];
const ROWS = [{ id: 101, raqam: '5' }, { id: 102, raqam: '6' }, { id: 103, raqam: '7' }];
const ctx = (o: Partial<AmalKontekst> = {}): AmalKontekst => ({
  kompaniyaId: 7, obyektId: 11, obyektlar: [{ id: 11, nom: 'Amfiteatr' }], shartnomalar: [],
  permissions: ['fakt.write', 'document.write', 'project.read', 'accounting.write'], superadmin: false, bugun: new Date(2026, 10, 12), ...o,
});

async function boshla(matn: string, c: AmalKontekst) {
  const t = amalTopish(matn);
  if (t?.tur !== 'aniq') throw new Error('amal topilmadi: ' + matn);
  const amal = t.amal; const s = sessiyaBosh(amal, matn, c);
  return { amal, s, h: await holatAsync(amal, s, c, IJROCHILAR[amal.kalit]) };
}
async function javob(amal: ReturnType<typeof AMAL_MAP.get> & object, s: AmalSessiya, c: AmalKontekst, matn: string) {
  const r = javobQabul(amal, s, matn, c); if (!r.ok) return { r } as const;
  return { r, h: await holatAsync(amal, s, c, IJROCHILAR[amal.kalit]) } as const;
}

beforeEach(() => {
  amalKeshTozala(); Object.values(m).forEach((f) => f.mockClear());
  m.daraxt.mockResolvedValue({ ok: true, rows: ROWS, states: STATES });
  m.aloqalar.mockResolvedValue({ ok: true, natija: [{ id: 5, holat: 'faol', qarshi_nom: 'Buyurtmachi MChJ', qarshi_rol: 'zakazchik' }, { id: 6, holat: 'faol', qarshi_nom: 'LabTest', qarshi_rol: 'laboratoriya' }] });
  m.hujjat.mockResolvedValue({ documents: [{ id: 40, type: 'f2_akt', filename: 'F2 oktabr.xlsx' }, { id: 41, type: 'f2_akt', filename: 'F2 noyabr.xlsx' }] });
  m.taqdimlar.mockResolvedValue({ ok: true, natija: [{ id: 70, nom: 'F2 oktabr', qarshi_nom: 'Pudratchi MChJ', obyekt_nom: 'Amfiteatr', summa: 1_200_000_000 }] });
  m.turlar.mockResolvedValue({ ok: true, natija: [{ kalit: 'savol', nom: 'Savol', nom_ru: 'Вопрос' }, { kalit: 'predpisaniya', nom: 'Predpisaniya', nom_ru: 'Предписание' }] });
});

describe('qatorNomzodlari: raqam / shifr / nom', () => {
  it('raqam, shifr va nom bo‘yicha', () => {
    const r = new Map(ROWS.map((x) => [x.id, x.raqam]));
    expect(qatorNomzodlari('5-qatorga 12 m3 fakt yoz', ['Amfiteatr'], STATES, r).map((h) => h.qator_id)).toEqual([101]);
    expect(qatorNomzodlari('КР-6 ga 3 m3', ['Amfiteatr'], STATES, r).map((h) => h.qator_id)).toEqual([102]);
    expect(qatorNomzodlari('beton quyish uchun fakt yoz', ['Amfiteatr'], STATES, r).map((h) => h.qator_id)).toEqual([101]);
    expect(qatorNomzodlari('fakt yoz', ['Amfiteatr'], STATES, r)).toEqual([]);
  });
});

describe('1) FAKT naqsh bilan: «Amfiteatrda 5-qatorga 12 m3 fakt yoz»', () => {
  it('qator va hajm matndan, birlik mos; ko‘rinishda smeta/fakt/yangi jami + smetadan oshish ogohi; yoziladi', async () => {
    const c = ctx(); const { amal, s, h } = await boshla('Amfiteatrda 5-qatorga 12 m3 fakt yoz', c);
    expect(h).toEqual({ tur: 'tayyor' });
    expect(s.params).toMatchObject({ obyekt: 11, qator: 101, hajm: 12 });
    const k = korinish(amal, s, c, IJROCHILAR[amal.kalit]);
    expect(k.matn).toContain('КР-5'); expect(k.matn).toContain('yangi jami: 102'); expect(k.matn).toContain('SMETADAN OSHADI');
    const n = await bajar(amal, s, { karta: true, ikkinchi: false }, c, IJROCHILAR[amal.kalit]);
    expect(m.fakt).toHaveBeenCalledWith({ obyektId: 11, sana: '2026-11-12', qatorlar: [{ qator_id: 101, hajm: 12 }], operationId: s.id });
    expect(n.havola).toBe('/admin/fakt?obyekt=11');
  });
  it('birlik qator birligiga mos kelmasa — BITTA savol, birlik o‘zgartirilmaydi', async () => {
    const c = ctx(); const { amal, s, h } = await boshla('Amfiteatrda 5-qatorga 12 kg fakt yoz', c);
    expect(h).toMatchObject({ tur: 'savol', param: 'hajm' });
    expect((h as { matn: string }).matn).toContain('m3');
    const j = await javob(amal, s, c, '8');
    expect(j.h).toEqual({ tur: 'tayyor' }); expect(s.params.hajm).toBe(8);
  });
  it('bir nechta nomzod — BITTA savol (top 3), raqam bilan tanlanadi', async () => {
    const c = ctx(); const { amal, s, h } = await boshla('Amfiteatrda 5 m3 beton fakt yoz', c);
    expect(h.tur).toBe('savol'); expect((h as { matn: string }).matn).toMatch(/1\).*\n2\)/);
    expect(javobQabul(amal, s, 'xxx', c).ok).toBe(false);
    const j = await javob(amal, s, c, '2'); expect(j.h).toEqual({ tur: 'tayyor' }); expect(s.params.qator).toBe(102);
  });
  it('naqsh qatorni topa olmasa — model oqimiga (modelga), hajm taxmin qilinmaydi', async () => {
    const c = ctx(); const { s } = await boshla('Amfiteatrda 12 m3 fakt yoz', c);
    expect(s.modelga).toBe(true); expect(m.fakt).not.toHaveBeenCalled();
  });
});

describe('2) hujjatni tomonga yuborish', () => {
  it('«shu F2 ni buyurtmachiga yubor»: aloqa roli bo‘yicha, hujjat — eng yangi; taqdimYubor chaqiriladi', async () => {
    const c = ctx(); const { amal, s, h } = await boshla('shu F2 ni buyurtmachiga yubor', c);
    expect(h.tur).toBe('savol');   // 2 ta hujjat — BITTA savol
    const j = await javob(amal, s, c, '1'); expect(j.h).toEqual({ tur: 'tayyor' });
    expect(korinish(amal, s, c, IJROCHILAR[amal.kalit]).matn).toContain('Buyurtmachi MChJ');
    await bajar(amal, s, { karta: true, ikkinchi: false }, c, IJROCHILAR[amal.kalit]);
    expect(m.taqdimYubor).toHaveBeenCalledWith(7, 5, 'f2', 41);
  });
});

describe('3) kelgan hujjatga qaror: ikki tasdiq, rad uchun sabab', () => {
  it('rad: sabab so‘raladi; summa ko‘rinadi; bitta tasdiq yozmaydi; ikki tasdiq yozadi', async () => {
    const c = ctx(); const { amal, s, h } = await boshla('kelgan hujjatni rad et', c);
    expect(h).toMatchObject({ tur: 'savol', param: 'izoh' });
    await javob(amal, s, c, 'hajmlar mos emas');
    const k = korinish(amal, s, c, IJROCHILAR[amal.kalit]);
    expect(k.matn).toMatch(/1\D200\D000\D000/); expect(k.summa).toBe(1_200_000_000);
    await expect(bajar(amal, s, { karta: true, ikkinchi: false }, c, IJROCHILAR[amal.kalit])).rejects.toMatchObject({ kod: 'IKKI_TASDIQ_KERAK' });
    await bajar(amal, s, { karta: true, ikkinchi: true }, c, IJROCHILAR[amal.kalit]);
    expect(m.qaror).toHaveBeenCalledWith(7, 70, 'rad', 'hajmlar mos emas');
  });
});

describe('4) murojaat / 7) lab / 12) davrni yopish', () => {
  it('murojaat yaratish: tomon va tur tanlanadi, mavjud klient', async () => {
    const c = ctx(); const { amal, s, h } = await boshla('buyurtmachiga murojaat yarat', c);
    expect(h.tur).toBe('savol');
    let x = await javob(amal, s, c, '2'); expect(x.h?.tur).toBe('savol');
    x = await javob(amal, s, c, 'armatura sertifikati kerak'); expect(x.h).toEqual({ tur: 'tayyor' });
    await bajar(amal, s, { karta: true, ikkinchi: false }, c, IJROCHILAR[amal.kalit]);
    expect(m.murojaat).toHaveBeenCalledWith(7, expect.objectContaining({ aloqaId: 5, turi: 'predpisaniya', sarlavha: 'armatura sertifikati kerak', obyektId: 11 }));
  });
  it('lab so‘rovi: laboratoriya aloqasi avtomatik', async () => {
    const c = ctx(); const { amal, s, h } = await boshla('laboratoriyaga so‘rov beton kub', c);
    if (h.tur === 'savol') await javob(amal, s, c, 'beton kub');
    expect(s.params.aloqa).toBe(6);
    s.params.sinovTuri ??= 'beton kub';
    await bajar(amal, s, { karta: true, ikkinchi: false }, c, IJROCHILAR[amal.kalit]);
    expect(m.lab).toHaveBeenCalledWith(7, expect.objectContaining({ aloqaId: 6, obyektId: 11 }));
  });
  it('davrni yopish: ikki tasdiq, operation_id uzatiladi', async () => {
    const c = ctx(); const { amal, s, h } = await boshla('2026-10 davrni yop', c);
    expect(h).toEqual({ tur: 'tayyor' }); expect(s.params.oy).toBe('2026-10');
    await expect(bajar(amal, s, { karta: true, ikkinchi: false }, c, IJROCHILAR[amal.kalit])).rejects.toMatchObject({ kod: 'IKKI_TASDIQ_KERAK' });
    await bajar(amal, s, { karta: true, ikkinchi: true }, c, IJROCHILAR[amal.kalit]);
    expect(m.davr).toHaveBeenCalledWith({ kompaniyaId: 7, oy: '2026-10', amal: 'yop', tasdiq: true, operationId: s.id });
  });
});