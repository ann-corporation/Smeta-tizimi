/**
 * «Bu sahifa nima beradi» — birinchi foydalanishda chiqadigan o'rgatuvchi kartalar REESTRI (egasi, 2026-11-05:
 * «funksiya birinchi marta ishlatilganda tizim uni keyingi ishlarga taklif qilsin va POP-UP da nima olishini ko'rsatsin —
 * tizimni tushunmaydigan odamni O'RGATSIN»).
 *
 * YAGONA manba: AdminShell dagi «?» tugmasi va avtomatik karta (components/qollanma) faqat shu ro'yxatdan o'qiydi.
 * Matnlar — o'zbek lotin (i18n kaliti); ru/en tarjimasi `i18n/lugat/qism/qollanma.json` da, ekranda `t()` orqali.
 * Kartasi yo'q sahifada hech narsa chiqmaydi.
 */

export type QollanmaIkon = 'obyekt' | 'smeta' | 'studio' | 'podval' | 'fakt' | 'f2' | 'tarix' | 'reestr' | 'portfel' | 'nakopitelniy' | 'dizayn' | 'sozlama';

export type QollanmaKarta = {
  /** Barqaror kalit — «ko'rildi» belgisi shu bilan saqlanadi; o'zgartirilmaydi. */
  kalit: string;
  /** Qaysi sahifalarda chiqadi (yo'l prefiksi, `/` chegarasida). */
  yollar: readonly string[];
  /** Faqat shu URL parametrlari bo'lsa (masalan `portfel=1`) — aniqroq karta umumiysidan ustun. */
  parametr?: Readonly<Record<string, string>>;
  sarlavha: string;
  /** Bir qatorda: foydalanuvchi nima oladi. */
  nimaBeradi: string;
  /** Qanday ishlatiladi — 3 qisqa qadam. */
  qadamlar: readonly [string, string, string];
  /** Ixtiyoriy keyingi qadam havolasi; `{obyekt}` — joriy obyekt id si bilan almashtiriladi. */
  keyingi?: { matn: string; yol: string };
  ikon?: QollanmaIkon;
};

