import { describe, expect, it } from 'vitest';
import { kitobAnatomiyasi } from '../../lib/smeta-anatomiya';
import { smetaDaraxtniYoy } from '../../lib/smeta-flatten';
import { bargKategoriyasi, daraxtKategoriyaNomzodlari, kitobVaraqTeglari, narxTaklifiniTop, obKodTaklifi, resKategoriyaNomzodlariniOl, hujjatKategoriyalariniBelgila, bolakniQaytaUrinibYubor, paketImportFayllariniSarala, spreadsheetReadError, resSatrlariniOl, resNarxIndeksiQur, narxlarniDaraxtgaQoll, katTaxmini, varaqTuriTaxmin, resBolimKategoriya, resursMkKabAniqla, podvalBlokTuri, tanlanganResManbalariniYig, tanlanganLrvVaraqlaridanDaraxtQur, lokallarBoyichaNarxla, resLokallargaBol } from './SmetaYuklaNative';
import type { AktNode } from '../../lib/f2-match-engine';
import type { F2ColumnConfig } from '../../lib/f2-import-parse';

const cols: F2ColumnConfig = { kod: 0, nom: 1, bir: 2, norma: -1, obyom: -1, narx: 3, sum: -1 };

describe('RES (resursniy vedomost) narx moslashtirish', () => {
  it('kod, nom va birlik ustunlaridan narx katalogini quradi', () => {
    const rows = [
      ['B25', 'Beton B25', 'm3', '500000'],
      ['', 'Armatura', 'kg', '12000,5'],
      ['1', '2', '3', '4'], // ustun-raqamlash qatori -- rad etiladi
      ['', '', '', ''],
    ];
    const satrlar = resSatrlariniOl(rows, cols);
    expect(satrlar).toEqual([
      { kod: 'B25', nom: 'Beton B25', birlik: 'm3', narx: 500000 },
      { kod: undefined, nom: 'Armatura', birlik: 'kg', narx: 12000.5 },
    ]);
  });

  it('nom+birlik asosiy kalit, kod bo‘lsa qo‘shimcha aniqlashtirish sifatida ham indekslanadi', () => {
    const idx = resNarxIndeksiQur([
      { kod: 'B25', nom: 'Beton B25', birlik: 'm3', narx: 500000 },
      { nom: 'Armatura', birlik: 'kg', narx: 12000 },
    ]);
    expect(idx.byNomBir.get('BETONB25|M3')).toBe(500000);
    expect(idx.byKodNomBir.get('B25|BETONB25|M3')).toBe(500000);
    expect(idx.byNomBir.get('ARMATURA|KG')).toBe(12000);
  });

  /* ⚠️ Haqiqiy falokat, egasining "Karting2" obyektida (980+ mlrd so'm
     xato smeta) tasdiqlangan: egasining haqiqiy Drive faylida (Karting_
     LRV_PLUS) `kod='С'` 388 xil, bir-biriga aloqasi yo'q materialda
     takrorlangan -- T1 dagi meros konventsiya, xato emas. `kod`ni birinchi
     ustuvor sifatida ishlatish bitta tasodifiy narxni o'sha kodga ega
     BARCHA boshqa materiallarga yopishtirib chiqargan. Bu test aynan shu
     ssenariyni qayta hosil qiladi va har bir material o'z HAQIQIY (nom
     bo‘yicha) narxini olishini tasdiqlaydi -- kodning umumiyligidan
     qat'i nazar. */
  it('T1dagi umumiy/noyob bo‘lmagan kod (masalan bitta harfli "С") turli materiallarni bir-biriga ARALASHTIRMAYDI', () => {
    const idx = resNarxIndeksiQur([
      { kod: 'С', nom: 'САМОСВЕРЛЯЮЩИЙ ШУРУП 250 ММ', birlik: 'ШТ', narx: 450 },
      { kod: 'С', nom: 'АРМАТУРА КЛАССА АIII ДИАМЕТРОМ 12 ММ', birlik: 'КГ', narx: 8295844 },
    ]);
    const tree: AktNode[] = [
      { uid: '1', type: 'rs', kod: 'С', nom: 'САМОСВЕРЛЯЮЩИЙ ШУРУП 250 ММ', bir: 'ШТ', hajm: 70140 },
      { uid: '2', type: 'rs', kod: 'С', nom: 'АРМАТУРА КЛАССА АIII ДИАМЕТРОМ 12 ММ', bir: 'КГ', hajm: 10 },
    ];
    const { tree: out, mosSoni, mosEmasSoni } = narxlarniDaraxtgaQoll(tree, idx);
    expect(out[0].narx).toBe(450); // shuruplarga faqat shuruplarning narxi
    expect(out[0].summa).toBe(31563000);
    expect(out[1].narx).toBe(8295844); // armaturaga faqat armaturaning narxi
    expect(mosSoni).toBe(2);
    expect(mosEmasSoni).toBe(0);
  });

  it('LRV daraxtidagi narxsiz rs bargiga RES narxini qo‘llaydi va summa=hajm*narx hisoblaydi', () => {
    const tree: AktNode[] = [{
      uid: '1', type: 'rz', nom: 'Fundament', children: [{
        uid: '2', type: 'bl', nom: 'Beton ishlari', children: [
          { uid: '3', type: 'rs', kod: 'B25', nom: 'Beton B25', bir: 'm3', hajm: 10 },
        ],
      }],
    }];
    const idx = resNarxIndeksiQur([{ kod: 'B25', nom: 'Beton B25', birlik: 'm3', narx: 500000 }]);
    const { tree: out, mosSoni, mosEmasSoni } = narxlarniDaraxtgaQoll(tree, idx);
    const rs = out[0].children![0].children![0];
    expect(rs.narx).toBe(500000);
    expect(rs.summa).toBe(5000000);
    expect(mosSoni).toBe(1);
    expect(mosEmasSoni).toBe(0);
  });

  it('LRV faylida allaqachon narx bor bargni ustidan yozmaydi', () => {
    const tree: AktNode[] = [{
      uid: '1', type: 'rs', kod: 'B25', nom: 'Beton B25', bir: 'm3', hajm: 10, narx: 1, summa: 10,
    }];
    const idx = resNarxIndeksiQur([{ kod: 'B25', nom: 'Beton B25', birlik: 'm3', narx: 999999 }]);
    const { tree: out } = narxlarniDaraxtgaQoll(tree, idx);
    expect(out[0].narx).toBe(1);
    expect(out[0].summa).toBe(10);
  });

  it('mos kelmagan bargni jim narxsiz qoldiradi, taxmin qilmaydi', () => {
    const tree: AktNode[] = [{ uid: '1', type: 'rs', kod: 'YOQ', nom: 'Nomalum', bir: 'dona', hajm: 5 }];
    const { tree: out, mosSoni, mosEmasSoni } = narxlarniDaraxtgaQoll(tree, resNarxIndeksiQur([]));
    expect(out[0].narx).toBeUndefined();
    expect(mosSoni).toBe(0);
    expect(mosEmasSoni).toBe(1);
  });

  /* ⚠️ Haqiqiy nosozlik, obyekt 26 («Fast Food 1etaj») da tasdiqlangan:
     narxsiz LRV faylida narx ustuni bo'sh emas, 0 bo'lib keladi. Avvalgi
     shart (`narx != null`) tufayli bunday barglar «allaqachon narxlangan»
     deb butunlay tashlab ketilardi -- ekranda «0 ta mos, 0 ta narxsiz
     qoldi» (ikkala hisoblagich ham nol), smeta esa narx=0 bilan yozilardi. */
  it('narx=0 bo‘lgan bargni «narxsiz» deb hisoblaydi va RES narxini qo‘llaydi', () => {
    const tree: AktNode[] = [
      { uid: '1', type: 'rs', kod: '1', nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', bir: 'ЧЕЛ.-Ч', hajm: 9.3139, narx: 0, summa: 0 },
    ];
    const idx = resNarxIndeksiQur([{ kod: '1', nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', birlik: 'ЧЕЛ.-Ч', narx: 20000 }]);
    const { tree: out, mosSoni, mosEmasSoni } = narxlarniDaraxtgaQoll(tree, idx);
    expect(out[0].narx).toBe(20000);
    expect(out[0].summa).toBe(186278);
    expect(mosSoni).toBe(1);
    expect(mosEmasSoni).toBe(0);
  });

  /* ⭐⭐ Owner (2026-09-10), Stella obyekti: «primoy zatrati 6mlrd 250mln ga
     yaqin summa edi ... nimadir xato yoki narxlanmay qolayotgan narsalar
     bor». Tizim 5.04 mlrd ko'rsatardi; 319 qator narxsiz qolgan edi.

     Ildiz sabab, egasining Drive'dagi MANBA faylidan tasdiqlangan
     («Copy of Стелла 26.12.2025г 1кв 2025.xlsx»): RES bo'limida nom
     «ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ С УЧЕТОМ СОЦСТРАХА», ЧЕЛ-Ч,
     narx 24 517.700 -- LRV'da esa o'sha qator «ЗАТРАТЫ ТРУДА
     РАБОЧИХ-СТРОИТЕЛЕЙ» deb yozilgan (suffikssiz). Hajmi bir xil:
     43 647.501. Nom bo'yicha moslash topa olmagan.

     Egasining yechimi: «eng oson yo'li mash Chas va chel Chas
     birliklaridan topish ... resdan chel Chas qidiriladi topiladi hamma
     chel Chas lrv da narxlanadi ... bunda zatrat truda mashinist
     narxlanmaydi chunki u mash chasda hisoblangan bo'ladi». */
  describe('Stella: birlik bo‘yicha narx topish (ЧЕЛ-Ч / МАШ-Ч)', () => {
    const resStella = [
      { nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ С УЧЕТОМ СОЦСТРАХА', birlik: 'ЧЕЛ-Ч', narx: 24517.7 },
      { nom: 'АВТОПОГРУЗЧИКИ 5 Т', birlik: 'МАШ-Ч', narx: 148613 },
      { nom: 'КРАНЫ НА АВТОМОБИЛЬНОМ ХОДУ 16 Т', birlik: 'МАШ-Ч', narx: 244250 },
      { nom: 'КРАНЫ НА АВТОМОБИЛЬНОМ ХОДУ 10 Т', birlik: 'МАШ-Ч', narx: 210000 },
    ];

    it('nomi boshqacha yozilgan ishchi soatini ЧЕЛ-Ч birligidan topadi', () => {
      // hajm bazadagi aniq qiymat (t2_qator, obyekt 71 bo'yicha jami)
      const hajm = 43647.5011696;
      const tree: AktNode[] = [
        { uid: '1', type: 'rs', kod: '1', nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', bir: 'ЧЕЛ-Ч', hajm, narx: 0 },
      ];
      const { tree: out, mosSoni } = narxlarniDaraxtgaQoll(tree, resNarxIndeksiQur(resStella));
      expect(out[0].narx).toBe(24517.7);
      expect(out[0].summa).toBe(Math.round(hajm * 24517.7 * 100) / 100);
      // T1 shu qator uchun 1 070 136 339 so'm ko'rsatadi -- 1 so'mgacha mos
      expect(out[0].summa).toBeCloseTo(1070136339, -1);
      expect(mosSoni).toBe(1);
    });

    it('mashinist mehnatini ATAYLAB narxlamaydi — u МАШ-Ч stavkasi ichida', () => {
      const tree: AktNode[] = [
        { uid: '2', type: 'rs', kod: '3', nom: 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', bir: 'ЧЕЛ-Ч', hajm: 3938.03, narx: 0 },
      ];
      const { tree: out, narxsizlar } = narxlarniDaraxtgaQoll(tree, resNarxIndeksiQur(resStella));
      expect(out[0].narx).toBe(0);   // qator o'zgarmadi -- narxi 0 bo'lib qoladi
      expect(narxsizlar[0].sabab).toBe('mashinist_normativ');
    });

    it('МАШ-Ч da nomning o‘rtasidagi qo‘shimcha matnni kechiradi, SONI bo‘yicha ajratadi', () => {
      const tree: AktNode[] = [
        { uid: '3', type: 'rs', nom: 'КРАНЫ НА АВТОМОБИЛЬНОМ ХОДУ ПРИ РАБОТЕ НА ДРУГИХ ВИДАХ СТРОИТЕЛЬСТВА (КРОМЕ МАГИСТРАЛЬНЫХ ТРУБОПРОВОДОВ) 16 Т', bir: 'МАШ-Ч', hajm: 2, narx: 0 },
      ];
      const { tree: out } = narxlarniDaraxtgaQoll(tree, resNarxIndeksiQur(resStella));
      expect(out[0].narx).toBe(244250); // 16 Т -- 10 Т bilan aralashmadi
    });

    it('sonlari boshqa mashinani MOSLAMAYDI (16 Т ≠ 25 Т)', () => {
      const tree: AktNode[] = [
        { uid: '4', type: 'rs', nom: 'КРАНЫ НА АВТОМОБИЛЬНОМ ХОДУ 25 Т', bir: 'МАШ-Ч', hajm: 1, narx: 0 },
      ];
      const { tree: out, narxsizlar } = narxlarniDaraxtgaQoll(tree, resNarxIndeksiQur(resStella));
      expect(out[0].narx).toBe(0);
      expect(narxsizlar[0].sabab).toBe('res_da_yoq');
    });

    it('qavs va tinish belgilari farqi narx topishga XALAQIT BERMAYDI', () => {
      const idx = resNarxIndeksiQur([
        { nom: 'АВТОГРЕЙДЕРЫ СРЕДНЕГО ТИПА 99 (135) КВТ (Л.С.)', birlik: 'МАШ-Ч', narx: 319423 },
      ]);
      const tree: AktNode[] = [
        { uid: '5', type: 'rs', nom: 'АВТОГРЕЙДЕРЫ СРЕДНЕГО ТИПА 99/135 КВТ Л.С.', bir: 'МАШ-Ч', hajm: 1, narx: 0 },
      ];
      expect(narxlarniDaraxtgaQoll(tree, idx).tree[0].narx).toBe(319423);
    });
  });

  /* Owner (2026-09-10): «yuklanish tugaganidan keyin narxlanmagan rs mat ob
     kabi har bir qatorlarni bildirishi va sababini keltirib bera olishi
     kerak». Avval faqat SON qaytarardi -- qaysi qator va nega ekani
     ko'rinmasdi. */
  it('narxsiz qolgan har bir qatorni SABABI bilan qaytaradi', () => {
    const tree: AktNode[] = [
      { uid: '1', type: 'rs', kod: 'B25', nom: 'БЕТОН ТЯЖЕЛЫЙ', bir: 'М3', hajm: 2 },
      { uid: '2', type: 'rs', kod: 'B25', nom: 'БЕТОН ТЯЖЕЛЫЙ', bir: 'ТОННА', hajm: 3 },
      { uid: '3', type: 'rs', kod: 'X', nom: 'НЕИЗВЕСТНЫЙ РЕСУРС', bir: 'ШТ', hajm: 1 },
      { uid: '4', type: 'rs', kod: 'Y', nom: '', bir: 'ШТ', hajm: 1 },
    ];
    const idx = resNarxIndeksiQur([{ kod: 'B25', nom: 'БЕТОН ТЯЖЕЛЫЙ', birlik: 'М3', narx: 500000 }]);
    const { mosSoni, narxsizlar } = narxlarniDaraxtgaQoll(tree, idx);

    expect(mosSoni).toBe(1);
    expect(narxsizlar.map(r => [r.uid, r.sabab])).toEqual([
      ['2', 'birlik_mos_emas'],   // nom RESda bor, birligi boshqa
      ['3', 'res_da_yoq'],        // bunday nom umuman yo'q
      ['4', 'nomsiz'],            // nom bo'sh
    ]);
  });

  it('RES umuman bo‘sh bo‘lsa sabab «res_yuklanmagan» bo‘ladi', () => {
    const tree: AktNode[] = [{ uid: '1', type: 'rs', kod: 'B25', nom: 'БЕТОН', bir: 'М3', hajm: 2 }];
    const { narxsizlar } = narxlarniDaraxtgaQoll(tree, resNarxIndeksiQur([]));
    expect(narxsizlar).toEqual([
      { uid: '1', kod: 'B25', nom: 'БЕТОН', bir: 'М3', hajm: 2, sabab: 'res_yuklanmagan' },
    ]);
  });

  it('narx=0 va mos kelmasa -- «narxsiz qoldi» deb SANAYDI (jim o‘tkazib yubormaydi)', () => {
    const tree: AktNode[] = [{ uid: '1', type: 'rs', kod: 'YOQ', nom: 'Nomalum', bir: 'dona', hajm: 5, narx: 0 }];
    const { mosSoni, mosEmasSoni } = narxlarniDaraxtgaQoll(tree, resNarxIndeksiQur([]));
    expect(mosSoni).toBe(0);
    expect(mosEmasSoni).toBe(1);
  });

  /* Ikki mustaqil Excel hujjati bir resursni bir xil yozmaydi -- kalit
     registr/bo'sh joy/tinish belgisi/«ё»/«м³» farqlariga bardosh berishi
     kerak (bazadagi t2_resurs_nom_kalit bilan bir xil g'oya). */
  it('kalit registr, bo‘sh joy, nuqta, «Ё» va «м³» farqlariga qaramay moslaydi', () => {
    const tree: AktNode[] = [
      { uid: '1', type: 'rs', nom: '  бетон   тяжёлый  ', bir: 'м³', hajm: 2 },
      { uid: '2', type: 'rs', nom: 'ЗАТРАТЫ ТРУДА', bir: 'ЧЕЛ.-Ч', hajm: 3 },
    ];
    const idx = resNarxIndeksiQur([
      { nom: 'БЕТОН ТЯЖЕЛЫЙ', birlik: 'М3', narx: 700000 },
      { nom: 'Затраты труда', birlik: 'чел-ч', narx: 25000 },
    ]);
    const { tree: out, mosSoni, mosEmasSoni } = narxlarniDaraxtgaQoll(tree, idx);
    expect(out[0].narx).toBe(700000);
    expect(out[1].narx).toBe(25000);
    expect(mosSoni).toBe(2);
    expect(mosEmasSoni).toBe(0);
  });
});

/* Bu blokdagi ma'lumot egasining Drive'idagi HAQIQIY RES fayllaridan
   olingan (Navoiy KL-10 kV va Karting loyihalari) -- bo'lim sarlavhalari,
   ularning ketma-ketligi va ИТОГО qatorlari aynan o'sha ko'rinishda. */
describe('RES bo‘lim sarlavhalari — МАТ/ОБ/КАБ/М-К ni ajratish', () => {
  it('haqiqiy RES sarlavhalarini kategoriyaga o‘giradi', () => {
    expect(resBolimKategoriya('ТРУДОВЫЕ РЕСУРСЫ')).toBe('ЧЕЛ');
    expect(resBolimKategoriya('СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ')).toBe('МАШ');
    expect(resBolimKategoriya('МАТЕРИАЛЬНЫЕ РЕСУРСЫ')).toBe('МАТ');
    expect(resBolimKategoriya('КОНСТРУКЦИИ ЗАВОДСКОГО ИЗГОТОВЛЕНИЯ')).toBe('М/К');
    expect(resBolimKategoriya('ОБОРУДОВАНИЕ')).toBe('ОБ');
  });

  it('ИТОГО/ЖАМИ/ВСЕГО bo‘limni yopadi', () => {
    expect(resBolimKategoriya('ИТОГО ПО СТРОИТЕЛЬНЫМ МАТЕРИАЛАМ:')).toBe('YAKUN');
    expect(resBolimKategoriya('ИТОГО ОБОРУДОВАНИЕ:')).toBe('YAKUN');
    expect(resBolimKategoriya('ЖАМИ')).toBe('YAKUN');
  });

  it('oddiy resurs nomi sarlavha deb qabul qilinmaydi', () => {
    expect(resBolimKategoriya('КИРПИЧ')).toBeNull();
    expect(resBolimKategoriya('ПЕСОК')).toBeNull();
    expect(resBolimKategoriya('ШЛИФКРУГИ')).toBeNull();
  });

  /* Owner (2026-09-10): «nima uchundir shu narsalarni mk deb o'ylayapdida» --
     БЕТОН/ПЕСОК/РАСТВОР/ЩЕБЕНЬ/ПРОВОД М/К bo'lib chiqqan edi. Bu nomlar
     Karting RES faylidan AYNAN olingan: ular ichida «КОНСТРУКЦИИ» so'zi
     bor, va eski `includes()` mantiqi ularni bo'lim sarlavhasi deb
     o'qirdi. Sarlavha emas -- RESURS. */
  it('nomida «КОНСТРУКЦИИ» bo‘lgan RESURS qatori sarlavha deb o‘qilmaydi', () => {
    expect(resBolimKategoriya('КОНСТРУКЦИИ СТАЛЬНЫЕ ПО ПРОЕКТУ')).toBeNull();
    expect(resBolimKategoriya('КОНСТРУКЦИИ 6Х19(1+6+12)+1 О.С. ОЦИНКОВАННЫЙ')).toBeNull();
    expect(resBolimKategoriya('АРМАТУРА ДЛЯ МОНОЛИТНЫХ ЖЕЛЕЗОБЕТОННЫХ КОНСТРУКЦИЙ В ВИДЕ СЕТОК И ПЛОСКИХ КАРКАСОВ')).toBeNull();
    expect(resBolimKategoriya('ПРОКАТ ДЛЯ АРМИРОВАНИЯ Ж/Б КОНСТРУКЦИЙ КРУГЛЫЙ И ПЕРИОДИЧЕСКОГО ПРОФИЛЯ')).toBeNull();
    expect(resBolimKategoriya('АГРЕГАТЫ ОКРАСОЧНЫЕ ВЫСОКОГО ДАВЛЕНИЯ ДЛЯ ОКРАСКИ ПОВЕРХНОСТЕЙ КОНСТРУКЦИЙ МОЩНОСТЬЮ 1 КВТ')).toBeNull();
  });

  /* Owner (2026-09-10), aynan matni: «haqiqiy mk bu tayyor konstruksiya kg
     yoki tonnada belgilanadigan narsaga aytiladi. kabel provod ham shunaqa
     … shu oilaga kiruvchi metr yoki km da berilgan narsalarga aytiladi».
     Va ogohlantirishi: «armatura balo battar hamma prokatlar mk ga kirib
     ketadi. Bunaqa vaziyatda noto'g'ri bo'ladi.» Quyidagi nomlar egasining
     ekranidan va Karting RES faylidan AYNAN ko'chirilgan. */
  describe('М/К va КАБ — tayyor konstruksiya (кг/т) va kabel oilasi', () => {
    it('tayyor konstruksiyani og‘irlik birligi bilan М/К deb belgilaydi', () => {
      expect(resursMkKabAniqla('КОНСТРУКЦИИ СТАЛЬНЫЕ ПО ПРОЕКТУ', 'Т', 'МАТ')).toBe('М/К');
      expect(resursMkKabAniqla('КОНСТРУКЦИИ ИНДИВИДУАЛЬНЫЕ РЕШЕТЧАТЫЕ СВАРНЫЕ ИЗ СТАЛИ МЕЛКИХ ПРОФИЛЕЙ МАССА, ДО 0,1Т', 'Т', 'МАТ')).toBe('М/К');
      expect(resursMkKabAniqla('ОТДЕЛЬНЫЕ КОНСТРУКТИВНЫЕ ЭЛЕМЕНТЫ ЗДАНИЙ И СООРУЖЕНИЙ С ПРЕОБЛАДАНИЕМ ГОРЯЧЕКАТАНЫХ ПРОФИЛЕЙ', 'Т', 'МАТ')).toBe('М/К');
      expect(resursMkKabAniqla('МЕТАЛЛОКОНСТРУКЦИИ ОПОРНЫЕ', 'КГ', 'МАТ')).toBe('М/К');
    });

    it('armatura va prokatni М/К ga TORTMAYDI — ular konstruksiya uchun xomashyo', () => {
      expect(resursMkKabAniqla('АРМАТУРА ДЛЯ МОНОЛИТНЫХ ЖЕЛЕЗОБЕТОННЫХ КОНСТРУКЦИЙ В ВИДЕ СЕТОК И ПЛОСКИХ КАРКАСОВ, ПЕРИОДИЧЕСКОГО ПРОФИЛЯ КЛАССА АIII, ДИАМТЕРОМ 12 ММ', 'Т', 'МАТ')).toBe('МАТ');
      expect(resursMkKabAniqla('ПРОКАТ ДЛЯ АРМИРОВАНИЯ Ж/Б КОНСТРУКЦИЙ КРУГЛЫЙ И ПЕРИОДИЧЕСКОГО ПРОФИЛЯ', 'Т', 'МАТ')).toBe('МАТ');
      expect(resursMkKabAniqla('КАТАНКА ГОРЯЧЕКАТАНАЯ В МОТКАХ ДИАМЕТРОМ 6,3-6,5 ММ', 'Т', 'МАТ')).toBe('МАТ');
    });

    it('kabel/provod oilasini КАБ deb belgilaydi, birligidan qat‘i nazar', () => {
      expect(resursMkKabAniqla('ПРОВОД', 'М', 'МАТ')).toBe('КАБ');
      expect(resursMkKabAniqla('ПРОВОДА ДЛЯ ВОЗДУШНЫХ ЛИНИЙ ЭЛЕКТРОПЕРЕДАЧИ МЕДНЫЕ МАРКИ М СЕЧ. 4 ММ2', 'Т', 'МАТ')).toBe('КАБ');
      expect(resursMkKabAniqla('КАБЕЛЬ СИЛОВОЙ С МЕДНЫМИ ЖИЛАМИ', 'КМ', 'МАТ')).toBe('КАБ');
    });

    it('«ПРОВОЛОКА» kabel emas — u bog‘lash simi, МАТ bo‘lib qoladi', () => {
      expect(resursMkKabAniqla('ПРОВОЛОКА СВЕТЛАЯ ДИАМЕТРОМ 1,1 ММ', 'Т', 'МАТ')).toBe('МАТ');
    });

    it('egasining ekranidagi 23 tadan oddiy materiallari МАТ bo‘lib qoladi', () => {
      for (const [nom, bir] of [
        ['БЕТОН ТЯЖЕЛЫЙ КЛАССА В12,5 /М-150/ ФРАКЦИИ 5-20ММ', 'М3'],
        ['ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ', 'М3'],
        ['РАСТВОР ГОТОВЫЙ КЛАДОЧНЫЙ ЦЕМЕНТНЫЙ, МАРКА 50', 'М3'],
        ['ЩЕБЕНЬ', 'М3'],
        ['СМЕСЬ ПЕСЧАНО-ГРАВИЙНАЯ ПРИРОДНАЯ', 'М3'],
        ['СМЕСЬ АСФАЛЬТОБЕТОННАЯ', 'Т'],
        ['СТЕКЛОЛЕНТА ЛИПКАЯ ИЗОЛЯЦИОННАЯ НА ПОЛИКАСИНОВОМ КОМПАУНДЕ МАРКИ ЛСЭПЛ', 'КГ'],
      ] as const) {
        expect(resursMkKabAniqla(nom, bir, 'МАТ')).toBe('МАТ');
      }
    });
  });

  /* ⭐ Owner (2026-09-10): «resurs vedemost da exell da ham saytni o'zidagi
     bo'limida ham ob ajratilmasdan materialga aralashtirib tashlanayapdiku».
     Egasining Stella faylida (obyekt 72) bazada ОБ kategoriyasi UMUMAN
     yo'q edi -- 127 mat + 409 rs qatorining hammasi МАТ.

     Ikki sabab, ikkalasi ham fayldan aynan tasdiqlangan:
       1) bo'lim «СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ» deb nomlangan --
          eski naqsh «…МАТЕРИАЛЫ$» bilan tugashini talab qilardi;
       2) oborudovaniye ALOHIDA VARAQDA, ustida sarlavha YO'Q -- uni faqat
          podvaldagi nakrutka foizlari ajratadi:
            ОБ  : «ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ=1,2%» + «ТРАНСПОРТНЫЕ УСЛУГИ=2%»
            МАТ : «ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ =2% И М/К=0,75%» + «…=5%» */
  /* ⭐ Owner (2026-09-10): «bu yana adashayapdida jigar kategoriya topishda.
     mash chas aniqku bazilarida mat deb tashlagan, yaxshi ishlaydigan qilib
     ber». Ekranida 70+ mashina va ishchi soati МАТ bo'lib chiqqan edi.

     Sabab AYNAN shu sessiyada kiritilgan podval qoidasi edi: bo'lim
     sarlavhalari o'qilmay qolgan blokda material podvali uchraganda
     orqaga belgilash BUTUN blokni МАТ qilib qo'ygan -- ЧЕЛ-Ч va МАШ-Ч
     qatorlarni ham. Endi birlik eng ustun va uni hech narsa bosmaydi. */
  describe('birlik eng ustun — ЧЕЛ-Ч/МАШ-Ч hech qachon МАТ bo‘lmaydi', () => {
    it('birlik bo‘yicha kategoriya bo‘lim va podvaldan kuchliroq', () => {
      expect(resursMkKabAniqla('АВТОПОГРУЗЧИКИ 5 Т', 'МАШ-Ч', 'МАТ')).toBe('МАШ');
      expect(resursMkKabAniqla('ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ С УЧЕТОМ СОЦСТРАХА', 'ЧЕЛ-Ч', 'МАТ')).toBe('ЧЕЛ');
      expect(resursMkKabAniqla('ЗАТРАТЫ ТРУДА МАШИНИСТОВ', 'ЧЕЛ-Ч', 'МАТ')).toBe('МАШ');
      // «МАШ.-Ч», «чел-час» kabi yozilishlar ham
      expect(resursMkKabAniqla('ВИБРАТОРЫ ГЛУБИННЫЕ', 'МАШ.-Ч', undefined)).toBe('МАШ');
    });

    it('sarlavhasiz blokda material podvali mashinalarni МАТ ga TORTMAYDI', () => {
      const cols = { kod: -1, nom: 0, bir: 1, norma: -1, obyom: -1, narx: 2, sum: -1 };
      const rows = [
        ['ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ С УЧЕТОМ СОЦСТРАХА', 'ЧЕЛ-Ч', '24517.7'],
        ['АВТОПОГРУЗЧИКИ 5 Т', 'МАШ-Ч', '148613'],
        ['КРАНЫ НА АВТОМОБИЛЬНОМ ХОДУ 16 Т', 'МАШ-Ч', '244250'],
        ['ЩЕБЕНЬ', 'М3', '75000'],
        ['ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ =2% И М/К=0,75%', 'СУМ', ''],
      ];
      expect(resSatrlariniOl(rows, cols).map(r => [r.nom, r.kat])).toEqual([
        ['ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ С УЧЕТОМ СОЦСТРАХА', 'ЧЕЛ'],
        ['АВТОПОГРУЗЧИКИ 5 Т', 'МАШ'],
        ['КРАНЫ НА АВТОМОБИЛЬНОМ ХОДУ 16 Т', 'МАШ'],
        ['ЩЕБЕНЬ', 'МАТ'],
      ]);
    });

    it('oborudovaniye podvali ham mashinalarni ОБ ga o‘tkazmaydi', () => {
      const cols = { kod: -1, nom: 0, bir: 1, norma: -1, obyom: -1, narx: 2, sum: -1 };
      const rows = [
        ['ЭЛЕКТРОСТАНЦИИ ПЕРЕДВИЖНЫЕ 2 КВТ', 'МАШ-Ч', '50000'],
        ['ОПТИЧЕСКИЙ ПАТЧ ПАНЕЛЬ 24 ПОРТА', 'ШТ', '325893'],
        ['ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ=1,2%', 'СУМ', ''],
      ];
      expect(resSatrlariniOl(rows, cols).map(r => r.kat)).toEqual(['МАШ', 'ОБ']);
    });
  });

  describe('ОБ ni МАТ dan ajratish', () => {
    it('«СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ» bo‘limini МАТ deb taniydi', () => {
      expect(resBolimKategoriya('СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ')).toBe('МАТ');
      expect(resBolimKategoriya('МАТЕРИАЛЬНЫЕ РЕСУРСЫ И КОНСТРУКЦИИ')).toBe('МАТ');
      expect(resBolimKategoriya('ОБОРУДОВАНИЕ И ИНВЕНТАРЬ')).toBe('ОБ');
    });

    it('podval foizidan blok turini aniqlaydi', () => {
      expect(podvalBlokTuri('ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ=1,2%')).toBe('ОБ');
      expect(podvalBlokTuri('ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ =2% И М/К=0,75%')).toBe('МАТ');
      expect(podvalBlokTuri('ТРАНСПОРТНЫЕ УСЛУГИ=2%')).toBeNull();  // bu ajratmaydi
      expect(podvalBlokTuri('ЩЕБЕНЬ')).toBeNull();
    });

    it('sarlavhasiz oborudovaniye blokini podvaliga qarab ОБ ga o‘tkazadi', () => {
      const cols = { kod: -1, nom: 0, bir: 1, norma: -1, obyom: -1, narx: 2, sum: -1 };
      const rows = [
        ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ', '', ''],
        ['ЩЕБЕНЬ', 'М3', '75000'],
        ['ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ =2% И М/К=0,75%', 'СУМ', ''],
        // sarlavhasiz blok -- faqat podvali ОБ ekanini aytadi
        ['ОПТИЧЕСКИЙ ПАТЧ ПАНЕЛЬ 24 ПОРТА RJ-45', 'ШТ', '325893'],
        ['ШКАФ ТЕЛЕКОММУНИКАЦИОННЫЙ 19"', 'ШТ', '412500'],
        ['ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ=1,2%', 'СУМ', ''],
      ];
      const out = resSatrlariniOl(rows, cols);
      expect(out.map(r => [r.nom, r.kat])).toEqual([
        ['ЩЕБЕНЬ', 'МАТ'],
        ['ОПТИЧЕСКИЙ ПАТЧ ПАНЕЛЬ 24 ПОРТА RJ-45', 'ОБ'],
        ['ШКАФ ТЕЛЕКОММУНИКАЦИОННЫЙ 19"', 'ОБ'],
      ]);
    });

    it('nom/birlik qoidasidan kelgan КАБ va М/К ni podval BUZMAYDI', () => {
      const cols = { kod: -1, nom: 0, bir: 1, norma: -1, obyom: -1, narx: 2, sum: -1 };
      const rows = [
        ['КАБЕЛЬ СИЛОВОЙ', 'М', '123956'],
        ['КОНСТРУКЦИИ СТАЛЬНЫЕ ПО ПРОЕКТУ', 'Т', '9000000'],
        ['ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ=1,2%', 'СУМ', ''],
      ];
      const out = resSatrlariniOl(rows, cols);
      expect(out.map(r => r.kat)).toEqual(['КАБ', 'М/К']);
    });
  });

  it('«КОНСТРУКЦИИ …» nomli narxsiz resurs keyingi materiallarni М/К ga o‘tkazib yubormaydi', () => {
    const cols = { kod: 0, nom: 1, bir: 2, norma: -1, obyom: -1, narx: 3, sum: -1 };
    const rows = [
      ['', 'МАТЕРИАЛЬНЫЕ РЕСУРСЫ', '', ''],
      ['С', 'КОНСТРУКЦИИ СТАЛЬНЫЕ ПО ПРОЕКТУ', 'Т', ''],   // narxi to'ldirilmagan RESURS
      ['6322', 'БЕТОН ТЯЖЕЛЫЙ КЛАССА В15 /М-200/', 'М3', '525672'],
      ['43113', 'ЩЕБЕНЬ', 'М3', '75000'],
      ['9219', 'ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ', 'М3', '1850'],
    ];
    const out = resSatrlariniOl(rows, cols);
    // Beton — БЕЗСКЛАД (egasi Q1; bez-sklad.ts kirill so'z chegarasi tuzatilgach), lekin М/К emas.
    expect(out.map((r) => r.kat)).toEqual(['БЕЗСКЛАД', 'МАТ', 'МАТ']);
  });

  /* ⭐ Asosiy talab: «materialni va oborudovaniyani ham ajrata oladigan
     bo'lishi kerak». Birlik BUNI AYTMAYDI -- «РЕКЛАМНЫЙ БАННЕР» М2 da,
     «КОНЦЕВАЯ КАБЕЛЬНАЯ МУФТА» КОМПЛ da, ikkalasi ham ОБОРУДОВАНИЕ;
     «КИРПИЧ» esa ШТ da, lekin МАТЕРИАЛЬНЫЕ РЕСУРСЫ. Yagona ishonchli
     manba -- bo'lim sarlavhasi. */
  it('bir xil birlikdagi resurslarni bo‘limiga qarab МАТ va ОБ ga ajratadi', () => {
    const cols = { kod: 0, nom: 1, bir: 2, norma: -1, obyom: -1, narx: 3, sum: -1 };
    const rows = [
      ['', 'МАТЕРИАЛЬНЫЕ РЕСУРСЫ', '', ''],
      ['30-2', 'КИРПИЧ', 'ШТ', '1200'],
      ['30-3', 'ПЕСОК', 'М3', '120000'],
      ['', 'ИТОГО ПО СТРОИТЕЛЬНЫМ МАТЕРИАЛАМ:', 'СУМ', ''],
      ['', 'КОНСТРУКЦИИ ЗАВОДСКОГО ИЗГОТОВЛЕНИЯ', '', ''],
      ['30-4', 'КАБЕЛЬ АПВПУ-1Х240', 'М', '123956.25'],
      ['', 'ИТОГО КОНСТРУКЦИИ ЗАВОДСКОГО ИЗГОТОВЛЕНИЯ:', 'СУМ', ''],
      ['', 'ОБОРУДОВАНИЕ', '', ''],
      ['10-6', 'КОНЦЕВАЯ КАБЕЛЬНАЯ МУФТА ПКНТ(Н)-0-10-150-240', 'КОМПЛ', '3000000'],
      ['1', 'РЕКЛАМНЫЙ БАННЕР', 'М2', '45000'],
      ['', 'ИТОГО ОБОРУДОВАНИЕ:', 'СУМ', ''],
    ];
    const satrlar = resSatrlariniOl(rows, cols);
    expect(satrlar.map(s => [s.nom, s.kat])).toEqual([
      ['КИРПИЧ', 'МАТ'],
      ['ПЕСОК', 'МАТ'],
      /* 2026-09-10 kutilgan natija O'ZGARTIRILDI (avval 'М/К' edi): egasi
         qoidani aniqlashtirdi -- «kabel provod ... shu oilaga kiruvchi
         metr yoki km da berilgan narsalar» КАБ bo'ladi. «КОНСТРУКЦИИ
         ЗАВОДСКОГО ИЗГОТОВЛЕНИЯ» bo'limi ichida turgani kabelni М/К
         qilmaydi -- bo'lim emas, nomning O'ZI hal qiladi. */
      ['КАБЕЛЬ АПВПУ-1Х240', 'КАБ'],
      ['КОНЦЕВАЯ КАБЕЛЬНАЯ МУФТА ПКНТ(Н)-0-10-150-240', 'ОБ'],
      ['РЕКЛАМНЫЙ БАННЕР', 'ОБ'],
    ]);
    // Birlik hech narsa demasligining isboti: ikkalasi ham "dona"ga o'xshash,
    // lekin biri МАТ, ikkinchisi ОБ.
    expect(katTaxmini('КИРПИЧ', 'ШТ')).toBe('МАТ');
    expect(katTaxmini('РЕКЛАМНЫЙ БАННЕР', 'М2')).toBe('МАТ'); // birlik yolg'on ko'rsatadi
  });

  /* T1 (10_Engine.js) da bir marta yuz bergan xato: «ЗАТРАТЫ ТРУДА
     РАБОЧИХ-СТРОИТЕЛЕЙ» resursi «ЗАТРАТЫ ТРУДА» sarlavhasi deb o'qilib,
     narxi yo'qolgan. Shuning uchun sarlavha FAQAT narxsiz qatorda. */
  it('narxi bor «ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ» resurs bo‘lib qoladi, sarlavha emas', () => {
    const cols = { kod: 0, nom: 1, bir: 2, norma: -1, obyom: -1, narx: 3, sum: -1 };
    const satrlar = resSatrlariniOl([
      ['', 'ТРУДОВЫЕ РЕСУРСЫ', '', ''],
      ['1', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ.-Ч', '46235.07'],
    ], cols);
    expect(satrlar).toHaveLength(1);
    expect(satrlar[0].narx).toBe(46235.07);
    expect(satrlar[0].kat).toBe('ЧЕЛ');
  });

  it('indeks kategoriyani kod va nom+birlik bo‘yicha eslab qoladi', () => {
    const idx = resNarxIndeksiQur([
      { kod: '10-6', nom: 'МУФТА', birlik: 'КОМПЛ', narx: 3000000, kat: 'ОБ' },
      { kod: '30-2', nom: 'КИРПИЧ', birlik: 'ШТ', narx: 1200, kat: 'МАТ' },
    ]);
    expect(idx.katByKodNomBir.get('106|МУФТА|КОМПЛ')).toBe('ОБ');
    expect(idx.katByNomBir.get('МУФТА|КОМПЛ')).toBe('ОБ');
    expect(idx.katByKodNomBir.get('302|КИРПИЧ|ШТ')).toBe('МАТ');
  });
});

describe('varaqTuriTaxmin (owner: bitta faylda ham LRV, ham RES varaqlari bo‘lishi mumkin)', () => {
  const sarlavha = [
    ['№', 'ШИФР', 'НАИМЕНОВАНИЕ РАБОТ И ЗАТРАТ', 'ЕД. ИЗМ.', 'КОЛИЧЕСТВО', '', 'СТОИМОСТЬ, СУМ', ''],
    ['', '', '', '', 'на единицу', 'по проектным данным', 'на.ед.изм', 'общая'],
  ];

  it('hajm (obyom) ustuni ko‘p to‘ldirilgan bo‘lsa LRV deb taxmin qiladi (narxsiz bo‘lsa ham)', () => {
    const rows = [
      ...sarlavha,
      ['1', 'K1', 'Ish 1', 'м3', '', '10', '', ''],
      ['2', 'K2', 'Ish 2', 'м3', '', '20', '', ''],
      ['3', 'K3', 'Ish 3', 'м3', '', '15', '', ''],
      ['4', 'K4', 'Ish 4', 'м3', '', '30', '', ''],
    ];
    expect(varaqTuriTaxmin(rows)).toBe('lrv');
  });

  it('narx deyarli har qatorda bor, hajm deyarli yo‘q bo‘lsa RES deb taxmin qiladi', () => {
    const rows = [
      ...sarlavha,
      ['1', 'R1', 'Resurs 1', 'кг', '', '', '5000', ''],
      ['2', 'R2', 'Resurs 2', 'кг', '', '', '12000', ''],
      ['3', 'R3', 'Resurs 3', 'шт', '', '', '800000', ''],
      ['4', 'R4', 'Resurs 4', 'м', '', '', '15000', ''],
    ];
    expect(varaqTuriTaxmin(rows)).toBe('res');
  });

  it('ma’lumot juda kam bo‘lsa taxmin qilmaydi -- noma’lum qaytaradi', () => {
    const rows = [...sarlavha, ['1', 'X1', 'Nomalum 1', 'dona', '', '', '', '']];
    expect(varaqTuriTaxmin(rows)).toBe('nomalum');
  });

  it('bo‘sh/mazmunsiz varaqni taxmin qilmaydi', () => {
    expect(varaqTuriTaxmin([['x'], [], []])).toBe('nomalum');
  });

  it('svod va tn·km varag‘i — hamroh (tashlanmaydi, LRV ham qilinmaydi; C4 PR-1)', () => {
    const tkm = [
      ['', '№', 'Наименование материалов', 'Ед.изм', 'Кол-во', 'Кол-во (тн)', 'Дальность возки (км)', 'Грузооборот тн.км.', 'Стоимость тн.км в сум', 'Стоимость всего сум.'],
      ['', 1, 'Материал А', 'тн', 100, 100, 10, 1000, 1000, 1000000],
      ['', '', 'ИТОГО:', 'сум', '', '', '', '', '', 1000000],
    ];
    expect(varaqTuriTaxmin(tkm, 'трансп.')).toBe('hamroh');
    const svod = [['№№ ПП', 'НАИМЕНОВАНИЕ ЗАТРАТ', 'Цена'], [1, 'ЗАТРАТЫ НА МАТЕРИАЛЫ', 100], [2, 'НДС -12%', 12]];
    expect(varaqTuriTaxmin(svod, 'сводн.')).toBe('hamroh');
  });
});

describe('smeta paket fayl tanlovi', () => {
  it('Excel lock faylini haqiqiy workbook sifatida parserga yubormaydi', () => {
    const lock = new File(['lock'], '~$ПK2+60 уч-к№1 переход.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const real = new File(['xlsx'], 'ПK2+60 уч-к№1 переход.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    expect(paketImportFayllariniSarala([lock, real])).toEqual({ accepted: [real], ignoredExcelLocks: [lock.name] });
  });

  it('faqat lock fayli tanlansa accepted bo‘sh qoladi va operator ogohlantirilishi mumkin', () => {
    const lock = new File(['lock'], '~$smeta.xlsx');
    expect(paketImportFayllariniSarala([lock])).toEqual({ accepted: [], ignoredExcelLocks: [lock.name] });
  });

  it('ZIP/XLSX parser xatosini texnik kodsiz operator xabariga aylantiradi', () => {
    const error = spreadsheetReadError('smeta.xlsx', new Error('XLSX_NOT_A_ZIP: End-of-central-directory record not found'));
    expect(error.message).toContain('haqiqiy Excel workbook emas');
    expect(error.message).not.toContain('XLSX_NOT_A_ZIP');
    expect(error.message).not.toContain('End-of-central-directory');
  });
});

describe('katTaxmini (mijoz tomoni ko‘rib chiqish uchun taxmin)', () => {
  it('birlikda ЧЕЛ bo‘lsa ЧЕЛ', () => expect(katTaxmini('Ishchi', 'чел-час')).toBe('ЧЕЛ'));
  it('birlikda МАШ bo‘lsa МАШ', () => expect(katTaxmini('Kran', 'маш-час')).toBe('МАШ'));
  it('nomda ТРУДА МАШИНИСТОВ bo‘lsa МАШ', () => expect(katTaxmini('Затраты труда машинистов', 'чел-час')).toBe('МАШ'));
  it('boshqa hollarda МАТ (standart) -- ОБ/КАБ/М-К hech qachon taxmin qilinmaydi', () => {
    expect(katTaxmini('Кабель ВВГ 3х2,5', 'м')).toBe('МАТ');
    expect(katTaxmini('Экскаватор', 'шт')).toBe('МАТ');
  });
});

describe('ko‘p varaqdan smeta/RES importi', () => {
  it('tanlangan ichki va alohida RES varaqlarini bitta indeksga yig‘adi', () => {
    const materialRows = [
      ['M-1', 'БЕТОН ТЯЖЕЛЫЙ', 'М3', '500000'],
    ];
    const uskunaRows = [
      ['O-1', 'НАСОС', 'ШТ', '750000'],
    ];
    const satrlar = tanlanganResManbalariniYig([
      { rows: materialRows, cols },
      { rows: uskunaRows, cols },
    ]);
    const applied = narxlarniDaraxtgaQoll([
      { uid: 'mat', type: 'mat', nom: 'БЕТОН ТЯЖЕЛЫЙ', bir: 'М3', hajm: 2, narx: 0 },
      { uid: 'ob', type: 'ob', nom: 'НАСОС', bir: 'ШТ', hajm: 1, narx: 0 },
    ], resNarxIndeksiQur(satrlar));
    expect(satrlar).toHaveLength(2);
    expect(applied.tree.map(x => x.narx)).toEqual([500000, 750000]);
    expect(applied.mosSoni).toBe(2);
  });

  it('bir obyektning ikki LRV varag‘ini alohida manba ildizlari ostida saqlaydi', () => {
    const lrvCols: F2ColumnConfig = { kod: 0, nom: 1, bir: 2, norma: 3, obyom: 4, narx: 5, sum: 6 };
    const tree = tanlanganLrvVaraqlaridanDaraxtQur([
      { name: '1-uchastka', rows: [['01', 'Бетон B25', 'М3', '', '10', '', '']], cols: lrvCols },
      { name: '2-uchastka', rows: [['02', 'Асфальт', 'Т', '', '20', '', '']], cols: lrvCols },
    ]);
    expect(tree.map(x => x.nom)).toEqual(['1-uchastka', '2-uchastka']);
    expect(tree[0].children?.[0].uid).not.toBe(tree[1].children?.[0].uid);
    expect(tree[0].children?.[0].children?.[0].nom).toBe('Бетон B25');
    expect(tree[1].children?.[0].children?.[0].nom).toBe('Асфальт');
  });

  it('LRV yakunidan keyingi RES ilovasini ish daraxtiga kiritmaydi', () => {
    const lrvCols: F2ColumnConfig = { kod: 0, nom: 1, bir: 2, norma: 3, obyom: 4, narx: 5, sum: 6 };
    const tree = tanlanganLrvVaraqlaridanDaraxtQur([{
      name: '1-uchastka / 4230_БВ',
      rows: [
        ['ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ'],
        ['01', 'Asfalt ishlari', 'м2', '', '100', '', ''],
        ['ИТОГО ПО ЛОКАЛЬНОЙ РЕСУРСНОЙ ВЕДОМОСТИ:'],
        ['ТРУДОВЫЕ РЕСУРСЫ'],
        ['1', 'Ishchi-resurs ilovasi', 'чел-ч', '', '20', '25000', '500000'],
      ],
      cols: lrvCols,
    }], { harManbagaRz: true });
    expect(tree).toHaveLength(1);
    expect(tree[0].type).toBe('rz');
    expect(tree[0].nom).toBe('1-uchastka / 4230_БВ');
    expect(JSON.stringify(tree)).toContain('Asfalt ishlari');
    expect(JSON.stringify(tree)).not.toContain('Ishchi-resurs ilovasi');
  });
});

describe('bolakniQaytaUrinibYubor — katta smeta tarmoq uzilishiga chidamli', () => {
  const tez = () => Promise.resolve();
  it('NETWORK xatosidan keyin qayta yuborib muvaffaqiyatga yetadi', async () => {
    let n = 0;
    const urinishlar: number[] = [];
    const r = await bolakniQaytaUrinibYubor({ bolak: 4 }, (u) => urinishlar.push(u),
      async () => (++n < 3 ? { ok: false, code: 'NETWORK' } : { ok: true, jami: 10000 }), tez);
    expect(r.ok).toBe(true);
    expect(n).toBe(3);
    expect(urinishlar).toEqual([1, 2]);
  });
  it('doimiy uzilishda 5 urinishdan keyin to‘xtaydi', async () => {
    let n = 0;
    const r = await bolakniQaytaUrinibYubor({}, undefined, async () => { n++; return { ok: false, code: 'NETWORK' }; }, tez);
    expect(r.ok).toBe(false);
    expect(n).toBe(5);
  });
  it('biznes xatosini (masalan IMPORT_SESSION_CLOSED) qayta yubormaydi', async () => {
    let n = 0;
    const r = await bolakniQaytaUrinibYubor({}, undefined, async () => { n++; return { ok: false, code: 'IMPORT_SESSION_CLOSED' }; }, tez);
    expect(r.code).toBe('IMPORT_SESSION_CLOSED');
    expect(n).toBe(1);
  });
});

describe('Prime Towers shakli (2026-10-24, sintetik): RES narxi to‘liq ulanadi', () => {
  it('«ГОРЯЧЕКАТАННАЯ … А-1, Д 16 ММ» (LRV) = «ГОРЯЧЕКАТАНАЯ … А-I, Д 16-18 ММ» (RES); boshqa diametr/sinf aralashmaydi', () => {
    const idx = resNarxIndeksiQur([
      { kod: '3568 С', nom: 'ГОРЯЧЕКАТАНАЯ АРМАТУРНАЯ СТАЛЬ ПЕРИОДИЧЕСКОГО ПРОФИЛЯ КЛАССА А-III ДИАМЕТРОМ 16-18 ММ', birlik: 'Т', narx: 100 },
      { kod: '3565 С', nom: 'ГОРЯЧЕКАТАНАЯ АРМАТУРНАЯ СТАЛЬ ПЕРИОДИЧЕСКОГО ПРОФИЛЯ КЛАССА А-III ДИАМЕТРОМ 10 ММ', birlik: 'Т', narx: 200 },
      { kod: '3504 С', nom: 'ГОРЯЧЕКАТАНАЯ АРМАТУРНАЯ СТАЛЬ ГЛАДКАЯ КЛАССА А-I ДИАМЕТРОМ 8 ММ', birlik: 'Т', narx: 300 },
    ]);
    const tree: AktNode[] = [
      { uid: '1', type: 'mat', kod: 'С124-0024', nom: 'ГОРЯЧЕКАТАННАЯ АРМАТУРНАЯ СТАЛЬ ПЕРИОДИЧЕСКОГО ПРОФИЛЯ КЛАССА А-III ДИАМЕТРОМ 16 ММ', bir: 'Т', hajm: 2 },
      { uid: '2', type: 'mat', kod: 'С124-0021', nom: 'ГОРЯЧЕКАТАННАЯ АРМАТУРНАЯ СТАЛЬ ПЕРИОДИЧЕСКОГО ПРОФИЛЯ КЛАССА А-III ДИАМЕТРОМ 10 ММ', bir: 'Т', hajm: 1 },
      { uid: '3', type: 'mat', kod: 'С124-0002', nom: 'ГОРЯЧЕКАТАННАЯ АРМАТУРНАЯ СТАЛЬ ГЛАДКАЯ КЛАССА А-1, ДИАМЕТРОМ 8 ММ', bir: 'Т', hajm: 1 },
      { uid: '4', type: 'mat', kod: 'С124-0026', nom: 'ГОРЯЧЕКАТАННАЯ АРМАТУРНАЯ СТАЛЬ ПЕРИОДИЧЕСКОГО ПРОФИЛЯ КЛАССА А-III ДИАМЕТРОМ 25 ММ', bir: 'Т', hajm: 1 },
    ];
    const { tree: out } = narxlarniDaraxtgaQoll(tree, idx);
    expect(out.map((n) => n.narx)).toEqual([100, 200, 300, undefined]);
    expect(out[0].summa).toBe(200);
  });

  it('ko‘p lokalli RES: har LRV lokali o‘z stavkasini oladi (ЧЕЛ 47965.99 va 47965.9936 — kop_nomzod emas)', () => {
    const resRows = [
      ['1', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ С УЧЕТОМ СОЦСТРАХА', 'ЧЕЛ.-Ч', '47965.99'],
      ['', 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', ''],
      ['', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ С УЧЕТОМ СОЦСТРАХА', 'ЧЕЛ.-Ч', '47965.9936'],
      ['', 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', ''],
    ];
    expect(resLokallargaBol(resRows)).toHaveLength(2);
    const lok = (uid: string, bir: string): AktNode => ({ uid, type: 'rz', nom: 'L' + uid, children: [
      { uid: uid + 'b', type: 'bl', nom: 'ISH', children: [{ uid: uid + 'r', type: 'rs', kod: '1', nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', bir, hajm: 10 }] },
    ] });
    const tree: AktNode[] = [{ uid: 'f', type: 'rz', nom: 'FAYL', children: [lok('1', 'ЧЕЛ.-Ч'), lok('2', 'чел-ч')] }];
    const umumiy = resNarxIndeksiQur(resSatrlariniOl(resRows, cols));
    // butun RES bitta indeksda — ikki xil stavka, moslanmaydi (avvalgi xatti-harakat)
    expect(narxlarniDaraxtgaQoll(tree, umumiy).tree[0].children![0].children![0].children![0].narx).toBeUndefined();
    const out = lokallarBoyichaNarxla(tree, [{ rows: resRows, cols }], umumiy);
    const narx = (i: number) => out[0].children![i].children![0].children![0].narx;
    expect(narx(0)).toBe(47965.99);
    expect(narx(1)).toBe(47965.9936);
  });
});
/* ─── Ekspertiza «ALL» to'plami (sintetik): RES / F5 / VED / TNDR ─── */
describe('ALL to‘plami — qat’iy varaq rollari va RES bloklari', () => {
  const allCols: F2ColumnConfig = { kod: 2, nom: 3, bir: 4, norma: -1, obyom: 5, narx: 6, sum: 7 };
  const T = (s: string) => [s, null, null, null, null, null, null, null];
  const R = (kod: string, nom: string, bir: string, k: number, narx: number) => ['1', null, kod, nom, bir, k, narx, k * narx];
  const P = (s: string, p: number | null, sum: number) => [null, null, null, s, 'СУМ', p, null, sum];
  const RES = [
    T('ЛОКАЛЬНАЯ РЕСУРСНАЯ СМЕТА № 01'),
    T('ТРУДОВЫЕ РЕСУРСЫ'), R('1', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', 10, 30), P('ИТОГО', null, 300),
    T('МЕСТНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'), R('M-1', 'СКАМЕЙКА', 'КОМПЛ', 2, 500), R('M-2', 'ПРОВОД ПВ-1', '1000М', 1, 1000),
    P('ИТОГО', null, 2000), P('ТРАНСПОРТНЫЕ РАСХОДЫ', 5, 100), P('ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ', 1, 20), P('ВСЕГО', null, 2120),
    P('ВСЕГО МАТЕРИАЛОВ', null, 2120),
    T('ОБОРУДОВАНИЕ'), R('2301-1', 'ЩИТ ОСВЕЩЕНИЯ', 'ШТ', 1, 7000), R('1501-9', 'КАБЕЛЬ КОНТРОЛЬНЫЙ', 'М', 10, 300),
    P('ИТОГО', null, 10000), P('ТРАНСПОРТНЫЕ РАСХОДЫ', 2, 200), P('ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ', 1, 100), P('ВСЕГО', null, 10300),
    P('ВСЕГО ОБОРУДОВАНИЯ', null, 10300),
    P('ИТОГО С ОБОРУДОВАНИЕМ', null, 12720),
  ];
  const F5 = [
    ['ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ № 01'],
    ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', 'ЕД.ИЗМ', 'КОЛ-ВО', '', 'ЦЕНА', 'СУММА'],
    ['', '', '', '', 'НА ЕДИНИЦУ', 'ПО ПРОЕКТУ', '', ''],
    ['1', 'Е10-1-1', 'УСТАНОВКА ЩИТА', 'ШТ', '1', '', '7300', '7300'],
    ['1.1', '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', '10', '10', '30', '300'],
    ['2', '2301-1', 'ЩИТ ОСВЕЩЕНИЯ', 'ШТ', '1', '', '7000', '7000'],
    [null, null, 'ЗАРПЛАТА', 'СУМ', null, null, null, 300],
    [null, null, 'ЭКСПЛУАТАЦИЯ МАШИН', 'СУМ', null, null, null, 0],
    [null, null, 'ИТОГО С ОБОРУДОВАНИЕМ', 'СУМ', null, null, null, 12720],
  ];
  const VED = [['ВЕДОМОСТЬ ОБЪЕМОВ РАБОТ № 01'], ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РАБОТ', 'ЕД.ИЗМ', 'КОЛ-ВО'], ['1', 'Е10-1-1', 'УСТАНОВКА ЩИТА', 'ШТ', '1']];
  const TNDR = [['ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ № 01'], ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ', 'ЕД.ИЗМ', 'КОЛ-ВО', '', 'ЦЕНА', 'СУММА'], ['1', 'Е10-1-1', 'УСТАНОВКА ЩИТА', 'ШТ', '1', '', '9999', '9999']];
  const kitob = [{ name: 'RES', rows: RES }, { name: 'F5', rows: F5 }, { name: 'VED', rows: VED }, { name: 'TNDR', rows: TNDR }];

  it('F5 = lrv, RES = res, VED/TNDR = etibor_bermaslik; asosiy LRV = F5', () => {
    expect(kitobVaraqTeglari(kitob)).toEqual({ RES: 'res', F5: 'lrv', VED: 'etibor_bermaslik', TNDR: 'etibor_bermaslik' });
    expect(varaqTuriTaxmin(VED, 'VED', kitob)).toBe('nomalum');
    const a = kitobAnatomiyasi({ fayl: 'sintetik.xls', varaqlar: kitob.map((s) => ({ nom: s.name, rows: s.rows as never })) });
    expect(a.asosiyLrv).toBe('F5');
    expect(a.dublikat.map((d) => d.varaq).sort()).toEqual(['TNDR', 'VED']);
  });

  it('faqat uskunali F5 (resurssiz ishlar) ham LRV; nomi o‘zgartirilgan RES/F5 mazmundan', () => {
    const faqatOb = [F5[0], F5[1], F5[2], F5[5], F5[6], F5[7], F5[8]];
    expect(kitobVaraqTeglari([{ name: 'RES', rows: RES }, { name: 'F5', rows: faqatOb }, { name: 'TNDR', rows: TNDR }]).F5).toBe('lrv');
    const nomsiz = kitobVaraqTeglari([{ name: 'Лист1', rows: RES }, { name: 'Лист2', rows: F5 }, { name: 'VED', rows: VED }]);
    expect(nomsiz).toMatchObject({ Лист1: 'res', Лист2: 'lrv', VED: 'etibor_bermaslik' });
  });

  it('TNDR narxi indeksga kirmaydi (operator ongli tanlamasa)', () => {
    const tndrCols: F2ColumnConfig = { kod: 1, nom: 2, bir: 3, norma: -1, obyom: 4, narx: 6, sum: 7 };
    expect(tanlanganResManbalariniYig([{ rows: TNDR, cols: tndrCols, tender: true }])).toEqual([]);
    expect(tanlanganResManbalariniYig([{ rows: TNDR, cols: tndrCols, tender: true, operatorTanladi: true }]).length).toBe(1);
  });

  it('ОБ guruhidagi «X, ШТ» → ОБ (kabel nomi ham guruhga bo‘ysunadi); МАТ guruhidagi «X, КОМПЛ» → МАТ', () => {
    const s = resSatrlariniOl(RES, allCols);
    const kat = (nom: string) => s.find((x) => x.nom === nom)?.kat;
    expect(kat('ЩИТ ОСВЕЩЕНИЯ')).toBe('ОБ');
    expect(kat('КАБЕЛЬ КОНТРОЛЬНЫЙ')).toBe('ОБ');
    expect(kat('СКАМЕЙКА')).toBe('МАТ');
    expect(kat('ПРОВОД ПВ-1')).toBe('МАТ');
    expect(kat('ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ')).toBe('ЧЕЛ');
    // F5 bargi RES qatoridan meros oladi (kod+nom+birlik); faqat 1504- prefiksi — taklif, avtomatik emas.
    const idx = resNarxIndeksiQur(s);
    expect(bargKategoriyasi({ kod: '2301-1', nom: 'ЩИТ ОСВЕЩЕНИЯ', bir: 'ШТ' }, idx)).toBe('ОБ');
    expect(bargKategoriyasi({ kod: '1504-7', nom: 'НАСОС ЦИРКУЛЯЦИОННЫЙ', bir: 'ШТ' }, idx)).toBe('МАТ');
    expect(obKodTaklifi('1504-7')).toBe(true);
    // RES bitta kod ostida jamlagan, F5 da boshqa nom: kod RES da yo'q (bo'sh ustun) — birlik + aynan narx
    expect(bargKategoriyasi({ kod: '2301-1', nom: 'ЩИТ ОСВЕЩЕНИЯ ТИП Б', bir: 'ШТ', narx: 7000 }, idx)).toBe('ОБ');
    expect(bargKategoriyasi({ kod: '2301-1', nom: 'ЩИТ ОСВЕЩЕНИЯ ТИП Б', bir: 'ШТ', narx: 6999 }, idx)).toBe('МАТ');
    expect(daraxtKategoriyaNomzodlari([{ uid: 'a', type: 'ob', kod: '2301-1', nom: 'ЩИТ ОСВЕЩЕНИЯ ТИП Б', bir: 'ШТ', narx: 7000 }], idx))
      .toEqual([{ nom: 'ЩИТ ОСВЕЩЕНИЯ ТИП Б', birlik: 'ШТ', tanlangan: 'ОБ' }]);
  });
});

describe('ALL zagotsiz blok → БЕЗСКЛАД; zagotli blokda hujjat beton qoidasidan ustun', () => {
  const c: F2ColumnConfig = { kod: 2, nom: 3, bir: 4, norma: -1, obyom: 5, narx: 6, sum: 7 };
  const T = (s: string) => [s, null, null, null, null, null, null, null];
  const R = (nom: string, bir: string, k: number, narx: number) => ['1', null, 'X-1', nom, bir, k, narx, k * narx];
  const P = (s: string, p: number | null, sum: number) => [null, null, null, s, 'СУМ', p, null, sum];
  const rows = [
    T('МЕСТНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ'), R('БЕТОН ТЯЖЕЛЫЙ В15', 'М3', 2, 500), R('ЦЕМЕНТ', 'Т', 1, 1000),
    P('ИТОГО', null, 2000), P('ТРАНСПОРТНЫЕ РАСХОДЫ', 5, 100), P('ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ', 1, 20), P('ВСЕГО', null, 2120),
    T('ИНЕРТНЫЕ МАТЕРИАЛЫ'), R('ЩЕБЕНЬ', 'М3', 4, 100), R('ПЕСОК', 'М3', 2, 300),
    P('ИТОГО', null, 1000), P('ТРАНСПОРТНЫЕ РАСХОДЫ', 5, 50), P('ВСЕГО', null, 1050),
    P('ВСЕГО МАТЕРИАЛОВ', null, 3170),
  ];
  it('kategoriyalar va kaskad = hujjat podvali (±1)', async () => {
    const s = resSatrlariniOl(rows, c);
    const kat = (n: string) => s.find((x) => x.nom === n)?.kat;
    expect(kat('ЩЕБЕНЬ')).toBe('БЕЗСКЛАД');
    expect(kat('ПЕСОК')).toBe('БЕЗСКЛАД');
    expect(kat('БЕТОН ТЯЖЕЛЫЙ В15')).toBe('МАТ'); // zagotli isbotli blok — hujjat zagotni qo'llagan
    // Hujjat БЕЗСКЛАД registrga yozilmaydi (kompaniya bo'yicha nom+birlik riski) — import qatorida keladi.
    expect(resKategoriyaNomzodlariniOl(s)).toEqual([]);
    const idx = resNarxIndeksiQur(s);
    const tree = hujjatKategoriyalariniBelgila([{ uid: 'b', type: 'bl', nom: 'ИШ', children: [
      { uid: 'r1', type: 'rs', nom: 'ЩЕБЕНЬ', bir: 'М3', hajm: 1 },
      { uid: 'r2', type: 'rs', nom: 'БЕТОН ТЯЖЕЛЫЙ В15', bir: 'М3', hajm: 1 },
      { uid: 'r3', type: 'rs', nom: 'ЗАТРАТЫ ТРУДА', bir: 'ЧЕЛ-Ч', hajm: 1 },
    ] }], idx);
    const flat = smetaDaraxtniYoy(tree);
    expect(flat.find((x) => x.local_id === 'r1')).toMatchObject({ kat: 'БЕЗСКЛАД', kat_manba: 'hujjat_blok' });
    expect(flat.find((x) => x.local_id === 'r2')).toMatchObject({ kat: 'МАТ', kat_manba: 'hujjat_blok' });
    expect(flat.find((x) => x.local_id === 'r3')).not.toHaveProperty('kat_manba');
    expect(flat.find((x) => x.local_id === 'b')).not.toHaveProperty('kat');
    const { nakrutkaKaskadJS } = await import('../../lib/nakrutka-podval');
    const k = nakrutkaKaskadJS({ ЧЕЛ: 0, МАШ: 0, МАТ: 2000, ОБ: 0, КАБ: 0, 'М/К': 0, 'БЕЗ СКЛАД': 1000 }, { ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 1 });
    expect(k.tr_mat + k.skl_mat).toBeCloseTo(100 + 20 + 50, 2);
  });
  it('zagotsiz blok transporti isbotsiz — БЕЗСКЛАД berilmaydi (eski qoidalar)', () => {
    const buzuq = rows.map((r) => (r[3] === 'ТРАНСПОРТНЫЕ РАСХОДЫ' && r[7] === 50 ? P('ТРАНСПОРТНЫЕ РАСХОДЫ', 5, 77) : r));
    const s = resSatrlariniOl(buzuq, c);
    expect(s.find((x) => x.nom === 'ЩЕБЕНЬ')?.kat).not.toBe('БЕЗСКЛАД');
    expect(resKategoriyaNomzodlariniOl(s).some((x) => x.nom === 'ЩЕБЕНЬ')).toBe(false);
  });
});

describe('Yo‘l paketi LRV↔RES — faqat TAKLIF, avtomatik birlashtirish yo‘q', () => {
  const c: F2ColumnConfig = { kod: 0, nom: 1, bir: 2, norma: -1, obyom: -1, narx: 3, sum: -1 };
  it('«PLITA TIP 1» va «TIP 2» hech qachon avtomatik birlashmaydi; yagona kod+birlik nomzodi — taklif', () => {
    const idx = resNarxIndeksiQur(resSatrlariniOl([
      ['ПЛ-01', 'ПЛИТА ТАКТИЛЬНАЯ ТИП 2', 'М2', '150000'],
      ['ТР-05', 'ТРУБА ПЭ ГАЗОВАЯ 110', 'М', '42000'],
    ], c));
    const tree: AktNode[] = [{ uid: 'r', type: 'rz', nom: 'R', children: [
      { uid: 'a', type: 'mat', kod: 'ПЛ-01', nom: 'ПЛИТА ТАКТИЛЬНАЯ ТИП 1', bir: 'М2', hajm: 10 },
      { uid: 'b', type: 'mat', kod: 'X-9', nom: 'ТРУБА ПЭ НАПОРНАЯ 110', bir: 'М', hajm: 5 },
    ] }];
    const q = narxlarniDaraxtgaQoll(tree, idx);
    expect(q.mosSoni).toBe(0);
    const a = q.narxsizlar.find((x) => x.uid === 'a')!;
    expect(a.taklif).toMatchObject({ sabab: 'kod_birlik', nom: 'ПЛИТА ТАКТИЛЬНАЯ ТИП 2', narx: 150000, sonlarMos: false });
    expect(q.narxsizlar.find((x) => x.uid === 'b')?.taklif).toMatchObject({ sabab: 'nom_token', nom: 'ТРУБА ПЭ ГАЗОВАЯ 110', sonlarMos: true });
  });
  it('turli narxli bir nechta nomzod — taklif yo‘q', () => {
    expect(narxTaklifiniTop({ kod: 'Z', nom: 'ПЛИТА ТАКТИЛЬНАЯ', bir: 'М2' }, [
      { kod: 'Z', nom: 'ПЛИТА ТАКТИЛЬНАЯ А', birlik: 'М2', narx: 1 }, { kod: 'Z', nom: 'ПЛИТА ТАКТИЛЬНАЯ Б', birlik: 'М2', narx: 2 },
    ])).toBeNull();
  });
});