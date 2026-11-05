import { describe, expect, it } from 'vitest';
import { internetQidiruvMatni, internetXulosa, manbaniBahola, narxTarqoqligi, type InternetDavo, type InternetManba } from './internet-narx';
import {
  internetgaMumkin, internetTaklif, keshKalit, lokalTaklif, narxsizNavbat, qabulYuki, taklifDarajasi, taxminiyToken, yuqorilarniQabul,
  type KorikQatori, type LokalTaklif, type NavbatQatori,
} from './ommaviy-narx';

// Synthetic data only — no real prices, names or companies.
const q = (id: number, nom: string, birlik: string, narx: number | null, p: Partial<NavbatQatori> = {}): NavbatQatori =>
  ({ id, tur: 'rs', kat: 'МАТ', nom, birlik, hajm: 2, narx, ...p });
const BUGUN = new Date('2026-11-05T10:00:00Z');
const lt = (p: Partial<LokalTaklif>): LokalTaklif => ({ qator_id: 1, manba_qator_id: 100, manba_id: 10, manba_tur: 'katalog', manba_nom: 'Katalog', manba_sana: '2026-10-01',
  yil: null, kvartal: null, nds_holati: 'nds_siz', manba_nom_qator: 'X', manba_birlik: 'т', manba_narx: 1000, platforma: true, ...p });

describe('navbat: narxsiz qatorlar kalit bo‘yicha birlashadi', () => {
  it('nom/birlik kaliti (DB bilan bir xil) — takror bitta guruh, hajm yig‘iladi; ЧЕЛ va narxli qator yo‘q', () => {
    const n = narxsizNavbat([q(1, 'Цемент М400', 'т', null), q(2, 'ЦЕМЕНТ  м400', 'Т.', null), q(3, 'Цемент М400', 'т', 500),
      q(4, 'Затраты труда', 'чел.-ч', null, { kat: 'ЧЕЛ' }), q(5, 'Песок', 'м3', 0), q(6, 'BL', 'м3', null, { tur: 'bl' })]);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ qatorIds: [1, 2], hajm: 4, nolNarxli: 0 });
  });
  it('NULL ≠ 0: narxi 0 qator faqat foydalanuvchi belgilasa', () => {
    expect(narxsizNavbat([q(5, 'Песок', 'м3', 0)])).toHaveLength(0);
    expect(narxsizNavbat([q(5, 'Песок', 'м3', 0)], { nolHam: true })[0]).toMatchObject({ nolNarxli: 1 });
  });
  it('mashina-soat internetga yuborilmaydi', () => {
    expect(internetgaMumkin({ kat: 'МАШ' })).toBe(false);
    expect(internetgaMumkin({ kat: 'МАТ' })).toBe(true);
  });
});

describe('ustuvorlik: reestr → katalog → КП → internet', () => {
  const g = narxsizNavbat([q(1, 'Цемент М400', 'т', null)])[0];
  it('daraja: yangi faktura/qabul qilingan = reestr; eski — katalog; КП', () => {
    expect(taklifDarajasi(lt({ platforma: false, manba_tur: 'boshqa' }), BUGUN)).toBe('reestr');
    expect(taklifDarajasi(lt({ platforma: false, manba_tur: 'faktura', manba_sana: '2024-01-01' }), BUGUN)).toBe('katalog');
    expect(taklifDarajasi(lt({ manba_tur: 'kp', platforma: false }), BUGUN)).toBe('kp');
  });
  it('reestr bo‘lsa katalog va КП ishlatilmaydi', () => {
    const t = lokalTaklif(g, [lt({ manba_qator_id: 1, manba_narx: 900 }), lt({ manba_qator_id: 2, manba_tur: 'kp', platforma: false, manba_narx: 800 }),
      lt({ manba_qator_id: 3, manba_tur: 'boshqa', platforma: false, manba_narx: 1100 })], BUGUN);
    expect(t).toMatchObject({ daraja: 'reestr', narx: 1100, ishonch: 'yuqori' });
  });
  it('bir darajada bir nechta manba — arifmetik o‘rtacha, tarqoqlik > 30 % — o‘rta ishonch', () => {
    const t = lokalTaklif(g, [lt({ manba_qator_id: 1, manba_narx: 1000 }), lt({ manba_qator_id: 2, manba_narx: 1400 })], BUGUN)!;
    expect(t.narx).toBe(1200);
    expect(t.manbalar).toHaveLength(2);
    expect(t.tarqoq).toBe(0.4);
    expect(t.ishonch).toBe('orta');
    expect(t.izoh).toContain('tarqoqlik 40 %');
  });
  it('birlik aniq o‘tkaziladi (кг → т), QQS bilan → QQS siz; o‘tmaydigan birlik tashlanadi', () => {
    expect(lokalTaklif(g, [lt({ manba_birlik: 'кг', manba_narx: 1.12, nds_holati: 'nds_bilan' })], BUGUN)?.narx).toBe(1000);
    expect(lokalTaklif(g, [lt({ manba_birlik: 'м3' })], BUGUN)).toBeNull();
  });
});

