import { describe, expect, it } from 'vitest';
import { bankKalitlari, bankMosla, bankParse, bankYuk, csvGrid } from './bank';
import { kontragentGuruhla, ndsJami, osvMuvozanat, saldoTomoni, sverkaQatorlari } from './hisob';
import { aktSverkaHujjat, osvHujjat } from './eksport';
import type { BuxShartnoma } from '../../api/t2-bux-hisob';

// Faqat sintetik ma'lumot.
const SH: BuxShartnoma[] = [
  { id: 1, raqam: 'T-1', nom: null, asosiy: true, kontragent_id: 10, kontragent: 'TEST BUYURTMACHI', inn: '111111111' },
  { id: 2, raqam: 'T-12', nom: null, asosiy: false, kontragent_id: 20, kontragent: 'TEST POSTAVSHIK', inn: '222222222' },
  { id: 3, raqam: 'T-2', nom: null, asosiy: false, kontragent_id: 20, kontragent: 'TEST POSTAVSHIK', inn: '222222222' },
];

describe('hisob', () => {
  it('saldo tomoni: minus — kredit, nol — tomonsiz, null — noma‘lum', () => {
    expect(saldoTomoni(100.005)).toEqual({ dt: 100.01, kt: null });
    expect(saldoTomoni(-5)).toEqual({ dt: null, kt: 5 });
    expect(saldoTomoni(0)).toEqual({ dt: null, kt: null });
    expect(saldoTomoni(null)).toEqual({ dt: null, kt: null });
  });
  it('OSV muvozanati', () => {
    expect(osvMuvozanat({ jami_dt: 10.1, jami_kt: 10.1 }).muvozanatda).toBe(true);
    expect(osvMuvozanat({ jami_dt: 10, jami_kt: 9 }).farq).toBe(1);
  });
  it('kontragent guruhlash: debitor/kreditor alohida, netlanmaydi', () => {
    const q = (kod: string, yopilish: number) => ({ kontragent_id: 1, kontragent: 'A', inn: null, kod, nom_uz: null, nom_ru: null, ochilish: 0, dt: 0, kt: 0, yopilish });
    const g = kontragentGuruhla([q('4010', 300), q('6010', -100)]);
    expect(g).toHaveLength(1);
    expect(g[0].debitor).toBe(300);
    expect(g[0].kreditor).toBe(100);
    expect(kontragentGuruhla([q('4010', 1)], 'zzz')).toHaveLength(0);
  });
  it('sverka: yurma saldo va jami', () => {
    const h = (dt: number, kt: number) => ({ sana: '2026-01-01', hisob: '4010', manba_tur: 'forma3', manba_id: 1, hujjat: 'F', shartnoma_id: 1, shartnoma_raqam: 'T', dt, kt, izoh: null });
    const s = sverkaQatorlari(50, [h(100, 0), h(0, 30), h(0, -10)]);
    expect(s.qatorlar.map((x) => x.saldo)).toEqual([150, 120, 130]);
    expect(s.yopilish).toBe(130);
    expect(s.kt).toBe(20);
  });
  it('QQS jami', () => {
    expect(ndsJami([{ sana: 'a', hujjat: null, manba_tur: 'forma3', manba_id: 1, kontragent: null, inn: null, shartnoma_raqam: null, asos: 1000, nds: 120, jami: 1120 }])).toEqual({ asos: 1000, nds: 120, jami: 1120 });
  });
});

