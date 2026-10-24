import type { EntryCopy } from '../product-scope';

/**
 * Landing v2 matnlari (uz · ru · en). Faqat kodda/Obsidianda tasdiqlangan imkoniyatlar; o'ylab topilgan statistika,
 * mijoz soni yoki sharh YO'Q. Raqamli misollar "namuna" yorlig'i bilan ko'rsatiladi.
 */
export const L = {
  marquee: ['Smeta · Fakt · F2 · Nakopitelniy · Форма №3 · LRV · RES · AOSR · M-29 · Pul tahlili', 'Смета · Факт · Ф-2 · Накопительная · Форма №3 · ЛРВ · РЕС · АОСР · М-29 · Анализ денег', 'Estimate · Progress · F2 · Cumulative · Form No.3 · LRV · RES · Hidden-work acts · M-29 · Money analysis'],
  depthEyebrow: ['TIZIM BUTUN ZANJIRNI YOPADI', 'СИСТЕМА ЗАКРЫВАЕТ ВСЮ ЦЕПОЧКУ', 'THE WHOLE CHAIN, IN ONE PLACE'],
  depthTitle: ['PTO muhandisining kundalik ishi — bitta tizimda.', 'Ежедневная работа инженера ПТО — в одной системе.', 'A project engineer’s daily work — in one system.'],
  depthNote: ['Quyida har bir modul qanday ishlashi jonli namunada ko‘rsatilgan. Raqamlar — namuna, mijoz ma’lumoti emas.', 'Ниже на живых примерах показано, как работает каждый модуль. Цифры — пример, не данные клиентов.', 'Each module below is shown as a live sample. Figures are illustrative, not customer data.'],
  sample: ['namuna', 'пример', 'sample'],

  f2Eyebrow: ['F2 IMPORT', 'ИМПОРТ Ф-2', 'F2 IMPORT'],
  f2Title: ['F2 ni reestr bo‘yicha oling — qatorlar smetaga o‘zi bog‘lanadi.', 'Загрузите Ф-2 по реестру — строки сами привязываются к смете.', 'Import F2 by registry — rows link to the estimate on their own.'],
  f2Text: ['Har varaq — bitta F2; reestr summasi bilan solishtiriladi. Avto-bog‘lash natijasi uch belgida: ✓ aniq, ◐ tekshirish kerak, ✕ topilmadi. Zamena va qo‘shimcha ishlar alohida belgilanadi, asl smeta qatorlari o‘zgarmaydi.', 'Каждый лист — одна Ф-2, сверяется с суммой реестра. Результат автосвязывания в трёх отметках: ✓ точно, ◐ проверить, ✕ не найдено. Замены и дополнительные работы помечаются отдельно, исходные строки сметы не меняются.', 'Each sheet is one F2, checked against the registry total. Auto-linking returns three marks: ✓ exact, ◐ needs review, ✕ not found. Replacements and extra works are flagged separately; original estimate rows stay untouched.'],
  f2Left: ['F2 qatorlari', 'Строки Ф-2', 'F2 rows'],
  f2Right: ['Smeta qatorlari', 'Строки сметы', 'Estimate rows'],
  f2Ok: ['aniq', 'точно', 'exact'],
  f2Review: ['tekshirish', 'проверить', 'review'],
  f2Miss: ['topilmadi', 'не найдено', 'not found'],

  chainEyebrow: ['USTAMALI SUMMA', 'СУММА С НАКРУТКОЙ', 'MARKUP-AWARE TOTALS'],
  chainTitle: ['Har summa — ustamasi bilan. Zanjir ko‘z oldingizda.', 'Каждая сумма — с накруткой. Цепочка на виду.', 'Every amount with its markup. The chain in plain sight.'],
  chainText: ['Tizimdagi har pul summasi ustamali (asosiy) va ustamasiz (yonida kichik) ko‘rinadi. Narx doim QQS siz; QQS faqat alohida yorliq bilan. Kategoriyasi noma’lum summa 0 ga aylantirilmaydi — “taxminiy” deb belgilanadi.', 'Каждая денежная сумма показывается с накруткой (крупно) и без неё (рядом мелко). Цена всегда без НДС; НДС — только отдельной меткой. Сумма с неизвестной категорией не обнуляется — помечается как «ориентировочно».', 'Every amount shows with markup (large) and without (small, beside it). Prices are always VAT-free; VAT appears only under its own label. An amount with unknown category is never turned into zero — it is marked as an estimate.'],
  chain: [
    ['To‘g‘ridan-to‘g‘ri xarajat', 'Прямые затраты', 'Direct costs'],
    ['Transport va ombor', 'Транспорт и склад', 'Transport & storage'],
    ['Pudratchi boshqa xarajati 18%', 'Прочие расходы подрядчика 18%', 'Contractor overheads 18%'],
    ['Sug‘urta', 'Страхование', 'Insurance'],
    ['QQS (alohida yorliq)', 'НДС (отдельной меткой)', 'VAT (separate label)'],
  ] satisfies readonly EntryCopy[],
  chainTotal: ['Jami (QQS bilan)', 'Итого (с НДС)', 'Total (incl. VAT)'],
  chainSom: ['so‘m', 'сум', 'UZS'],

  photoEyebrow: ['REAL ISHLAR', 'РЕАЛЬНЫЕ ОБЪЕКТЫ', 'REAL SITES'],
  photoTitle: ['Hujjat ortida — haqiqiy obyektlar.', 'За документами — реальные объекты.', 'Behind the documents — real sites.'],
  photoNote: ['PTO ishi qog‘ozda emas, maydonda boshlanadi. Suratlar — jamoamiz obyektlaridan.', 'Работа ПТО начинается не на бумаге, а на площадке. Снимки — с объектов нашей команды.', 'PTO work starts on site, not on paper. Photos are from our team’s own sites.'],

  moduleCta: ['Tizimga kirish', 'Войти', 'Sign in'],
  keysEyebrow: ['TEZLIK', 'СКОРОСТЬ', 'SPEED'],
  keysTitle: ['Klaviatura bilan, 4 tilda, telefonda ham.', 'С клавиатуры, на 4 языках, и на телефоне.', 'Keyboard-first, four languages, mobile-ready.'],
  keysText: ['O‘zbek (lotin va kirill), rus va ingliz tillari; rasmiy hujjatlar (F2, Форма №3, M-29, akt) rus tilida qoladi. Tez kiritish uchun klaviatura yo‘llari mavjud.', 'Узбекский (латиница и кириллица), русский и английский; официальные документы (Ф-2, Форма №3, М-29, акты) остаются на русском. Для быстрого ввода есть клавиатурные сценарии.', 'Uzbek (Latin and Cyrillic), Russian and English; official documents (F2, Form No.3, M-29, acts) stay in Russian. Keyboard flows are available for quick entry.'],
} satisfies Record<string, EntryCopy | readonly EntryCopy[]>;