describe('o‘rtacha va tarqoqlik', () => {
  it('(max − min) / min; ikkidan kam manbada null', () => {
    expect(narxTarqoqligi([100, 130])).toBe(0.3);
    expect(narxTarqoqligi([100])).toBeNull();
  });
  it('internet xulosasi: 2 ta sahifada tekshirilgan, tarqoqlik ≤ 30 % — yuqori; aks holda o‘rta', () => {
    const m = (smetaNarx: number, ishonch: 'yuqori' | 'orta' = 'yuqori', domen = 'shop.example'): InternetManba =>
      ({ url: `https://${domen}/x`, nom: '', narx: smetaNarx, birlik: 'т', nds: 'siz', sotuvchi: '', domen, tekshirildi: true, sabab: null, smetaNarx, koef: 1, ishonch });
    expect(internetXulosa([m(100), m(120)])).toEqual({ narx: 110, ishonch: 'yuqori', tarqoq: 0.2 });
    expect(internetXulosa([m(100), m(200)]).ishonch).toBe('orta');
    expect(internetXulosa([m(100, 'orta'), m(110, 'orta')]).ishonch).toBe('orta');
    expect(internetXulosa([m(100, 'yuqori', 'xarid.uzex.uz')]).ishonch).toBe('yuqori');
    expect(internetXulosa([{ ...m(100), tekshirildi: false }]).narx).toBeNull();
  });
});

describe('tekshiruv: sahifa, JS sahifa uchun iqtibos, havolasiz manba yo‘q', () => {
  const s = { id: 'r0', nom: 'Арматура А500С Д12', birlik: 'т', kat: 'МАТ' };
  const v = (p: Partial<InternetDavo> = {}): InternetDavo => ({ url: 'https://shop.example/a', nom: 'Арматура', narx: 1120, birlik: 'т', nds: 'bilan', sotuvchi: 'S', ...p });
  const uzun = (x: string) => `${'Меню каталог доставка. '.repeat(80)}\n${x}`;
  it('sahifada narx va belgilar — yuqori, QQS siz', () => {
    const r = manbaniBahola(v(), s, 'shop.example', { ok: true, url: 'https://shop.example/a', matn: uzun('Арматура A500C ф12 — 1 120 сум') });
    expect(r).toMatchObject({ tekshirildi: true, ishonch: 'yuqori', smetaNarx: 1000 });
  });
  it('JS sahifa (matn qisqa yoki ochilmadi): iqtibosda narx va belgilar bo‘lsa — o‘rta', () => {
    const ok = manbaniBahola(v({ iqtibos: 'Арматура А500С 12 мм цена 1 120 сум/т' }), s, 'shop.example', { ok: true, url: 'https://shop.example/a', matn: 'Loading…' });
    expect(ok).toMatchObject({ tekshirildi: true, ishonch: 'orta' });
    expect(manbaniBahola(v({ iqtibos: 'Арматура А500С 12 мм цена 1 120 сум/т' }), s, 'shop.example', { ok: false, xato: 'Manba javobi: 403' }).ishonch).toBe('orta');
    // The fragment must carry the identity tokens too (Ø16 ≠ Ø12).
    expect(manbaniBahola(v({ narx: 3360, iqtibos: 'Арматура А500С 16 мм цена 3 360' }), s, 'shop.example', { ok: true, url: 'https://shop.example/a', matn: 'x' }).tekshirildi).toBe(false);
  });
  it('uzun sahifada mahsulot yo‘q — iqtibos ham yordam bermaydi', () => {
    const r = manbaniBahola(v({ iqtibos: 'Арматура А500С 12 мм 1 120' }), s, 'shop.example', { ok: true, url: 'https://shop.example/a', matn: uzun('Кирпич М100 900 сум') });
    expect(r.tekshirildi).toBe(false);
  });
  it('havolasiz/https emas manba hech qachon o‘tmaydi', () => {
    expect(manbaniBahola(v({ url: 'http://shop.example/a', iqtibos: 'Арматура А500С 12 мм 1 120' }), s, 'shop.example', { ok: false, xato: 'x' }).tekshirildi).toBe(false);
    expect(manbaniBahola(v({ iqtibos: 'Арматура А500С 12 мм 1 120' }), s, '', { ok: false, xato: 'x' }).tekshirildi).toBe(false);
  });
  it('qadoq: tarkib sahifada yozilgan bo‘lsa мешок 50 кг → т', () => {
    const sm = { id: 'r1', nom: 'Портландцемент М400', birlik: 'т', kat: 'МАТ' };
    const d = { url: 'https://shop.example/c', nom: 'Цемент М400', narx: 56, birlik: 'мешок', nds: 'bilan' as const, sotuvchi: 'S', qadoq: { miqdor: 50, birlik: 'кг' } };
    expect(manbaniBahola(d, sm, 'shop.example', { ok: true, url: d.url, matn: uzun('Цемент М400, мешок 50 кг — 56 сум') })).toMatchObject({ tekshirildi: true, smetaNarx: 1000 });
    expect(manbaniBahola(d, sm, 'shop.example', { ok: true, url: d.url, matn: uzun('Цемент М400, мешок — 56 сум') }).sabab).toContain('qadoq');
  });
  it('qidiruv matni ikki tilda, hudud va kod bilan', () => {
    const m = internetQidiruvMatni({ nom: 'Портландцемент марки М400 ГОСТ 10178-85', birlik: 'т' }, 'Navoiy');
    expect(m).toContain('цена за тонну Navoiy, Узбекистан');
    expect(m).toContain('ГОСТ 10178-85');
    expect(m).toContain('sement');
    expect(m).toContain('М400');
  });
});

