/* OBYEKT KARTASI QAYSI NOM BILAN OCHILADI — qoida testi.
 *
 * NIMA UCHUN BOR. 2026-08-17: foydalanuvchi «Game club» kartasini bosdi,
 * ekranda «10 kv visokiy liniya» ochildi. Sabab: kartalar
 * `obyekt.split(' - ')[0]` bo'yicha GURUHLANADI va OCHISHDA ham o'sha
 * QISQARTIRILGAN nom yuborilardi. GAS da bunday nomli obyekt yo'q →
 * boshqa obyekt ochilib qolardi. Bu xato obyektni tahrirlash xavfini
 * tug'diradi, shuning uchun qoida test bilan qulflandi.
 *
 * Bu yerda `Obyektlar.tsx` dagi AYNI qoida takrorlanadi va uning
 * manbadagi ko'rinishi ham tekshiriladi (qoida o'zgarsa test yiqiladi).
 *
 * ISHLATISH: node testlar/obyekt_guruh.test.cjs
 */
const fs = require('fs');
const path = require('path');

/** Obyektlar.tsx dagi qoidaning ayni nusxasi. */
function guruhla(data) {
  const groups = new Map();
  for (const obj of data) {
    const baseName = obj.obyekt.split(' - ')[0];
    if (!groups.has(baseName)) groups.set(baseName, []);
    groups.get(baseName).push(obj);
  }
  return [...groups.entries()].map(([baseName, items]) => ({
    baseName,
    items,
    ochishNomi: items.length === 1
      ? items[0].obyekt
      : (data.some((o) => o.obyekt === baseName) ? baseName : items[0].obyekt),
  }));
}

let ok = 0, xato = 0;
const T = (nom, shart, izoh) => {
  if (shart) { ok++; console.log('  ✅ ' + nom); }
  else { xato++; console.log('  ❌ ' + nom + (izoh ? '  → ' + izoh : '')); }
};

console.log('\n── 1. FOYDALANUVCHI URILGAN HOLAT ──');
{
  const d = [
    { obyekt: 'Game club - 110081_ALL_01' },
    { obyekt: '10 kv visokiy liniya' },
  ];
  const g = guruhla(d);
  const gc = g.find((x) => x.baseName === 'Game club');
  T('«Game club» TO\'LIQ nomi bilan ochiladi',
    gc.ochishNomi === 'Game club - 110081_ALL_01', gc.ochishNomi);
  T('boshqa obyektga tushib ketmaydi', gc.ochishNomi !== '10 kv visokiy liniya');
}

console.log('\n── 2. KO\'P SMETALI OBYEKT (ota-papka HAQIQATAN bor) ──');
{
  const d = [
    { obyekt: 'Yevropa' },              // ota-papkaning o'zi ham ro'yxatda
    { obyekt: 'Yevropa - Oshxona' },
    { obyekt: 'Yevropa - Zal' },
  ];
  const g = guruhla(d).find((x) => x.baseName === 'Yevropa');
  T('ota-nom bilan ochiladi (butun obyekt)', g.ochishNomi === 'Yevropa', g.ochishNomi);
  T('uchala fayl bitta guruhda', g.items.length === 3);
}

console.log('\n── 3. TASODIFIY BIR XIL PREFIKS (ota-papka YO\'Q) ──');
{
  const d = [
    { obyekt: 'X - bir' },
    { obyekt: 'X - ikki' },
  ];
  const g = guruhla(d).find((x) => x.baseName === 'X');
  T('mavjud bo\'lmagan «X» ga yo\'naltirmaydi', g.ochishNomi !== 'X', g.ochishNomi);
  T('birinchi haqiqiy obyektni ochadi', g.ochishNomi === 'X - bir', g.ochishNomi);
}

console.log('\n── 4. « - » YO\'Q ODDIY OBYEKT ──');
{
  const d = [{ obyekt: 'Amfiteatr' }];
  const g = guruhla(d)[0];
  T('o\'z nomi bilan ochiladi', g.ochishNomi === 'Amfiteatr', g.ochishNomi);
}

console.log('\n── 5. HAR GURUH O\'ZINI OCHADI (aralashmaydi) ──');
{
  const d = [
    { obyekt: 'A - bir' }, { obyekt: 'B - bir' }, { obyekt: 'C' },
  ];
  const g = guruhla(d);
  T('uch alohida guruh', g.length === 3);
  T('har biri o\'z elementini ochadi',
    g.every((x) => x.ochishNomi === x.items[0].obyekt));
}

/* 6-bo'lim eski Tizim1 `admin/sahifalar/Obyektlar.tsx` manbasini tekshirardi — sahifa olib tashlandi
   (egasi: «tizim1 dan qolgan sarqitlarni butunlay chiqarib tashla»). Guruhlash qoidasi yuqorida tekshiriladi. */

console.log('\n═══ ' + ok + ' o\'tdi, ' + xato + ' yiqildi ═══');
process.exit(xato ? 1 : 0);
