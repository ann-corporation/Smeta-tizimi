/**
 * QURILISH LUG'ATI — yagona ma'lumot (egasi: «naryad va smeta lug'ati ochiq qolmasin»).
 * Smeta normativ tili (ruscha, «Устройство … кладка … толщиной») ↔ oddiy til: o'zbekcha (lotin/kirill) va ruscha ish so'zlari
 * («кладка» / «g'isht terish» / «кирпич», «стяжка» / «pol quyish»). Faqat UMUMIY qurilish atamalari — hech qanday mijoz ma'lumoti yo'q.
 * Manba: smetalardagi ish nomlarining eng ko'p uchraydigan o'zaklari (устройство, установка, грунт, гидроизоляция, монтаж, обмазочная,
 * каркасов, окраска, облицовка, кладка, стяжка, штукатурка …).
 *
 * Qoida: `ru` — ruscha o'zaklar (kichik harf, ё=е), token shu o'zak bilan BOSHLANSA mos; `$` bilan tugasa — butun so'z (masalan «пол$»,
 * aks holda «полиэтилен» ham «пол» bo'lib qolardi). `uz` — o'zbekcha so'zlar (lotin, apostrofsiz yoki apostrof bilan — farqi yo'q);
 * kirill ko'rinishi (ғишт, қолип) avtomatik hosil qilinadi. `qisqa` — odam nomi [o'zbekcha lotin, ruscha].
 */
export type LugatYozuv = {
  k: string;
  ru: readonly string[];
  uz: readonly string[];
  qisqa: readonly [string, string];
};

