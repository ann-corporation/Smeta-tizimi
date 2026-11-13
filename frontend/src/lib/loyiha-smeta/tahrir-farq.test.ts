import { describe, expect, it } from 'vitest';
import { eskirganBolimlar, tahrirJami, tahrirJuftligi, tahrirQatorlari, type TahrirBog, type TahrirFarqDB, type TahrirItem } from './tahrir-farq';
import { qatorSumma, qqsBilan } from '../hisob-yadro';

const bog = (o: Partial<TahrirBog> = {}): TahrirBog => ({ qator_id: 2, kod: null, nom: 'Бетон монолитный', birlik: '100 м3', hajm: 0.1, narx: 90_000_000, kat: null, bolim_id: 1, bolim_nom: 'РАЗДЕЛ ОБРАЗЕЦ (КР-5)', ...o });
const el = (o: Partial<TahrirItem>): TahrirItem => ({ varaq: 'КР-5', kalit: 'beton|p1|beton', nom: 'Бетон', tur: 'beton', belgi: 'P1', holat: 'ozgargan', eski_birlik: 'м3', yangi_birlik: 'м3', eski_miqdor: 10, yangi_miqdor: 12,
  eski_norm: 10, yangi_norm: 12, foiz: 20, boglar: [bog()], ...o });
const d = (items: TahrirItem[], qarorlar: TahrirFarqDB['qarorlar'] = []): TahrirFarqDB => ({ eski_id: 1, yangi_id: 2, varaqlar: [
  { varaq: 'КР-5', eski_soni: 3, yangi_soni: 3, ozgargan: 1, olingan: 0, yangi: 0, ayni: 2, holat: 'ozgargan' }, { varaq: 'КР-7', eski_soni: 1, yangi_soni: 0, ozgargan: 0, olingan: 1, yangi: 0, ayni: 0, holat: 'olingan_varaq' },
  { varaq: 'КР-9', eski_soni: 0, yangi_soni: 1, ozgargan: 0, olingan: 0, yangi: 1, ayni: 0, holat: 'yangi_varaq' }], items, qarorlar });

describe('tahrirlar farqi: pul ta‘siri (hisob-yadro), narxsiz «—», eskirgan bo‘limlar', () => {
  it('o‘zgargan element: 100 м3 koeffitsiyenti, QQS bilan = QQS siz × 1.12; bog‘langan narx yo‘q -> null (0 emas)', () => {
    const [a, b] = tahrirQatorlari(d([el({}), el({ kalit: 'k2', boglar: [] })]));
    expect(a.farqQatorBirlikda).toBeCloseTo(0.02, 10); expect(a.pulQQSsiz).toBe(qatorSumma(0.02, 90_000_000)); expect(a.pulQQSbilan).toBe(qqsBilan(a.pulQQSsiz, 12));
    expect(b.pulQQSsiz).toBeNull(); expect(b.pulQQSbilan).toBeNull(); expect(b.narxsiz).toBe(true); expect(b.qator).toBeNull();
  });
  it('olingan element = manfiy farq (butun eski miqdor), yangi element = musbat; birligi noma‘lum -> null', () => {
    const [o, y, n] = tahrirQatorlari(d([el({ holat: 'olingan', yangi_norm: null, yangi_miqdor: null, foiz: null }), el({ holat: 'yangi', kalit: 'k3', eski_norm: null, eski_miqdor: null, foiz: null }),
      el({ kalit: 'k4', eski_norm: null, yangi_norm: 5 })]));
    expect(o.farqNorm).toBe(-10); expect(o.pulQQSsiz).toBeLessThan(0); expect(y.farqNorm).toBe(12); expect(y.pulQQSsiz).toBeGreaterThan(0); expect(n.farqNorm).toBeNull(); expect(n.pulQQSsiz).toBeNull();
  });
  it('qarorlar kalit bo‘yicha biriktiriladi; jami: qaror kutayotganlar, narxsiz va bog‘siz sanoq alohida', () => {
    const dd = d([el({}), el({ kalit: 'k2', boglar: [] }), el({ kalit: 'k5', boglar: [bog({ narx: null })] })], [{ varaq: 'КР-5', kalit: 'beton|p1|beton', qaror: 'pereraschet', sabab: null }]);
    const q = tahrirQatorlari(dd); const j = tahrirJami(dd, q);
    expect(q[0].qaror).toBe('pereraschet'); expect(j.qarorKutadi).toBe(2); expect(j.bogsizSoni).toBe(1); expect(j.narxsizSoni).toBe(1);
    expect([j.varaqOzgargan, j.varaqOlingan, j.varaqYangi]).toEqual([1, 1, 1]); expect(j.pulQQSbilan).toBe(q[0].pulQQSbilan);
  });
  it('eskirgan bo‘limlar: bog‘langan qatori o‘zgargan bo‘limlar, pul bo‘yicha tartib; qarorlar soni', () => {
    const q = tahrirQatorlari(d([el({}), el({ kalit: 'a', boglar: [bog({ bolim_id: 7, bolim_nom: 'ДРУГОЙ (КР-6)', narx: 1000, birlik: 'м3', hajm: 10 })] }), el({ kalit: 'b', boglar: [] })],
      [{ varaq: 'КР-5', kalit: 'a', qaror: 'qoldir', sabab: 'xato' }]));
    const b = eskirganBolimlar(q);
    expect(b.map((x) => x.bolimId)).toEqual([1, 7]); expect(b[0].soni).toBe(1); expect(b[1].hal).toBe(1); expect(b.reduce((s, x) => s + x.soni, 0)).toBe(2);
  });
  it('tahrir juftligi: asos (yo‘q bo‘lsa birinchi) ↔ oxirgi; bittadan kam bo‘lsa yo‘q; smeta eskirgan faqat asos belgilangan bo‘lsa', () => {
    expect(tahrirJuftligi([{ id: 1, smeta_asosi: false }])).toBeNull();
    expect(tahrirJuftligi([{ id: 1, smeta_asosi: false }, { id: 2, smeta_asosi: false }])).toEqual({ eski: 1, yangi: 2, smetaEskirgan: false });
    expect(tahrirJuftligi([{ id: 1, smeta_asosi: false }, { id: 2, smeta_asosi: true }, { id: 3, smeta_asosi: false }])).toEqual({ eski: 2, yangi: 3, smetaEskirgan: true });
    expect(tahrirJuftligi([{ id: 1, smeta_asosi: true }, { id: 2, smeta_asosi: false }, { id: 3, smeta_asosi: true }].slice(0, 2))).toEqual({ eski: 1, yangi: 2, smetaEskirgan: true });
  });
});
