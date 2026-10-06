# T2-AI-ISHCHILAR-001 — AI ishchilar platformasi (kasb agentlari, model registri, xarajat nazorati)

Egasi: Claude (noutbuk). Status: in_progress. Hujjat: docs/architecture/T2_AGENT_PLATFORM_V1.md.

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
