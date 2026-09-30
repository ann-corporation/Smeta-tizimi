/* TIZIM_02 KO'ZGU — LRV_PLUS SHAKLI
 * ═══════════════════════════════════════════════════════════════════
 *
 * Foydalanuvchi (haqiqiy LRV_PLUS bilan taqqoslab):
 *   «norma ustuni yangi jadvalda umuman yo'q»
 *   «qatorlarni raqamlash 1 1.1 1.2 … kabi davom etishi kerak edi»
 *   «resurslarni turiga qarab alohida ustunlarga ham ajratishi kerak,
 *    chunki shundan nakrutka hisoblanadi»
 *   «lrv plus fayllarni o'qib chiq va hozirgi oyna jadvalimiz ham
 *    shunaqa bo'lishini … taminlashing kerak»
 *
 * Bu tekshiruvlar ko'zgu jadvalining shaklini QULFLAYDI. Ular sof
 * mantiq — GAS ishga tushirmasdan ham buzilishni ushlaydi.
 */
const fs = require('fs');
const path = require('path');

const ILDIZ = path.join(__dirname, '..', '..');
// 2026-09-30: eski GAS UI (test02/TestImport.tsx) olib tashlandi — smeta yuklash yagona SmetaYuklaNative.
// Bu yerda faqat GAS server shartnomasi qoladi; UI tekshiruvlari (5 ta) olib tashlandi.
const KOZGU = fs.readFileSync(path.join(ILDIZ, 'Smeta tizimi', 'T2_Kozgu.js'), 'utf8');
const CFG = fs.readFileSync(path.join(ILDIZ, 'Smeta tizimi', '00_Config.js'), 'utf8');

let ok = 0, xato = 0;
const tek = (nom, shart, izoh) => {
  if (shart) { ok++; console.log('  ✅ ' + nom); }
  else { xato++; console.log('  ❌ ' + nom + (izoh ? '\n       ' + izoh : '')); }
};

console.log('\n── Ustunlar LRV_PLUS bilan mos ──');

const um = KOZGU.match(/var USTUNLAR = \[([\s\S]*?)\];/);
tek('USTUNLAR ro\'yxati topildi', !!um);

