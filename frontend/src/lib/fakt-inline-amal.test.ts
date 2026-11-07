import { describe, expect, it } from 'vitest';
import { bolimTop, bosForma, inlineTekshir, inlineXato, inlineYuklama, ozgarishBor, zamenaJuftlari, zamenaYoqSabab, type InlineKontekst, type InlineQator } from './fakt-inline-amal';
import type { JurnalIsh, JurnalQator } from './fakt-jurnal';

// Sintetik ma'lumot (repo PUBLIC).
const ish: InlineQator = { id: 2, tur: 'bl', kod: 'E1', nom: 'Ish A', birlik: 'м3', kat: null, norma: null, smeta: 100, otaId: 1, otaVersiya: 3, qoshimcha: false, zamena: false };
const res: InlineQator = { ...ish, id: 3, tur: 'rs', kod: null, nom: 'Resurs A', birlik: 'т', kat: 'МАТ', norma: 0.5, otaId: 2, otaVersiya: 7 };
const k: InlineKontekst = { otaIshHajm: 100, bolim: { id: 1, nom: 'Bo‘lim A', versiya: 3 }, zamenaYoq: null };
const asos = { kompaniyaId: 1, obyektId: 8, sana: '2026-01-01', operationId: 'op-1' };

describe('fakt-inline-amal', () => {
  it('resurs zamenasi: asl norma oldindan, norma qo‘llansa hajm yuborilmaydi', () => {
    const f = { ...bosForma(res, 'zamena'), nom: 'Resurs B', izoh: 's' };
    expect(f.norma).toBe('0.5');
    expect(inlineTekshir('zamena', res, f, k)).toEqual([]);
    expect(inlineYuklama({ ...asos, tur: 'zamena', q: res, f, k })).toMatchObject({ command: 'resurs_zamena', almashtirilayotganQatorId: 3, ish: null,
      resurslar: [{ kat: 'МАТ', nom: 'Resurs B', birlik: 'т', norma: 0.5, hajm: null, narx: null, narx_manba: 'qolda' }] });
  });

  it('alohida resurs (ota ish hajmi noma‘lum) — aniq hajm majburiy', () => {
    const f = { ...bosForma(res, 'zamena'), nom: 'Resurs B', izoh: 's' };
    const k2 = { ...k, otaIshHajm: null };
    expect(inlineTekshir('zamena', res, f, k2).join(' ')).toMatch(/Hajmni yozing/);
    expect(inlineYuklama({ ...asos, tur: 'zamena', q: res, f: { ...f, hajm: '4' }, k: k2 }).resurslar[0]).toMatchObject({ norma: null, hajm: 4 });
  });

  it('qo‘shimcha material: narx 0 — 0 (NULL emas), bo‘sh — NULL; joy «tashqari» — ota yo‘q', () => {
    const f = { ...bosForma(ish, 'qoshimcha_material'), nom: 'Material', birlik: 'т', hajm: '2', izoh: 's' };
    expect(inlineYuklama({ ...asos, tur: 'qoshimcha_material', q: ish, f: { ...f, narx: '0' }, k }).resurslar[0].narx).toBe(0);
    const y = inlineYuklama({ ...asos, tur: 'qoshimcha_material', q: ish, f: { ...f, joy: 'tashqari' }, k });
    expect(y).toMatchObject({ command: 'additional', otaQatorId: null, kutilganVersiya: null, ish: { nom: 'Material', birlik: 'т', hajm: 2 } });
    expect(y.resurslar).toEqual([{ kat: 'МАТ', kod: null, nom: 'Material', birlik: 'т', norma: 1, hajm: null, narx: null, narx_manba: 'qolda' }]);
  });

  it('qo‘shimcha material МАШ/ЧЕЛ qatoridan ochilsa ham МАТ bo‘ladi; zamena kategoriyani saqlaydi', () => {
    for (const kat of ['МАШ', 'ЧЕЛ'] as const) {
      const q = { ...res, kat };
      expect(bosForma(q, 'qoshimcha_material').kat).toBe('МАТ');
      const f = { ...bosForma(q, 'qoshimcha_material'), nom: 'Material', birlik: 'т', hajm: '1', izoh: 's' };
      expect(inlineYuklama({ ...asos, tur: 'qoshimcha_material', q, f, k }).resurslar[0].kat).toBe('МАТ');
      expect(bosForma(q, 'zamena').kat).toBe(kat);
    }
  });

  it('tekshiruv: manfiy narx, sabab yo‘q, zamena taqiqlangan', () => {
    const f = { ...bosForma(ish, 'qoshimcha_ish'), nom: 'X', birlik: 'м2', hajm: '1', narx: '-5' };
    expect(inlineTekshir('qoshimcha_ish', ish, f, k).join(' | ')).toMatch(/Narx noto‘g‘ri.*Sababini yozing/);
    expect(inlineTekshir('zamena', ish, { ...f, narx: '', izoh: 's' }, { ...k, zamenaYoq: 'TAQIQ' })).toEqual(['TAQIQ']);
  });

  it('zamena taqiqi sabablari: qo‘shilgan qator, joyi yo‘q, mehnat, chiqarilgan', () => {
    const o = { mehnat: false, chiqarilgan: false, mehnatMatn: 'MEHNAT' };
    expect(zamenaYoqSabab(ish, o)).toBeNull();
    expect(zamenaYoqSabab({ ...ish, qoshimcha: true }, o)).toMatch(/o‘zingiz qo‘shgansiz/);
    expect(zamenaYoqSabab({ ...ish, otaId: null }, o)).toMatch(/joyi aniqlanmadi/);
    expect(zamenaYoqSabab(res, { ...o, mehnat: true })).toBe('MEHNAT');
    expect(zamenaYoqSabab(res, { ...o, chiqarilgan: true })).toMatch(/ishdan chiqarilgan/);
    expect(zamenaYoqSabab(ish, { ...o, mehnat: true })).toBeNull(); // ish zamenasiga mehnat qoidasi tegmaydi
  });

  it('server kodlari → oddiy matn; javob yo‘q — qayta bosish xavfsiz', () => {
    expect(inlineXato(null)).toMatch(/Javob olinmadi/);
    expect(inlineXato({ ok: false, code: 'SABAB_REQUIRED' })).toMatch(/Sababini yozing/);
    expect(inlineXato({ ok: false, code: 'PARENT_REQUIRED' })).toMatch(/Bo‘lim yoki obyekt topilmadi/);
    expect(inlineXato({ ok: false, error: 'FAKT_NOT_WRITTEN: X' })).toMatch(/fakt qabul qilinmadi/);
    expect(inlineXato({ ok: false, code: 'STALE_VERSION' })).toMatch(/Smeta shu orada o‘zgargan/); // mavjud abcXato
  });

  it('bo‘lim ota zanjiri bo‘yicha; juftlar va filtr', () => {
    const m = new Map([[1, { id: 1, tur: 'rz', ota_id: null, nom: 'A', versiya: 3 }], [2, { id: 2, tur: 'bl', ota_id: 1, nom: 'I', versiya: 1 }]]);
    expect(bolimTop(2, (id) => m.get(id))).toEqual({ id: 1, nom: 'A', versiya: 3 });
    expect(bolimTop(null, (id) => m.get(id))).toBeNull();
    const j = zamenaJuftlari({ almashtiradi: new Map([[41, 2], [40, 2]]), almashtirilgan: new Map() });
    expect(j.zamenalar.get(2)).toEqual([40, 41]);
    expect(j.asl.get(40)).toBe(2);
    const bo = (o: Partial<JurnalQator>) => ({ zamena: false, qoshimcha: false, almashtirilgan: null, id: 9, ...o }) as JurnalQator;
    const i = (o: Partial<JurnalQator>, r: JurnalQator[] = []) => ({ ...bo(o), resurslar: r, avtomatik: [] }) as JurnalIsh;
    expect(ozgarishBor(i({}))).toBe(false);
    expect(ozgarishBor(i({}, [bo({ qoshimcha: true })]))).toBe(true);
    expect(ozgarishBor(i({ id: 2 }), j.zamenalar)).toBe(true);
  });
});
