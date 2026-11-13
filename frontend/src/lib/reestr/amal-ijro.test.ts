import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  zayavka: vi.fn(async () => ({ ok: true })),
  tolov: vi.fn(async () => ({ ok: true })),
  arxiv: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../api/t2-zayavka', () => ({ sbZayavkaYoz: m.zayavka }));
vi.mock('../../api/t2-nakopitelniy', () => ({ tolovYoz: m.tolov }));
vi.mock('../../api/t2-arxiv', () => ({ sbArxivla: m.arxiv }));

import { IJROCHILAR } from './amal-ijro';
import { AMAL_MAP } from './amal';
import { amalKeshTozala, amalTopish, bajar, holat, javobQabul, korinish, sessiyaBosh, type AmalKontekst } from './amal-motor';

const ctx = (o: Partial<AmalKontekst> = {}): AmalKontekst => ({
  kompaniyaId: 7, obyektId: 11, joriyShartnomaId: null,
  obyektlar: [{ id: 11, nom: 'Amfiteatr' }, { id: 12, nom: 'Yevropa 1' }],
  shartnomalar: [{ id: 301, raqam: '12/2026', nom: 'Beton ishlari' }],
  permissions: ['warehouse.write', 'financial.write', 'smeta.write'], superadmin: false, bugun: new Date(2026, 10, 12), ...o,
});

/** Jarvis oqimining o‘zi: niyat -> sessiya -> (savol/javob) -> ko‘rinish -> tasdiq -> ijro. */
async function oqim(matn: string, c: AmalKontekst, javoblar: string[] = [], tasdiq = { karta: true, ikkinchi: true }) {
  const t = amalTopish(matn);
  if (!t || t.tur !== 'aniq') return { t } as const;
  const amal = t.amal; const s = sessiyaBosh(amal, matn, c);
  const savollar: string[] = [];
  let h = holat(amal, s, c);
  for (const j of javoblar) {
    if (h.tur !== 'savol') break;
    savollar.push(h.matn);
    const r = javobQabul(amal, s, j, c); if (!r.ok) savollar.push(r.matn);
    h = holat(amal, s, c);
  }
  if (h.tur === 'savol') savollar.push(h.matn);
  if (h.tur !== 'tayyor') return { t, h, savollar, s } as const;
  const k = korinish(amal, s, c, IJROCHILAR[amal.kalit]);
  const n = await bajar(amal, s, tasdiq, c, IJROCHILAR[amal.kalit]);
  return { t, h, savollar, s, k, n } as const;
}

beforeEach(() => { amalKeshTozala(); Object.values(m).forEach((f) => f.mockClear()); });

describe('Jarvis amal oqimi (niyat -> ko‘rinish -> ijro), API klientlari mock', () => {
  it('«КР-5 uchun zayavka och»: bitta savol (miqdor), ko‘rinish, tasdiq, mavjud klient chaqiriladi', async () => {
    const r = await oqim('КР-5 uchun zayavka och', ctx(), ['40'], { karta: true, ikkinchi: false });
    expect(r.savollar).toHaveLength(1);
    expect(r.k?.matn).toContain('КР-5');
    expect(m.zayavka).toHaveBeenCalledWith(7, expect.objectContaining({ obyektId: 11, itemText: 'КР-5', requestedQty: 40 }));
    expect(r.n).toMatchObject({ ok: true, havola: '/admin/zayavka' });
  });
  it('miqdor aytilmasa yozilmaydi (taxmin yo‘q): savol qaytadi, klient chaqirilmaydi', async () => {
    const r = await oqim('КР-5 uchun zayavka och', ctx());
    expect(r.h?.tur).toBe('savol');
    expect(m.zayavka).not.toHaveBeenCalled();
  });
  it('to‘lov: summa/ shartnoma matndan, operation_id klientga uzatiladi, ikki tasdiq', async () => {
    const r = await oqim('12/2026 shartnomaga 5 mln tolov kiritish', ctx());
    expect(r.k?.summa).toBe(5_000_000);
    expect(r.k?.matn).toContain('5');
    expect(m.tolov).toHaveBeenCalledWith(expect.objectContaining({ kompaniyaId: 7, shartnomaId: 301, summa: 5_000_000, tur: 'tolov', sana: '2026-11-12', operationId: r.s?.id }));
  });
  it('to‘lov bitta tasdiq bilan bajarilmaydi', async () => {
    await expect(oqim('12/2026 shartnomaga 5 mln tolov kiritish', ctx(), [], { karta: true, ikkinchi: false })).rejects.toMatchObject({ kod: 'IKKI_TASDIQ_KERAK' });
    expect(m.tolov).not.toHaveBeenCalled();
  });
  it('ruxsat yo‘q: tushuntiriladi, klient chaqirilmaydi', async () => {
    const r = await oqim('12/2026 shartnomaga 5 mln tolov kiritish', ctx({ permissions: ['fakt.read'] }));
    expect(r.h).toMatchObject({ tur: 'ruxsatYoq' });
    expect(m.tolov).not.toHaveBeenCalled();
  });
  it('arxivla: ikki tasdiq, mavjud sbArxivla(obyekt, id)', async () => {
    const r = await oqim('obyektni arxivla', ctx({ permissions: ['smeta.write'] }));
    if (r.t) expect(r.t).toMatchObject({ tur: 'aniq', amal: { kalit: 'arxiv.obyekt' } });
    expect(m.arxiv).toHaveBeenCalledWith('obyekt', 11);
  });
  it('qayta urinish bir xil operation_id bilan ikkinchi marta yozmaydi', async () => {
    const c = ctx(); const amal = AMAL_MAP.get('moliya.tolov')!;
    const s = sessiyaBosh(amal, '12/2026 shartnomaga 5 mln tolov kiritish', c, 'op-fixed'); holat(amal, s, c);
    await bajar(amal, s, { karta: true, ikkinchi: true }, c, IJROCHILAR['moliya.tolov']);
    const b = await bajar(amal, s, { karta: true, ikkinchi: true }, c, IJROCHILAR['moliya.tolov']);
    expect(m.tolov).toHaveBeenCalledTimes(1);
    expect(b.takror).toBe(true);
  });
  it('server xatosi: foydalanuvchiga sababi, keshlanmaydi', async () => {
    m.zayavka.mockResolvedValueOnce({ ok: false, error: 'OBYEKT_YOPIQ' } as never);
    const r = await oqim('КР-5 uchun zayavka och', ctx(), ['3'], { karta: true, ikkinchi: false });
    expect(r.n).toMatchObject({ ok: false, xabar: 'OBYEKT_YOPIQ' });
  });
});