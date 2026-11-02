import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * QOIDA (egasi: «bir joyda tuzatish — hamma joyda tuzatish»): ustama kaskadi arifmetikasi FAQAT `lib/hisob-yadro` da.
 * Boshqa fayl foiz kalitlari (ТРАНСПОРТ_МАТЕРИАЛ … СТРАХОВАНИЕ) bilan `/100` hisob yoki kaskad qadamlari
 * (tr_mat, skl_mat, prochie …) ustida arifmetika qilsa — test yiqiladi. Excel FORMULA matnini quruvchi va smeta
 * faylidan foizni O'QIYDIGAN (hisoblamaydigan) fayllar ro'yxatda, sababi bilan.
 */
const ILDIZ = join(process.cwd(), 'src'); // vitest frontend/ dan ishga tushadi
const RUXSAT: Record<string, string> = {
  'lib/nakrutka-podval.ts': 'Excel podvali: Kf FORMULA matni (foiz kataklariga havola), qiymatlar yadrodan',
  'lib/smeta-anatomiya/nakrutka.ts': 'smeta fayli podvalidan foizlarni O\'QIYDI va hujjat summalari bilan solishtiradi (kalkulyator emas)',
};
const FOIZ = '(ТРАНСПОРТ_МАТЕРИАЛ|СКЛАДСКИЕ_МАТЕРИАЛ|ПРОЧИЕ_ПОДРЯДЧИК|СКЛАДСКИЕ_МК|ТРАНСПОРТ_КАБЕЛЬ|ТРАНСПОРТ_ОБОРУД|ЗАГОТ_СКЛАД_ОБОРУД|СТРАХОВАНИЕ|РИСК|НДС)';
const QADAM = '(tr_mat|skl_mat|skl_mk|tr_kab|prochie|tr_ob|zag_ob|strax|itogo1|itogo2|itogo3)';
const QOLIPLAR: RegExp[] = [
  new RegExp(`${FOIZ}[^\\n]*\\/\\s*100`),               // foiz kaliti … / 100
  new RegExp(`\\b${QADAM}\\b\\s*[-+*/]\\s*[\\w(]`),      // qadam ± …
  new RegExp(`[-+*/]\\s*\\w+\\.${QADAM}\\b`),            // … ± x.qadam
  /\bpc\(\s*nk\s*,/,                                     // eski kaskad yordamchisi
  /\bnds\w*\s*\/\s*100\b/i,                               // QQS arifmetikasi (yadro qqsSumma/qqsBilan ishlatilsin)
  /\(1\s*\+\s*\w*(nds|qqs)\w*\s*\/\s*100\)/i,          // ×(1 + QQS/100)
];

function fayllar(d: string): string[] {
  return readdirSync(d).flatMap((n: string) => {
    const p = join(d, n);
    if (statSync(p).isDirectory()) return fayllar(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

const izohmi = (l: string) => /^\s*(\*|\/\/|\/\*)/.test(l);

describe('hisob yadrosi qorovuli — kaskad faqat lib/hisob-yadro da', () => {
  it('boshqa fayllarda kaskad arifmetikasi yo‘q (ruxsat ro‘yxatidan tashqari)', () => {
    const buzilish: string[] = [];
    for (const p of fayllar(ILDIZ)) {
      const rel = relative(ILDIZ, p).replace(/\\/g, '/');
      if (rel.startsWith('lib/hisob-yadro/') || RUXSAT[rel]) continue;
      readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
        if (izohmi(l)) return;
        if (QOLIPLAR.some((r) => r.test(l))) buzilish.push(`${rel}:${i + 1}: ${l.trim().slice(0, 140)}`);
      });
    }
    expect(buzilish).toEqual([]);
  });

  it('ruxsat ro‘yxatidagi fayllar mavjud (eskirgan yozuv qolmasin)', () => {
    const bor = new Set(fayllar(ILDIZ).map((p) => relative(ILDIZ, p).replace(/\\/g, '/')));
    for (const f of Object.keys(RUXSAT)) expect(bor.has(f), f).toBe(true);
  });

  it('qolip haqiqatan ushlaydi (o‘z-o‘zini tekshirish)', () => {
    const misol = ['const tr = (s.МАТ + s.КАБ) * Number(nk.ТРАНСПОРТ_МАТЕРИАЛ) / 100;', 'r.itogo1 = y(r.pryamye + r.tr_mat);', 'const p = itogo1 * k;', 'const q = summa * ndsFoiz / 100;', 'const v = x * (1 + nds / 100);', 'const r = i4 * Number(nk.НДС) / 100;'];
    for (const m of misol) expect(QOLIPLAR.some((r) => r.test(m)), m).toBe(true);
  });
});
