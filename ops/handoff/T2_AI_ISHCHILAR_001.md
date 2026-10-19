# T2-AI-ISHCHILAR-001 — AI ishchilar platformasi (kasb agentlari, model registri, xarajat nazorati)

Egasi: Claude (noutbuk). Status: in_progress. Hujjat: docs/architecture/T2_AGENT_PLATFORM_V1.md.

## 2026-10-19 — owner-authorized Studio cost routing (Codex)

Branch `codex/smeta-ai-cost-routing-20261019`, base main `90a36f53`; oldingi `f2df36ea` Studio→Jarvis continuation saqlandi. CSV billing dalili: 9–17-oktabr, 124 generation, $4.847697; 1,048,356 input / 364,512 output, output ichida 289,701 reasoning (79.5%); 30 length ($1.730956). Hammasi `second mind` kaliti va Gemini3.5flash; endpoint/app bo'sh. Bu sarfning hammasi saytga tegishli degan isbot emas, user aytgan Gemini3.1 tanlovini taxmin bilan almashtirmang.

**Source:** `functions/_shared/smeta-ai-routing.ts`, `ai-hisobli.ts`, `ai.ts`, `api/smeta-ai.ts` va beshta test fayli. UI, canonical hisob, DB schema, ruxsat va boshqa dirty ishlar o'zgarmadi.

- PRIMARY = mavjud `t2_agent_muhit_v1` qaytargan owner/company model. Suhbat/rejalash, hujjat, normativ ish tanlash, koeffitsient va murakkab narx ma'nosi shu ekspertda qoladi. Umumiy FAST konfiguratsiyasi utility tanlovini tasodifan qimmat modelga aylantirmaydi.
- LOCAL = bitta to'liq, authoritative-reference nomzod; nom va birlik faqat NFKC/case/whitespace bo'yicha AYNAN bir xil. Actual0 mumkin, NULL/blank/bool→0 EMAS. Bu yangi narx hisoblash yoki canonical write emas, berilgan candidate IDni saqlash.
- UTILITY = bo'sh nomzod uchun qidiruv iboralari, yoki mahsulot nomi+birligi+NARXI bir xil bo'lgan reference nomzodlar. Default `google/gemini-2.5-flash-lite`, reasoning none (metadata: mandatory=false, reasoning supported, public /models 2026-10-19). Faqat server `SMETA_AI_UTILITY_MODEL` aniq override qiladi; browser workload/modelni belgilamaydi. Configured boshqa helper uchun minimal effort; mosligini integrator tekshirsin.
- Narx/marka/diametr/birlik farqi, dimensional formula, kompaniya smetasidagi narx yoki qisqartirilgan source — to'g'ridan primary. AI confidence yolg'iz gate emas. Utility medium/past/yo'q/soxta ID/chala/format xatosi — faqat shu subset primaryga; bir helper generation, alohida helper JSON repair loop yo'q. Har model chaqiruvi mavjud budget va sarf RPC orqali; denied walletni escalation chetlab o'tmaydi.
- `ishonchliChaqir`: length valid JSON bo'lsa ham rad; primary repair, length'dan keyin low effort; oxirgi urinishda ekspert arzon fallback bilan almashtirilmaydi. Chegara 3 generation. Studio uchun bo'sh length natijasi gatewaydan usage bilan qaytadi, shunda metering hisoblaydi; yashirin boshqa-provider fallback bilan birinchi sarf yo'qolmaydi. Bu to'liq all-provider retry billing tuzatishi EMAS.
- OpenRouter generation ID, finish reason, reasoning token o'qiladi (reasoning output ichida, ikki marta yig'ilmaydi). `AI_USAGE` server log: generation/actor/company/profile/amal/model/workload/input/output/reasoning/cost/finish. Prompt/fayl/kalit yozilmaydi. RPC sarf jurnali o'zgarmadi. HTTP/timeout/fallback barcha urinishlari va provider CSV bilan to'liq reconciliation hali ochiq.
- Qaytish: `SMETA_AI_UTILITY_ENABLED=0` — expert-only narx yo'li; kalitni o'chirish/rotate yoki schema rollback kerak emas. Response additive `routing`: local/utility/primary/escalated/models.

