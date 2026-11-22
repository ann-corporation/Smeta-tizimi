/**
 * MCP server ko'rsatmalari — YAGONA matn: lokal stdio server (server.ts) va masofaviy Cloudflare Worker (smeta-mcp-remote)
 * shu yerdan oladi (dublikat yozilmaydi).
 */

/** Qisqa `instructions` (MCP initialize javobi). */
export const KORSATMA = 'QURAI (T2) bazasi bilan to\'g\'ridan-to\'g\'ri ishlash. Pul: NDS siz; ustamasiz + ustamali (ИТОГО-4), NDS alohida; null — noma\'lum (0 emas). '
  + 'Yozuvchi toollar avtomatik snapshot oladi (snapshot sxemasi bo\'lsa), bazaga audit yozadi; dry_run:true — preview + ROLLBACK. '
  + 'RPC aktori: SMETA_AKTOR_ID yoki aktor_tanla. Sxema: `sxema` tooli. '
  + 'Rasmiy Ф-2 Excel: `f2_excel` (avval preview — token narxi; `tasdiq:true` token yechadi va faylni yozadi). '
  + 'Transport (3 tur: ish / t·km / foiz; material uchun bitta usul): transport_tekshir, transport_belgila, transport_yoy (qoidalar — smeta://qoidalar «Transport»; transport ikki marta olinmaydi). Saytdagi Transport paneli va Jarvis ham shu RPC lardan foydalanadi.';

