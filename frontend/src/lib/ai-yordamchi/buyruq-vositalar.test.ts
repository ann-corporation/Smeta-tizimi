import { describe, expect, it, vi } from 'vitest';
import type { T2Qator } from '../../api/supabase';
import type { JurnalHolat } from '../fakt-jurnal';
import { BUYRUQ_AMAL_NOMI, PUL_TURLARI, amalDelta, buyruqAmalTekshir, buyruqMalumotQur, buyruqNarxsiz, buyruqOqi, buyruqQoldiq, buyruqVositalar, faktDelta, pulAmalmi, type YozNatija } from './buyruq-vositalar';
import { SAHIFA_VOSITALARI, sahifaJavobiniTekshir } from './protokol';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: 'n', birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

const rows = [
  q({ id: 1, tur: 'rz', kod: '1', nom: 'Fundament' }),
  q({ id: 2, tur: 'bl', ota_id: 1, kod: 'Е06-001-1', nom: 'Бетон монолитный фундамент', hajm: 40, narx: 1000 }),
  q({ id: 3, tur: 'rs', ota_id: 2, nom: 'Затраты труда', hajm: 80, kat: 'ЧЕЛ', narx: 50 }),
  q({ id: 4, tur: 'mat', ota_id: 2, nom: 'Бетон B25', hajm: 41, kat: 'МАТ' }),
  q({ id: 5, tur: 'rz', kod: '2', nom: 'Devorlar' }),
  q({ id: 6, tur: 'bl', ota_id: 5, kod: 'Е08-002', nom: 'Кладка стен из кирпича', hajm: 100, narx: 200 }),
  q({ id: 7, tur: 'mat', ota_id: 6, nom: 'Кирпич', hajm: 5000, kat: 'МАТ', narx: 0 }),
];
const states: JurnalHolat[] = [
  { qator_id: 2, smeta_hajm: 40, fakt_hajm: 10, f2_hajm: 5, qoldiq_hajm: 35, smeta_narx: 1000 },
  { qator_id: 6, smeta_hajm: 100, fakt_hajm: 0, f2_hajm: 0, qoldiq_hajm: 100, smeta_narx: 200 },
];
const m = () => buyruqMalumotQur(rows, states, { obyektNomi: 'Maktab', ustamali: (s) => ({ ustamali: s.ustamasiz == null ? null : s.ustamasiz * 1.2, taxminiy: false }) });

describe('buyruq satri — o‘qish buyruqlari (narxsiz, qoldiq)', () => {
  it('narxsiz: faqat narxi NULL resurs; narx 0 — narxsiz emas; summa noma’lum deyiladi', () => {
    const s = buyruqNarxsiz(m(), null);
    expect(s).toContain('[#4] MAT'); expect(s).toContain('narxsiz');
    expect(s).not.toContain('[#7]'); expect(s).not.toContain('[#2]');
    expect(s).toContain('0 emas');
    expect(buyruqNarxsiz(m(), 'кирпич')).toContain('yo‘q');
  });
  it('qoldiq: eng katta qoldiq tepada, fakt qoldig‘i va jami summa bloki bilan', () => {
    const s = buyruqQoldiq(m(), null);
    expect(s.indexOf('[#6]')).toBeGreaterThan(-1);
    expect(s.indexOf('[#6]')).toBeLessThan(s.indexOf('[#2]'));
    expect(s).toContain('fakt qoldig‘i'); expect(s).toContain('NDS');
    expect(buyruqQoldiq(m(), 'бетон')).toContain('[#2]');
  });
  it('buyruqOqi: qidir/holat/narxsiz/qoldiq; noma’lum vosita rad', () => {
    expect(buyruqOqi(m(), { vosita: 'qidir', arg: 'beton' })).toContain('[#2]');
    expect(buyruqOqi(m(), { vosita: 'holat', arg: null })).toContain('Butun obyekt');
    expect(buyruqOqi(m(), { vosita: 'narxsiz', arg: null })).toContain('[#4]');
    expect(buyruqOqi(m(), { vosita: 'qoldiq', arg: null })).toContain('Qoldiq');
    expect(buyruqOqi(m(), { vosita: 'sql_yozish', arg: null })).toContain('Noma’lum');
  });
  it('protokol: buyruq sahifasi vositalari; ro‘yxatda yo‘q amal (f2_yarat) tashlanadi', () => {
    expect(SAHIFA_VOSITALARI.buyruq.oqish).toEqual(expect.arrayContaining(['narxsiz', 'qoldiq']));
    const j = sahifaJavobiniTekshir({ javob: 'x', savollar: [], oqish: [{ vosita: 'narxsiz', arg: null }, { vosita: 'sql_yozish', arg: 'x' }],
      amallar: [{ tur: 'fakt_hajm', qator: 2, qiymat: '+5', izoh: '' }, { tur: 'f2_yarat', qator: null, qiymat: null, izoh: '' }] }, 'buyruq');
    expect(j.oqish).toEqual([{ vosita: 'narxsiz', arg: null }]);
    expect(j.amallar.map((a) => a.tur)).toEqual(['fakt_hajm']);
  });
});

