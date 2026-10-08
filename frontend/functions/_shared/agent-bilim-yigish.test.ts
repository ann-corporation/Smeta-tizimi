import { describe, expect, it } from 'vitest';
import { bilimKodi, bilimTakliflariniAjrat } from './agent-bilim-yigish';
import { bilimBolimi, bilimTanla, dbBilimYozuvlari, tizimYordamJavobi } from './agent-bilim';

describe('bilim yig‘ish — model javobini tozalash', () => {
  it('kod lotinga o‘giriladi va yaroqli shaklga keltiriladi', () => {
    expect(bilimKodi('ШНК 3.01.01-22 АОСР')).toBe('shnk_3_01_01_22_aosr');
    expect(bilimKodi('  !!  ')).toBe('');
    expect(bilimKodi('x'.repeat(100)).length).toBe(60);
  });
  it('yaroqli taklif qabul qilinadi, qisqa/kalitsiz/takroriy tashlanadi, ≤3', () => {
    const yaxshi = (k: string) => ({ kod: k, sarlavha: 'Talab ' + k, matn: 'Bu manbada aniq yozilgan talab: ' + k + ' band 4.2.', kalit: ['Talab', 'талаб', 'x'] });
    const xom = JSON.stringify({ takliflar: [yaxshi('abc_1'), { ...yaxshi('abc_2'), matn: 'qisqa' }, { ...yaxshi('abc_3'), kalit: [] }, yaxshi('abc_1'), yaxshi('abc_4'), yaxshi('abc_5'), yaxshi('abc_6')] });
    const r = bilimTakliflariniAjrat(xom);
    expect(r.map((x) => x.kod)).toEqual(['abc_1', 'abc_4', 'abc_5']);
    expect(r[0].kalit).toEqual(['talab', 'талаб']);   // 1 belgili kalit tashlandi, kichik harf
  });
  it('buzuq JSON, kod-blok va noto‘g‘ri shakl xavfsiz bo‘sh qaytadi', () => {
    expect(bilimTakliflariniAjrat('bu json emas')).toEqual([]);
    expect(bilimTakliflariniAjrat('{"takliflar": "yoq"}')).toEqual([]);
    expect(bilimTakliflariniAjrat('')).toEqual([]);
    const blok = '```json\n' + JSON.stringify({ takliflar: [{ kod: 'k_ok', sarlavha: 'Sarlavha', matn: 'Yetarlicha uzun matn bo‘lishi kerak', kalit: ['atama'] }] }) + '\n```';
    expect(bilimTakliflariniAjrat(blok)).toHaveLength(1);
  });
});

describe('bazadagi bilim qidiruvda', () => {
  const db = dbBilimYozuvlari([
    { kod: 'shnq_yangi', doira: 'global', sarlavha: 'ShNQ yangi talab', matn: 'Yangi tahrirda dalolatnoma talabi o‘zgargan.', kalit: ['shnq yangi', 'dalolatnoma'], manba_url: 'https://norma.uz/x' },
    { kod: 'bizniki', doira: 'company', sarlavha: 'Bizning tartib', matn: 'Avval PTO keyin direktor tasdiqlaydi.', kalit: ['tasdiq tartibi'] },
    { kod: 'buzuq', sarlavha: 5, matn: 'x', kalit: 'yoq' },
  ]);
  it('faqat yaroqli yozuvlar o‘tadi; manba havolasi va kompaniya belgisi qo‘shiladi', () => {
    expect(db.map((x) => x.id)).toEqual(['db:shnq_yangi', 'db:bizniki']);
    expect(db[0].matn).toContain('(manba: https://norma.uz/x)');
    expect(db[1].sarlavha).toContain('kompaniya bilimi');
    expect(dbBilimYozuvlari(null)).toEqual([]);
  });
  it('savolga mos DB bilimi topiladi va bir xil ballda lug‘atdan ustun', () => {
    expect(bilimTanla('ShNQ yangi talab qanday?', null, 3000, 5, db)[0].id).toBe('db:shnq_yangi');
    expect(bilimBolimi('bizning tasdiq tartibi qanday', null, 3200, db)).toContain('Avval PTO keyin direktor');
    expect(bilimBolimi('dalolatnoma talabi', null, 3200)).not.toContain('norma.uz');   // DB'siz qo‘shilmaydi
  });
  it('kompaniyasiz tizim yordamchisi ham global DB bilimidan javob beradi', () => {
    const j = tizimYordamJavobi('yangi shnq dalolatnoma talabi', null, db.slice(0, 1));
    expect(j.topildi).toBe(true); expect(j.javob).toContain('Yangi tahrirda');
  });
});