describe('kesh va narx baholash', () => {
  it('kesh kaliti: nom, birlik, hudud, oy (Toshkent vaqti)', () => {
    expect(keshKalit('Цемент М400', 'т.', 'Navoiy', new Date('2026-11-05T00:00:00Z'))).toBe('ЦЕМЕНТМ400|Т|NAVOIY|2026-11');
    expect(keshKalit('Цемент М400', 'т', null, new Date('2026-11-30T20:00:00Z'))).toBe('ЦЕМЕНТМ400|Т|UZ|2026-12');
  });
  it('taxminiy token: resurslar × birlik narx × ustama × kurs / token narxi', () => {
    expect(taxminiyToken(100, { usd_kurs: 10000, token_som: 100 })).toBe(Math.ceil(100 * 0.012 * 1.4 * 100));
    expect(taxminiyToken(0, null)).toBe(0);
    expect(taxminiyToken(5, null)).toBeNull();
  });
});

describe('ko‘rib chiqish → mavjud yozish yo‘li yuklari', () => {
  const [g1, g2, g3, g4] = narxsizNavbat([q(1, 'Цемент М400', 'т', null), q(2, 'Цемент М400', 'т', null), q(3, 'Песок', 'м3', null), q(4, 'Щебень', 'м3', null), q(5, 'Кирпич', 'шт', null)]);
  const lok = lokalTaklif(g2.nom === 'Песок' ? g2 : g1, [lt({ qator_id: 3, manba_birlik: 'м3', manba_qator_id: 77 })], BUGUN);
  const inet = internetTaklif(g1, { id: 'g0', narx: 1000, izoh: '', ishonch: 'yuqori', manbalar: [
    { url: 'https://shop.example/c', nom: '', narx: 1120, birlik: 'т', nds: 'bilan', sotuvchi: 'Shop', domen: 'shop.example', tekshirildi: true, sabab: null, smetaNarx: 1000, koef: 1, ishonch: 'yuqori' },
    { url: 'https://bad.example/c', nom: '', narx: 9, birlik: 'т', nds: 'siz', sotuvchi: 'Bad', domen: 'bad.example', tekshirildi: false, sabab: 'x', smetaNarx: 9, koef: 1 }] });
  const rows: KorikQatori[] = [
    { guruh: g1, taklif: inet, holat: 'kutilmoqda', tahrir: null },
    { guruh: g2, taklif: lok, holat: 'qabul', tahrir: null },
    { guruh: g3, taklif: null, holat: 'qabul', tahrir: 777 },
    { guruh: g4, taklif: inet && { ...inet, kalit: g4.kalit }, holat: 'rad', tahrir: null },
  ];
  it('faqat tekshirilgan internet manbasi taklifga kiradi', () => {
    expect(inet?.manbalar.map(m => m.url)).toEqual(['https://shop.example/c']);
  });
  it('«yuqori ishonchlilarni qabul qilish» faqat kutilayotgan yuqori qatorlarni qabul qiladi', () => {
    const r = yuqorilarniQabul(rows);
    expect(r.map(x => x.holat)).toEqual(['qabul', 'qabul', 'qabul', 'rad']);
  });
  it('narxlar → smeta_narxla_res_v3; internet/tahrir → reestr (havola, sana); mahalliy → dalil; rad yozilmaydi', () => {
    const y = qabulYuki(yuqorilarniQabul(rows), 'Navoiy', BUGUN);
    expect(y.narxlar).toEqual([{ nom: 'Цемент М400', birlik: 'т', narx: 1000 }, { nom: 'Песок', birlik: 'м3', narx: 1000 }, { nom: 'Щебень', birlik: 'м3', narx: 777 }]);
    expect(y.reestr.map(r => r.nom)).toEqual(['Цемент М400', 'Щебень']);
    expect(y.reestr[0].izoh).toContain('https://shop.example/c');
    expect(y.reestr[0].izoh).toContain('2026-11-05');
    expect(y.reestr.every(r => r.nds_holati === 'nds_siz')).toBe(true);
    expect(y.dalil).toEqual([{ qator_id: 3, manba_qator_id: 77, izoh: expect.stringContaining('Katalog') }]);
    expect(y.reestrKalitlar).toEqual([g1.kalit, g3.kalit]);
    expect(y.narxlar.some(n => n.nom === 'Кирпич')).toBe(false);
  });
});
