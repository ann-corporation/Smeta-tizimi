import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import { f2Hujjat } from './f2-hujjat';
import { bosKiritma, f2Qatorlar, f2Qur, type F2Holat } from './f2-tayyor';
import { hujjatTekshir } from './hujjat-yozuvchi';
import { kodlarMatni, kodSolishtirma, resursGuruhKaliti, shifrKorinish } from './f2-resurs-guruh';
import { lrvBarmoqIzi, lrvBarmoqIziEski, lrvIziMos } from './lrv-qayta-import';

const q = (o: Partial<T2Qator> & { id: number; tur: string; norma?: number | null }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: `q${o.id}`, birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

const CHEL = 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ';
const MASH_AVTO = 'АВТОМОБИЛИ БОРТОВЫЕ ГРУЗОПОДЪЕМНОСТЬЮ ДО 5 Т';
// Ikki ish: bir xil resurslar boshqa kod/birlik yozuvida; machinist qatori narxsiz (mashina narxi ichida); ЦЕНА shifrli material.
const rows = [
  q({ id: 1, tur: 'rz', nom: 'Участок 1' }),
  q({ id: 2, tur: 'bl', ota_id: 1, kod: 'Е1-1', nom: 'Ish A', hajm: 10 }),
  q({ id: 3, tur: 'rs', ota_id: 2, kod: '000001', kat: 'ЧЕЛ', nom: CHEL, birlik: 'ЧЕЛ-Ч', norma: 2, narx: 29421 }),
  q({ id: 4, tur: 'rs', ota_id: 2, kod: '3', kat: 'МАШ', nom: 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', birlik: 'ЧЕЛ-Ч', norma: 1, narx: null }),
  q({ id: 5, tur: 'rs', ota_id: 2, kod: '002509', kat: 'МАШ', nom: MASH_AVTO, birlik: 'МАШ.-Ч', norma: 0.5, narx: 107615 }),
  q({ id: 6, tur: 'bl', ota_id: 1, kod: 'Е1-2', nom: 'Ish B', hajm: 4 }),
  q({ id: 7, tur: 'rs', ota_id: 6, kod: '1', kat: 'ЧЕЛ', nom: CHEL, birlik: 'ЧЕЛ.-Ч', norma: 3, narx: 29421 }),
  q({ id: 8, tur: 'rs', ota_id: 6, kod: '3', kat: 'МАШ', nom: 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', birlik: 'ЧЕЛ.-Ч', norma: 1, narx: null }),
  q({ id: 9, tur: 'rs', ota_id: 6, kod: '2499', kat: 'МАШ', nom: MASH_AVTO, birlik: 'МАШ-Ч', norma: 0.5, narx: 100000 }),
  q({ id: 10, tur: 'mat', ota_id: 1, kod: 'ЦЕНА', kat: 'МАТ', nom: 'Цемент', birlik: 'т', narx: 800000 }),
];
const holat: F2Holat[] = [
  { qator_id: 2, f2_mumkin_hajm: 10 }, { qator_id: 3, f2_mumkin_hajm: 20 }, { qator_id: 4, f2_mumkin_hajm: 10 }, { qator_id: 5, f2_mumkin_hajm: 5 },
  { qator_id: 6, f2_mumkin_hajm: 4 }, { qator_id: 7, f2_mumkin_hajm: 12 }, { qator_id: 8, f2_mumkin_hajm: 4 }, { qator_id: 9, f2_mumkin_hajm: 2 },
  { qator_id: 10, f2_mumkin_hajm: 3 },
];
const hujjat = () => {
  const b = f2Qur(rows, holat);
  const k = bosKiritma(); k.hajm[2] = '10'; k.hajm[6] = '4'; k.hajm[10] = '3';
  const qs = f2Qatorlar(b, k);
  expect(qs.every((x) => !x.xato)).toBe(true);
  const r = f2Hujjat(b, qs, { obyektNom: 'Yo‘l 2,5 km', davr: '2026-10-01', raqam: '1', ndsFoiz: 12 });
  return { r, t: hujjatTekshir(r.bytes) };
};

describe('shifr «ЦЕНА» va resurs guruhlash yordamchilari', () => {
  it('ЦЕНА shifri bo‘sh; boshqa shifrlar o‘zgarmaydi', () => {
    expect(shifrKorinish('ЦЕНА')).toBe(''); expect(shifrKorinish(' цена ')).toBe('');
    expect(shifrKorinish('Е1202-001-01')).toBe('Е1202-001-01'); expect(shifrKorinish(null)).toBe('');
  });
  it('guruh kaliti: kod/birlik yozilishi farqi bir xil resurs', () => {
    expect(resursGuruhKaliti('ЧЕЛ', CHEL, 'ЧЕЛ-Ч')).toBe(resursGuruhKaliti('ЧЕЛ', ` ${CHEL.toLowerCase()} `, 'ЧЕЛ.-Ч'));
    expect(resursGuruhKaliti('МАШ', MASH_AVTO, 'МАШ.-Ч')).toBe(resursGuruhKaliti('МАШ', MASH_AVTO, 'МАШ-Ч'));
    expect(resursGuruhKaliti('МАТ', CHEL, 'ЧЕЛ-Ч')).not.toBe(resursGuruhKaliti('ЧЕЛ', CHEL, 'ЧЕЛ-Ч'));
  });
  it('kodlar: bosh nollar solishtirishda hisobga olinmaydi; turli kodlar «a / b»', () => {
    expect(kodSolishtirma('000001')).toBe('1');
    expect(kodlarMatni(['000001', '1'])).toBe('000001');
    expect(kodlarMatni(['002509', '2499'])).toBe('002509 / 2499');
    expect(kodlarMatni(['ЦЕНА', null, ''])).toBe('');
  });
  it('КАЛИТ izi: ЦЕНА bo‘sh katak bilan mos; eski iz (xom kod) ham tanilishi kerak', () => {
    expect(lrvBarmoqIzi('ЦЕНА', 'Цемент', 'т')).toBe(lrvBarmoqIzi('', 'Цемент', 'т'));
    expect(lrvIziMos(lrvBarmoqIziEski('ЦЕНА', 'Цемент', 'т'), 'ЦЕНА', 'Цемент', 'т')).toBe(true);
    expect(lrvIziMos(lrvBarmoqIzi('A1', 'Цемент', 'т'), 'A2', 'Цемент', 'т')).toBe(false);
  });
});

describe('F2 Excel: Ведомость ресурсов', () => {
  it('ЦЕНА shifr katagida chiqmaydi (F-2 va vedomost)', () => {
    const { t } = hujjat();
    for (const v of t.varaqlar) expect(v.kataklar.filter((k) => /^\s*ЦЕНА\s*$/i.test(k.matn ?? '')).map((k) => k.ref)).toEqual([]);
  });

  it('takror resurslar bitta qatorga, kodlari «002509 / 2499» (narxlari farqli - alohida qator + belgi)', () => {
    const { t } = hujjat();
    const ved = t.varaqlar.find((v) => v.nom === 'Ведомость ресурсов')!;
    const qator = (nom: string) => ved.kataklar.filter((k) => k.ref.startsWith('C') && (k.matn ?? '').startsWith(nom));
    // Ishchi: ikki kod/birlik yozuvi, bir xil narx -> bitta qator
    expect(qator(CHEL)).toHaveLength(1);
    // Machinist: ikki qator emas, bitta
    expect(qator('ЗАТРАТЫ ТРУДА МАШИНИСТОВ')).toHaveLength(1);
    // Avtomobil: narx 107615 va 100000 - ikki qator, «цена отличается» belgisi bilan
    const avto = qator(MASH_AVTO);
    expect(avto).toHaveLength(2);
    expect(avto.every((k) => (k.matn ?? '').includes('[ЦЕНА ОТЛИЧАЕТСЯ]'))).toBe(true);
    const kodlar = ved.kataklar.filter((k) => k.ref.startsWith('B')).map((k) => k.matn);
    expect(kodlar).toContain('000001');
    expect(kodlar).not.toContain('1');
  });

  it('barcha formulalar mavjud katakka havola qiladi, xato qiymat yo‘q, machinist (narxsiz) qatori #VALUE!/#REF! bermaydi', () => {
    const { t } = hujjat();
    const varaq = new Map(t.varaqlar.map((v) => [v.nom, new Map(v.kataklar.map((k) => [k.ref, k]))]));
    const bosh: string[] = [];
    for (const v of t.varaqlar) {
      for (const k of v.kataklar) {
        expect(k.v ?? '', `${v.nom}!${k.ref}`).not.toMatch(/^#/);
        expect(k.matn ?? '', `${v.nom}!${k.ref}`).not.toMatch(/#(REF|VALUE|DIV|NAME|N\/A)/);
        if (!k.f) continue;
        const f = k.f;
        // Qo'shtirnoq ichidagi matnlarni olib tashlab, havolalarni yig'amiz: 'Varaq'!A1 yoki A1 (A1:B2 oraliqlari alohida).
        const toza = f.replace(/"[^"]*"/g, '');
        const oraliqsiz = toza.replace(/(?:'[^']+'!)?\$?[A-Z]{1,2}\$?\d+:\$?[A-Z]{1,2}\$?\d+/g, '');
        for (const m of oraliqsiz.matchAll(/(?:'([^']+)'!)?\$?([A-Z]{1,2})\$?(\d+)/g)) {
          const nom = m[1] ?? v.nom;
          const katak = varaq.get(nom)?.get(`${m[2]}${m[3]}`);
          expect(varaq.has(nom), `${v.nom}!${k.ref}: varaq «${nom}» yo‘q (${f})`).toBe(true);
          if (!katak || (katak.matn == null && katak.v == null && !katak.f)) bosh.push(`${v.nom}!${k.ref} -> ${nom}!${m[2]}${m[3]} (${f})`);
          // Arifmetika (SUM/IF emas) matn katagiga havola qilmasligi shart: «—» ROUND ichida #VALUE! beradi.
          else if (!/^(SUM|IF|SUMIF)/.test(f) && katak.matn != null && !katak.f && Number.isNaN(Number(katak.matn.replace(',', '.')))) bosh.push(`${v.nom}!${k.ref} matn katagiga arifmetik havola: ${nom}!${m[2]}${m[3]}='${katak.matn}' (${f})`);
        }
      }
    }
    expect(bosh).toEqual([]);
  });
});

// --- Iyerarxiya: uchastka/fayl > razdel > ichki razdel (egasi 2026-10-25, "daraxt saytda bor, hujjatda yo'q") ---
const irows = [
  q({ id: 1, tur: 'rz', nom: '1уч-к.xlsx — 4230_БВ' }),
  q({ id: 2, tur: 'rz', ota_id: 1, nom: 'РАЗДЕЛ 1.ЗЕМЛЯНЫЕ' }),
  q({ id: 3, tur: 'rz', ota_id: 2, nom: '2.ЗЕМЛЯНЫЕ РАБОТЫ .' }),
  q({ id: 4, tur: 'bl', ota_id: 3, kod: 'Е1', nom: 'Выемка', hajm: 10 }),
  q({ id: 5, tur: 'rs', ota_id: 4, kod: '1', kat: 'ЧЕЛ', nom: CHEL, birlik: 'ЧЕЛ-Ч', norma: 2, narx: 1000 }),
  q({ id: 6, tur: 'rs', ota_id: 4, kod: '3', kat: 'МАШ', nom: 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', birlik: 'ЧЕЛ-Ч', norma: 1, narx: null }),
  q({ id: 7, tur: 'bl', ota_id: 2, kod: 'Е2', nom: 'Планировка', hajm: 4 }),
  q({ id: 8, tur: 'rs', ota_id: 7, kod: '1', kat: 'ЧЕЛ', nom: CHEL, birlik: 'ЧЕЛ.-Ч', norma: 3, narx: 1000 }),
  q({ id: 9, tur: 'rz', nom: '2уч-к.xlsx — 4240_БВ' }),
  q({ id: 10, tur: 'rz', ota_id: 9, nom: '2.ЗЕМЛЯНЫЕ РАБОТЫ .' }),
  q({ id: 11, tur: 'bl', ota_id: 10, kod: 'Е1', nom: 'Выемка', hajm: 5 }),
  q({ id: 12, tur: 'rs', ota_id: 11, kod: '1', kat: 'ЧЕЛ', nom: CHEL, birlik: 'ЧЕЛ-Ч', norma: 2, narx: 1200 }),
  q({ id: 13, tur: 'rz', ota_id: 9, nom: 'Пустой раздел' }),
  q({ id: 14, tur: 'rz', nom: 'Пустой участок' }),
];
const iholat: F2Holat[] = [4, 5, 6, 7, 8, 11, 12].map((id) => ({ qator_id: id, f2_mumkin_hajm: 100 }));

/** SUM(H5,H7:H9,SUM(..)) ni katak qiymatlari bo'yicha hisoblaydi. */
function hisobla(f: string, qiymat: (ref: string) => number | null): number {
  let s = f;
  let m = /SUM\(([^()]*)\)/.exec(s);
  if (!m) throw new Error(`SUM emas: ${f}`);
  while (m) {
    const bo = m[1].split(',').reduce((t, qism) => {
      const r = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(qism.trim());
      if (!r) return t + Number(qism);
      let s2 = 0;
      for (let i = Number(r[2]); i <= Number(r[4] ?? r[2]); i++) s2 += qiymat(`${r[1]}${i}`) ?? 0;
      return t + s2;
    }, 0);
    s = s.replace(m[0], String(bo)); m = /SUM\(([^()]*)\)/.exec(s);
  }
  return Number(s);
}

describe('F2 Excel: iyerarxiya (uchastka > razdel > ichki razdel)', () => {
  const ihujjat = () => {
    const b = f2Qur(irows, iholat);
    const k = bosKiritma(); k.hajm[4] = '10'; k.hajm[7] = '4'; k.hajm[11] = '5';
    const qs = f2Qatorlar(b, k);
    const r = f2Hujjat(b, qs, { obyektNom: 'Yo‘l 2,5 km', davr: '2026-10-01', raqam: '1', rows: irows });
    return { r, t: hujjatTekshir(r.bytes) };
  };

  it('F-2 varaqda sarlavhalar daraxti va oraliq jamilar; bo‘sh razdellar chiqmaydi; jamilar yig‘indisi = umumiy jami', () => {
    const { r, t } = ihujjat();
    const f2 = t.varaqlar.find((v) => v.nom === 'Ф-2')!;
    const sat = (ref: string) => f2.kataklar.find((k) => k.ref === ref);
    const matnlar = f2.kataklar.filter((k) => k.ref.startsWith('A') || k.ref.startsWith('C')).map((k) => k.matn ?? '');
    const bor = (s: string) => matnlar.some((m) => m.includes(s));
    expect(bor('1УЧ-К.XLSX — 4230_БВ')).toBe(true);
    expect(bor('2УЧ-К.XLSX — 4240_БВ')).toBe(true);
    expect(bor('РАЗДЕЛ 1.ЗЕМЛЯНЫЕ')).toBe(true);
    expect(matnlar.filter((m) => m.includes('2.ЗЕМЛЯНЫЕ РАБОТЫ .') && !m.startsWith('ИТОГО'))).toHaveLength(2);
    expect(bor('ПУСТОЙ')).toBe(false);
    expect(matnlar.some((m) => /^ИТОГО ПО «1УЧ-К/.test(m))).toBe(true);
    expect(matnlar.some((m) => /^ИТОГО ПО РАЗДЕЛУ «РАЗДЕЛ 1\.ЗЕМЛЯНЫЕ»/.test(m))).toBe(true);
    const qiymat = (ref: string) => { const k = sat(ref); const x = k?.v != null ? Number(k.v) : NaN; return Number.isFinite(x) ? x : null; };
    const jamilar = f2.kataklar.filter((k) => k.ref.startsWith('C') && /^ИТОГО ПО/.test(k.matn ?? ''));
    expect(jamilar).toHaveLength(5); // 2 uchastka + 1-uchastkada tashqi va ichki razdel + 2-uchastkada ichki razdel
    for (const j of jamilar) {
      const h = sat(`H${j.ref.slice(1)}`)!;
      expect(h.f).toBeTruthy();
      expect(hisobla(h.f!, qiymat)).toBeCloseTo(Number(h.v), 2);
    }
    const uchJamilar = jamilar.filter((j) => /^ИТОГО ПО «/.test(j.matn ?? '')).map((j) => Number(sat(`H${j.ref.slice(1)}`)!.v));
    expect(uchJamilar).toHaveLength(2);
    const vsego = f2.kataklar.find((k) => /ИТОГО ПРЯМЫЕ ЗАТРАТЫ ПО АКТУ/.test(k.matn ?? ''))!;
    const vsegoH = sat(`H${vsego.ref.slice(1)}`)!;
    expect(uchJamilar.reduce((a, b) => a + b, 0)).toBeCloseTo(Number(vsegoH.v), 2);
    expect(Number(vsegoH.v)).toBeCloseTo(r.jami!, 2);
    expect(r.jami).toBeCloseTo(10 * 2 * 1000 + 4 * 3 * 1000 + 5 * 2 * 1200, 2);
    const ichki = jamilar.find((j) => /РАЗДЕЛУ «2\.ЗЕМЛЯНЫЕ РАБОТЫ \./.test(j.matn ?? '') && Number(sat(`H${j.ref.slice(1)}`)!.v) === 20000);
    expect(ichki).toBeTruthy();
    const tashqi = jamilar.find((j) => /РАЗДЕЛУ «РАЗДЕЛ 1/.test(j.matn ?? ''))!;
    expect(Number(sat(`H${tashqi.ref.slice(1)}`)!.v)).toBeCloseTo(32000, 2);
  });

  it('Ведомость ресурсов uchastka bo‘yicha bo‘limlangan; jamilar yig‘indisi = ВСЕГО; xato qiymat yo‘q', () => {
    const { t } = ihujjat();
    const ved = t.varaqlar.find((v) => v.nom === 'Ведомость ресурсов')!;
    const sat = (ref: string) => ved.kataklar.find((k) => k.ref === ref);
    const qiymat = (ref: string) => { const x = Number(sat(ref)?.v); return Number.isFinite(x) ? x : null; };
    const sec = ved.kataklar.filter((k) => k.ref.startsWith('C') && /^ИТОГО ПО «/.test(k.matn ?? ''));
    expect(sec).toHaveLength(2);
    const vsego = ved.kataklar.find((k) => /ВСЕГО ПО ВЕДОМОСТИ/.test(k.matn ?? ''))!;
    const h = sat(`G${vsego.ref.slice(1)}`)!;
    expect(hisobla(h.f!, qiymat)).toBeCloseTo(Number(h.v), 2);
    expect(sec.reduce((s, j) => s + Number(sat(`G${j.ref.slice(1)}`)!.v), 0)).toBeCloseTo(Number(h.v), 2);
    for (const k of ved.kataklar) { expect(k.v ?? '').not.toMatch(/^#/); expect(k.matn ?? '').not.toMatch(/#(REF|VALUE)/); }
    // Bir xil resurs ikki uchastkada alohida (uchastka aralashmaydi).
    expect(ved.kataklar.filter((k) => k.ref.startsWith('C') && (k.matn ?? '').startsWith(CHEL)).length).toBe(2);
  });
});
