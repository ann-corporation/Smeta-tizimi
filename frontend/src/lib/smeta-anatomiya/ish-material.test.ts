/**
 * Ish–material muvofiqligi (PR1 yadro). FAQAT sintetik qatorlar (repo public): nomlar umumiy, raqamlar o'ylab topilgan.
 * Oltin naqshlar (arxitektura §8) abstrakt shaklda qayta yaratilgan; 7 ta yolg'on-musbat naqsh signal BERMASLIGI shart.
 *
 * Lokal baholash (ixtiyoriy): ISH_MATERIAL_DIR="C:/.../dump" npx vitest run src/lib/smeta-anatomiya/ish-material
 * — papkadagi har `*.json` ({ qatorlar, holat: [[id, {fakt, kiritilgan}]], kutilgan?: { mat_id, daraja }[] }) bo'yicha
 * signallar hisoboti. Ma'lumot repoga qo'yilmaydi.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ishMaterialBoglanishlari, muvofiqlikTekshir, type IshMatHolat, type IshMatQator, type IshMatQaror } from './ish-material';

let tartib = 0;
const rz = (id: number, ota_id: number | null = null): IshMatQator => ({ id, ota_id, tur: 'rz', tartib: ++tartib, nom: 'БОЛИМ' });
const bl = (id: number, ota: number, nom: string, birlik: string, hajm: number, o: Partial<IshMatQator> = {}): IshMatQator =>
  ({ id, ota_id: ota, tur: 'bl', tartib: ++tartib, nom, birlik, hajm, ...o });
const mat = (id: number, ota: number, nom: string, birlik: string, hajm: number, narx: number | null = 1_000_000, o: Partial<IshMatQator> = {}): IshMatQator =>
  ({ id, ota_id: ota, tur: 'mat', tartib: ++tartib, nom, birlik, hajm, narx, ...o });
const ob = (id: number, ota: number, nom: string, birlik: string, hajm: number, o: Partial<IshMatQator> = {}): IshMatQator =>
  ({ id, ota_id: ota, tur: 'ob', tartib: ++tartib, nom, birlik, hajm, narx: 5_000_000, ...o });
const h = (pairs: [number, number | null][]): Map<number, IshMatHolat> =>
  new Map(pairs.map(([id, f]) => [id, f == null ? { kiritilgan: false, fakt: null } : { kiritilgan: true, fakt: f }]));

const tekshir = (rows: IshMatQator[], holat: Map<number, IshMatHolat>, qarorlar: IshMatQaror[] = []) =>
  muvofiqlikTekshir(ishMaterialBoglanishlari(rows, qarorlar), rows, holat);
const bogOl = (rows: IshMatQator[], id: number, qarorlar: IshMatQaror[] = []) => ishMaterialBoglanishlari(rows, qarorlar).find((b) => b.mat_id === id)!;

describe('ish–material: oltin naqshlar (signal BOR)', () => {
  it('A 1:1 + zamena: ishning 0,38 qismi zamena ishiga tushgan — 0,59% farq ushlanadi (xato, ehtimol taraf — ish)', () => {
    const rows = [
      rz(1), bl(10, 1, 'МОНТАЖ ВИТРАЖЕЙ', 'М2', 64.4), mat(11, 1, 'ВИТРАЖ АЛЮМИНИЕВЫЙ', 'М2', 64.4),
      bl(12, 1, 'МОНТАЖ ВИТРАЖЕЙ', 'М2', 10, { zamena: true, change_type: 'REPLACEMENT', replaces_line_id: 10 }),
    ];
    const b = bogOl(rows, 11);
    expect(b).toMatchObject({ bl_id: 10, ishonch: 'ishonchli', sinf: 'A', mano: 'VITRAJ', k_norm: 1 });
    const s = tekshir(rows, h([[10, 54.02], [12, 10], [11, 64.4]]));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ mat_id: 11, daraja: 'xato', yorliq: 'farq', sinf: 'A', ishFakt: 64.02, kutilgan: 64.02, fakt: 64.4, ehtimolTaraf: 'ish', ehtimolSabab: 'zamena' });
    expect(s[0].farqUlush!).toBeCloseTo(0.38 / 64.02, 6);
    // Ishni moslash: o'z fakti = 64,4 − zamena qoplagan 10.
    expect(s[0].variantlar.ishniMoslash).toEqual({ qator_id: 10, yangiFakt: 54.4 });
    expect(s[0].variantlar.materialniMoslash).toEqual({ qator_id: 11, yangiFakt: 64.02 });
  });

  it('A: 0,05% ichidagi farq — signal yo\'q', () => {
    const rows = [rz(1), bl(10, 1, 'МОНТАЖ ВИТРАЖЕЙ', 'М2', 100), mat(11, 1, 'ВИТРАЖ', 'М2', 100)];
    expect(tekshir(rows, h([[10, 100], [11, 100.04]]))).toEqual([]);
  });

  it('B gazoblok +12% — xato', () => {
    const rows = [rz(1), bl(10, 1, 'КЛАДКА СТЕН ИЗ ГАЗОБЛОКОВ', 'М3', 100), mat(11, 1, 'ГАЗОБЛОК D500', 'М3', 104, 500_000)];
    expect(bogOl(rows, 11)).toMatchObject({ ishonch: 'ishonchli', sinf: 'B', mano: 'BLOK' });
    const s = tekshir(rows, h([[10, 80], [11, 80 * 1.04 * 1.12]]));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ daraja: 'xato', yorliq: 'farq', sinf: 'B' });
    expect(s[0].farqUlush!).toBeCloseTo(0.12, 6);
  });

  it('C ish o\'sdi, armatura o\'smadi (Т/М3) — savol, ehtimol taraf — material (aynan 100% smeta)', () => {
    const rows = [rz(1), bl(10, 1, 'БЕТОНИРОВАНИЕ МОНОЛИТНЫХ ПЛИТ', 'М3', 100), mat(11, 1, 'АРМАТУРА А500С', 'Т', 8, 9_000_000)];
    expect(bogOl(rows, 11)).toMatchObject({ ishonch: 'ishonchli', sinf: 'C', mano: 'ARMATURA' });
    const s = tekshir(rows, h([[10, 130], [11, 8]]));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ daraja: 'savol', yorliq: 'farq', sinf: 'C', kutilgan: 10.4, ehtimolTaraf: 'material', ehtimolSabab: 'smeta_100' });
  });

  it('C +34% — savol', () => {
    const rows = [rz(1), bl(10, 1, 'АРМИРОВАНИЕ ФУНДАМЕНТОВ', '100М3', 0.5), mat(11, 1, 'АРМАТУРА', 'КГ', 4000, 9_000)];
    expect(bogOl(rows, 11).k_norm).toBeCloseTo(0.08, 9);
    const s = tekshir(rows, h([[10, 0.3], [11, 30 * 80 * 1.34]]));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ daraja: 'savol', sinf: 'C' });
    expect(s[0].farqUlush!).toBeCloseTo(0.34, 6);
  });

  it('D ГКЛ/ГКЛВ/ГКЛО guruhi: bittasi to\'liq kiritilgan — Σ bo\'yicha mos, signal yo\'q; Σ kam bo\'lsa — savol', () => {
    const rows = [
      rz(1), bl(10, 1, 'ОБЛИЦОВКА ПЕРЕГОРОДОК ГИПСОКАРТОННЫМИ ЛИСТАМИ', 'М2', 100),
      mat(11, 1, 'ЛИСТ ГКЛ 12,5', 'М2', 40, 50_000), mat(12, 1, 'ЛИСТ ГКЛВ 12,5', 'М2', 35, 60_000), mat(13, 1, 'ЛИСТ ГКЛО 12,5', 'М2', 30, 70_000),
    ];
    const bog = ishMaterialBoglanishlari(rows);
    expect(bog.map((b) => b.sinf)).toEqual(['D', 'D', 'D']);
    expect(new Set(bog.map((b) => b.guruh)).size).toBe(1);
    expect(tekshir(rows, h([[10, 100], [11, 105], [12, null], [13, null]]))).toEqual([]);
    const s = tekshir(rows, h([[10, 100], [11, 60], [12, null], [13, null]]));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ daraja: 'savol', sinf: 'D', mat_idlar: [11, 12, 13], birlik: 'М2', kutilgan: 105, fakt: 60 });
    expect(s[0].variantlar.materialniMoslash).toBeNull();
  });

  it('B kabel −8%, material/k yumaloq son — ehtimol taraf ish (yangi ish fakti = material/k)', () => {
    const rows = [rz(1), bl(10, 1, 'ПРОКЛАДКА КАБЕЛЯ В ЛОТКАХ', 'М', 1100), mat(11, 1, 'КАБЕЛЬ ВВГНГ 3Х2,5', 'М', 1122, 20_000)];
    const s = tekshir(rows, h([[10, 1000], [11, 938.4]]));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ daraja: 'xato', sinf: 'B', kutilgan: 1020, ehtimolTaraf: 'ish', ehtimolSabab: 'yumaloq' });
    expect(s[0].variantlar.ishniMoslash).toEqual({ qator_id: 10, yangiFakt: 920 });
  });

  it('material kiritilmagan (NULL) — savol; 0 kiritilgan — haqiqiy farq (xato)', () => {
    const rows = [rz(1), bl(10, 1, 'УСТАНОВКА ОКОННЫХ БЛОКОВ', 'ШТ', 20), mat(11, 1, 'ОКНО ПВХ ОК-1', 'ШТ', 20)];
    expect(bogOl(rows, 11)).toMatchObject({ sinf: 'A', mano: 'OKNO' });
    const yoq = tekshir(rows, h([[10, 12], [11, null]]));
    expect(yoq).toHaveLength(1);
    expect(yoq[0]).toMatchObject({ daraja: 'savol', yorliq: 'material_kiritilmagan', kutilgan: 12, fakt: null, ehtimolTaraf: 'material' });
    const nol = tekshir(rows, h([[10, 12], [11, 0]]));
    expect(nol).toHaveLength(1);
    expect(nol[0]).toMatchObject({ daraja: 'xato', yorliq: 'farq', fakt: 0 });
    // Ikkalasi kiritilmagan — hech narsa.
    expect(tekshir(rows, h([]))).toEqual([]);
  });

  it('smeta nisbati g\'ayritabiiy (ish hajmi 0,01) — savol yorlig\'i', () => {
    const rows = [rz(1), bl(10, 1, 'ПРОКЛАДКА ТРУБ ПОЛИЭТИЛЕНОВЫХ', 'М', 0.01), mat(11, 1, 'ТРУБА ПЭ 110', 'М', 120, 30_000)];
    const b = bogOl(rows, 11);
    expect(b).toMatchObject({ ishonch: 'ishonchli', gayritabiiy: true, sabab: 'k_gayritabiiy' });
    const s = tekshir(rows, h([[10, 0.01], [11, 100]]));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ daraja: 'savol', yorliq: 'smeta_nisbati_gayritabiiy', variantlar: { ishniMoslash: null, materialniMoslash: null } });
  });

  it('chiqindisiz kiritilgan (k = 1,10, material = ish) — savol yorlig\'i, xato emas', () => {
    const rows = [rz(1), bl(10, 1, 'УКЛАДКА ПЛИТКИ НА ПОЛ', 'М2', 200), mat(11, 1, 'ПЛИТКА КЕРАМИЧЕСКАЯ', 'М2', 220, 80_000)];
    const s = tekshir(rows, h([[10, 150], [11, 150]]));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ daraja: 'savol', yorliq: 'chiqindisiz', kutilgan: 165, fakt: 150 });
  });
});

describe('ish–material: yolg\'on-musbat naqshlar (signal YO\'Q)', () => {
  const tashlandi = (rows: IshMatQator[], holat: Map<number, IshMatHolat>, ids: number[], sabab?: string) => {
    for (const id of ids) {
      const b = bogOl(rows, id);
      expect(b.ishonch, `mat ${id}`).toBe('boglanmaydi');
      if (sabab) expect(b.sabab).toBe(sabab);
    }
    expect(tekshir(rows, holat)).toEqual([]);
  };

  it('1. sinov ishi (gidravlik sinov) dan keyin armatura/kranlar', () => {
    const rows = [rz(1), bl(10, 1, 'ГИДРАВЛИЧЕСКОЕ ИСПЫТАНИЕ ТРУБОПРОВОДОВ', 'М', 500), mat(11, 1, 'КРАН ШАРОВОЙ ДУ25', 'ШТ', 12), mat(12, 1, 'ЗАДВИЖКА ДУ100', 'ШТ', 4)];
    tashlandi(rows, h([[10, 500], [11, 0], [12, 1]]), [11, 12], 'materialsiz_ish');
  });

  it('2. aloqasiz ishdan keyingi uskuna dumi', () => {
    const rows = [rz(1), bl(10, 1, 'КЛАДКА ПЕРЕГОРОДОК ИЗ КИРПИЧА', 'М3', 30), ob(11, 1, 'КОНДИЦИОНЕР НАСТЕННЫЙ', 'ШТ', 6), ob(12, 1, 'ВЕНТИЛЯТОР КАНАЛЬНЫЙ', 'ШТ', 2)];
    tashlandi(rows, h([[10, 30], [11, 1], [12, null]]), [11, 12], 'uskuna_ornatish_emas');
  });

  it('3. mebel dumi (bo\'lim oxirida)', () => {
    const rows = [rz(1), bl(10, 1, 'ОКРАСКА СТЕН ВОДОЭМУЛЬСИОННАЯ', 'М2', 400), mat(11, 1, 'СТОЛ ПИСЬМЕННЫЙ', 'ШТ', 10), mat(12, 1, 'ШКАФ ДЛЯ ДОКУМЕНТОВ', 'ШТ', 5)];
    tashlandi(rows, h([[10, 400], [11, 2], [12, 0]]), [11, 12], 'mustaqil_material');
  });

  it('4. suvoqdan keyin MDF panellar (bir xil М2, n = 1)', () => {
    const rows = [rz(1), bl(10, 1, 'ШТУКАТУРКА СТЕН', 'М2', 300), mat(11, 1, 'ПАНЕЛИ МДФ СТЕНОВЫЕ', 'М2', 300)];
    tashlandi(rows, h([[10, 300], [11, 50]]), [11], 'mustaqil_material');
  });

  it('5. shit montajidan keyin registrator va disklar', () => {
    const rows = [rz(1), bl(10, 1, 'МОНТАЖ ЩИТА СЛАБОТОЧНОГО', 'ШТ', 1), mat(11, 1, 'ВИДЕОРЕГИСТРАТОР 16 КАНАЛОВ', 'ШТ', 2), mat(12, 1, 'ЖЕСТКИЙ ДИСК 4 ТБ', 'ШТ', 4)];
    tashlandi(rows, h([[10, 1], [11, 0], [12, 0]]), [11, 12], 'mustaqil_material');
  });

  it('6. demontajdan keyingi material', () => {
    const rows = [rz(1), bl(10, 1, 'ДЕМОНТАЖ ПЕРЕГОРОДОК', 'М2', 50), mat(11, 1, 'ЛИСТ ГКЛ', 'М2', 50)];
    tashlandi(rows, h([[10, 50], [11, 0]]), [11], 'materialsiz_ish');
  });

  it('7. bo\'lim oxiridagi aloqasiz dum (birlik ham, ma\'no ham mos emas, n ≥ 2)', () => {
    const rows = [rz(1), bl(10, 1, 'ГРУНТОВАНИЕ ПОВЕРХНОСТЕЙ', 'М2', 500), mat(11, 1, 'ЗАМОК НАВЕСНОЙ', 'ШТ', 10), mat(12, 1, 'ОГНЕТУШИТЕЛЬ', 'ШТ', 6)];
    tashlandi(rows, h([[10, 500], [11, 3], [12, 0]]), [11, 12], 'dum_blok');
  });

  it('bo\'lim oxiridagi farqli o\'lcham, lekin ma\'lum nisbat (т/м²) — dum emas, shubhali (taklifda qoladi)', () => {
    const rows = [rz(1), bl(10, 1, 'Asfalt yotqizish', 'М2', 1000), mat(11, 1, 'Asfaltobeton', 'Т', 120), mat(12, 1, 'Bitum', 'Т', 2)];
    expect(bogOl(rows, 11)).toMatchObject({ ishonch: 'shubhali', sabab: 'faqat_tartib', bl_id: 10 });
    expect(bogOl(rows, 12)).toMatchObject({ ishonch: 'shubhali', bl_id: 10 });
  });

  it('shubhali bog\'lanish (faqat tartib) — signal yo\'q', () => {
    const rows = [rz(1), bl(10, 1, 'ГРУНТОВАНИЕ ПОВЕРХНОСТЕЙ', 'М2', 500), mat(11, 1, 'ЛЕНТА СЕРПЯНКА', 'М', 10), mat(12, 1, 'ЛЕНТА ДЕМПФЕРНАЯ', 'М', 6), bl(13, 1, 'ОКРАСКА', 'М2', 500)];
    expect(bogOl(rows, 11)).toMatchObject({ ishonch: 'shubhali', sabab: 'faqat_tartib', bl_id: 10, n: 2, orin: 1 });
    expect(tekshir(rows, h([[10, 500], [11, 0], [12, 0]]))).toEqual([]);
  });

  it('pul farqi F2_CHANG_PUL dan kichik — e\'tiborsiz', () => {
    const rows = [rz(1), bl(10, 1, 'МОНТАЖ ВИТРАЖЕЙ', 'М2', 100), mat(11, 1, 'ВИТРАЖ', 'М2', 100, 1000)];
    expect(tekshir(rows, h([[10, 100], [11, 100.5]]))).toEqual([]);
    // Narx noma'lum — pul bo'yicha tashlanmaydi.
    const nomalum = [rz(1), bl(10, 1, 'МОНТАЖ ВИТРАЖЕЙ', 'М2', 100), mat(11, 1, 'ВИТРАЖ', 'М2', 100, null)];
    expect(tekshir(nomalum, h([[10, 100], [11, 100.5]]))).toHaveLength(1);
  });
});

describe('ish–material: qatorlar qoidalari', () => {
  it('tuzatish qatori nomzod emas — material asosiy ishga bog\'lanadi', () => {
    const rows = [
      rz(1), bl(10, 1, 'УСТРОЙСТВО СТЯЖКИ ЦЕМЕНТНОЙ ТОЛЩИНОЙ 20 ММ', '100М2', 2),
      bl(11, 1, 'НА КАЖДЫЕ 5 ММ ИЗМЕНЕНИЯ ТОЛЩИНЫ ДОБАВЛЯТЬ ИЛИ ИСКЛЮЧАТЬ', '100М2', 2),
      mat(12, 1, 'РАСТВОР ЦЕМЕНТНЫЙ М150', 'М3', 6),
    ];
    expect(bogOl(rows, 12)).toMatchObject({ bl_id: 10, ishonch: 'ishonchli', sinf: 'C' });
  });

  it('almashtirilgan versiya qatorlari chiqariladi (nomzod ham, material ham emas)', () => {
    const rows = [
      rz(1), bl(10, 1, 'МОНТАЖ ВИТРАЖЕЙ', 'М2', 50, { versiya_holat: 'faol' }),
      bl(11, 1, 'МОНТАЖ ВИТРАЖЕЙ', 'М2', 40, { versiya_holat: 'almashtirilgan' }),
      mat(12, 1, 'ВИТРАЖ', 'М2', 50, 1_000_000, { versiya_holat: 'faol' }),
      mat(13, 1, 'ВИТРАЖ', 'М2', 40, 1_000_000, { versiya_holat: 'almashtirilgan' }),
    ];
    const bog = ishMaterialBoglanishlari(rows);
    expect(bog.map((b) => b.mat_id)).toEqual([12]);
    expect(bog[0]).toMatchObject({ bl_id: 10, sinf: 'A' });
  });

  it('zamena materiali aslning bog\'ini meros oladi; fakti asl o\'rniga qo\'shiladi', () => {
    const rows = [
      rz(1), bl(10, 1, 'ПРОКЛАДКА КАБЕЛЯ', 'М', 1000), mat(11, 1, 'КАБЕЛЬ ВВГ 3Х2,5', 'М', 1000, 20_000),
      mat(12, 1, 'КАБЕЛЬ ВВГНГ 3Х2,5', 'М', 300, 25_000, { zamena: true, change_type: 'REPLACEMENT', replaces_line_id: 11 }),
    ];
    expect(bogOl(rows, 12)).toMatchObject({ bl_id: 10, manba: 'zamena', sabab: 'zamena_meros' });
    // Asl 700 + zamena 300 = 1000 = ish fakti — signal yo'q.
    expect(tekshir(rows, h([[10, 1000], [11, 700], [12, 300]]))).toEqual([]);
    // Zamena faktisiz — asl 700 → farq; ehtimol taraf ish (zamena bor).
    const s = tekshir(rows, h([[10, 1000], [11, 700], [12, null]]));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ mat_id: 11, ehtimolSabab: 'zamena' });
  });

  it('minus hajmli material (chegirma) — ishora farqli: shubhali, signal yo\'q; ikkalasi minus — oddiy', () => {
    const rows = [rz(1), bl(10, 1, 'ПРОКЛАДКА КАБЕЛЯ', 'М', 100), mat(11, 1, 'КАБЕЛЬ ВВГ', 'М', -20)];
    expect(bogOl(rows, 11)).toMatchObject({ ishonch: 'shubhali', sabab: 'ishora_farqli', k_norm: null });
    expect(tekshir(rows, h([[10, 100], [11, -5]]))).toEqual([]);
    const ikki = [rz(1), bl(10, 1, 'ПРОКЛАДКА КАБЕЛЯ', 'М', -100), mat(11, 1, 'КАБЕЛЬ ВВГ', 'М', -102, 20_000)];
    expect(bogOl(ikki, 11)).toMatchObject({ ishonch: 'ishonchli', sinf: 'B' });
    expect(tekshir(ikki, h([[10, -100], [11, -102]]))).toEqual([]);
    expect(tekshir(ikki, h([[10, -100], [11, -90]]))[0]).toMatchObject({ daraja: 'xato' });
  });

  it('tuzilma (ota = ish) — ishonchli; qo\'shimcha material bog\'lanmaydi; egasi qarori ustun', () => {
    const rows = [
      rz(1), bl(10, 1, 'УСТРОЙСТВО ГИДРОИЗОЛЯЦИИ', 'М2', 100), mat(11, 10, 'МАСТИКА БИТУМНАЯ', 'Т', 0.2),
      mat(12, 1, 'ГИДРОИЗОЛЯЦИЯ РУЛОННАЯ', 'М2', 115), mat(13, 1, 'ЛЕНТА', 'М', 5, 100, { qoshimcha: true }),
    ];
    expect(bogOl(rows, 11)).toMatchObject({ bl_id: 10, ishonch: 'ishonchli', sabab: 'tuzilma' });
    expect(bogOl(rows, 13)).toMatchObject({ ishonch: 'boglanmaydi', sabab: 'qoshimcha' });
    expect(bogOl(rows, 12, [{ mat_id: 12, tur: 'boglanmaydi' }])).toMatchObject({ ishonch: 'boglanmaydi', sabab: 'qaror_boglanmaydi' });
    expect(tekshir(rows, h([[10, 100], [11, 0.2], [12, 50]]), [{ mat_id: 12, tur: 'normal' }])).toEqual([]);
    expect(tekshir(rows, h([[10, 100], [11, 0.2], [12, 50]]))[0]).toMatchObject({ mat_id: 12, daraja: 'xato', sinf: 'B' });
  });
});

const DIR = process.env.ISH_MATERIAL_DIR;
describe.skipIf(!DIR)('ish–material — lokal baholash (repoda ma\'lumot yo\'q)', () => {
  it('har fayl bo\'yicha signallar hisoboti', () => {
    const fayllar = fs.readdirSync(DIR!).filter((n) => n.endsWith('.json')).sort();
    let yolgon = 0; let topildi = 0; let jami = 0;
    for (const n of fayllar) {
      const d = JSON.parse(fs.readFileSync(path.join(DIR!, n), 'utf8')) as {
        qatorlar: IshMatQator[]; holat: [number, IshMatHolat][]; qarorlar?: IshMatQaror[]; kutilgan?: { mat_id: number; daraja: string }[];
      };
      const s = tekshir(d.qatorlar, new Map(d.holat), d.qarorlar ?? []);
      const kut = new Set((d.kutilgan ?? []).map((k) => k.mat_id));
      const ushlangan = s.filter((x) => x.mat_idlar.some((id) => kut.has(id))).length;
      jami += kut.size; topildi += ushlangan; if (d.kutilgan) yolgon += s.length - ushlangan;
      console.log(`${n}: signal ${s.length} (xato ${s.filter((x) => x.daraja === 'xato').length}), kutilgan ${kut.size}, ushlangan ${ushlangan}`);
    }
    console.log(`JAMI: kutilgan ${jami}, ushlangan ${topildi}, ortiqcha ${yolgon}`);
    expect(fayllar.length).toBeGreaterThan(0);
  });
});