let ustunlar = [];
if (um) {
  ustunlar = um[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  const KUTILGAN = ['№', 'КОД', 'НАИМЕНОВАНИЕ', 'ЕД.ИЗМ.',
                    'ХАЖМ (ед)', 'ХАЖМ (жами)', 'НАРХ (1 ед)', 'СУММА', 'ТИП',
                    'ЧЕЛ', 'МАШ', 'МАТ', 'ОБ'];
  /* ⚠️ 2026-08-26 (Antigravity): 4 ta F2/QOLDIQ ustuni qo'shildi.
     ⚠️ 2026-08-28 (Claude): ФАКТ ХАЖМ/СУММА qo'shildi — avval odam
     ko'zguda «qancha bajarildi» ni NA ko'ra, NA kirita olardi, holbuki
     u aynan shu varaqda ishlaydi. ФАКТ ХАЖМ — YAGONA tahrirlanadigan
     hisob ustuni: unga yozilsa teskari sinx `t2_fakt_belgila` ni
     chaqiradi (jami beriladi, tizim farqni hujjat qilib yozadi).
     Endi 20 ta KO'RINADIGAN (13 LRV_PLUS + 2 ФАКТ + 4 F2/qoldiq + РАЗДЕЛ)
     + 2 ta yashirin xizmat ustuni (_id, _v).
     Tartib mantiqiy: smeta → ФАКТ (bajarildi) → Ф2 (hisob) → qoldiq. */
  tek('23 ta ustun (21 ko\'rinadigan + 2 yashirin)',
      ustunlar.length === 23, 'topildi: ' + ustunlar.length);
  tek('birinchi 13 tasi LRV_PLUS tartibida',
      JSON.stringify(ustunlar.slice(0, 13)) === JSON.stringify(KUTILGAN),
      JSON.stringify(ustunlar.slice(0, 13)));
  tek('ФАКТ ustunlari Ф2 dan OLDIN (bajarildi → hisoblandi)',
      JSON.stringify(ustunlar.slice(13, 15)) ===
      JSON.stringify(['ФАКТ ХАЖМ', 'ФАКТ СУММА']),
      JSON.stringify(ustunlar.slice(13, 15)));
  tek('F2/QOLDIQ ustunlari ФАКТ dan keyin, xizmatdan oldin',
      JSON.stringify(ustunlar.slice(15, 20)) ===
      JSON.stringify(['F2 HAJM', 'F2 НАРХ', 'F2 SUMMA', 'QOLDIQ HAJM', 'QOLDIQ SUMMA']),
      JSON.stringify(ustunlar.slice(15, 19)));
  tek('xizmat ustunlari OXIRIDA',
      ustunlar[21] === '_id' && ustunlar[22] === '_v');
  tek('NORMA ustuni bor (avval yo\'q edi)', ustunlar.includes('ХАЖМ (ед)'));
  tek('ТИП ustuni bor — rz/bl/rs/mat/ob', ustunlar.includes('ТИП'));
  tek('kategoriya ustunlari bor', ['ЧЕЛ','МАШ','МАТ','ОБ'].every((k) => ustunlar.includes(k)));
}

/* LRV_PLUS ning o'z xaritasi 00_Config.js da. Ko'zgu undan chetlashmasin. */
const cm = CFG.match(/CHEL:(\d+), *MASH:(\d+), *MAT:(\d+), *OB:(\d+)/);
tek('00_Config.js dagi CHEL/МАШ/МАТ/ОБ tartibi o\'qildi', !!cm);
if (cm && ustunlar.length >= 13) {
  const [, chel, mash, mat, obq] = cm.map(Number);
  /* LRV_PLUS: J=10 ЧЕЛ, K=11 МАШ, L=12 МАТ, M=13 ОБ */
  const kozguTartib = ['ЧЕЛ','МАШ','МАТ','ОБ'].map((k) => ustunlar.indexOf(k) + 1);
  tek('kategoriya tartibi LRV_PLUS bilan bir xil (ЧЕЛ→МАШ→МАТ→ОБ)',
      JSON.stringify(kozguTartib) === JSON.stringify([chel, mash, mat, obq]),
      'ko\'zgu: ' + kozguTartib.join(',') + '  LRV_PLUS: ' + [chel, mash, mat, obq].join(','));
}

console.log('\n── NOM toza bo\'lsin ──');

/* Foydalanuvchi: «"        ГИЛЬЗЫ СОЕДИНИТЕЛЬНЫЕ" nima uchun oldidan joy
   tashlab ketayapdi». Daraja bo'shliq bilan ko'rsatilardi va u nomni
   ifloslantirardi — qidiruv, saralash, nusxa olish, bazaga qaytarish. */
tek('nom oldiga bo\'shliq QO\'YILMAYDI',
    !/join\('    '\)/.test(KOZGU) && /qator\[2\] = r\.nom \|\| ''/.test(KOZGU),
    'daraja rang, ТИП va № (1/1.1/1.2) orqali ko\'rinadi');

console.log('\n── Sheets formulalari ──');

/* Foydalanuvchi: «man buni exell qilib olsam obyomlarni o'zgartirsam
   formulalar avtomat ishlar edida». */
tek('ХАЖМ (жами) resursda FORMULA: blok hajmi × norma',
    /'=IF\(N\(\$F' \+ otaSatr/.test(KOZGU));
tek('СУММА resursda FORMULA: hajm × narx',
    /=IF\(ISNUMBER\(\$F' \+ qn \+ '\)\*ISNUMBER\(\$G/.test(KOZGU));
tek('«нарх йўқ» matni formulani buzmaydi (ISNUMBER)',
    /ISNUMBER\(\$G/.test(KOZGU));
tek('blok СУММА = resurslari yig\'indisi', /'=SUM\(\$H' \+ bb\.ilk/.test(KOZGU));
tek('razdel СУММА faqat 1-daraja turlarini qo\'shadi (SUMIFS)',
    /sumifs\('bl'\) \+ '\+' \+ sumifs\('mat'\) \+ '\+' \+ sumifs\('ob'\)/.test(KOZGU),
    'hammasini qo\'shsa blok ham, resurslari ham sanalib ikki baravar bo\'lardi');
tek('kategoriya ustuni ham FORMULA',
    /qator\[kUst - 1\] = '=IF\(\$H' \+ qn \+ '=""' \+ AJR/.test(KOZGU));
tek('sarlavhadagi JAMI va kategoriyalar FORMULA',
    /q3\[C_SUMMA - 1\] = '=SUM\(\$J\$3:\$M\$3\)'/.test(KOZGU) &&
    /q3\[C_KAT1 - 1\] = '=SUM\(J'/.test(KOZGU));

/* Formula ustunlari ustiga yozilsa formula o'chib jadval jim buziladi */
tek('hisob ustunlari qulflanadi (СУММА, ТИП, kategoriya)',
    /СУММА — формула/.test(KOZGU) && /ТИП ва ЧЕЛ\/МАШ\/МАТ\/ОБ — формула/.test(KOZGU));
tek('butun varaq QULFLANMAYDI (tahrir endi saqlanadi)',
    !/sh\.protect\(\)/.test(KOZGU));

console.log('\n── Avtomatik sinxron (tugmasiz) ──');

/* Foydalanuvchi: «man sanga aytgandimku bu sheetsda o'zgartirsa avtomat
   database da o'zgarishi kerak». */
tek('onEdit tirgagi bor', /function t2VaraqOnEdit\(e\)/.test(KOZGU));
tek('tirgak varaq yaratilganda o\'rnatiladi',
    /_t2VaraqTirgakOrnat\(ss\.getId\(\)\)/.test(KOZGU));
tek('faqat odam kiritadigan ustunlar sinxronni uyg\'otadi',
    /if\(u2 < 3 \|\| u1 > 7\) return;/.test(KOZGU));
/* Har tahrirda yozish o'nlab ortiqcha so'rov bo'lardi */
tek('bir seriya tahrir — BITTA yozish (kechiktirish)',
    /T2_SINX_KECHIKISH/.test(KOZGU) && /_t2SinxRejalashtir/.test(KOZGU));
tek('navbatda turgani bo\'lsa yangi tirgak yasalmaydi',
    /=== 't2VaraqSinxFon'\) return;/.test(KOZGU),
    'aks holda 20 ta tirgak limiti tez to\'lardi');
tek('fon tirgagi O\'ZINI o\'chiradi', /deleteTrigger\(trg\[i\]\)/.test(KOZGU));
tek('tirgak limiti tekshiriladi va OCHIQ aytiladi',
    /trg\.length >= 18/.test(KOZGU) && /holat:'limit'/.test(KOZGU));

console.log('\n── Formula hujjat TILIDA to\'g\'ri bo\'lsin ──');

/* Foydalanuvchining hujjati polyak tilida (`zł`): u yerda o'nlik kasr
   vergul, shuning uchun argument ajratgichi NUQTALI VERGUL. Vergulli
   formula «Formula parse error» berib butun jadvalni #ERROR! qildi. */
tek('ajratgich SINAB aniqlanadi, taxmin qilinmaydi',
    /function _t2Ajratgich\(sh\)/.test(KOZGU) && /=SUM\(1,2\)/.test(KOZGU) &&
    /=SUM\(1;2\)/.test(KOZGU));
tek('formulalarda AJR ishlatiladi, qattiq vergul emas',
    !/\+ qn \+ '\),\$F/.test(KOZGU) && /AJR \+/.test(KOZGU));
tek('aniqlanmasa xavfsiz odatiy qiymat', /return ',';\s*\/\/ ma'lum bo/.test(KOZGU) ||
    /return ',';\s+\/\* ma'lum/.test(KOZGU) || /return ',';/.test(KOZGU));

/* Formulalar ikkala ajratgichda ham to'g'ri yig'ilishi kerak */
for (const AJR of [',', ';']) {
  const qn = 13, ota = 12, oH = '$H14:$H20', oI = '$I14:$I20';
  const sumifs = (t) => 'SUMIFS(' + oH + AJR + oI + AJR + '"' + t + '")';
  const lar = [
    '=IF(N($F' + ota + ')*N($E' + qn + ')=0' + AJR + '""' + AJR + '$F' + ota + '*$E' + qn + ')',
    '=IF(ISNUMBER($F' + qn + ')*ISNUMBER($G' + qn + ')' + AJR + '$F' + qn + '*$G' + qn + AJR + '"")',
    '=' + sumifs('bl') + '+' + sumifs('mat') + '+' + sumifs('ob'),
  ];
  const teskari = AJR === ',' ? ';' : ',';
  const yomon = lar.filter((f) => {
    let d = 0;
    for (const c of f) { if (c === '(') d++; else if (c === ')') d--; if (d < 0) return true; }
    return d !== 0 || f.includes(teskari);
  });
  tek('«' + AJR + '» ajratgichda formulalar butun', !yomon.length, yomon.join(' | '));
}

console.log('\n── Tahrir KEYINGI hisobda yo\'qolmasin ──');

/* apiT2Ishla zanjirida t2_markirovka bor, u t2_qator ni O'CHIRIB xom
   ma'lumotdan qayta quradi — endigina saqlangan tahrir yo'q bo'lardi. */
tek('qaytishdan keyin apiT2Ishla CHAQIRILMAYDI',
    !/apiT2VaraqQaytar[\s\S]*?hisob = apiT2Ishla/.test(KOZGU),
    't2_markirovka t2_qator ni o\'chirib qayta quradi — tahrir yo\'qolardi');
tek('yangi JAMI faqat O\'QILADI', /t2_obyekt_jami\?id=eq/.test(KOZGU));

console.log('\n── Atama: «ko\'zgu» emas ──');

/* Foydalanuvchi: «tayyor mahsulot nomi ustida nima uchun ko'zgu deysan,
   bir ilmiyroq nom topsangchi». */
tek('hujjat nomi «ИШЧИ СМЕТА»', /faylNomi = obyekt \+ ' — ИШЧИ СМЕТА'/.test(KOZGU));
tek('API nomi apiT2VaraqYarat', /function apiT2VaraqYarat\(/.test(KOZGU));

console.log('\n── № va NORMA manbai ──');

tek('№ smetaning ASL raqamidan (r.raqam)', /qator\[0\] = r\.raqam \|\| ''/.test(KOZGU),
    'oddiy qator sanog\'i (xom_qator) odam izlaydigan belgi emas');
tek('NORMA `r.norma` dan olinadi', /C_NORMA - 1\] = \(r\.norma/.test(KOZGU));
tek('ХАЖМ (жами) `r.hajm` dan olinadi', /C_HAJM - 1\]\s*= \(r\.hajm/.test(KOZGU));
tek('t2_daraxt dan norma/raqam so\'raladi (view yangilangan)',
    /t2_daraxt/.test(KOZGU));

console.log('\n── Kategoriya ustunlari: IKKI MARTA sanalmasin ──');

tek('kategoriya summasi FAQAT resurs qatorida yoziladi',
    /if\(resursmi\)\{\s*\n\s*var kUst/.test(KOZGU),
    'blok/razdel summasi bolalarining yig\'indisi — qo\'shilsa ikki marta sanaladi');
tek('ЧЕЛ/МАШ/ОБ aniq, qolgani МАТ',
    /r\.kat === 'ЧЕЛ'/.test(KOZGU) && /r\.kat === 'МАШ'/.test(KOZGU) &&
    /r\.kat === 'ОБ'/.test(KOZGU) && /МАТ — qolgani/.test(KOZGU));

/* Taqsimot mantiqini haqiqiy raqamlar bilan sinaymiz (Fast food 1этаж) */
const namuna = [
  { tur: 'rz',  kat: null,  summa: 744054071.73 },   // razdel — sanalmaydi
  { tur: 'bl',  kat: null,  summa: 588205.56 },      // blok  — sanalmaydi
  { tur: 'rs',  kat: 'ЧЕЛ', summa: 137467242.72 },
  { tur: 'rs',  kat: 'МАШ', summa: 16648419.35 },
  { tur: 'mat', kat: 'МАТ', summa: 471236584.66 },
  { tur: 'ob',  kat: 'ОБ',  summa: 118701825.00 },
  { tur: 'rs',  kat: null,  summa: 100 },            // kat yo'q → МАТ
];
const ust = { 'ЧЕЛ': 0, 'МАШ': 0, 'МАТ': 0, 'ОБ': 0 };
for (const r of namuna) {
  const resursmi = (r.tur === 'rs' || r.tur === 'mat' || r.tur === 'ob');
  if (!resursmi || r.summa === null) continue;
  if (r.kat === 'ЧЕЛ') ust['ЧЕЛ'] += r.summa;
  else if (r.kat === 'МАШ') ust['МАШ'] += r.summa;
  else if (r.kat === 'ОБ') ust['ОБ'] += r.summa;
  else ust['МАТ'] += r.summa;
}
const jamiUst = ust['ЧЕЛ'] + ust['МАШ'] + ust['МАТ'] + ust['ОБ'];
const resursJami = namuna
  .filter((r) => ['rs', 'mat', 'ob'].includes(r.tur))
  .reduce((a, r) => a + r.summa, 0);
const hammaJami = namuna.reduce((a, r) => a + r.summa, 0);

tek('kategoriyalar yig\'indisi = RESURSLAR yig\'indisi',
    Math.abs(jamiUst - resursJami) < 0.01,
    jamiUst + ' ≠ ' + resursJami);
/* Razdel va blok summasi bolalarining yig'indisi. Agar ular ham
   kategoriya ustuniga tushsa, yig'indi resurslarnikidan OSHIB ketadi. */
tek('razdel/blok kategoriyaga TUSHMAYDI',
    Math.abs(jamiUst - hammaJami) > 1 && jamiUst < hammaJami,
    'ikki marta sanash bor: ' + jamiUst + ' vs ' + hammaJami);
tek('kategoriyasiz resurs МАТ ga tushadi',
    Math.abs(ust['МАТ'] - (471236584.66 + 100)) < 0.01);

console.log('\n── Ogohlantirish saqlanadi ──');

tek('narx yo\'q bo\'lsa 0 EMAS, «нарх йўқ»', /'нарх йўқ'/.test(KOZGU),
    '0 yozilsa hujjat resursni «bepul» deb ko\'rsatardi');
tek('to\'liq bo\'lmagan JAMI ogohlantirish bilan',
    /ЖАМИ ТЎЛИҚ ЭМАС/.test(KOZGU));
tek('kategoriya jamlanmasi sarlavhada ko\'rsatiladi', /katJami/.test(KOZGU));

console.log('\n── Sheets → baza qaytish yo\'li ──');

/* Foydalanuvchi: «bu sheets oynasida ishlangan ishlar supabase ga ham
   o'ta olishi kerak edi». Ko'zgu endi bir tomonlama emas. */
tek('apiT2VaraqQaytar bor', /function apiT2VaraqQaytar\(/.test(KOZGU));

/* Qatorni ANIQLASH — qator raqami bilan emas, o'zgarmas id bilan.
   Qator qo'shilsa/o'chsa raqam suriladi va tahrir boshqa resursga tushardi. */
tek('yashirin `_id` va `_v` ustunlari yoziladi',
    /'_id', '_v'/.test(KOZGU) && /qator\[C_ID - 1\]\s*= r\.id/.test(KOZGU));
tek('ular ko\'zdan yashiriladi, lekin o\'chirilmaydi',
    /hideColumns\(C_ID, 2\)/.test(KOZGU));
/* ⚠️ 2026-08-28: `_id` endi QATTIQ INDEKS bilan emas, SARLAVHADAN
   topiladi (`iId`). Sabab: ФАКТ ustunlari qo'shilgach indeks 17 dan 19 ga
   surildi va qattiq raqam eski ko'zgularni buzardi. Sarlavhadan izlash
   ustun tartibi kelajakda yana o'zgarsa ham ishlaydi. */
tek('qaytishda qator `_id` orqali topiladi',
    /var id = Number\(qiy\[i\]\[iId\]\)/.test(KOZGU) &&
    /sn === '_id'/.test(KOZGU));
tek('ФАКТ varaqdan bazaga qaytadi (t2_fakt_belgila)',
    /t2_fakt_belgila/.test(KOZGU));
/* Takroriy hujjat xavfi: joriy fakt `t2_daraxt` da YO'Q, faqat
   `t2_qator_holat` da. O'qilmasa har sinx yangi hujjat yaratardi. */
tek('joriy ФАКТ `t2_qator_holat` dan o\'qiladi (takror hujjat bo\'lmasin)',
    /faktJoriy\[/.test(KOZGU) && /_t2HolatlarOl\(ob\.id\)/.test(KOZGU));

/* Ziddiyat — «oxirgi yozgan yutadi» BO'LMASLIGI kerak */
tek('kutilgan versiya yuboriladi', /p_kutilgan_versiya: kutilganV/.test(KOZGU));
tek('ziddiyat ro\'yxatga yig\'iladi, jim o\'tkazilmaydi',
    /ziddiyat\.push\(\{/.test(KOZGU));

/* FAQAT odam kiritadigan maydonlar qaytadi */
const mm = KOZGU.match(/var MAYDON = \[([\s\S]*?)\];/);
tek('qaytariladigan maydonlar ro\'yxati bor', !!mm);
if (mm) {
  const maydonlar = (mm[1].match(/nom: '(\w+)'/g) || []).map((s) => s.split("'")[1]);
  tek('faqat nom/birlik/hajm/narx',
      JSON.stringify(maydonlar) === JSON.stringify(['nom', 'birlik', 'hajm', 'narx']),
      JSON.stringify(maydonlar));
  tek('СУММА va kategoriya QAYTARILMAYDI (hisobdan keladi)',
      !maydonlar.includes('summa') && !maydonlar.includes('kat'));
}

/* Narx o'zidan to'qilmasin */
tek('bo\'sh katak 0 deb YOZILMAYDI',
    /if\(xom === '' \|\| xom == null\) continue;/.test(KOZGU),
    '0 «bepul» degan ma\'noni beradi — bu yolg\'on hujjat');
tek('«нарх йўқ» yozuvi son deb o\'qilmaydi',
    /indexOf\('нарх'\) >= 0\) continue/.test(KOZGU));

/* ⚠️ Bu yerda avval «yozilgach apiT2Ishla chaqiriladi» tekshiruvi bor edi.
   U XATO edi: apiT2Ishla zanjiridagi t2_markirovka `t2_qator` ni o'chirib
   xom ma'lumotdan qayta quradi va endigina saqlangan tahrirni yo'q qilardi.
   Endi teskarisi tekshiriladi — «Tahrir KEYINGI hisobda yo'qolmasin». */

console.log('\n── Sinx halqasi va varaqdagi ziddiyat ──');

/* Reja 7.4: «Supabase → Sheets yozuvi user edit deb qayta qabul
   qilinmasin». Qayta chizish minglab katakni yozadi va har biri
   onEdit ni uyg'otadi — sinxron bekorga ishga tushardi. */
tek('chizish bayrog\'i bor', /_t2ChizishBoshlandi/.test(KOZGU) &&
    /_t2ChizishTugadi/.test(KOZGU));
tek('onEdit chizish paytida chetlab o\'tadi',
    /if\(_t2ChizilmoqdaMi\(\)\) return;/.test(KOZGU));
tek('bayroq XATO holatida ham tozalanadi',
    /_t2ChizishTugadi\(\);\s*\n\s*return \{ok:false/.test(KOZGU),
    'aks holda sinxron umr tugagunicha jim o\'chib turardi');
tek('bayroq umri cheklangan (osilib qolmasin)',
    /T2_CHIZISH_UMRI/.test(KOZGU));

/* Reja 7.8: «Sheetsda qator aniq status bilan ko'rsatiladi».
   MAJBURIY, chunki sinxron FONDA ishlaydi — ziddiyatni faqat panelga
   qaytarsak odam uni hech qachon ko'rmaydi va tahriri yo'qoladi. */
tek('ziddiyat VARAQDA belgilanadi', /setBackground\('#FFCDD2'\)/.test(KOZGU));
tek('katakka tushuntirish izohi ilinadi',
    /setNote\('⚠️ BAZAGA YOZILMADI/.test(KOZGU));
tek('eski belgilar tozalanadi', /setBackground\(null\)\.clearNote\(\)/.test(KOZGU),
    'aks holda tuzatilgan qator qizil bo\'lib qolardi');

console.log('\n── Bezak hujjatni yiqitmasin ──');

/* setFrozenColumns(3) butun ko'zguni yaratilmasdan qoldirgan edi:
   1/2/4-qatorlar butun kenglikda birlashtirilgan, ustunni 3-dan
   muzlatish o'sha birlashmani o'rtasidan kesadi. */
tek('setFrozenColumns CHAQIRILMAYDI', !/sh\.setFrozenColumns\(/.test(KOZGU),
    'banner birlashmasi bilan birga ishlamaydi — ko\'zgu umuman yaralmasdi');
tek('setFrozenRows himoyalangan', /try\{ sh\.setFrozenRows/.test(KOZGU));
tek('hideColumns himoyalangan', /try\{ sh\.hideColumns/.test(KOZGU));
tek('setBorder himoyalangan', /try\{[\s\S]{0,160}setBorder/.test(KOZGU));

/* sh.clear() birlashmalarni olib tashlamaydi — ustun soni o'zgarsa
   eski birlashma yangisi bilan to'qnashardi. */
tek('sarlavha zonasi avval breakApart qilinadi',
    /breakApart\(\)/.test(KOZGU));

console.log('\n' + ok + ' o\'tdi, ' + xato + ' yiqildi');
process.exit(xato ? 1 : 0);