export const QOLLANMA_REESTR: readonly QollanmaKarta[] = [
  {
    kalit: 'obyektlar', yollar: ['/admin/obyektlar'], ikon: 'obyekt',
    sarlavha: 'Loyihalar va obyektlar',
    nimaBeradi: 'Barcha obyektlaringiz bir ro‘yxatda — har birining smetasi, bajarilgan ishi va F2 lari bir joyda turadi.',
    qadamlar: [
      '«Yangi obyekt» tugmasi bilan obyekt qo‘shing va nomini yozing.',
      'Obyekt nomini bosing — uning ish joyi ochiladi.',
      'Ish joyida smeta faylini yuklang — shundan keyin fakt va F2 ishlaydi.',
    ],
  },
  {
    kalit: 'obyekt', yollar: ['/admin/holat'], ikon: 'obyekt',
    sarlavha: 'Obyekt ish joyi',
    nimaBeradi: 'Bitta obyektning hammasi bir sahifada: smeta daraxti, bajarilgan ish, qoldiq va Excel hujjatlar.',
    qadamlar: [
      'Tepadagi ro‘yxatdan obyektni tanlang.',
      '«Keyingi qadam» paneli nima qilish kerakligini aytadi — uning tugmasini bosing.',
      '«Hujjatlar va eksport» — LRV, ostatka va slichitelniy Excel fayllari.',
    ],
  },
  {
    kalit: 'smeta-yuklash', yollar: ['/admin/holat'], parametr: { panel: 'smeta' }, ikon: 'smeta',
    sarlavha: 'Smeta yuklash',
    nimaBeradi: 'Excel smetangiz tizimga kiradi: har ish, resurs va narx qatorma-qator o‘qiladi — fakt va F2 shundan tuziladi.',
    qadamlar: [
      'Smeta XLSX faylini tanlang.',
      'Tizim topgan varaq va ustunlarni tekshiring.',
      'Yuklang — smeta obyekt daraxtida paydo bo‘ladi, podval foizlari ham o‘qiladi.',
    ],
    keyingi: { matn: 'Faktni kiriting (Fakt jurnali)', yol: '/admin/fakt?obyekt={obyekt}' },
  },
  {
    kalit: 'smeta-studio', yollar: ['/admin/smeta-studio'], ikon: 'studio',
    sarlavha: 'Smeta Studio',
    nimaBeradi: 'Smetani noldan yoki tayyor fayldan tuzasiz: ishlar ro‘yxati (LRV), narxlash va resurs vedomosti bitta oqimda.',
    qadamlar: [
      'Avval ishlar ro‘yxatini (LRV) tuzing yoki faylni yuklang.',
      'Narxlarni qo‘ying — tizim stavka va manbali narxlarni taklif qiladi.',
      'Tayyor smetani obyektga biriktiring yoki Excel qilib oling.',
    ],
  },
  {
    kalit: 'podval', yollar: ['/admin/nakrutka'], ikon: 'podval',
    sarlavha: 'Nakrutka podvali',
    nimaBeradi: 'Smeta oxiridagi ustama foizlari (podval) obyektga yoziladi — shunda har summa ustamali va ustamasiz to‘g‘ri chiqadi.',
    qadamlar: [
      'Obyekt ish joyida «Smeta» bo‘limini oching.',
      'Tizim smeta podvalidan o‘qigan foizlarni tekshiring.',
      'Saqlang — obyektning barcha summalari shu foizlar bilan hisoblanadi.',
    ],
    keyingi: { matn: 'Faktni kiriting (Fakt jurnali)', yol: '/admin/fakt?obyekt={obyekt}' },
  },
  {
    kalit: 'fakt', yollar: ['/admin/fakt'], ikon: 'fakt',
    sarlavha: 'Fakt jurnali',
    nimaBeradi: 'Bajarilgan ishni yozasiz — tizim qoldiqni o‘zi hisoblaydi va F2 ga nima chiqishini tayyorlab qo‘yadi.',
    qadamlar: [
      'Obyektni tanlang va bajarilgan hajmni kiriting (son yoki foiz, masalan 50%).',
      'Egizak obyektlarni belgilasangiz — shu fakt ularga ham ko‘chadi.',
      'Qalinlik tuzatishi bor ishlarda tuzatish qatorlari o‘zi qo‘shiladi — faqat tekshiring.',
    ],
    keyingi: { matn: 'F2 tayyorlang', yol: '/admin/f2-tayyorlash?obyekt={obyekt}' },
  },
  {
    kalit: 'f2-tayyorlash', yollar: ['/admin/f2-tayyorlash'], ikon: 'f2',
    sarlavha: 'F2 tayyorlash',
    nimaBeradi: 'Oy uchun F2 (Ф-2) faktdan o‘zi tuziladi: qatorlar, hajm va summa tayyor — siz faqat tekshirasiz.',
    qadamlar: [
      'Obyekt va oyni tanlang.',
      'Tizim taklif qilgan qatorlar va summalarni tekshiring.',
      'Qoralama qilib saqlang, keyin F2 tarixida tasdiqlang.',
    ],
    keyingi: { matn: 'F2 tarixini ochish', yol: '/admin/f2-tarix?obyekt={obyekt}' },
  },
  {
    kalit: 'f2-tarix', yollar: ['/admin/f2-tarix'], ikon: 'tarix',
    sarlavha: 'F2 tarixi',
    nimaBeradi: 'Obyektning barcha F2 lari oyma-oy: qoralamani tasdiqlaysiz, Excel olasiz, xato bo‘lsa storno (pereraschet) qilasiz.',
    qadamlar: [
      'Ro‘yxatdan F2 ni tanlang va ko‘rib chiqing.',
      'Tasdiqlang — F2 muzlaydi va rasmiy hujjat bo‘ladi.',
      'Xato topilsa — storno. Fakt allaqachon to‘g‘ri bo‘lsa, «Faktni o‘zgartirma» ni belgilang.',
    ],
    keyingi: { matn: 'F2 portfelida yig‘ib, Excel yuklang', yol: '/admin/f2-reestr?portfel=1&portfel_obyekt={obyekt}' },
  },
  {
    kalit: 'f2-reestr', yollar: ['/admin/f2-reestr'], ikon: 'reestr',
    sarlavha: 'F2 reestri va oylik paket',
    nimaBeradi: 'Barcha obyektlar bo‘yicha F2 holati bir jadvalda: qaysi oy topshirilgan, qaysi biri qolgan; oylik paket bitta tugmada.',
    qadamlar: [
      'Jadvalda obyekt va oy bo‘yicha F2 holatini ko‘ring.',
      '«Oylik paket» — oyning barcha hujjatlarini bitta paketga yig‘ing.',
      '«F2 portfeli» bo‘limi — shartnoma yoki obyektning barcha F2 lari.',
    ],
  },
  {
    kalit: 'f2-portfel', yollar: ['/admin/f2-reestr'], parametr: { portfel: '1' }, ikon: 'portfel',
    sarlavha: 'F2 portfeli',
    nimaBeradi: 'Barcha F2 laringiz bir joyda, summalari bilan, bitta tugmada Excel.',
    qadamlar: [
      'Shartnoma yoki obyektni tanlang.',
      'Tepada tasdiqlangan jami, qoralamalar va hammasi ko‘rinadi.',
      '«Yuklab olish» — «Свод» varag‘i va har F2 o‘z varag‘ida, bitta Excelda.',
    ],
  },
  {
    kalit: 'nakopitelniy', yollar: ['/admin/nakopitelniy'], ikon: 'nakopitelniy',
    sarlavha: 'Nakopitelniy vedomost',
    nimaBeradi: 'Tasdiqlangan F2 lar oyma-oy yig‘ilib boradi: smeta, fakt va topshirilgan ish bitta vedomostda — F2 bilan bir xil raqamlar.',
    qadamlar: [
      'Obyektni tanlang.',
      'Har qator bo‘yicha oylar kesimida topshirilgan ish va qoldiqni ko‘ring.',
      'Excel qilib yuklab oling.',
    ],
  },
  {
    kalit: 'hujjat-dizayn', yollar: ['/admin/hujjat-dizayn'], ikon: 'dizayn',
    sarlavha: 'Hujjatlar dizayni',
    nimaBeradi: 'Har hujjat turi uchun ko‘rinishni bir marta tanlaysiz — Excel va ko‘rish oynasi shu uslubda chiqadi.',
    qadamlar: [
      'Hujjat turini tanlang (F2, akt, vedomost…).',
      'Rang mavzusini tanlang — namunada darhol ko‘rinadi.',
      'Saqlang — keyingi barcha eksportlar shu dizaynda bo‘ladi.',
    ],
  },
  {
    kalit: 'sozlamalar', yollar: ['/admin/sozlamalar', '/admin/tizim-sozlama'], ikon: 'sozlama',
    sarlavha: 'Sozlamalar',
    nimaBeradi: 'Akkauntingiz, kompaniya va jamoa sozlamalari bir joyda — bir marta to‘ldirsangiz, hamma hujjatga o‘zi tushadi.',
    qadamlar: [
      '«Akkaunt» — faqat siz uchun: til, ko‘rinish, parol.',
      '«Kompaniya» — rekvizitlar, logotip, xodimlar va rollar.',
      'Imzo qo‘yadigan shaxslarni yozing — hujjatlarga avtomatik chiqadi.',
    ],
  },
];

