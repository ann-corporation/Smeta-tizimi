/* TIZIM_02 — OBYEKT-MARKAZLI IMPORT SHARTNOMASI
 * ═══════════════════════════════════════════════════════════════════
 *
 * NEGA BU TEST BOR (ikki bosqichli tarix):
 *
 * 1) Kod BITTA fayl ichidagi varaqlar bilan ishlardi. Foydalanuvchi:
 *    «res va lrv alohida-alohida hujjat bo'ladiku, sani bu koding faqat
 *    hujjat ichidagi sahifani o'qiyapdi».
 *
 * 2) Hujjat darajasi qo'shilgach ham tartib TESKARI qoldi — fayldan
 *    boshlanardi. Foydalanuvchi: «SHU BU OBYEKTNI RES QISMI, BU LRV
 *    QISMI DEB HAR BIR OBYEKTNI YARATIB ICHINI TO'LDIRISH IMKONI
 *    BERILISHI KERAK».
 *
 * Ikkala xato ham `tsc` ga ko'rinmaydi — GAS tomonida tip yo'q.
 * Shuning uchun shartnoma SHU YERDA qulflanadi.
 */
const fs = require('fs');
const path = require('path');

const ILDIZ = path.join(__dirname, '..', '..');
// 2026-09-30: eski GAS UI (test02/TestImport.tsx) olib tashlandi — smeta yuklash yagona SmetaYuklaNative.
// Bu yerda faqat GAS server shartnomasi qoladi; UI tekshiruvlari (38 ta) olib tashlandi.
const YUKLASH = fs.readFileSync(path.join(ILDIZ, 'Smeta tizimi', 'T2_Yuklash.js'), 'utf8');

let ok = 0, xato = 0;
const tek = (nom, shart, izoh) => {
  if (shart) { ok++; console.log('  ✅ ' + nom); }
  else { xato++; console.log('  ❌ ' + nom + (izoh ? '\n       ' + izoh : '')); }
};

console.log('\n── GAS: hujjat darajasi ──');

/* Imzo (obyektNom, hujjatlar) — eski (obyektNom, faylId, varaqlar) EMAS */
const imzo = YUKLASH.match(/function\s+apiT2YuklanganImport\s*\(([^)]*)\)/);
tek('apiT2YuklanganImport imzosi topildi', !!imzo);
if (imzo) {
  const argl = imzo[1].split(',').map((s) => s.trim()).filter(Boolean);
  tek('2 ta argument (obyektNom, hujjatlar)', argl.length === 2,
      'topildi: ' + JSON.stringify(argl));
  tek('2-argument «hujjatlar» deb nomlangan', argl[1] === 'hujjatlar');
  tek('eski `faylId` argumenti QOLMAGAN', !argl.includes('faylId'));
}

tek('hujjat roli o\'qiladi', /\bd\.rol\b/.test(YUKLASH) && /\bhj\.rol\b/.test(YUKLASH));
tek('hujjat fayl_id o\'qiladi', /\bd\.fayl_id\b|\bhj\.fayl_id\b/.test(YUKLASH));
tek('hujjat ichidagi varaqlar o\'qiladi', /\bhj\.varaqlar\b/.test(YUKLASH));
tek('varaq `olinsin` bilan filtrlanadi', /v\.olinsin\s*!==\s*false/.test(YUKLASH));

/* LOKALKA majburiy — ishlar ro'yxatisiz narx bazasi o'zicha ma'nosiz */
tek('LOKALKA yo\'qligi ushlanadi',
    /lokalkaBor/.test(YUKLASH) && /LOKALKA hujjati belgilanmagan/.test(YUKLASH));

const chaqiruv = YUKLASH.match(/apiT2FaylImport\(([^)]*)\)/);
tek('apiT2FaylImport hujjatning fayl_id si bilan chaqiriladi',
    !!chaqiruv && /hj\.fayl_id/.test(chaqiruv[1]) && /hj\.rol/.test(chaqiruv[1]),
    chaqiruv ? chaqiruv[0] : 'chaqiruv topilmadi');

tek('fayl nomidan rol taklif qilinadi', /rol_taklif/.test(YUKLASH));
tek('asl_nom qaytariladi (Drive vaqt-prefiksisiz)', /asl_nom:\s*nom/.test(YUKLASH));