export const LUGAT: readonly LugatYozuv[] = [
  { k: 'gisht', ru: ['кирпич', 'кладк', 'кладоч'], uz: ["g'isht", 'gisht', 'terish', 'devor terish'], qisqa: ["G'isht terish", 'Кладка кирпича'] },
  { k: 'gazobeton', ru: ['газобетон', 'пеноблок', 'газоблок'], uz: ['gazobeton', 'penoblok', 'gazoblok'], qisqa: ['Gazobeton terish', 'Кладка газобетона'] },
  { k: 'beton', ru: ['бетон', 'бетонир'], uz: ['beton', 'betonlash', 'beton quyish', 'quyma'], qisqa: ['Beton quyish', 'Бетонирование'] },
  { k: 'armatura', ru: ['арматур', 'каркас', 'вязк'], uz: ['armatura', 'karkas', 'armatura toqish', 'armatura bog\'lash'], qisqa: ["Armatura to'qish", 'Арматура (вязка каркасов)'] },
  { k: 'opalubka', ru: ['опалуб'], uz: ['qolip', 'qoliplash', 'opalubka'], qisqa: ['Qolip (opalubka)', 'Опалубка'] },
  { k: 'styajka', ru: ['стяжк', 'выравнивающ', 'стяжек'], uz: ['styajka', 'stazhka', 'pol quyish', 'pol tekislash', 'tekislash'], qisqa: ['Pol styajkasi (quyish)', 'Стяжка пола'] },
  { k: 'shtukaturka', ru: ['штукатур', 'оштукатур'], uz: ['suvoq', 'suvash', 'shtukaturka'], qisqa: ['Suvoq', 'Штукатурка'] },
  { k: 'boyash', ru: ['окраск', 'краск', 'покраск', 'водоэмульс', 'эмаль'], uz: ["bo'yash", 'boyash', 'buyash', 'boyoq', 'kraska', 'emulsiya'], qisqa: ["Bo'yash", 'Окраска'] },
  { k: 'shpatlyovka', ru: ['шпатл', 'шпакл'], uz: ['shpatlyovka', 'shpaklyovka', 'shpaklevka', 'shpatlevka'], qisqa: ['Shpatlyovka', 'Шпатлёвка'] },
  { k: 'gruntovka', ru: ['грунтовк'], uz: ['gruntovka', 'astar'], qisqa: ['Astar (gruntovka)', 'Грунтовка'] },
  { k: 'plitka', ru: ['плитк', 'облицов', 'кафел'], uz: ['plitka', 'kafel', 'qoplash', 'koplash'], qisqa: ['Plitka yotqizish', 'Облицовка плиткой'] },
  { k: 'gidroizolyatsiya', ru: ['гидроизол', 'обмазочн', 'битумн', 'битум'], uz: ['gidroizolyatsiya', 'bitum', 'surtma'], qisqa: ['Gidroizolyatsiya', 'Гидроизоляция'] },
  { k: 'izolyatsiya', ru: ['теплоизол', 'утеплен', 'утеплит', 'пенопласт', 'минват', 'вспененн'], uz: ['issiqlik izolyatsiyasi', 'izolyatsiya', 'penoplast', 'isitgich', 'utepleniye'], qisqa: ['Issiqlik izolyatsiyasi', 'Утепление'] },
  { k: 'truba', ru: ['труб', 'трубопровод'], uz: ['quvur', 'truba', 'quvur yotqizish'], qisqa: ['Quvur yotqizish', 'Прокладка труб'] },
  { k: 'kanalizatsiya', ru: ['канализ'], uz: ['kanalizatsiya', 'oqava'], qisqa: ['Kanalizatsiya', 'Канализация'] },
  { k: 'suv', ru: ['водоснаб', 'водопровод'], uz: ["suv ta'minoti", 'vodoprovod', 'suv quvuri'], qisqa: ["Suv ta'minoti", 'Водоснабжение'] },
  { k: 'isitish', ru: ['отоплен', 'радиатор', 'батаре'], uz: ['isitish', 'radiator', 'batareya'], qisqa: ['Isitish', 'Отопление'] },
  { k: 'ventilyatsiya', ru: ['вентиляц', 'воздуховод', 'кондиционер'], uz: ['ventilyatsiya', 'havo quvuri', 'konditsioner'], qisqa: ['Ventilyatsiya', 'Вентиляция'] },
  { k: 'elektr', ru: ['кабел', 'провод$', 'проводк', 'электро', 'розетк', 'выключател'], uz: ['kabel', 'sim', 'elektr', 'rozetka', 'elektr montaj'], qisqa: ['Elektr montaj', 'Электромонтаж'] },
  { k: 'yoritish', ru: ['светильн', 'освещен', 'ламп'], uz: ['chiroq', 'yoritish', 'svetilnik', 'lampa'], qisqa: ['Yoritish (chiroqlar)', 'Освещение'] },
  { k: 'eshik', ru: ['дверн', 'двери$', 'дверь$', 'дверей$'], uz: ['eshik', "eshik o'rnatish"], qisqa: ["Eshik o'rnatish", 'Установка дверей'] },
  { k: 'deraza', ru: ['оконн', 'окон$', 'окна$', 'окно$', 'остекл'], uz: ['deraza', 'oyna', 'oynalash'], qisqa: ["Deraza o'rnatish", 'Установка окон'] },
  { k: 'tom', ru: ['кровл', 'кровельн', 'черепиц', 'шифер'], uz: ['tom', 'tom yopish', 'krovlya', 'cherepitsa'], qisqa: ['Tom yopish', 'Кровля'] },
  { k: 'shift', ru: ['потолок', 'потолк', 'подвесн'], uz: ['shift', 'potolok', 'osma shift'], qisqa: ['Shift', 'Потолок'] },
  { k: 'pol', ru: ['пол$', 'пола$', 'полы$', 'полов$', 'полах$', 'напольн'], uz: ['pol', 'polga', 'pollar'], qisqa: ['Pol qurish', 'Устройство полов'] },
  { k: 'devor', ru: ['стен', 'перегородк'], uz: ['devor', 'devorlar', 'tosiq', 'peregorodka'], qisqa: ['Devor', 'Стены, перегородки'] },
  { k: 'poydevor', ru: ['фундамент'], uz: ['poydevor', 'fundament'], qisqa: ['Poydevor', 'Фундамент'] },
  { k: 'qazish', ru: ['разработк', 'котлован', 'траншей', 'выемк', 'экскават'], uz: ['qazish', 'kovlash', 'transheya', 'kotlovan', 'ekskavator'], qisqa: ['Qazish (kotlovan, transheya)', 'Земляные работы'] },
  { k: 'grunt', ru: ['грунт$', 'грунта$', 'грунтов$', 'грунтам$', 'грунтах$'], uz: ['grunt', 'tuproq', 'yer'], qisqa: ['Tuproq (grunt)', 'Грунт'] },
  { k: 'zasypka', ru: ['засыпк', 'обратн'], uz: ["ko'mish", 'komish', 'zasypka', "qayta to'ldirish"], qisqa: ["Ko'mish (zasypka)", 'Засыпка'] },
  { k: 'zichlash', ru: ['уплотн', 'трамбов'], uz: ['zichlash', 'tromblash', 'tramovka'], qisqa: ['Zichlash', 'Уплотнение'] },
  { k: 'planirovka', ru: ['планировк'], uz: ['planirovka', 'yer tekislash'], qisqa: ['Yer tekislash', 'Планировка'] },
  { k: 'asfalt', ru: ['асфальт'], uz: ['asfalt'], qisqa: ['Asfalt yotqizish', 'Асфальтирование'] },
  { k: 'bordyur', ru: ['бордюр'], uz: ['bordyur', 'chet tosh'], qisqa: ['Bordyur', 'Бордюр'] },
  { k: 'bruschatka', ru: ['брусчатк', 'тротуарн', 'мощен'], uz: ['bruschatka', "yo'lak", 'yolak', 'trotuar'], qisqa: ["Yo'lak yotqizish", 'Брусчатка, тротуар'] },
  { k: 'montaj', ru: ['монтаж', 'установк'], uz: ['montaj', "o'rnatish", 'ornatish'], qisqa: ["O'rnatish (montaj)", 'Монтаж'] },
  { k: 'demontaj', ru: ['демонтаж', 'разборк'], uz: ['demontaj', 'buzish', 'sindirish'], qisqa: ['Buzish (demontaj)', 'Демонтаж'] },
  { k: 'payvand', ru: ['сварк', 'сварочн'], uz: ['payvandlash', 'svarka', 'payvand'], qisqa: ['Payvandlash', 'Сварка'] },
  { k: 'metall', ru: ['металлоконстр', 'металлическ', 'стальн', 'швеллер', 'двутавр', 'уголок'], uz: ['metall', "po'lat", 'polat', 'konstruksiya', 'shveller'], qisqa: ['Metall konstruksiya', 'Металлоконструкции'] },
  { k: 'quduq', ru: ['колодец', 'колодц', 'люк$', 'люки$', 'люков$'], uz: ['quduq', 'lyuk', 'kolodets'], qisqa: ['Quduq (kolodets)', 'Колодец'] },
  { k: 'nasos', ru: ['насос'], uz: ['nasos'], qisqa: ['Nasos', 'Насос'] },
  { k: 'qozon', ru: ['котел$', 'котла$', 'котёл$', 'котлы$'], uz: ['qozon', 'kotel'], qisqa: ['Qozon', 'Котёл'] },
  { k: 'transformator', ru: ['трансформатор'], uz: ['transformator'], qisqa: ['Transformator', 'Трансформатор'] },
  { k: 'panjara', ru: ['огражден', 'забор', 'перил'], uz: ['panjara', 'zabor', 'tosiq', "to'siq"], qisqa: ["Panjara (to'siq)", 'Ограждение'] },
  { k: 'zina', ru: ['лестниц', 'ступен'], uz: ['zina', 'zinapoya'], qisqa: ['Zinapoya', 'Лестница'] },
  { k: 'polietilen', ru: ['полиэтилен', 'плёнк', 'пленк'], uz: ['polietilen', 'plyonka', 'plenka'], qisqa: ['Polietilen', 'Полиэтилен'] },
  { k: 'zakladnoy', ru: ['закладн'], uz: ['zakladnoy', 'zakladnoy detal'], qisqa: ['Zakladnoy detal', 'Закладные детали'] },
  { k: 'yopma', ru: ['перекрыт', 'плит$', 'плиты$', 'плитами$', 'плиты$'], uz: ['yopma', 'plita'], qisqa: ['Yopma plita', 'Плиты перекрытия'] },
  { k: 'balka', ru: ['балк', 'ригел', 'прогон'], uz: ['balka', 'rigel', 'tosin'], qisqa: ['Balka, rigel', 'Балки, ригели'] },
  { k: 'kolonna', ru: ['колонн'], uz: ['ustun', 'kolonna'], qisqa: ['Ustun (kolonna)', 'Колонны'] },
  { k: 'qorishma', ru: ['цемент', 'раствор'], uz: ['sement', 'qorishma', 'eritma', 'rastvor'], qisqa: ['Qorishma (rastvor)', 'Цементный раствор'] },
  { k: 'qum', ru: ['песок', 'песч'], uz: ['qum', 'pesok'], qisqa: ['Qum', 'Песок'] },
  { k: 'shcheben', ru: ['щебен', 'щебн', 'гравий', 'гравийн'], uz: ["shag'al", 'shagal', 'shcheben', 'sheben'], qisqa: ["Shag'al (shcheben)", 'Щебень'] },
  { k: 'asos', ru: ['основани', 'подстилающ', 'подготовк'], uz: ['asos', 'tayyorlov', 'asos tayyorlash'], qisqa: ['Asos tayyorlash', 'Подготовка основания'] },
  { k: 'transport', ru: ['перевозк', 'автомобил', 'самосвал', 'погрузк', 'транспорт'], uz: ['tashish', 'transport', 'yuklash', 'avtomobil'], qisqa: ['Tashish va yuklash', 'Перевозка и погрузка'] },
  { k: 'gipsokarton', ru: ['гипсокартон', 'гкл$'], uz: ['gipsokarton', 'gips'], qisqa: ['Gipsokarton', 'Гипсокартон'] },
  { k: 'panel', ru: ['панел', 'сэндвич'], uz: ['panel', 'sendvich'], qisqa: ['Panellar', 'Панели'] },
  { k: 'shisha', ru: ['стекл'], uz: ['shisha', 'oyna', 'stekla'], qisqa: ['Oyna (shisha)', 'Стекло'] },
  { k: 'yogoch', ru: ['дерев', 'деревян', 'брус$', 'доск'], uz: ["yog'och", 'yogoch', 'taxta', 'brus'], qisqa: ["Yog'och ishlar", 'Деревянные конструкции'] },
  { k: 'alyuminiy', ru: ['алюмин'], uz: ['alyuminiy', 'aluminiy'], qisqa: ['Alyuminiy konstruksiya', 'Алюминий'] },
  { k: 'fasad', ru: ['фасад', 'наружн'], uz: ['fasad', 'tashqi'], qisqa: ['Fasad ishlari', 'Фасадные работы'] },
  { k: 'drenaj', ru: ['дренаж'], uz: ['drenaj'], qisqa: ['Drenaj', 'Дренаж'] },
  { k: 'kokalam', ru: ['озеленен', 'газон', 'посадк'], uz: ['kokalamzor', "ko'kalamzor", 'maysa', 'kochat'], qisqa: ["Ko'kalamzorlashtirish", 'Озеленение'] },
];

