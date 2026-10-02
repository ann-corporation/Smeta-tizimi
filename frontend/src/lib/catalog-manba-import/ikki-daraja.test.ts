import { describe, expect, it } from 'vitest';
import { catalogQatorlariniApiFormatga, tahlilKatalogXlsx, zavodSarlavhasimi } from '.';

/* Katalog 1 kv. 2026 haqiqiy tuzilishi (egasi yuklagan, 213 691 qator): zavod sarlavhasi → mahsulot guruhi → mahsulotlar.
 * Avval parser faqat oxirgi sarlavhani eslardi — mahsulot guruhi zavodni "bosib", 87% qatorda zavod yo'qolardi. */
describe('Katalog — ikki darajali sarlavha (zavod → mahsulot guruhi)', () => {
  it('zavod sarlavhasi: raqam + tashkilot shakli (lotincha MChJ ham)', () => {
    expect(zavodSarlavhasimi('17. ООО "YOGOCHSOZ SERVIS LYUKS". (НДС 12%) Руководитель: Юн Л.М.')).toBe(true);
    expect(zavodSarlavhasimi('30. "ASILL METALL" MCHJ. (НДС 12%) Руководитель: Хошимов')).toBe(true);
    expect(zavodSarlavhasimi('Трубы стальные электросварные прямошовные ГОСТ 10704-91')).toBe(false);
    expect(zavodSarlavhasimi('1.Трубы выпускаются длиной от 10 000 мм')).toBe(false);
  });

  it('mahsulot guruhi zavodni o‘chirmaydi: har mahsulot ikkalasini ham oladi', () => {
    const Z = '17. ООО "YOGOCHSOZ". (НДС 12%) Руководитель: X. Адрес: г. Ташкент';
    const G = 'Трубы стальные ГОСТ 10704';
    const rows: unknown[][] = [
      ['Наименование продукции', 'Ед. изм.', 'Отпускная цена без НДС, сум'],
      [Z, Z, Z],
      ['Доска обрезная', 'м3', 3_000_000],
      [G, G, G],
      ['Труба 57x3,5', 'м', 45_000],
    ];
    const t = tahlilKatalogXlsx({ sheets: [{ name: 'г. Ташкент, сум', rows, hidden: false }] } as never, 'Каталог 1 кв. 2026 г..xls');
    const api = catalogQatorlariniApiFormatga(t.qatorlar);
    const doska = api.find((q) => q.nom === 'Доска обрезная');
    const truba = api.find((q) => q.nom === 'Труба 57x3,5');
    expect(doska).toMatchObject({ zavod: Z, guruh: null });
    expect(truba).toMatchObject({ zavod: Z, guruh: G });
  });
});