describe('bank ko‘chirmasi', () => {
  const csv = 'Дата;Номер;ИНН;Контрагент;Дебет;Кредит;Назначение платежа\n01.03.2026;55;111111111;TEST BUYURTMACHI;;250,50;Оплата по договору T-1\n02.03.2026;56;;;100;;Оплата по договору T-12 за материал\n03.03.2026;57;;;;;\n';
  it('CSV: ustunlar, yo‘nalish (Kredit = kirim), summa', () => {
    const p = bankParse(csvGrid(csv));
    expect(p.topilmadi).toEqual([]);
    expect(p.qatorlar).toHaveLength(2);
    expect(p.qatorlar[0]).toMatchObject({ sana: '2026-03-01', summa: 250.5, yonalish: 'kirim', hujjat_raqam: '55', inn: '111111111' });
    expect(p.qatorlar[1]).toMatchObject({ summa: 100, yonalish: 'chiqim' });
    expect(bankParse(csvGrid(csv), { kreditKirim: false }).qatorlar[0].yonalish).toBe('chiqim');
  });
  it('bitta Summa ustuni: minus — chiqim', () => {
    const p = bankParse(csvGrid('Sana,Summa,Maqsad\n2026-03-01,-70,test\n2026-03-02,30,test2'));
    expect(p.qatorlar.map((x) => x.yonalish)).toEqual(['chiqim', 'kirim']);
  });
  it('sarlavha yo‘q — topilmadi', () => {
    expect(bankParse(csvGrid('a;b\n1;2')).topilmadi.length).toBeGreaterThan(0);
  });
  it('moslash: eng uzun raqam (T-12 va T-1 adashmaydi), INN, bir nechta — tanlanmaydi', () => {
    expect(bankMosla({ izoh: 'Оплата по договору T-12', inn: null, kontragent: null, yonalish: 'chiqim' }, SH)).toEqual({ shartnoma_id: 2, sabab: 'raqam' });
    expect(bankMosla({ izoh: 'x', inn: '111111111', kontragent: null, yonalish: 'kirim' }, SH)).toEqual({ shartnoma_id: 1, sabab: 'inn' });
    expect(bankMosla({ izoh: 'x', inn: '222222222', kontragent: null, yonalish: 'chiqim' }, SH).sabab).toBe('bir_nechta');
    expect(bankMosla({ izoh: 'x', inn: null, kontragent: null, yonalish: 'kirim' }, SH).sabab).toBe('topilmadi');
  });
  it('kalitlar barqaror, bir xil qatorlar ajratiladi; yuk faqat moslangan', () => {
    const p = bankParse(csvGrid(csv)).qatorlar;
    const k1 = bankKalitlari([p[0], p[0]]);
    expect(k1[0]).not.toBe(k1[1]);
    expect(bankKalitlari([p[0]])[0]).toBe(k1[0]);
    expect(bankYuk(p, [1, null])).toHaveLength(1);
  });
});

describe('akt-sverka Excel', () => {
  it('xlsx baytlari yaratiladi, fayl nomi ruscha', () => {
    const h = { sana: '2026-01-31', hisob: '4010', manba_tur: 'forma3', manba_id: 1, hujjat: 'F3-1', shartnoma_id: 1, shartnoma_raqam: 'T-1', dt: 1120, kt: 0, izoh: null };
    const r = aktSverkaHujjat({ kompaniya: 'TEST', kontragent: 'TEST BUYURTMACHI', dan: '2026-01-01', gacha: '2026-01-31', ochilish: 0, hujjatlar: [h] });
    expect(r.bytes[0]).toBe(0x50); // ZIP (PK)
    expect(r.faylNomi).toContain('АКТ_СВЕРКИ');
    expect(r.faylNomi.endsWith('.xlsx')).toBe(true);
  });
});

describe('ОСВ Excel', () => {
  it('oborot-saldo Excel: xlsx baytlari va fayl nomi', () => {
    const r = osvHujjat({ kompaniya: 'TEST', osv: { ok: true, dan: '2026-01-01', gacha: '2026-01-31', jami_dt: 1120, jami_kt: 1120, jami_ochilish: 0,
      qatorlar: [{ kod: '4010', nom_uz: 'x', nom_ru: 'x', tur: 'aktiv', ochilish: 0, dt: 1120, kt: 0, yopilish: 1120 }, { kod: '9010', nom_uz: 'y', nom_ru: 'y', tur: 'daromad', ochilish: 0, dt: 0, kt: 1120, yopilish: -1120 }] } });
    expect(r.bytes[0]).toBe(0x50);
    expect(r.faylNomi).toContain('ОСВ');
    expect(r.faylNomi.endsWith('.xlsx')).toBe(true);
  });
});