const rx = YUKLASH.match(/var rolTaklif = (\/[^/]+\/)\.test/);
tek('rol taxmini regexi topildi', !!rx);
if (rx) {
  const q = new RegExp(rx[1].slice(1, -1));
  const holatlar = [
    ['Amfiteatr_RES.xlsx', 'svodka'], ['СВОДНЫЙ РАСЧЕТ.xlsx', 'svodka'],
    ['Ресурсная ведомость.xls', 'svodka'], ['Amfiteatr_LRV.xlsx', 'lokalka'],
    ['ЛОКАЛЬНАЯ СМЕТА 01-02.xls', 'lokalka'], ['PROGRESS_2026.xlsx', 'lokalka'],
  ];
  const yiqilgan = holatlar.filter(([n, k]) =>
    (q.test(n.toUpperCase()) ? 'svodka' : 'lokalka') !== k);
  tek('rol taxmini 6/6 nomda to\'g\'ri', !yiqilgan.length, yiqilgan.map((x) => x[0]).join(', '));
}

console.log('\n── GAS: obyekt-markazli API ──');

/* Obyekt fayldan OLDIN tug'iladi va keyin to'ldiriladi */
tek('apiT2ObyektYarat bor', /function\s+apiT2ObyektYarat\s*\(/.test(YUKLASH));
tek('apiT2ObyektHujjatlar bor', /function\s+apiT2ObyektHujjatlar\s*\(/.test(YUKLASH));
tek('apiT2HujjatOchir bor', /function\s+apiT2HujjatOchir\s*\(/.test(YUKLASH));

/* Bitta hujjatning bir necha varag'i t2_manba da alohida qator bo'lib
   yotadi; foydalanuvchi esa HUJJATNI ko'rishi kerak */
tek('t2_manba fayl_id bo\'yicha guruhlanadi',
    /xarita\[q\.fayl_id\]/.test(YUKLASH) && /h\.varaqlar\.push/.test(YUKLASH));
tek('bir hujjatda ikki rol bo\'lsa belgilanadi', /rol_ziddiyat/.test(YUKLASH));

/* Importni bekor qilish ≠ asl hujjatni yo'qotish */
tek('hujjat o\'chirishda faqat t2_manba tozalanadi',
    /_t2Ochir\('t2_manba'/.test(YUKLASH) && !/setTrashed|removeFile\(/.test(YUKLASH));
tek('hujjat o\'chgach qayta hisoblanadi',
    /apiT2HujjatOchir[\s\S]{0,1200}apiT2Ishla/.test(YUKLASH));

console.log('\n── Drive API v3 (v2 shakli emas) ──');

/* Loyihada appsscript.json da Drive v3 yoqilgan. v2 shakli
   (`title`, `parents:[{id}]`) berilsa Drive «Internal Error» qaytaradi
   va fayl umuman yuklanmaydi — jonli sinovda aynan shunday bo'ldi. */
const APPS = fs.readFileSync(path.join(ILDIZ, 'Smeta tizimi', 'appsscript.json'), 'utf8');
const driveV3 = /"userSymbol":\s*"Drive"[\s\S]{0,120}?"version":\s*"v3"/.test(APPS);
tek('appsscript.json da Drive v3', driveV3);

tek('T2 kodida v2 shakli YO\'Q',
    !/parents:\s*\[\{\s*id:/.test(YUKLASH) && !/\btitle:\s*'/.test(YUKLASH),
    'v3 da maydonlar `name` va `parents:[id]`');
tek('borini takrorlamay _excelToNative chaqiriladi',
    /_excelToNative\(fayl\.getId\(\), papka\.getId\(\)/.test(YUKLASH),
    '05_Papka.js dagi funksiyada zip-mime uchun zaxira yo\'li ham bor');
tek('konvert yiqilsa fayl hajmi ham aytiladi',
    /fayl\.getSize\(\)/.test(YUKLASH),
    'hajm chegarasi sababmi yoki yo\'qmi — buni bilish kerak');

/* Konvert nusxa «(GS) » prefiksi bilan nomlanishi shart — `apiT2ManbaFayllar`
   asl .xlsx va konvert nusxasini AYNAN shu prefiks bo'yicha guruhlaydi.
   Nom v3 ning `name` maydoni orqali beriladi (alohida setName kerak emas). */
tek('konvert nusxaga «(GS) » nomi beriladi',
    /_excelToNative\([\s\S]{0,120}'\(GS\) ' \+ saqlanadigan\)/.test(YUKLASH));

/* «Sahifalarni nazorat qilish» = olib tashlash EMAS, qo'shish HAM.
   t2_manba faqat import qilinganlarini biladi — to'liq ro'yxat Drive'dan. */
tek('apiT2HujjatVaraqlar bor', /function\s+apiT2HujjatVaraqlar\s*\(/.test(YUKLASH));
tek('openById oldidan MIME tekshiriladi (V8 qulashi)',
    /apiT2HujjatVaraqlar[\s\S]{0,700}getMimeType\(\) !== MimeType\.GOOGLE_SHEETS[\s\S]{0,400}openById/
      .test(YUKLASH));

console.log('\n── Frontend: obyekt → qismlar ──');

/* ⚠️ 2026-08-25: `apiT2ObyektYarat` → `apiT2YangiObyektYarat` ga
   almashtirildi — endi Drive papka tuzilmasini (Смета/F2, Лойиха
   ҳужжатлари, Виборка) ham bitta amalda yaratadi. */

/* Bazadagi hujjat yoyilganda Drive'dan TO'LIQ ro'yxat tortilishi kerak —
   aks holda o'tgan safar belgilanmagan varaqni qo'shib bo'lmaydi. */

console.log('\n── Hujjatni solishning IKKI yo\'li ──');

/* Foydalanuvchi: «ikkita hujjat yuklanadi YOKI shu paytgacha
   yuklanganlar tanlanadi — biri lrv biri res».
   Ya'ni yuklash yagona yo'l EMAS; tanlash ham teng huquqli yo'l. */

console.log('\n── GAS: manba ro\'yxati bitta hujjat = bitta qator ──');

/* Har yuklash Drive'da IKKI fayl qoldiradi (asl .xlsx + konvert Sheets).
   Ikkalasini ko'rsatish chalkashlik: .xlsx tanlansa import yiqiladi. */
tek('«(GS) » prefiksi va kengaytma bo\'yicha guruhlanadi',
    /replace\(\/\^\\\(GS\\\)\\s\*\/, ''\)\.replace\(\/\\\.\(xlsx\|xlsm\|xls\)\$\/i, ''\)/.test(YUKLASH));
tek('fayl_id doim O\'QILADIGAN (Sheets) nusxaniki',
    /if\(sheetsmi\)\{ bor\.fayl_id = f\.getId\(\); bor\.oqiladi = true; \}/.test(YUKLASH));
tek('vaqt belgisi ko\'rsatiladigan nomdan olib tashlanadi',
    /replace\(\/\^\\d\{8\}_\\d\{6\}__\/, ''\)/.test(YUKLASH));
tek('ro\'yxatda ham rol taklifi bor', /h\.rol_taklif =/.test(YUKLASH));
tek('Sheets nusxasi yo\'q hujjat `oqiladi:false` bilan keladi',
    /if\(!h\.fayl_id\) h\.fayl_id = h\.asl_id;/.test(YUKLASH));

/* Dedup mantiqi haqiqiy _MANBA holatida ishlashi kerak */
const kalitla = (nom) => nom.replace(/^\(GS\)\s*/, '').replace(/\.(xlsx|xlsm|xls)$/i, '');
const papka = ['20260819_160939__RES', '20260819_160939__RES.xlsx',
               '20260819_160748__LRV', '20260819_160748__LRV.xlsx',
               '(GS) 20260820_090000__Amfiteatr_LRV.xlsx',
               '20260820_090000__Amfiteatr_LRV.xlsx'];
const guruh = new Set(papka.map(kalitla));
tek('6 fayl → 3 hujjat (rasmdagi holat)', guruh.size === 3, 'topildi: ' + guruh.size);

console.log('\n── Xato JIM yutilmasin ──');

/* «Tugallanmadi» deb quruq yozish — eng qimmat bug turi. Fast food
   holatida ikkala varaq ✓ o'qilgan, sabab esa `hisob.xabar` ichida
   qolib ketgan va bazani qo'lda kovlashga to'g'ri kelgan. */
tek('hisob yiqilsa sabab yuqoriga chiqariladi',
    /Hisob yiqildi: ' \+ \(hisob\.xabar/.test(YUKLASH));
tek('sabab `xatolar` ro\'yxatiga ham qo\'shiladi',
    /if\(xabar\) xatolar\.push\(xabar\);/.test(YUKLASH));
tek('hech varaq o\'qilmasa ham sabab bor',
    /Hech bir varaq o\\'qilmadi/.test(YUKLASH));

/* JAMI ekranda ko'rinishi kerak — foydalanuvchi shu raqamni so'raydi */

/* Tanlash ro'yxatida hujjat QAYSI qismda turgani aytilsin */

console.log('\n── Frontend: yuboriladigan shakl ──');


console.log('\n' + ok + ' o\'tdi, ' + xato + ' yiqildi');
process.exit(xato ? 1 : 0);