**Acceptance:** synthetic/mocked model, empty & truncated responses, medium/forged choices, grade/unit mismatch, strict0/NULL, tenant rejection before local route, per-attempt wallet, partial source, duplicate IDs, 40 exact rows → 0 provider calls. Haqiqiy qo'shimcha paid AI generation sinov uchun yuborilmaydi. Real sifat va dollar tejam acceptance: bir xil saved task/source bilan primary-only va routing candidate natijalarini authorized nazoratli evalda solishtirish; qaysi qatorda qaror/manba/summa farq qilsa releasega o'tmasin. Tejam foizi yoki 'sifat aslo tushmadi' hali VERIFIED emas.

Yakuniy frozen-source full Vitest **2189PASS / 17skip**, 297filePASS / 8skip (305file), 73.26s; final app+Functions TS/build PASS; lint exit0 baseline warnings, tekshir PASS, governance PASS79task (baseline stale main_sha warning), diff-check PASS. Oldingi parallel test yurayotganida qo'shilgan length regressiya testining birinchi run'i eski module snapshotiga tushib yiqildi; source freeze qilib to'liq qayta yugurtirildi, final yashil. Bu xato yashirilmagan, test yumshatilmagan.

Production/main/config o'zgartirilmagan; Preview/release SHA mailboxda alohida. Oldingi F2 edit/key exposure/E8 vazifalari yopilmaydi.

## 2026-10-18 — owner-authorized Codex continuation: Studio → Jarvis

Base `90a36f53fdf578ea2c65cff694fb9a14bcece530`; branch `codex/jarvis-studio-context-20261018`; worktree `C:/Temp/GAS-jarvis-studio-context-20261018`, mashina `noutbuk-jarvis-continuation`. Egasi Claude limitidan keyin davom ettirishni bevosita so‘radi. Main'dagi price-index/auto-pricing/local-estimate sibling tuzatishlari qayta qilinmadi; dirty boshqa worktree fayllari saqlandi.

- Studio header: «Qoralamani Jarvis bilan muhokama qilish». Eski companyId=NULL qoralama faqat operator shu tugmani bosganda tanlangan kompaniyaga mahalliy bog‘lanadi. Boshqa kompaniyaga allaqachon bog‘langan qoralama bu tugma orqali ko‘chirilmaydi. Bu canonical server save emas.
- `lib/jarvis/studio-kontekst.ts`: memory-only bitta publisher, company/page/draft scope, eski cleanup yangi source'ni o‘chirmaydi; qat’iy DTO va 6000 belgi limiti.
- `useStudioKontekst.ts`: faqat savol yuborilganda oxirgi editor snapshotini oladi. Mavjud `smetaXulosasi` va `DocCalc` qayta ishlatiladi; pul/qoldiq formulasi yozilmagan. Resource lines `NULL`/0 va decimal strings bilan aniq; unknown→0 aggregation yo‘q. Katta hujjat summary/resource sample ekani ochiq, to‘liq o‘qildi deyilmaydi.
- `AiChat.tsx` → `t2-agent-ish.ts` → mavjud `/api/agent-ish` `kasb_savol`. Server DB kategoriyasi `smeta_pul`ni roldan ham, read-modeldan ham tasdiqlamaguncha qoralamani modelga bermaydi. Boshqa company/route yoki katta payload modeldan oldin rad etiladi. Qoralama tashqi/ishonchsiz data blokida; canonical smeta/F2 emas. Qoralama bilan savolda harakat takliflari ham serverda chiqarilmaydi — readonly. Studio ichidagi alohida Smetachi AI command oqimi o‘zgarmagan.
- Rapid duplicate submit, company/page/draft almashuvi va katalog kutilayotgandagi Stop himoyasi. Oldingi request allaqachon providerga ketgan bo‘lsa, browser abort provayder to‘lovini bekor qiladi deb va’da qilinmaydi.
- UI’da qoralama konteksti mavjudligi ko‘rsatiladi, to‘rtta yangi RU/EN matn bor. I18N dictionary lease continuation uchun AI taskga aniq ko‘chirildi; boshqa Codex F2 lane’iga yozilmadi.

Tekshiruv: full Vitest **2131 PASS / 17 skip**, 294 file PASS / 8 skip; keyingi strict catalogue-price va early-role fixlari bilan **106 focused PASS / 9 file**. App TS + Functions TS, build, lint(exit0, baseline warnings), tekshir, governance va diff-check PASS. 30k synthetic work fixture prompt limit/truncationni tekshiradi; real fayllarning 530-sheet korpus natijasi oldingi Claude xabari, bu continuationda qayta yugurtirilmadi.

