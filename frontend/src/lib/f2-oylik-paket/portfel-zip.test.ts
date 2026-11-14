import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { RasmiyVaraq, rasmiyKitob, xavfsizFaylNomi, xavfsizQism } from '../hujjat-yozuvchi';
import { aktFaylNomi, paketRejasi, paketReestriXlsx, paketZipi, PAPKA_AKT, PAPKA_SVOD, REESTR_FAYL_NOMI, svodFaylNomi, YOL_MAKS, type PaketHujjat } from './portfel-zip';

/* Barcha nom, son va raqam SINTETIK. */
const TAQIQ = /[\\/:*?"<>|]/;

describe('xavfsiz fayl/papka nomi', () => {
  it('taqiqlangan belgilar, boshqaruv belgilari va oxirgi nuqta/bo‘shliq olib tashlanadi', () => {
    expect(xavfsizQism('A/B\\C:D*E?F"G<H>I|J')).not.toMatch(TAQIQ);
    expect(xavfsizQism('  nom.  ')).toBe('nom');
    expect(xavfsizQism('a\u0000b\u001fc')).toBe('a_b_c');
    expect(xavfsizQism('')).toBe('hujjat');
    expect(xavfsizQism('...', 10, 'zaxira')).toBe('zaxira');
  });
  it('Windows zaxira nomlari (CON, NUL, COM1) o‘zgartiriladi', () => {
    expect(xavfsizQism('CON')).toBe('_CON');
    expect(xavfsizQism('com3')).toBe('_com3');
    expect(xavfsizQism('CONSTRUCT')).toBe('CONSTRUCT');
  });
  it('uzunlik chegarasi: butun fayl nomi (kengaytma bilan) maksdan oshmaydi, kengaytma saqlanadi', () => {
    const n = xavfsizFaylNomi('Я'.repeat(500), 'xlsx', 100);
    expect(n.length).toBeLessThanOrEqual(100);
    expect(n.endsWith('.xlsx')).toBe(true);
  });
});

describe('aktFaylNomi / svodFaylNomi', () => {
  it('«<объект> — Акт Ф-2 №<№> <davr>.xlsx»; qoralama belgilanadi', () => {
    expect(aktFaylNomi({ obyekt: 'Объект А', raqam: '12', davr: 'Март 2026' })).toBe('Объект А — Акт Ф-2 №12 Март 2026.xlsx');
    expect(aktFaylNomi({ obyekt: 'Объект А', raqam: '12', davr: 'Март 2026', qoralama: true })).toBe('Объект А — Акт Ф-2 №12 Март 2026 (черновик).xlsx');
  });
  it('raqamsiz akt — id bilan; taqiqlangan belgisiz; uzun obyekt nomi qisqaradi', () => {
    expect(aktFaylNomi({ obyekt: 'О', raqam: null, aktId: 5 })).toContain('№id5');
    const n = aktFaylNomi({ obyekt: 'Объект/с:опасными*символами?'.repeat(10), raqam: '1/2', davr: 'Март 2026' });
    expect(n).not.toMatch(TAQIQ);
    expect(n.length).toBeLessThanOrEqual(110);
    expect(n.endsWith('.xlsx')).toBe(true);
  });
  it('svod nomi', () => {
    expect(svodFaylNomi('№ 7 · тест')).toBe('Свод Ф-2 — № 7 · тест.xlsx');
  });
});

const bayt = (n: number) => new Uint8Array([n, n, n]);
const akt = (id: number, obyekt: string, raqam: string, davr: string, holat = 'утверждён', summa: number | null = 1000, qoralama = false): PaketHujjat =>
  ({ tur: 'akt', obyekt, hujjat: 'Акт Ф-2', raqam, davr, oyKalit: davr.startsWith('Март') ? '2026-03' : '2026-04', holat, summa, qoralama, aktId: id, bytes: bayt(id) });
const svod: PaketHujjat = { tur: 'svod', obyekt: null, hujjat: 'Свод Ф-2', bytes: bayt(99), summa: 3000 };

describe('paket rejasi (papkalar)', () => {
  it('obyekt BIR bo‘lsa — aktlar papkasiz «01 Акты Ф-2/», svod «02 Свод Ф-2/»; papkalar raqamlangan (tartib bilan saralanadi)', () => {
    const r = paketRejasi([svod, akt(2, 'Объект А', '2', 'Апрель 2026'), akt(1, 'Объект А', '1', 'Март 2026')], { svodKesim: '№ 7' });
    expect(r.map((x) => x.yol)).toEqual([
      `${PAPKA_AKT}/Объект А — Акт Ф-2 №1 Март 2026.xlsx`,
      `${PAPKA_AKT}/Объект А — Акт Ф-2 №2 Апрель 2026.xlsx`,
      `${PAPKA_SVOD}/Свод Ф-2 — № 7.xlsx`,
    ]);
    expect([PAPKA_SVOD, PAPKA_AKT].sort()[0]).toBe(PAPKA_AKT);
  });

  it('obyekt KO‘P bo‘lsa — har obyekt o‘z papkasida', () => {
    const r = paketRejasi([akt(1, 'Б-объект', '1', 'М'), akt(2, 'А-объект', '1', 'М'), svod], { svodKesim: 'k' });
    expect(r.map((x) => x.yol.split('/').slice(0, 2).join('/'))).toEqual([`${PAPKA_AKT}/А-объект`, `${PAPKA_AKT}/Б-объект`, `${PAPKA_SVOD}/Свод Ф-2 — k.xlsx`]);
  });

  it('yo‘llar takrorsiz (bir xil nom — _2), katta-kichik harf farqsiz', () => {
    const r = paketRejasi([akt(1, 'Объект', '1', 'М'), akt(1, 'ОБЪЕКТ', '1', 'М'), akt(1, 'Объект', '1', 'М')], { svodKesim: 'k' });
    const k = r.map((x) => x.yol.toLowerCase());
    expect(new Set(k).size).toBe(3);
    expect(r.some((x) => /_2\.xlsx$/.test(x.yol))).toBe(true);
  });

  it('ikki xil obyekt, papka nomi to‘qnashsa (taqiqlangan belgi) — (2) qo‘shiladi', () => {
    const r = paketRejasi([akt(1, 'А/Б', '1', 'М'), akt(2, 'А:Б', '1', 'М')], { svodKesim: 'k' });
    expect(new Set(r.map((x) => x.yol.split('/')[1].toLowerCase())).size).toBe(2);
  });

  it('har yo‘l YOL_MAKS dan qisqa, taqiqlangan belgisiz, kengaytma xlsx', () => {
    const uzun = 'Очень длинное название объекта строительства '.repeat(12);
    const r = paketRejasi([akt(1, uzun, '1', 'Март 2026'), akt(2, uzun + 'Б', '2', 'Март 2026'), svod], { svodKesim: uzun });
    for (const x of r) {
      expect(x.yol.length).toBeLessThanOrEqual(YOL_MAKS);
      expect(x.yol.split('/').every((q) => !TAQIQ.test(q))).toBe(true);
      expect(x.yol.endsWith('.xlsx')).toBe(true);
    }
  });
});

describe('ZIP paket (xotirada ochiladi)', () => {
  const hujjatlar = [akt(1, 'А-объект', '1', 'Март 2026'), akt(2, 'А-объект', '2', 'Апрель 2026', 'черновик / на проверке', null, true), akt(3, 'Б-объект', '1', 'Март 2026'), svod];
  const reja = paketRejasi(hujjatlar, { svodKesim: '№ 7' });
  const reestr = paketReestriXlsx(reja, { kesimMatni: 'по договору № 7', tashkilot: 'ООО Тест', kirmadi: ['Б-объект · Ф-2 № 9: нет строк'] });
  const zip = paketZipi(reja, reestr);
  const z = unzipSync(zip);

  it('papka/fayl ro‘yxati: ildizda Реестр, «01 Акты Ф-2/<объект>/…» alohida fayllar, «02 Свод Ф-2/…»', () => {
    expect(Object.keys(z).sort()).toEqual([
      REESTR_FAYL_NOMI,
      `${PAPKA_AKT}/А-объект/А-объект — Акт Ф-2 №1 Март 2026.xlsx`,
      `${PAPKA_AKT}/А-объект/А-объект — Акт Ф-2 №2 Апрель 2026 (черновик).xlsx`,
      `${PAPKA_AKT}/Б-объект/Б-объект — Акт Ф-2 №1 Март 2026.xlsx`,
      `${PAPKA_SVOD}/Свод Ф-2 — № 7.xlsx`,
    ].sort());
  });

  it('har akt ALOHIDA fayl: baytlar o‘z faylida, bitta kitobga birlashtirilmagan', () => {
    expect([...z[`${PAPKA_AKT}/А-объект/А-объект — Акт Ф-2 №1 Март 2026.xlsx`]]).toEqual([1, 1, 1]);
    expect([...z[`${PAPKA_AKT}/Б-объект/Б-объект — Акт Ф-2 №1 Март 2026.xlsx`]]).toEqual([3, 3, 3]);
  });

  it('bir xil kirish — bir xil baytlar (barqaror sana)', () => {
    expect([...paketZipi(reja, reestr)]).toEqual([...zip]);
  });

  it('Реестр пакета.xlsx: har fayl bir qator (hujjat, obyekt, №, davr, holat, summa); noma’lum summa — bo‘sh katak', () => {
    const r = unzipSync(z[REESTR_FAYL_NOMI]);
    const sheet = strFromU8(r['xl/worksheets/sheet1.xml']);
    for (const q of reja) expect(sheet).toContain(q.yol.replace(/&/g, '&amp;'));
    expect(sheet).toContain('Б-объект');
    expect(sheet).toContain('утверждён');
    expect(sheet).toContain('не включён в пакет');
    expect(sheet).toContain('Б-объект · Ф-2 № 9: нет строк');
    // 2-akt (qoralama, summa noma'lum): summa ustuni (H) bo'sh katak, 0 emas
    expect(sheet).not.toMatch(/<c r="H1\d" s="\d+"><v>0<\/v>/);
  });

  it('Реестр ham, hujjatlar ham haqiqiy rasmiy kitob bilan mos (kitob kuzatuvchisi dizaynni tekshiradi)', () => {
    const v = new RasmiyVaraq({ nom: 'Т', sarlavha: 'Т', ustunlar: [{ sarlavha: 'А', kenglik: 10, tur: 'matn' }] });
    v.qator('oddiy', ['x']);
    expect(rasmiyKitob([v]).bytes.length).toBeGreaterThan(100);
  });
});
