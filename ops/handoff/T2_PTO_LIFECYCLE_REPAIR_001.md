# T2-PTO-LIFECYCLE-REPAIR-001

## Tekshirilgan tuzatish

- Branch: `codex/pto-lifecycle-repair-v1`; base `1c4bfc2fe200794fa1f2b4e545b761a59f8f016d`.
- F2 lifecycle audit RPC akt IDni object FKga yozgan. Endi haqiqiy object ID ishlatiladi; akt ID audit tafsilotida saqlanadi.
- Submitted/checked bosqichida uzilgan tasdiqlash eng so‘nggi holat va versiyadan davom etadi; xatodan keyin ham ro‘yxat yangilanadi.
- Correction hujjatining bo‘sh raqami takroriy unique key bermaydi; source lock ostida yangi o‘qiladigan raqam ajratiladi.
- F3 faqat `certified_amount` oladi, generated `summa`ga fallback qilmaydi. Bir davrda bir qator ikki alohida F2 aktida bo‘lishi mumkin; bir akt manbasi ikki marta yig‘ilmaydi.
- Shartnoma rekvizitlari yetishmasa eksport bo‘sh rekvizit bilan davom etadi; mavjud noto‘g‘ri tenant/object bog‘lanishi bloklanadi.
- Nakopitelniy umumiy PTO workspace obyektini ishlatadi; obsolete async javob yangi obyekt holatini almashtirmaydi.

## Runtime dalil

Supabase ledger: `20260928103802 / t2_f2_lifecycle_audit_lineage_fix`, qo‘llangan.
Acceptance SQL ichidagi har bir behavioral transaction `ROLLBACK` bilan tugaydi.
Fast Food 1-etaj, akt 231 sinovi: submit/check/approve, operation retry, stale version, tenant boundary, correction PASS.
F2 exact source = LRV delta = F3 monthly source delta = Nakopitelniy delta, tiyingacha **241 983 934,96**.
Sinovdan keyin actual akt `draft`, version 3; haqiqiy moliyaviy tasdiqlash persist qilinmadi.

## Gate

- TypeScript browser/functions va build PASS.
- Focused 54 test PASS; full Vitest 726 PASS, 12 skipped, 113 suites PASS / 6 skipped.
- Lint PASS, mavjud warnings bor.
- Tekshir PASS; yangi migration ID mavjud boshqa ID bilan to‘qnashmasligi uchun real applied ledger ID bilan nomlandi.
- Governance PASS, CURRENT_STATE old SHA warning mavjud.
- `git diff --check` PASS.

## Authenticated Chrome smoke

User loginli `9a67de4e` Previewda Fast Food F2 tarix, F2 tayyorlash va Nakopitelniy ochildi.
F2 394 qator / 241 983 934,96, hali qoralama. Fakt 0: F2 tayyorlashning bo‘sh eligibility holati aniq.
F3 tugmasi oldingi Previewda "bitta faol shartnoma bog‘lanishi aniq emas" xatosi bilan bloklandi; yuqoridagi source tuzatish shu reproduced xatoni bartaraf qiladi.
Yangi Preview eksport smoke hali davom etmoqda; faqat qayta tekshirilgan natija final hisobotda PASS deb yoziladi.
Rasmiy biznes F2 tasdiqlashi operatorning qarori; test uchun takroriy import yoki Fakt ma’lumotlari kiritilmaydi.

## Xavfsizlik

Dirty original worktree va boshqa agentning importer/matcher source fayllari o‘zgartirilmagan.
Old lineage task source `b994c45` va keyingi fixlar main ichida mavjud: governance status completed bilan reconciled.
Rollback source business rowsni o‘chirmaydi; eski audit xatosini qaytaradi, shu sabab faqat emergency rollback uchun.
# Authenticated Preview — qo‘shimcha topilgan xatolar

Fast Food 1-etaj tanlanganda Nakopitelniy avtomatik yuklandi. To‘g‘ri xarajat
742 939 194.64, nakrutka + QQS 1 008 620 120.96 — alohida qiymatlar.
F3 yuklashda `YYYY-MM` PostgreSQL `date` parametriga yuborilgani sabab xato
takrorlandi. Read-only SQL `2026-07` uchun 22007 xatosini isbotladi;
`2026-07-01` bilan RPC ok:true, 1440 qator qaytardi. Mijoz davrni to‘liq
sanaga aylantiradi; sahifalash regression testi aynan shu sanani tekshiradi.
LRV virtual daraxti uchun nol balandlik muammosi aniq viewport bilan tuzatildi.
Ushbu qo‘shimcha uchun 24 focused test va build (ikkala TypeScript gate) PASS.
Preview: https://codex-pto-lifecycle-repair-v.smeta-tizimi.pages.dev
Code checkpoint: 8e5e94bff49664d965a38c834037b36f34cf772b.
Authenticated Chrome smoke: Fast Food LRV daraxti ochildi, ZEMLYANYE RABOTY
razdeli va BL/RS ko‘rindi. Downloads ichida haqiqiy fayllar tekshirildi:
LRV_PLUS (290570 bytes), Nakopitelniy (264185 bytes), Forma-3 (136419 bytes).
F3 hozir approved F2 yo‘qligini ochiq bildiradi; draft sum kiritilmaydi.
To‘liq Vitest: 113 suites / 728 tests PASS; 6 suites / 12 tests skipped.
Build, browser/functions tsc, lint, tekshir, governance va diff-check PASS.
F2 real moliyaviy tasdiqlash operatorga berildi; keyingi nonzero F3 browser
tekshiruvi shu operator harakatidan keyin davom etadi. Main hali o‘zgarmagan.
