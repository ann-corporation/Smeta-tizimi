import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { faylOqishXatosi, importXatoMatni, oldindanKorinish } from './korinish';
import { IshVarogiTopilmadi, JamiKorinish, NatijaEkrani } from './Bosqichlar';
import { muammolarRoyxati } from './xulosa';

const daraxt = [{ type: 'rz', children: [
  { type: 'bl', kod: '', nom: 'ISH', children: [{ type: 'rs', summa: 1000 }, { type: 'mat', summa: 500.5 }, { type: 'ob' }] },
  { type: 'bl', kod: 'A-1', nom: 'ISH 2', children: [{ type: 'rs', summa: 0 }] },
] }];

describe('ko‘rib chiqish: oldindan jami', () => {
  it('summa bor resurslar yig‘iladi; summasizi 0 emas, noma’lum', () => {
    const k = oldindanKorinish(daraxt, null);
    expect(k.resursSumma).toBe(1500.5);
    expect(k.kodsizIsh).toBe(1);
    expect(k.podval).toBe('topilmadi');
    expect(k.qqsFoiz).toBe(12);
    expect(oldindanKorinish([{ type: 'rz', children: [{ type: 'rs' }] }], null).resursSumma).toBeNull();
    expect(oldindanKorinish([{ type: 'rz', children: [{ type: 'rs' }] }], null).resursQqsBilan).toBeNull();
  });

  it('fayl podvali: QQS foizi, fayl jami va to‘g‘ridan-to‘g‘ri xarajat bilan farq', () => {
    const k = oldindanKorinish(daraxt, {
      holat: 'topildi', koeffitsientlar: { 'НДС': 12, 'СТРАХОВАНИЕ': 0.32 },
      qatorlar: [{ kod: 'pryamye', summa: 1500, masshtab: 1 }, { kod: 'vsego', summa: 2, masshtab: 1000 }],
    });
    expect(k.qqsFaylda).toBe(true);
    expect(k.faylVsego).toBe(2000);
    expect(k.faylPryamye).toBe(1500);
    expect(k.farqPryamye).toBe(0.5);
    expect(k.podvalFoizSoni).toBe(2);
    expect(k.resursQqsBilan).toBeGreaterThan(k.resursSumma as number);
  });

  it('muammolar: narxsiz qatorlar tafsiloti, shifrsiz ish va podval yo‘qligi chiqadi', () => {
    const m = muammolarRoyxati({ lrvTanlanmagan: false, narxsiz: 2, resursJami: 5, vedomostChiqarildi: 0, tekisVaraqlar: [], tushunilmadiVaraq: 0,
      narxsizQatorlar: ['K1 · BETON — RES da yo‘q'], kodsizIsh: 3, podvalYoq: true });
    expect(m.map((x) => x.kalit)).toEqual(['narxsiz', 'kodsiz', 'podval-yoq']);
    expect(m[0].tafsilot?.join(' ')).toContain('BETON');
  });

  it('JamiKorinish: noma’lum summa «—» ko‘rsatadi, 0 emas', () => {
    render(<JamiKorinish k={oldindanKorinish([{ type: 'rz', children: [{ type: 'rs' }] }], null)} />);
    const blok = screen.getByTestId('yuklash-jami');
    expect(blok.textContent).toContain('—');
    expect(blok.textContent).not.toMatch(/\b0,00\b/);
    expect(blok.textContent).toContain('topilmadi');
  });
});

describe('xato matnlari texnik so‘zsiz', () => {
  it('server kodlari oddiy o‘zbekchaga o‘giriladi', () => {
    for (const kod of ['NETWORK', 'BAD_RESPONSE', 'AUTH_REQUIRED', 'TOO_MANY_ROWS', 'MISSING_ROWS', 'BAD_CHUNK_SIZE', 'MISSING_CONTEXT']) {
      const s = importXatoMatni(kod, undefined, '3-qism yuborilmadi');
      expect(s).not.toMatch(/[A-Z]{3,}_[A-Z]{2,}/);
      expect(s.startsWith('3-qism yuborilmadi: ')).toBe(true);
    }
    expect(importXatoMatni('NETWORK')).toContain('Internet');
    expect(importXatoMatni('BOSHQA_KOD', 'RPC xatosi: DB_FAIL')).not.toContain('DB_FAIL');
    expect(importXatoMatni('X', 'Obyekt topilmadi')).toBe('Obyekt topilmadi');
  });

  it('fayl o‘qilmasa sabab aytiladi: katta fayl, buzuq zip, parol', () => {
    expect(faylOqishXatosi(new Error('Fayl 50 MB dan katta.'), 50)).toContain('50 MB');
    expect(faylOqishXatosi(new Error('XLSX_NOT_A_ZIP'), 50)).toContain('Excel');
    expect(faylOqishXatosi(new Error('File is password protected'), 50)).toContain('parol');
    expect(faylOqishXatosi(new Error('boshqa'), 50)).toContain('Excelda ochib');
  });
});

describe('ish varag‘i topilmasa — foydalanuvchi qotib qolmaydi', () => {
  it('sabab, varaqlar ro‘yxati va «Boshqa fayl tanlash» tugmasi chiqadi', () => {
    const yana = vi.fn();
    render(<IshVarogiTopilmadi varaqlar={['TITUL', 'SVOD']} onYana={yana} />);
    expect(screen.getByRole('alert').textContent).toContain('TITUL, SVOD');
    fireEvent.click(screen.getByText('Boshqa fayl tanlash'));
    expect(yana).toHaveBeenCalled();
  });
});

describe('natija ekrani: keyingi qadam', () => {
  it('narxsiz qolsa — narxlash qadam sifatida aytiladi va tugma chaqiriladi', () => {
    const narx = vi.fn();
    render(<NatijaEkrani qatorSoni={1318} sanoq={{ bolim: 2, ish: 10, resurs: 40 }} muammolar={[]} narxsizSoni={7} onNarxlash={narx} />);
    expect(screen.getByTestId('keyingi-qadam').textContent).toContain('narx');
    fireEvent.click(screen.getByText('Narxlashga o‘tish'));
    expect(narx).toHaveBeenCalled();
  });
  it('narxsiz yo‘q bo‘lsa — narxlash tugmasi chiqmaydi', () => {
    render(<NatijaEkrani qatorSoni={5} sanoq={null} muammolar={[]} narxsizSoni={0} onNarxlash={() => {}} />);
    expect(screen.queryByText('Narxlashga o‘tish')).toBeNull();
  });
});