describe('buyruq satri — tekshiruv, pul darajasi, delta', () => {
  it('pul/huquqiy turlar ikkinchi tasdiqni talab qiladi; oddiy fakt/korsat — yo‘q', () => {
    for (const tur of ['narx_tuzat', 'f2_yarat', 'forma3', 'akt_bekor', 'zamena', 'qoshimcha']) expect(pulAmalmi({ tur }), tur).toBe(true);
    expect(pulAmalmi({ tur: 'fakt_hajm' })).toBe(false); expect(pulAmalmi({ tur: 'korsat' })).toBe(false);
    expect(PUL_TURLARI.has('narx_tuzat')).toBe(true);
    // Modelga beriladigan har bir amal turi — nomlangan, pul turlari esa PUL_TURLARIda
    for (const tur of SAHIFA_VOSITALARI.buyruq.amal) expect(BUYRUQ_AMAL_NOMI[tur]).toBeTruthy();
  });
  it('tekshir: yaroqli fakt, noto‘g‘ri qator/hajm, bo‘limga yozilmaydi, bajarilmaydigan pul amali rad', () => {
    const x = m();
    expect(buyruqAmalTekshir(x, { tur: 'fakt_hajm', qator: 2, qiymat: '+5', izoh: '' })).toBeNull();
    expect(buyruqAmalTekshir(x, { tur: 'fakt_hajm', qator: 999, qiymat: '+5', izoh: '' })).toMatch(/topilmadi/);
    expect(buyruqAmalTekshir(x, { tur: 'fakt_hajm', qator: 2, qiymat: '5', izoh: '' })).toMatch(/\+5/);
    expect(buyruqAmalTekshir(x, { tur: 'fakt_hajm', qator: 2, qiymat: '=10', izoh: '' })).toMatch(/o‘zgarmaydi/);
    expect(buyruqAmalTekshir(x, { tur: 'narx_tuzat', qator: 4, qiymat: '900', izoh: '' })).toBeNull();
    expect(buyruqAmalTekshir(x, { tur: 'narx_tuzat', qator: 1, qiymat: '900', izoh: '' })).toMatch(/Bo‘lim/);
    expect(buyruqAmalTekshir(x, { tur: 'narx_tuzat', qator: 4, qiymat: '-5', izoh: '' })).toMatch(/musbat/);
    expect(buyruqAmalTekshir(x, { tur: 'f2_yarat', qator: null, qiymat: null, izoh: '' })).toMatch(/bajarilmaydi/);
  });
  it('delta: fakt «+5» / «=40» eski→yangi va pul (narx noma’lum bo‘lsa — null, 0 emas)', () => {
    const x = m();
    expect(faktDelta(x, { tur: 'fakt_hajm', qator: 2, qiymat: '+5', izoh: '' })).toBe(5);
    expect(faktDelta(x, { tur: 'fakt_hajm', qator: 2, qiymat: '=40', izoh: '' })).toBe(30);
    const d = amalDelta(x, { tur: 'fakt_hajm', qator: 2, qiymat: '+5', izoh: '' });
    expect(d?.ustamasiz).toBe(5000); expect(d?.eski).toContain('10'); expect(d?.yangi).toContain('15');
    const n = amalDelta(x, { tur: 'narx_tuzat', qator: 4, qiymat: '900', izoh: '' });
    expect(n?.eski).toBe('narxsiz'); expect(n?.ustamasiz).toBe(900 * 41);
    const nomalum = amalDelta(x, { tur: 'fakt_hajm', qator: 4, qiymat: '+3', izoh: '' });
    expect(nomalum?.ustamasiz).toBeNull();
  });
});

