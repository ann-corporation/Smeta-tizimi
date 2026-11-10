/**
 * MCP server ko'rsatmalari — YAGONA matn: lokal stdio server (server.ts) va masofaviy Cloudflare Worker (smeta-mcp-remote)
 * shu yerdan oladi (dublikat yozilmaydi).
 */

/** Qisqa `instructions` (MCP initialize javobi). */
export const KORSATMA = 'Smeta tizimi (T2) bazasi bilan to\'g\'ridan-to\'g\'ri ishlash. Pul: NDS siz; ustamasiz + ustamali (ИТОГО-4), NDS alohida; null — noma\'lum (0 emas). '
  + 'Yozuvchi toollar avtomatik snapshot oladi (snapshot sxemasi bo\'lsa), bazaga audit yozadi; dry_run:true — preview + ROLLBACK. '
  + 'RPC aktori: SMETA_AKTOR_ID yoki aktor_tanla. Sxema: `sxema` tooli.';

/** Domen qoidalari (har LLM to'g'ri ishlatishi uchun; masofaviy serverda `smeta://qoidalar` resursi). */
export const QOIDALAR = `# Smeta tizimi (T2) — domen qoidalari

## Pul
- Barcha narx va summalar **NDS (QQS) siz**. QQS faqat alohida yorliq bilan ko'rsatiladi («QQS bilan»).
- Har summa ikki ko'rinishda: **ustamasiz** (to'g'ridan-to'g'ri xarajat) va **ustamali** (nakrutka kaskadi, ИТОГО-4). Ustama foizlari smeta podvalidan olinadi.
- \`null\` — **noma'lum** (narx yo'q), **0 emas**. Narx 0 — ongli nol. Kategoriya noma'lum qism ustamasiz qo'shiladi va izohda aytiladi.
- Minus qator normal (normaga keltirish) — ishorasi bilan saqlanadi, tashlanmaydi.

## Smeta
- **Asl smeta qatorlari o'zgarmaydi (const).** Fakt, F2, zamena, qo'shimcha ish — alohida qatlam. Asl qatorni tahrirlash/o'chirish yo'q.
- Ustuvorlik: avval mavjud smeta qatori/normasi → keyin **zamena** (zamena_qosh) → oxirgi chora **qo'shimcha ish** (qoshimcha_ish).
- Faqat \`versiya_holat = 'faol'\` qatorlar joriy smeta; almashtirilgan versiyalar tarix (F2 tarixi ularda).
- Daraxt: rz (bo'lim) → bl (ish) → rs/mat/ob (resurslar). Summalar barglar (rs/mat/ob) bo'yicha; ish (bl) narxsiz.

## Fakt va F2
- Fakt — bajarilgan hajm (fakt_yoz, delta: + yoki −). F2 — buyurtmachiga topshiriladigan akt.
- **F2 narxi = max(smeta narxi, xarid/shartnoma narxi QQS siz)** (f2_qoralama_yangila \`narx_qoida:"max"\` standart).
- F2 hajmi fakt qoldig'idan (f2_mumkin) oshsa — bloklanmaydi, ogohlantiriladi. Narxsiz qoralama bloklanmaydi; tasdiqda narx kerak.
- Tasdiqlangan F2 muzlaydi: bekor qilinmaydi, faqat tuzatish/storno. F2 = Nakopitelniy = F3 (bir manba).
- F3 (forma3) — tasdiqlangan F2 lardan.

## Yozish tartibi (masofaviy server)
- Har yozuvchi tool **standart dry_run:true** — preview + ROLLBACK, bazaga hech narsa yozilmaydi.
- Haqiqiy yozish: \`dry_run:false\` **va** \`tasdiq:true\`. Avval dry_run bilan natijani foydalanuvchiga ko'rsating, roziligini oling.
- Haqiqiy yozishdan oldin avtomatik snapshot olinadi (snapshot_royxat / snapshot_qaytar bilan qaytarish mumkin); audit bazaga foydalanuvchi bilan yoziladi.
- Faqat o'z kompaniyangiz obyektlari ko'rinadi; boshqa kompaniya id si rad etiladi.
`;
