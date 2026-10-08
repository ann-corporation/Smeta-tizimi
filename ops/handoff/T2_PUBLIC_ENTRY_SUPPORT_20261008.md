# T2-PUBLIC-ENTRY-SUPPORT-20261008 — egasi topshirig'i

2026-10-08. Aloqa raqamini ochiq saytga qo'yishga egasi bevosita ruxsat berdi:
**+998 50 501 25 66**, telefon havolasi `tel:+998505012566`.

## Maqsad
Kirish oynasi oddiy forma emas, yangi PTO uchun tushunarli public intro sayt
bo'lsin. Tizim nima qilishini haqiqiy rasmlar bilan ko'rsatsin; shu sahifadan
login/sign up va egasi bilan aloqa mumkin bo'lsin. AI savol/muammoni tushunsin,
murojaatni egasiga yetkazsin; egasi o'sha suhbatga qo'shilib javob bersin.

## Tekshirilgan mavjud holat
Base `1ef3e6d4b8b282fda8e534196c7d55d1918f135f`:
`frontend/src/kirish/KirishSahifa.tsx` login `/api/kirish`, email tasdiqlash
`/api/royxat-email-kod`, sign up `/api/royxat-ozi`, Google kirish va mavjud
rol yo'naltirishlarini ishlatadi. Yangi auth/backend yaratish kerak emas.
Hozirgi desktop split layout `h-screen overflow-hidden`, chap intro kichik
ekranda yashiriladi; uzun public landing uchun moslashtirilishi kerak.
`frontend/public/` ichida mahsulot skrinshot to'plami topilmadi.
`tomon-murojaat` authenticated tashkilotlararo domen; anonim marketing
chat o'rniga uni ko'r-ko'rona ishlatmaslik kerak.

## Sahifa tarkibi va dizayn qabul mezoni
1. Header: TIZIM_02, imkoniyatlar, qanday ishlaydi, aloqa, kirish/sign up.
2. Hero: "Smetani yuklang. Faktni kiriting. F2ni ishonch bilan tayyorlang."
   Ikki aniq CTA: "Tizimga kirish" va "Ro'yxatdan o'tish".
3. Haqiqiy UI ko'rinishlari: Smeta/LRV daraxti, ikki panelli F2 import,
   hisob/eksport va hujjat tarixi. Rasm faqat real route'dan; mijoz nomi,
   narxlari, telefon, actor ma'lumoti anonimlashtiriladi. Soxta AI mockup
   haqiqiy mahsulot skrinshoti deb berilmaydi.
4. Ish jarayoni: smeta → fakt → F2 → tasdiqlangan tarix/eksport. Faqat
   tekshirilgan imkoniyatlar; "100% xatosiz", fake customer/raqamlar yo'q.
5. Bir joydagi mavjud login/sign up; parol/password manager, email-code,
   Google auth va server xato semantics saqlanadi. Til tanlash ru/uz/en
   mavjud i18n qatlamidan; auth logikasi marketing komponentida bo'lmaydi.
6. Aloqa: tel:+998505012566, raqam matni va "Savol berish" chat CTA.
   Telegram username yoki WhatsApp mavjudligini taxmin qilib yaratmaymiz.
7. 360px telefon, tablet va desktop; barcha bo'lim scroll bilan ochiladi,
   keyboard/focus/label/contrast, reduced motion; 3D majburiy emas.

## Support — backend integratsiya kontrakti, hali implemented emas
Visitor suhbat uchun server yaratgan opaque scope/token; murojaatlar
canonical metadata omborida, operator role/auth bilan o'qiydi. Public
visitor tenant/project/F2 yoki kompaniya ichki API ma'lumotini olmaydi.
AI faqat tasdiqlangan public product knowledge yordamida gaplashadi;
muammo + route + user ixtiyoriy kontaktini yig'adi; parol/token so'ramaydi.
User xabar/aloqa saqlanishi haqida xabardor bo'ladi; data retention va
notification destination Claude kontraktida belgilanadi.

Holatlar: AI_ASSISTING → WAITING_OPERATOR → HUMAN_ACTIVE → CLOSED.
Operator qo'shilganda AI javobi to'xtaydi, kechikkan AI response ham
ko'rsatilmaydi. Server receipt bo'lgandagina "Murojaatingiz yuborildi".
Egasi yo'q paytda "operator onlayn" deb yozilmaydi; AI mavjud bo'lmasa
telefon/real ticket fallback. Notification failed bo'lsa murojaat saqlangani
va notification status alohida. Retry duplicate yaratmaydi.

Production mezoni: owner operator inbox'da suhbatni ko'radi, qo'shiladi,
xabar yuboradi, visitor shu sessiyada oladi, reload'dan keyin davom etadi;
boshqa visitor tokeni bilan tarix o'qilmaydi. Abuse/rate/size limits,
server AI budget, input isolation; arbitrary tool/DB write yo'q.