const KALIT_BOYICHA = new Map(QOLLANMA_REESTR.map((k) => [k.kalit, k]));

export function kartaKalit(kalit: string | null | undefined): QollanmaKarta | null {
  return (kalit && KALIT_BOYICHA.get(kalit)) || null;
}

const yolMos = (pathname: string, yol: string) => pathname === yol || pathname.startsWith(yol + '/');

/**
 * Joriy sahifa uchun karta. `?qollanma=<kalit>` (masalan «Keyingi qadam» havolasidan) — aniq o'sha karta;
 * aks holda parametri mos va yo'li eng uzun karta. Kartasi yo'q sahifa — null.
 */
export function kartaTop(pathname: string, search = ''): QollanmaKarta | null {
  const p = new URLSearchParams(search);
  const aniq = kartaKalit(p.get('qollanma'));
  if (aniq) return aniq;
  let eng: { k: QollanmaKarta; ball: number } | null = null;
  for (const k of QOLLANMA_REESTR) {
    const yol = k.yollar.filter((y) => yolMos(pathname, y)).sort((a, b) => b.length - a.length)[0];
    if (!yol) continue;
    if (k.parametr && !Object.entries(k.parametr).every(([n, v]) => p.get(n) === v)) continue;
    const ball = yol.length * 10 + (k.parametr ? Object.keys(k.parametr).length : 0);
    if (!eng || ball > eng.ball) eng = { k, ball };
  }
  return eng?.k ?? null;
}

/** URL dan joriy obyekt id si: `/admin/holat/:id` yoki `?obyekt=` / `?portfel_obyekt=`. */
export function urlObyekti(pathname: string, search = ''): number | null {
  const m = /^\/admin\/holat\/(\d+)/.exec(pathname);
  const p = new URLSearchParams(search);
  const n = Number(m?.[1] ?? p.get('obyekt') ?? p.get('portfel_obyekt'));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Keyingi qadam havolasi: `{obyekt}` o'rniga id; obyekt noma'lum bo'lsa — o'sha parametr olib tashlanadi. */
export function keyingiYol(yol: string, obyektId: number | null): string {
  if (obyektId != null) return yol.replace(/\{obyekt\}/g, String(obyektId));
  const [asos, qs = ''] = yol.split('?');
  const p = new URLSearchParams(qs);
  for (const [n, v] of [...p.entries()]) if (v === '{obyekt}') p.delete(n);
  const s = p.toString();
  return s ? `${asos}?${s}` : asos;
}

/** Karta ichidagi barcha matnlar (tarjima testi uchun). */
export function kartaMatnlari(k: QollanmaKarta): string[] {
  return [k.sarlavha, k.nimaBeradi, ...k.qadamlar, ...(k.keyingi ? [k.keyingi.matn] : [])];
}
