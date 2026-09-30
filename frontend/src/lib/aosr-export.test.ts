import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { aosrExcel, aosrSana, aosrKomissiyaTartibi, azoMatni, protokolMatni, aosrFaylNomi, TIZIM_KOLONTITUL } from './aosr-export';
import { qoralamaTanlangandan } from './aosr-qoralama';

async function oqi(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const ws = wb.worksheets[0];
  const matnlar: string[] = [];
  ws.eachRow((r) => r.eachCell((c) => { if (typeof c.value === 'string' && c.value) matnlar.push(c.value); }));
  return { ws, matnlar: [...new Set(matnlar)] };
}

describe('АОСР generator (ШНК 3.01.01-22 Прил.6)', () => {
  it('sana — ruscha, bo‘sh bo‘lsa to‘ldirish chizig‘i', () => {
    expect(aosrSana('2025-12-19')).toBe('«19» декабря 2025 г.');
    expect(aosrSana(null)).toContain('«___»');
  });

  it('komissiya tartibi blank variantiga mos, yetishmagan rol bo‘sh qator bilan', () => {
    const t = aosrKomissiyaTartibi('subpudratchisiz', [{ rol: 'texnadzor', fio: 'Жумаев Ж.' }]);
    expect(t.map((a) => a.rol)).toEqual(['smo', 'texnadzor', 'loyihachi']);
    expect(azoMatni(t[0])).toMatch(/^_+$/);
    const s = aosrKomissiyaTartibi('subpudratchili', []);
    expect(s.map((a) => a.rol)).toEqual(['subpudratchi', 'bosh_pudratchi', 'texnadzor', 'loyihachi']);
  });

  it('to‘liq akt: sarlavha, maydonlar, protokol ilovasi, imzolar, kolontitul, A4', async () => {
    const bytes = await aosrExcel({
      raqam: '58', sana: '2025-12-14', ishNomi: 'Устройство парапета из кирпича на трибунах',
      obyektNomi: 'Амфитеатр', ishTavsifi: 'Кладка парапета — 12,5 м3\nАрмирование кладки',
      smoNomi: '«NEW TIMES BUILDINGS»', loyihaTashkiloti: '«Узшахарсозлик ЛИТИ»', loyihaHujjati: 'АР-12',
      materiallar: 'Кирпич М-100 (серт. № 5)', chetlanishlar: 'Нет', boshlanishSana: '2025-12-01', tugashSana: '2025-12-10',
      keyingiIshlar: 'Устройство кровли', komissiya: [
        { rol: 'smo', fio: 'Бозоров Ш.', lavozim: 'Начальник участка', tashkilot: '«NEW TIMES BUILDINGS»' },
        { rol: 'texnadzor', fio: 'Жумаев Ж.', lavozim: 'Технадзор' },
      ],
      protokollar: [{ raqam: 'П-7', sana: '2025-12-12', laboratoriya: 'Азим геотех', natija: 'mos' }],
    });
    const { ws, matnlar } = await oqi(bytes);
    expect(matnlar).toContain('АКТ ОСВИДЕТЕЛЬСТВОВАНИЯ СКРЫТЫХ РАБОТ № 58');
    expect(matnlar).toContain('Устройство парапета из кирпича на трибунах');
    expect(matnlar).toContain('Кладка парапета — 12,5 м3');
    expect(matnlar).toContain('Армирование кладки');
    expect(matnlar).toContain('«Узшахарсозлик ЛИТИ», АР-12');
    expect(matnlar).toContain('«14» декабря 2025 г.');
    expect(matnlar.some((m) => m.includes('протокол испытаний № П-7') && m.includes('Азим геотех') && m.includes('соответствует'))).toBe(true);
    expect(matnlar).toContain('Бозоров Ш. — Начальник участка, «NEW TIMES BUILDINGS»');
    expect(matnlar).toContain('Бозоров Ш.');
    // loyihachi berilmagan — rol qatori bor, qiymati chiziq (o'ylab topilmaydi)
    expect(matnlar.some((m) => m.startsWith('Представитель проектной организации'))).toBe(true);
    expect(ws.headerFooter.oddFooter).toContain(TIZIM_KOLONTITUL.split(' — ')[0]);
    expect(ws.pageSetup.paperSize).toBe(9);
    expect(ws.pageSetup.fitToWidth).toBe(1);
  });

  it('bo‘sh maydonlar — chiziq, taxmin yo‘q', async () => {
    const { matnlar } = await oqi(await aosrExcel({ komissiya: [] }));
    expect(matnlar.some((m) => m.startsWith('АКТ ОСВИДЕТЕЛЬСТВОВАНИЯ СКРЫТЫХ РАБОТ № ____'))).toBe(true);
    expect(matnlar.some((m) => /^_{20,}$/.test(m))).toBe(true);
    expect(matnlar.some((m) => m.includes('Приложения'))).toBe(false);
  });

  it('protokol matni va fayl nomi', () => {
    expect(protokolMatni({ raqam: '12', natija: 'mos_emas' })).toBe('протокол испытаний № 12 — не соответствует');
    expect(aosrFaylNomi('Амфитеатр: 1/2', '58', '2025-12-14')).toBe('Амфитеатр 1 2_АОСР_58_2025-12-14.xlsx');
  });
});

describe('АОСР qoralamasi belgilangan ishlardan', () => {
  it('ishlar — 1-bo‘lim, materiallar — 3-bo‘lim, hajm yo‘q bo‘lsa yozilmaydi', () => {
    const q = qoralamaTanlangandan([
      { qator_id: 1, obyekt_id: 1, nom: 'Бетонирование фундамента', kod: 'E6-1', birlik: 'м3', kat: 'bl', fakt_hajm: 12.5, yashirin: true, akt_bor: false },
      { qator_id: 2, obyekt_id: 1, nom: 'Бетон B25', kod: null, birlik: 'м3', kat: 'mat', fakt_hajm: 12.8, yashirin: false, akt_bor: false },
    ]);
    expect(q.ish_nomi).toBe('Бетонирование фундамента');
    expect(q.ish_tavsifi).toBe('Бетонирование фундамента — 12,5 м3');
    expect(q.materiallar).toBe('Бетон B25 — 12,8 м3');
  });
});