## Ish bo'linishi va integratsiya
Codex taklif: yangi `frontend/src/components/public-entry/` presentation,
mobile/accessibility testlari; exact locks Claude registry'da ajratadi.
Claude: `KirishSahifa` binding + AI platformasi/public support gateway,
operator inbox, canonical storage, notification, deployment. Mavjud
komponent/API mavjud bo'lsa qayta ishlatiladi; public endpoint invented emas.
NULL adversarial task saqlanadi; navbat Claude bilan kelishiladi.

## Status
SOURCE IMPLEMENTED (frontend checkpoint), production readiness EMAS.

Branch `codex/public-entry-ui-20261008`, task T2-PUBLIC-ENTRY-UI-20261008.
Yangi task registry'ga faqat additiv qo'shildi; boshqa task qulflari o'zgarmadi.
`PublicEntry.tsx` + scoped CSS haqiqiy KirishSahifa'ga ulandi: responsive intro,
process/features/FAQ/contact, phone, existing auth slot; 3D kirish dependency
olib tashlandi. Login/sign up/email-code/Google server oqimi saqlandi.
Login label/autocomplete/show-password va generic network error qo'shildi.
Intro matnlari uz/ru/en, kirill mavjud t() orqali. Existing auth tarjimalari
mavjud i18n qatlamidan. Tarjima to'liq mahsulot bo'yicha qayta tekshirilmadi.

`PublicSupportPort` + `SupportConversation` frontend kodi: versioned snapshot,
AI/HUMAN/WAITING/CLOSED holatlari, send/requestOperator, retry operation_id,
abort/epoch guard, timeout, 5s polling, UI/state so'nggi 100 xabar bilan
chegaralangan. Port yo'q paytda FAQ+phone; fake yuborish/chat receipt yo'q.
Bu server RLS/auth/budget/AI-human arbitrationning o'rnini BOSMAYDI.
Backend adapter `KirishSahifa`ga hali BERILMAGAN; user jonli operator chatdan
foydalana olmaydi. Claude AI platforma/backend lane bilan ulash kerak.

16 focused tests PASS: KirishSahifa existing4 + public7 + support5.
Focused oxlint PASS (warninglar tuzatildi). Functions standalone typecheck
PASS. `npm run tekshir` barcha bosqichlari PASS. Yakuniy combined Vitest
16/16 PASS. Fixture mock return tipidagi TS xato `df0b4e4`da tuzatildi,
5 support test qayta PASS. Yakuniy `npm run build` exit0: `tsc -b`, Functions
typecheck va Vite production bundle PASS (3441 module). Grid.svg resolve va
500kB chunk warninglari bor; error emas. Task frontend review uchun tayyor,
to'liq user support/prod readiness emas.
Governance PASS75task, diff-check PASS; stale CURRENT_STATE SHA warning.
Lokal HTTP200; ichki brauzer localhostga CONNECTION_REFUSED berdi, desktop/
mobile visual smoke hali UNKNOWN. Authenticated signup/login live smoke yo'q.

Qolganlar: haqiqiy anonimlashtirilgan screenshot corpus (`screenshots` prop
tayyor, rasm berilmaguncha gallery chizilmaydi), public support gateway + owner
operator inbox + receipt/notifications + human takeover server guard, real
mobile/desktop preview QA, integrator release. Main/prod/DB o'zgartirilmadi.

## 2026-10-09 — egasi v1ni rad etdi, mahsulot qamrovi revision

Egasi: introdan ro'yxatdan o'tishni xohlamaydi, ma'lumot juda kam va tizim
qamrovi to'liq ko'rsatilmagan. V1ni final design sifatida olish MUMKIN EMAS.

`product-scope.ts` source-backed public copy: 8 domain (kompaniya/loyiha,
smeta/normativ, Fakt/F2/davr, narx/oferta, ta'minot/sklad, ijro/hujjat,
shartnoma/moliya, AI/boshqaruv). Evidence `src/lib/sayt-xaritasi/pageCatalog.ts`,
`src/App.tsx`, Obsidian CODEMAP domain rows. Route borligi to'liq runtime
readiness deb olinmadi: rivojlanayotgan studio/coefficient, accounting
chegarasi, AI final approval cheklovi va role/access note ko'rsatiladi.

Hero product-first: "Qurilishni boshqaring. Faqat hujjatlarni emas." + 8
yo'nalish clickable xaritasi, 6 lavozim uchun interaktiv task/output,
5 bosqich connected chain, narx/F2/NULL/source qonunlari. Kirish formasi
pastdagi signup/login bo'limida; har CTA shu formaga focus/scroll qiladi.
Design navy hero + light editorial sections; responsive domain cards/map.
Public scope/roles uz/ru/en va avtomatik uz-Cyrl; fake KPI/testimonial yo'q.

21 focused tests PASS (old16 + scope5), focused oxlint PASS. Yakuniy full
build exit0 (app TS + Functions + Vite3442modules) va tekshir PASS. Browser
local webview attach timeout: desktop/mobile visual acceptance UNKNOWN.
Real screenshots va live support adapter bu revisionda ham ulanmagan.
