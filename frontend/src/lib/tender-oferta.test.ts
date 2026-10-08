import { describe, expect, it } from 'vitest';
import { ofertaHisobla, type OfertaQator } from './tender-oferta';
import { NAKRUTKA_STANDART, nakrutkaKaskad } from './nakrutka-kaskad';

const qator = (patch: Partial<OfertaQator> = {}): OfertaQator => ({
  sourceId: 'RES::r3', sourceSheet: 'RES', sourceRow: 3, tartibRaqami: 1, shifr: null,
  nom: 'Бетон B25', birlik: 'м3', hajm: 10, smetaBirlikNarx: 123.45, smetaSumma: 1234.5,
  rol: 'RESOURCE', hisobTuri: 'birlik', kategoriya: 'МАТ', kategoriyaManbasi: 'bolim',
  ...patch,
});

const foiz = (f: number, yon: 'pasaytirish' | 'oshirish' = 'pasaytirish') => ({ sozlama: { rejim: 'foiz' as const, yon, foiz: f } });

describe('tender oferta V2 — barg narxlash', () => {
  it('foiz bilan pasaytirganda summa = ROUND(taklif hajmi × pudratchi narxi; 2), manba o‘zgarmaydi', () => {
    const r = ofertaHisobla([qator()], foiz(10));
    expect(r.qatorlar[0].pudratchiBirlikNarx).toBe(111.105);
    expect(r.qatorlar[0].pudratchiSumma).toBe(1111.05);
    expect(r.qatorlar[0].smetaSumma).toBe(1234.5);
    expect(r.qatorlar[0].hajm).toBe(10);
  });

  it('qo‘lda narx global va kategoriya foizidan ustun', () => {
    const r = ofertaHisobla([qator({ sourceId: 'a' })], {
      sozlama: { rejim: 'foiz', yon: 'pasaytirish', foiz: 90, kategoriyaFoizlari: { МАТ: { yon: 'pasaytirish', foiz: 15 } } },
      manualNarxlar: { a: 77.25 },
    });
    expect(r.qatorlar[0].pudratchiSumma).toBe(772.5);
    expect(r.qatorlar[0].narxManbasi).toBe('qolda');
  });

  it('kategoriya foizi global foizdan ustun (Beton −15%, mashina +3%)', () => {
    const r = ofertaHisobla([
      qator({ sourceId: 'b', smetaBirlikNarx: 100, hajm: 1 }),
      qator({ sourceId: 'm', smetaBirlikNarx: 100, hajm: 1, kategoriya: 'МАШ', birlik: 'маш-ч' }),
      qator({ sourceId: 'c', smetaBirlikNarx: 100, hajm: 1, kategoriya: 'ЧЕЛ', birlik: 'чел-ч' }),
    ], { sozlama: { rejim: 'foiz', yon: 'pasaytirish', foiz: 0, kategoriyaFoizlari: { МАТ: { yon: 'pasaytirish', foiz: 15 }, МАШ: { yon: 'oshirish', foiz: 3 } } } });
    expect(r.qatorlar.map((q) => q.pudratchiSumma)).toEqual([85, 103, 100]);
    expect(r.qatorlar[0].narxManbasi).toBe('kategoriya_foiz');
  });

  it('qo‘lda rejimda kiritilmagan narx 0 ga aylanmaydi; yakuniy oferta ma’lum summalardan ko‘rinadi, qator ro‘yxatda (egasi qoidasi)', () => {
    const r = ofertaHisobla([qator()], { sozlama: { rejim: 'qolda' } });
    expect(r.qatorlar[0].pudratchiSumma).toBeNull();
    expect(r.qatorlar[0].muammolar).toContain('PUDRATCHI_NARXI_YOQ');
    expect(r.yakuniyOferta).toBe(0);
    expect(r.halQilinmagan).toBe(1);
  });

  it('smeta narxi ANIQ 0 — taklif 0, hal qilingan; NULL — faqat o‘sha qator ro‘yxatda, yakuniy ko‘rinadi', () => {
    const r = ofertaHisobla([qator({ smetaBirlikNarx: 0, smetaSumma: 0 })], foiz(10));
    expect(r.qatorlar[0].pudratchiBirlikNarx).toBe(0);
    expect(r.qatorlar[0].pudratchiSumma).toBe(0);
    expect(r.qatorlar[0].muammolar).toContain('SMETA_NARXI_NOL');
    expect(r.halQilinmagan).toBe(0);
    const n = ofertaHisobla([qator({ smetaBirlikNarx: null, smetaSumma: null })], foiz(10));
    expect(n.qatorlar[0].pudratchiSumma).toBeNull();
    expect(n.halQilinmagan).toBe(1);
    expect(n.yakuniyOferta).toBe(0);
  });

  it('P0: manba hajmi bo‘sh, qo‘lda taklif hajmi 10 × 800 000 = 8 000 000; manba hajmi null qoladi', () => {
    const r = ofertaHisobla([qator({ sourceId: 'q', hajm: null })], { sozlama: { rejim: 'qolda' }, manualNarxlar: { q: 800000 }, manualHajmlar: { q: 10 } });
    const q = r.qatorlar[0];
    expect(q.hajm).toBeNull();
    expect(q.taklifHajmiOverride).toBe(10);
    expect(q.taklifHajmi).toBe(10);
    expect(q.hajmManbasi).toBe('qolda');
    expect(q.pudratchiSumma).toBe(8000000);
    expect(q.muammolar).toEqual([]);
  });

  it('hajm yo‘q va override yo‘q bo‘lsa summa null (HAJM_YOQ)', () => {
    const r = ofertaHisobla([qator({ hajm: null })], foiz(0));
    expect(r.qatorlar[0].pudratchiSumma).toBeNull();
    expect(r.qatorlar[0].muammolar).toContain('HAJM_YOQ');
  });

  it('pasaytirish >100% rad etiladi', () => {
    expect(ofertaHisobla([qator()], foiz(101)).qatorlar[0].muammolar).toContain('NARX_MANFIY');
  });

  it('manba_jami (RESURS_VEDOMOST/TN transport) summaga foiz, soxta birlik narx yo‘q', () => {
    const r = ofertaHisobla([qator({ hisobTuri: 'manba_jami', smetaBirlikNarx: null, smetaSumma: 74909186.586528 })], foiz(10));
    expect(r.qatorlar[0].pudratchiBirlikNarx).toBeNull();
    expect(r.qatorlar[0].pudratchiSumma).toBe(67418267.93);
  });
});