function yozQur() {
  let n = 0;
  return {
    faktYoz: vi.fn(async (_p: unknown): Promise<YozNatija> => ({ ok: true, raqam: 'F1' })),
    narxProtokol: vi.fn(async (_p: unknown): Promise<YozNatija> => ({ ok: true, raqam: 'P1' })),
    korsat: vi.fn((_id: number) => undefined), yangila: vi.fn(() => undefined),
    yangiOperationId: () => `op-${++n}-aaaaaaaa`, bugun: () => '2026-11-11',
  };
}
describe('buyruq satri — «Bajarish»: faqat mavjud yozish yo‘llari, operation_id bilan', () => {
  it('fakt: BIR chaqiruv, operation_id bor, qatorlar delta bilan; qayta bosilsa — o‘sha operation_id (idempotent)', async () => {
    const yoz = yozQur(); const v = buyruqVositalar(m, 1, yoz);
    const list = [{ tur: 'fakt_hajm', qator: 2, qiymat: '+5', izoh: '' }, { tur: 'fakt_hajm', qator: 6, qiymat: '=20', izoh: '' }];
    const out = await v.bajar(list);
    expect(yoz.faktYoz).toHaveBeenCalledTimes(1);
    const p = yoz.faktYoz.mock.calls[0][0] as { obyektId: number; sana: string; operationId: string; qatorlar: Array<{ qator_id: number; hajm: number }> };
    expect(p.operationId).toMatch(/^op-1-/); expect(p.obyektId).toBe(1); expect(p.sana).toBe('2026-11-11');
    expect(p.qatorlar).toEqual([{ qator_id: 2, hajm: 5 }, { qator_id: 6, hajm: 20 }]);
    expect(out.join('\n')).toContain('operation_id op-1-aaa');
    expect(yoz.narxProtokol).not.toHaveBeenCalled(); expect(yoz.yangila).toHaveBeenCalledTimes(1);
    await v.bajar(list);
    expect((yoz.faktYoz.mock.calls[1][0] as { operationId: string }).operationId).toBe(p.operationId);
  });
  it('narx_tuzat: narx protokoli qoralamasi BIR chaqiruv, operation_id bilan; yozilmasa xato matni', async () => {
    const yoz = yozQur(); const v = buyruqVositalar(m, 1, yoz);
    const out = await v.bajar([{ tur: 'narx_tuzat', qator: 4, qiymat: '900,5', izoh: '' }]);
    expect(yoz.narxProtokol).toHaveBeenCalledTimes(1);
    expect(yoz.narxProtokol.mock.calls[0][0]).toMatchObject({ obyektId: 1, qatorlar: [{ qator_id: 4, yangi_narx: 900.5 }] });
    expect((yoz.narxProtokol.mock.calls[0][0] as { operationId: string }).operationId).toBeTruthy();
    expect(out.join('')).toContain('operation_id');
    const yoz2 = yozQur(); yoz2.faktYoz.mockResolvedValueOnce({ ok: false, error: 'ruxsat yo‘q' });
    const out2 = await buyruqVositalar(m, 1, yoz2).bajar([{ tur: 'fakt_hajm', qator: 2, qiymat: '+1', izoh: '' }]);
    expect(out2.join('')).toContain('ruxsat yo‘q'); expect(yoz2.yangila).not.toHaveBeenCalled();
  });
  it('yaroqsiz taklif yozilmaydi; korsat hech narsa yozmaydi', async () => {
    const yoz = yozQur(); const v = buyruqVositalar(m, 1, yoz);
    await v.bajar([{ tur: 'fakt_hajm', qator: 999, qiymat: '+5', izoh: '' }, { tur: 'f2_yarat', qator: null, qiymat: null, izoh: '' }, { tur: 'korsat', qator: 4, qiymat: null, izoh: '' }]);
    expect(yoz.faktYoz).not.toHaveBeenCalled(); expect(yoz.narxProtokol).not.toHaveBeenCalled(); expect(yoz.korsat).toHaveBeenCalledWith(4);
  });
  it('vositalar: pul belgisi narx_tuzat uchun true, fakt_hajm uchun false', () => {
    const v = buyruqVositalar(m, 1, yozQur());
    expect(v.pul({ tur: 'narx_tuzat', qator: 4, qiymat: '1', izoh: '' })).toBe(true);
    expect(v.pul({ tur: 'fakt_hajm', qator: 2, qiymat: '+1', izoh: '' })).toBe(false);
    expect(v.nomi({ tur: 'fakt_hajm', qator: 2, qiymat: '+5', izoh: '' })).toContain('Fakt hajmi');
  });
});
