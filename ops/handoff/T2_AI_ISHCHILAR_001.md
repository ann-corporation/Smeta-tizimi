# T2-AI-ISHCHILAR-001 — AI ishchilar platformasi (kasb agentlari, model registri, xarajat nazorati)

Egasi: Claude (noutbuk). Status: in_progress. Hujjat: docs/architecture/T2_AGENT_PLATFORM_V1.md.

## 2026-10-18 — owner-authorized Codex continuation: Studio → Jarvis

Base `90a36f53fdf578ea2c65cff694fb9a14bcece530`; branch `codex/jarvis-studio-context-20261018`; worktree `C:/Temp/GAS-jarvis-studio-context-20261018`, mashina `noutbuk-jarvis-continuation`. Egasi Claude limitidan keyin davom ettirishni bevosita so‘radi. Main'dagi price-index/auto-pricing/local-estimate sibling tuzatishlari qayta qilinmadi; dirty boshqa worktree fayllari saqlandi.

- Studio header: «Qoralamani Jarvis bilan muhokama qilish». Eski companyId=NULL qoralama faqat operator shu tugmani bosganda tanlangan kompaniyaga mahalliy bog‘lanadi. Boshqa kompaniyaga allaqachon bog‘langan qoralama bu tugma orqali ko‘chirilmaydi. Bu canonical server save emas.
- `lib/jarvis/studio-kontekst.ts`: memory-only bitta publisher, company/page/draft scope, eski cleanup yangi source'ni o‘chirmaydi; qat’iy DTO va 6000 belgi limiti.
- `useStudioKontekst.ts`: faqat savol yuborilganda oxirgi editor snapshotini oladi. Mavjud `smetaXulosasi` va `DocCalc` qayta ishlatiladi; pul/qoldiq formulasi yozilmagan. Resource lines `NULL`/0 va decimal strings bilan aniq; unknown→0 aggregation yo‘q. Katta hujjat summary/resource sample ekani ochiq, to‘liq o‘qildi deyilmaydi.
- `AiChat.tsx` → `t2-agent-ish.ts` → mavjud `/api/agent-ish` `kasb_savol`. Server DB kategoriyasi `smeta_pul`ni roldan ham, read-modeldan ham tasdiqlamaguncha qoralamani modelga bermaydi. Boshqa company/route yoki katta payload modeldan oldin rad etiladi. Qoralama tashqi/ishonchsiz data blokida; canonical smeta/F2 emas. Qoralama bilan savolda harakat takliflari ham serverda chiqarilmaydi — readonly. Studio ichidagi alohida Smetachi AI command oqimi o‘zgarmagan.
- Rapid duplicate submit, company/page/draft almashuvi va katalog kutilayotgandagi Stop himoyasi. Oldingi request allaqachon providerga ketgan bo‘lsa, browser abort provayder to‘lovini bekor qiladi deb va’da qilinmaydi.
- UI’da qoralama konteksti mavjudligi ko‘rsatiladi, uch yangi RU/EN matn bor. I18N dictionary lease continuation uchun AI taskga aniq ko‘chirildi; boshqa Codex F2 lane’iga yozilmadi.

Tekshiruv: dastlabki full Vitest2128PASS17skip; undan keyingi final source uchun yakuniy gate natijalari branch commit/Obsidian receipt’da qayd etiladi. 30k synthetic work fixture prompt limit/truncationni tekshiradi; real fayllarning 530-sheet korpus natijasi oldingi Claude xabari, bu continuationda qayta yugurtirilmadi.

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