/** Birlik lug'ati: smeta birligi (ruscha) → [asos kalit, o'zbekcha so'z, ruscha oddiy so'z]. */
export const BIRLIK_LUGAT: ReadonlyArray<{ re: RegExp; uz: string; ru: string }> = [
  { re: /^(?:м2|м²|кв\.?м|квм)$/, uz: 'kvadrat', ru: 'м²' },
  { re: /^(?:м3|м³|куб\.?м|кубм)$/, uz: 'kub', ru: 'м³' },
  { re: /^(?:м|п\.?м|погм|мп)$/, uz: 'metr', ru: 'м' },
  { re: /^(?:т|тн|тонн\w*)$/, uz: 'tonna', ru: 'т' },
  { re: /^(?:кг|килограмм\w*)$/, uz: 'kilo', ru: 'кг' },
  { re: /^(?:шт|штук\w*)$/, uz: 'dona', ru: 'шт' },
  { re: /^(?:компл|комплект\w*)$/, uz: 'komplekt', ru: 'компл.' },
  { re: /^(?:чел-?ч|челч|чел\.?-?ч)$/, uz: 'odam-soat', ru: 'чел-ч' },
  { re: /^(?:маш-?ч|машч)$/, uz: 'mashina-soat', ru: 'маш-ч' },
  { re: /^(?:км)$/, uz: 'kilometr', ru: 'км' },
  { re: /^(?:га)$/, uz: 'gektar', ru: 'га' },
  { re: /^(?:л|литр\w*)$/, uz: 'litr', ru: 'л' },
  { re: /^(?:рейс\w*)$/, uz: 'reys', ru: 'рейс' },
];