describe('tender oferta V2 — jami, kategoriya va kaskad', () => {
  const rows: OfertaQator[] = [
    qator({ sourceId: 'l', sourceRow: 2, nom: 'ЗАТРАТЫ ТРУДА', kategoriya: 'ЧЕЛ', smetaBirlikNarx: 100, hajm: 10, smetaSumma: 1000 }),
    qator({ sourceId: 'm', sourceRow: 3, nom: 'ПЕСОК', kategoriya: 'МАТ', smetaBirlikNarx: 50, hajm: 20, smetaSumma: 1000 }),
    qator({ sourceId: 'k', sourceRow: 4, nom: 'КАБЕЛЬ', kategoriya: 'КАБ', smetaBirlikNarx: 10, hajm: 50, smetaSumma: 500 }),
    qator({ sourceId: 'j', sourceRow: 5, rol: 'SUBTOTAL', hisobTuri: 'yoq', kategoriya: null, nom: 'ИТОГО', hajm: null, smetaBirlikNarx: null, smetaSumma: 1500, jamiBolalari: ['m', 'k'], jamiMoslik: 'summa' }),
    qator({ sourceId: 't', sourceRow: 6, rol: 'TRANSPORT', hosila: true, hisobTuri: 'yoq', kategoriya: null, nom: 'Транспортные расходы 5%', hajm: null, smetaBirlikNarx: null, smetaSumma: 75 }),
    qator({ sourceId: 'g', sourceRow: 7, rol: 'GRAND_TOTAL', hisobTuri: 'yoq', kategoriya: null, nom: 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', hajm: null, smetaBirlikNarx: null, smetaSumma: 2575, jamiBolalari: ['l', 'j', 't'], jamiMoslik: 'summa' }),
  ];

  it('barg + uning jamisi ikki marta sanalmaydi; hosila podval summasi pulga qo‘shilmaydi', () => {
    const r = ofertaHisobla(rows, foiz(10));
    expect(r.togridanJami).toBe(900 + 900 + 450);
    expect(r.manbaTogridanJami).toBe(2500);
    expect(r.qatorlar.find((q) => q.sourceId === 'j')!.pudratchiSumma).toBe(1350);
    // Podval (транспорт 5%) manbadagidek taklifga ham qo‘llanadi: 1350 × 5% = 67,5.
    expect(r.qatorlar.find((q) => q.sourceId === 't')!.pudratchiSumma).toBe(67.5);
    expect(r.qatorlar.find((q) => q.sourceId === 'g')!.pudratchiSumma).toBe(900 + 1350 + 67.5);
    expect(r.kategoriyaJami).toMatchObject({ ЧЕЛ: 900, МАТ: 900, КАБ: 450 });
  });

  it('hosila xarajatlar YANGI pudratchi asoslaridan kanonik kaskad bilan hisoblanadi', () => {
    const r = ofertaHisobla(rows, foiz(10));
    const kutilgan = nakrutkaKaskad({ chel: 900, mash: 0, mat: 1350, ob: 0, mk: 0, kab: 450, bez: 0 }, NAKRUTKA_STANDART);
    expect(r.kaskad).toEqual(kutilgan);
    expect(r.yakuniyOferta).toBe(kutilgan.vsego);
    expect(r.kaskad.tr_mat).toBe(45); // (1350−450)×5%, eski podval 75 emas
  });

  it('noma’lum kategoriya — qator ro‘yxatda, yakuniy ko‘rinadi; operator tanlasa kaskadga kiradi', () => {
    const u = [qator({ sourceId: 'x', kategoriya: 'UNKNOWN', kategoriyaManbasi: 'yoq', kategoriyaTaklifi: 'БЕЗСКЛАД' })];
    const r1 = ofertaHisobla(u, foiz(0));
    expect(r1.yakuniyOferta).not.toBeNull();
    expect(r1.halQilinmagan).toBe(1);
    expect(r1.qatorlar[0].muammolar).toContain('KATEGORIYA_NOMALUM');
    const r2 = ofertaHisobla(u, { ...foiz(0), manualKategoriyalar: { x: 'БЕЗСКЛАД' } });
    expect(r2.asos.bez).toBe(1234.5);
    expect(r2.yakuniyOferta).toBe(nakrutkaKaskad({ chel: 0, mash: 0, mat: 1234.5, ob: 0, mk: 0, kab: 0, bez: 1234.5 }, NAKRUTKA_STANDART).vsego);
  });

  it('transport varag‘i siyosati: varaq summasi material transporti o‘rnini egallaydi', () => {
    const tr = qator({ sourceId: 'tv', sourceSheet: 'TR', rol: 'TRANSPORT', hosila: false, hisobTuri: 'manba_jami', kategoriya: null, smetaBirlikNarx: null, smetaSumma: 200 });
    const base = [qator({ sourceId: 'm', kategoriya: 'МАТ', smetaBirlikNarx: 100, hajm: 10 }), tr];
    const kaskad = ofertaHisobla(base, foiz(0));
    const varaq = ofertaHisobla(base, { ...foiz(0), transportSiyosati: 'varaq' });
    expect(kaskad.kaskad.tr_mat).toBe(50);
    expect(kaskad.transportVaraqJami).toBe(200);
    expect(varaq.kaskad.tr_mat).toBe(200);
  });
});