Topilgan qo‘shimcha narx xatosi: server `Number(null)` / `Number('')` / `Number(false)`ni 0 deb qabul qilardi. Catalogue DTO endi faqat haqiqiy finite numeric narxni oladi: null/blank/boolean chiqariladi, actual numeric0 saqlanadi (5 regression). Modelga draft UUID/companyId yuborilmaydi, faqat nom va xulosa. Bu qoida narx indeksining manbalarini kanonik smeta narxiga yashirin almashtirmaydi.

**Release gate:** authenticated browser automation bu sessiyada mavjud emas. Source/component/API mocks prod login yoki real model javobi sifatini isbotlamaydi. Owner vertical smoke ochiq: Studio→qoralama→Jarvis button→shu smeta savoli→edit→yangi savol→switch company→old context yo‘q. Main/production tayyor deb e’lon qilinmasin, toki live smoke dalili bo‘lmaguncha.

**Ochiq alohida ishlar:** E8-2-1-1 qorishma resursi; OpenRouter haqiqiy billing/usage auditi. User keltirgan Claude yozuvida kalit stdout’da chiqqani REPORTED, bu yerda qiymati tekshirilmadi/saqlanmadi. Kalit rotatsiyasi egasi bilan alohida, sirni chat/log/vaultga yozmang. Yangi pullik model chaqiruvi yoki DB migration bajarilmadi.

## Boshqa agentlar uchun shartnoma (SMETA-AI va boshqalar)
1. **Model chaqiruvi FAQAT `frontend/functions/_shared/agent-hisob.ts` `aiHisobli(env, actor, kompaniya_id, profil, amal, {system,text,tier,model?,jsonSchema?})` orqali.**
   U (a) oylik limit va kompaniya hamyonini tekshiradi (limit yo'q = AI yo'q), (b) modelni chaqiradi, (c) haqiqiy sarfni (OpenRouter `usage.cost`) yozadi va kompaniya hamyonidan ustama bilan tokenga aylantirib yechadi.
   To'g'ridan `aiCall` (`_shared/ai.ts`) ni biznes yo'lida ishlatmang — xarajat nazoratdan chiqib ketadi.
2. **Model tanlash:** `t2_agent_muhit_v1(actor, kompaniya, profil)` javobidagi `model` (kompaniya → platforma tanlovi) ni `req.model` ga bering (`modelOf(m)`). Standart — `google/gemini-2.5-flash-lite` (openrouter/auto EMAS).
3. **Profil:** o'z AI ishchingiz uchun `t2_agent_profile` ga qator (kod `smeta_ai` — men qo'shdim, `permission_mode='draft'`). Platforma modeli AI markazida (Boshqaruv paneli) ko'rinadi/o'zgaradi.
4. **Lavozim chegarasi:** kim smeta-AI dan foydalanishi `t2_agent_kasb_v1` dagi `kategoriyalar` bilan aniqlanadi — `smeta_pul` toifasi bor rollar (boss, admin, director, rahbar, superadmin, pto). Prorab/usta/skladchi smeta narxini AI orqali ham ko'rmasligi shart.
5. **Qoidalar/xotira:** agent promptini `_shared/agent-prompt.ts` `tizimPrompti(muhit, profil)` bilan boshlang (yadro qoidalar o'zgarmas); tashqi/ishonchsiz matn — `tashqiMatnOra`.
6. **Yozuv:** AI hech qachon biznes jadvalga yozmaydi; harakat = taklif → foydalanuvchi tasdig'i → foydalanuvchining O'Z sessiyasi bilan mavjud nomli gateway (`sb-yoz`).

## Men yozmaydigan joylar (smeta-studio qulfi)
`frontend/src/lib/{smeta-studio,smeta-ai,narx-katalog,catalog-extraction}/`, `functions/api/{smeta-ai,smeta-studio,norm-katalog,narx-katalog}.ts`, `SmetaStudio*.tsx`.

## Mening qulfim
`functions/_shared/agent-*.ts`, `functions/api/agent-ish*.ts`, `src/api/t2-agent-ish.ts`, `src/umumiy/ui/Ai*.tsx`, `src/admin/ai-markaz/`, `t2_agent_*` migratsiyalari.