export type Mod = { id: string; icon: string; title: EntryCopy; benefit: EntryCopy; points: readonly EntryCopy[] };
export const modules: readonly Mod[] = [
  { id: 'smeta', icon: 'calc', title: ['Smeta: import va ASL const', 'Смета: импорт и неизменный оригинал', 'Estimate: import & immutable original'],
    benefit: ['Excel smetangizni yuklang — asl qatorlar o‘zgarmaydi, o‘zgarishlar alohida qatlamda.', 'Загрузите смету Excel — исходные строки не меняются, правки живут отдельным слоем.', 'Upload your Excel estimate — original rows never change; edits live in a separate layer.'],
    points: [['Narxsiz smeta import oldidan ogohlantiriladi', 'Смета без цен — предупреждение до импорта', 'Priceless estimates flagged before import'], ['Fakt va F2 o‘zgarishlari asl smetaga tegmaydi', 'Правки по факту и Ф-2 не трогают оригинал', 'Fact/F2 changes never touch the original']] },
  { id: 'studio', icon: 'sparkles', title: ['Smeta studiyasi: LRV → narx → RES', 'Студия: ЛРВ → расценка → РЕС', 'Studio: LRV → pricing → RES'],
    benefit: ['Ishni so‘z bilan yozing, AI normani topadi; narx manbali, yakuniy qaror — smetachida.', 'Опишите работу словами — AI найдёт норму; цены с источником, финальное решение за сметчиком.', 'Describe the work, AI finds the norm; prices carry sources, the estimator decides.'],
    points: [['Narx doim QQS siz', 'Цена всегда без НДС', 'Prices always VAT-free'], ['Mehnat va mash-soat alohida katalog', 'Труд и маш-часы — отдельные каталоги', 'Labour & machine hours: separate catalogues']] },
  { id: 'fakt', icon: 'clipboard', title: ['Fakt: xotiradan, bajarilmadi belgisi', 'Факт: из памяти, отметка «не выполнено»', 'Progress: from memory, “not done” flag'],
    benefit: ['Bajarilgan hajmni tez kiriting; bajarilmagan ishni belgilang — F2 ga to‘g‘ri hajm chiqadi.', 'Быстро вносите выполненные объёмы, отмечайте невыполненное — в Ф-2 уйдёт верный объём.', 'Enter completed quantities fast, flag what is not done — F2 gets the right numbers.'],
    points: [['Ostatka (qolgan hajm) ko‘rinadi', 'Виден остаток объёма', 'Remaining quantity visible'], ['Fakt to‘liq bo‘lsa — F2 to‘g‘ri', 'Полный факт — верная Ф-2', 'Complete progress → correct F2']] },
  { id: 'f2yasash', icon: 'file', title: ['F2 yasash → Форма №3', 'Создание Ф-2 → Форма №3', 'Build F2 → Form No.3'],
    benefit: ['Ф-2 dan счёт-фактura (Форма №3) bir bosishda — tasdiqlangan tarixdan.', 'Из утверждённой Ф-2 — счёт-фактура (Форма №3) в один клик.', 'From an approved F2 to the invoice (Form No.3) in one click.'],
    points: [['Tez kiritish: yig‘iq bo‘lim daraxti, klaviatura', 'Быстрый ввод: дерево разделов, клавиатура', 'Quick entry: section tree, keyboard'], ['Tasdiqlangan F2 qayta hisoblanmaydi', 'Утверждённая Ф-2 не пересчитывается', 'Approved F2 is never recalculated']] },
  { id: 'nakop', icon: 'layers', title: ['Nakopitelniy, Slichitelniy, LRV hujjatlari', 'Накопительная, сличительная, ЛРВ', 'Cumulative, reconciliation & LRV sheets'],
    benefit: ['Davrlar bo‘yicha jamlanma va smeta bilan solishtirish hujjatlari tayyor shaklda.', 'Накопительная по периодам и сличительные документы в готовой форме.', 'Period cumulative statements and reconciliation documents, ready-made.'],
    points: [['F2 = Nakopitelniy = F3 mosligi', 'Согласованность Ф-2 = накопительная = Ф-3', 'F2 = cumulative = F3 consistency'], ['Excel eksport', 'Экспорт в Excel', 'Excel export']] },
  { id: 'pul', icon: 'chart', title: ['Pul tahlili', 'Анализ денег', 'Money analysis'],
    benefit: ['Smeta ↔ F2 ↔ xarajat bitta ko‘rinishda; ЧЕЛ / МАШ / МАТ / ОБ bo‘yicha.', 'Смета ↔ Ф-2 ↔ затраты в одном виде; по ЧЕЛ / МАШ / МАТ / ОБ.', 'Estimate ↔ F2 ↔ cost in one view, split by ЧЕЛ / МАШ / МАТ / ОБ.'],
    points: [['Ustamali va ustamasiz summa yonma-yon', 'Суммы с накруткой и без — рядом', 'Marked-up and plain amounts side by side'], ['Ma’lum bo‘lmagan qiymat — nol emas', 'Неизвестное — не ноль', 'Unknown is never zero']] },
  { id: 'aosr', icon: 'shield', title: ['AOSR va ijro hujjatlari', 'АОСР и исполнительная документация', 'Hidden-work acts & execution docs'],
    benefit: ['Ish — hujjat — imzo — dalil zanjiri; laboratoriya va hujjat reestri.', 'Цепочка работа — документ — подпись — доказательство; лаборатория и реестр.', 'Work → document → signature → evidence; laboratory and registry.'],
    points: [['Topshirish va tasdiqlash tarixi', 'История передачи и согласования', 'Submission & approval history'], ['Excel eksport', 'Экспорт в Excel', 'Excel export']] },
  { id: 'm29', icon: 'box', title: ['M-29 va ombor', 'М-29 и склад', 'M-29 & warehouse'],
    benefit: ['Material sarfi, zayavka va ombor harakati — hujjat bilan solishtiriladi.', 'Расход материалов, заявки и движение склада — сверка с документами.', 'Material consumption, requests and stock movements — reconciled with documents.'],
    points: [['Resurs vedomosti', 'Ведомость ресурсов', 'Resource statement'], ['Zayavka · viborka · logistika', 'Заявки · выборка · логистика', 'Requests · take-off · logistics']] },
  { id: 'shartnoma', icon: 'handshake', title: ['Shartnoma va tomonlar', 'Договоры и стороны', 'Contracts & parties'],
    benefit: ['Qaysi akt va to‘lov qaysi shartnoma va obyektga tegishli — bir joyda.', 'Какой акт и платёж к какому договору и объекту — в одном месте.', 'Which certificate and payment belong to which contract and object — one place.'],
    points: [['Buyurtmachi kabineti', 'Кабинет заказчика', 'Client workspace'], ['To‘liq buxgalteriya o‘rnini bosmaydi', 'Не заменяет полную бухгалтерию', 'Not a full accounting replacement']] },
  { id: 'ai', icon: 'bot', title: ['AI yordamchi', 'AI-помощник', 'AI assistant'],
    benefit: ['Savol, izlash, tahlil — rol va ruxsat chegarasida; avtomatik yakuniy tasdiq yo‘q.', 'Вопросы, поиск, анализ — в рамках роли и прав; автоматического финального утверждения нет.', 'Questions, search, analysis within role and permission; no automatic final approval.'],
    points: [['AI narx yoki norma o‘ylab topmaydi', 'AI не выдумывает цены и нормы', 'AI never invents prices or norms'], ['Har taklif manbasi bilan', 'Каждое предложение — с источником', 'Every suggestion cites a source']] },
];