/** Domen qoidalari (har LLM to'g'ri ishlatishi uchun; masofaviy serverda `smeta://qoidalar` resursi). */
export const QOIDALAR = `# QURAI (T2) — domen qoidalari

## Pul
- Barcha narx va summalar **NDS (QQS) siz**. QQS faqat alohida yorliq bilan ko'rsatiladi («QQS bilan»).
- Har summa ikki ko'rinishda: **ustamasiz** (to'g'ridan-to'g'ri xarajat) va **ustamali** (nakrutka kaskadi, ИТОГО-4). Ustama foizlari smeta podvalidan olinadi.
- \`null\` — **noma'lum** (narx yo'q), **0 emas**. Narx 0 — ongli nol. Kategoriya noma'lum qism ustamasiz qo'shiladi va izohda aytiladi.
- Minus qator normal (normaga keltirish) — ishorasi bilan saqlanadi, tashlanmaydi.

## Transport (3 tur — material uchun BITTA usul; ikki marta olinmaydi)
- **ish**: Е310/С310 (avtovozka), Е311 (pogruzka-razgruzka) — oddiy bl qatorlar (yuk: grunt/chiqindi). Material transporti emas.
- **tkm**: mahalliy ommaviy material (asfalt, ГПС, shag'al, beton, temirbeton) — «Расчёт затрат транспорта» varag'i: t·km qatori materialning tagida (kod «Т·КМ», kat МАШ, norma/hajm = material x zichlik x km). Material \`transport_usul = tkm\` bo'ladi va podval transport-% bazasidan chiqariladi.
- **foiz**: podvaldagi «ТРАНСПОРТ ... ПРИВОЗНЫЕ МАТЕРИАЛЫ %» (sukut, usul NULL). **narx_ichida**: yetkazish material narxida (qo'shimcha transport yo'q; %-bazadan chiqariladi).
- Smeta yuklanganda transport varag'i bo'lsa: \`transport_yoy\` (dry_run standart true) — preview'dagi farq/topilmaganlarni foydalanuvchiga ko'rsating, so'ng tasdiqlang. Usulni qo'lda belgilash: \`transport_belgila\`. Tekshirish: \`transport_tekshir\` (xato_soni = 0 bo'lishi shart; F-2 tasdiqlash aks holda rad etiladi). Transport uchun alohida «tender / qo'shimcha» bo'lim ochilmaydi.
## Smeta
- **Asl smeta qatorlari o'zgarmaydi (const).** Fakt, F2, zamena, qo'shimcha ish — alohida qatlam. Asl qatorni tahrirlash/o'chirish yo'q.
- Ustuvorlik: avval mavjud smeta qatori/normasi → keyin **zamena** (zamena_qosh) → oxirgi chora **qo'shimcha ish** (qoshimcha_ish).
- Faqat \`versiya_holat = 'faol'\` qatorlar joriy smeta; almashtirilgan versiyalar tarix (F2 tarixi ularda).
- Daraxt: rz (bo'lim) → bl (ish) → rs/mat/ob (resurslar). Summalar barglar (rs/mat/ob) bo'yicha; ish (bl) narxsiz.

## Fakt va F2
- Fakt — bajarilgan hajm (fakt_yoz, delta: + yoki −). F2 — buyurtmachiga topshiriladigan akt.
- MINUS qatorlar («normaga keltirish», hajm<0): asosga fakt yozilsa jufti ulush bo'yicha avtomatik ergashadi; eski bo'shliqlar — minus_fakt (korik → qollash, obyektma-obyekt).
- **F2 narxi = max(smeta narxi, xarid/shartnoma narxi QQS siz)** (f2_qoralama_yangila \`narx_qoida:"max"\` standart).
- F2 hajmi fakt qoldig'idan (f2_mumkin) oshsa — bloklanmaydi, ogohlantiriladi. Narxsiz qoralama bloklanmaydi; tasdiqda narx kerak.
- Tasdiqlangan F2 muzlaydi: bekor qilinmaydi, faqat tuzatish/storno. F2 = Nakopitelniy = F3 (bir manba).
- F3 (forma3) — tasdiqlangan F2 lardan.

## Egasining amaliy qoidalari (PTO ish tartibi — majburiy)
- Javob o'zbek tilida, sodda: avval natija (raqam), keyin qisqa izoh. Joyni qator raqami bilan emas, nomi/bo'limi bilan ayting.
- Summani ko'rsatish tartibi: avval **QQS bilan** (obyekt qiymati), keyin ustamali QQS siz, kerak bo'lsa ustamasiz. Birlik narxi doim QQS siz.
- Ustama foizlari — smeta podvalidagi nominal foizlar; «effektiv %» ishlatilmaydi. F-2 ning o'z podvali bor (podval_tahrir) — smeta podvalini o'zgartirish F-2 ni o'zgartirmaydi.
- F-2 narxi = max(smeta, xarid/shartnoma narxi QQS siz) — so'ramasdan qo'llang. Bir mahsulotga bir necha yetkazuvchi narxi bo'lsa — arifmetik o'rtacha va foydalanuvchiga xabar.
- Ustuvorlik: mavjud smeta normasi → zamena (asl qator tagida) → oxirgi chora qo'shimcha ish. Qo'shimcha ish tegishli bo'limda, texnologik joyida (ota_qator_id); «СМЕТАДАН ТАШҚАРИ» bo'limi ochilmaydi.
- Material o'sha bo'lsa — faqat sarf/narx tuzatiladi, zamena yozilmaydi.
- F-2 qator tartibi smetadagidek. Bitta obyekt + bitta oy = bitta F-2; taxminiy ish uchun alohida F-2 ochilmaydi.
- **Tasdiqlangan F-2 ga tegilmaydi** (faqat tuzatish/storno, foydalanuvchi aniq so'rasa).
- Fakt smeta hajmidan oshmasin. F-2 hajmini o'zgartirganda faktni ham moslang (f2_qoralama_tahrir + fakt_yoz delta) — ikkisi bir xil bo'lsin; F-2 ni faktga avtomatik tenglashtirmang, faqat foydalanuvchi so'rasa.
- Tuzatishdan keyin fakti 0 qolgan qo'shimcha/zamena qatori olib tashlanadi.
- Fakt bo'yicha noaniqlik bo'lsa (bajarilganmi-yo'qmi) — taxmin qilmang, foydalanuvchidan so'rang.
- Lot/shartnoma bo'yicha jami summa — \`f2_jami\` (kompaniya_id, oy, holat, shartnoma_id).
- Har o'zgarishdan keyin: nima o'zgardi, summa oldin → keyin (QQS bilan), snapshot raqami — qisqa hisobot.

## Yozish tartibi (masofaviy server)
- Har yozuvchi tool **standart dry_run:true** — preview + ROLLBACK, bazaga hech narsa yozilmaydi.
- Haqiqiy yozish: \`dry_run:false\` **va** \`tasdiq:true\`. Avval dry_run bilan natijani foydalanuvchiga ko'rsating, roziligini oling.
- Haqiqiy yozishdan oldin avtomatik snapshot olinadi (snapshot_royxat / snapshot_qaytar bilan qaytarish mumkin); audit bazaga foydalanuvchi bilan yoziladi.
- Faqat o'z kompaniyangiz obyektlari ko'rinadi; boshqa kompaniya id si rad etiladi.
`;
