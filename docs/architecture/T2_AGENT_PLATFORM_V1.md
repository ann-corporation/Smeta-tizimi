# T2 Agent Platform V1 — OpenRouter va boshqa modellar bilan ishlaydigan agentlar

Status: DIZAYN + 1-qadam (AI shlyuzida OpenRouter provayderi) · 2026-10-06
Asos: `T2_AGENT_CONTROL_PLANE_V1.md` (10 profil, run/approval/tool_call jadvallari prod'da bor), `tizim02/AI_AGENT_CONNECTOR.md` (HMAC read-only tool connector), `functions/_shared/ai.ts` (provider-agnostik shlyuz).

## Ikki sinf agent (egasi talabi)

| | **Tizim agentlari** (platforma) | **Kompaniya agentlari** (tenant) |
|---|---|---|
| Doira | `global` — faqat platforma superadmini ishga tushiradi | `company` (yoki ichida `project`/`object`) — faqat shu kompaniya a'zosi |
| Maqsad | tizim salomatligi, katalog/narx sifati, xavfsizlik auditi, migratsiya/CI kuzatuvi, token-xarajat nazorati, agentlarning o'zini nazorat qilish | smeta/F2/hujjat/ombor/moliya/grafik/sifat bo'yicha yordam (mavjud 9 domen profili) |
| Ma'lumot | platforma jadvallari va **agregat**lar; tenant ma'lumotini faqat anonim hisob-kitob uchun | faqat o'z `kompaniya_id` — boshqa kompaniyani **ko'ra olmaydi, hatto adashib ham** |
| Yozish | hech qachon to'g'ridan; `draft → superadmin tasdig'i → nomli RPC` | hech qachon to'g'ridan; `draft → foydalanuvchi tasdig'i (rol bo'yicha) → nomli RPC` |
| Profil | `platform_orchestrator` (+ yangi `platform_auditor`, `platform_cost`) | `company_access`, `pto_smeta`, `document_control`, `procurement`, `warehouse`, `finance`, `schedule_execution`, `quality_handover`, `project_contract` |

## Qonunlar (buzilmaydi)

1. **Kalit faqat serverda.** `OPENROUTER_API_KEY` (va boshqalar) — Cloudflare Pages secret. Git, frontend, log, agent kontekstida YO'Q. Provayder nomi/URL/model klientdan qabul qilinmaydi.
2. **Model darajasi serverda belgilanadi** (`AiTier`: `fast` | `coding` | `reasoning`). Daraja → model xaritasi env (`OPENROUTER_MODEL_FAST/CODING/REASONING`) orqali; kodda qattiq yozilmaydi, almashtirish = env o'zgartirish.
3. **Agent hech qachon business jadvalga yozmaydi.** Tool = barqaror capability kodi (`allowed_tools`), SQL/URL emas. Yozuv — faqat tasdiqdan keyin mavjud kanonik RPC orqali (control plane `t2_agent_approval_decide_v1`).
4. **Tenant izolyatsiyasi kod emas, baza darajasida.** Kompaniya agentining har tool chaqiruvi `t2_agent_scope_guard_v1` dan o'tadi (actor sessiyadan, kompaniya a'zoligi/roli bazada). Model promptiga boshqa kompaniya ma'lumoti **hech qachon** kirmaydi: kontekst faqat scope-guard o'tgan RPC lardan yig'iladi.
5. **Prompt-injection chegarasi.** Hujjat/Excel/PDF/tashqi matn — *ma'lumot*, buyruq emas. Model chiqishi JSON-schema bilan tekshiriladi; domen validatori tasdiqlamaguncha moliyaviy yozuvga aylanmaydi (mavjud `invalid_response` qoidasi).
6. **Har chaqiruv o'lchanadi va cheklanadi.** Token hisobi `t2_token_harakat` (kompaniya hamyoni) bilan; tizim agentlari uchun alohida platforma byudjeti. Kompaniya byudjeti tugasa — agent to'xtaydi (jim ortiqcha xarajat yo'q).
7. **Audit.** Run, tool receipt, approval, model/provayder/token — `t2_agent_run/_tool_call/_approval` + javob metadata (`provider`, `model`, `usage`).
8. **Fail-closed.** Provayder sozlanmagan/javob bermasa agent «mavjud emas» deydi; boshqa tenant kontekstiga yoki qo'lda taxminga o'tmaydi.

## Model darajalari (tavsiya, egasi tasdiqlaydi)

- `fast` — tasniflash, qidiruv, formatlash, oddiy tekshiruv (arzon model).
- `coding` — strukturali ekstraksiya, shablon/skript, aniq formatli chiqish.
- `reasoning` — murakkab tahlil (narx mosligi, smeta ziddiyatlari, audit). Faqat natijasi mustaqil tekshiriladigan ishlar.
Xaritadagi aniq model nomlarini egasi belgilaydi (OpenRouter narxi/mavjudligi o'zgaradi).

## Bosqichlar

1. ✅ **Shlyuz:** `ai.ts` ga `openrouter` provayderi + `tier` (kalit bo'lmasa eski tartib o'zgarmaydi; usage `prompt_tokens` ham o'qiladi). Test: `_shared/ai-openrouter.test.ts`.
2. **Agent runtime** (`/api/agent-run`): `run_start` → scope-guard → kontekst (faqat ruxsatli tool'lar) → `aiCall({tier})` → JSON-schema tekshiruv → `draft` (yozuv emas) → approval. Fon ishlari — mavjud `t2_job`.
3. **Kompaniya agenti #1:** `document_control` yoki `pto_smeta` (read-only + draft) — eng ko'p foyda/eng kam xavf. UI: mavjud `AgentControlCenter`.
4. **Token o'lchash:** har chaqiruvdan `usage` → `t2_token_harakat` (kompaniya) / platforma byudjeti; oylik limit.
5. **Tizim agentlari:** `platform_auditor` (RLS/izolyatsiya regressiya tekshiruvi, sxema drift), `platform_cost` (token/xarajat anomaliyasi). Faqat superadmin, faqat o'qish + hisobot.
6. **Tanlangan provayder siyosati:** kompaniya o'zi OpenRouter kaliti ulashi (BYOK) yoki platforma tokenlari — egasi qarori.

## Ish muhiti (2026-10-06) — HAQIQIY holat
- **Qoidalar:** `t2_agent_qoida` — `yadro` (8 ta, bazada trigger bilan o'zgarmas: UPDATE/DELETE/INSERT bloklangan), `global` (superadmin tasdiqlagan), `company` (shu kompaniya admin/boss/director tasdiqlagan). Versiyalanadi, eski arxivga o'tadi.
- **Xotira:** `t2_agent_xotira` — kompaniya xotirasi faqat shu kompaniyaga; platforma xotirasi (kompaniya NULL) faqat tizim agentiga. Promptda «ishonchsiz eslatma» sifatida (buyruq emas).
- **Internet:** faqat `t2_agent_manba` dagi admin tasdiqlagan domenlar, faqat https/443, IP/localhost/ichki nomlar rad, har redirect qayta tekshiriladi, 1 MB / 8 s chegarasi; olingan matn `<TASHQI_MANBA>` to'sig'ida «ishonchsiz»; har olish `t2_agent_veb_olish` jurnaliga (url, sha256). Yangi domen — faqat taklif → SUPERADMIN tasdig'i.
- **Qoidalarni tatbiq etish (admin ruxsati bilan):** `veb_tahlil` — manbadan ≤3 qoida taklifi (dalil: url+sha256) → `t2_agent_taklif` (kutilmoqda) → admin `taklif_qaror` → faqat shundan keyin qoida faol. Global maqsad — superadmin; kompaniya maqsadi — shu kompaniya admini. Kompaniya kontekstidan global qoida taklif qilib bo'lmaydi (tenant ma'lumoti oqib chiqmasin), faqat manba domeni.
- **O'zini rivojlantirish:** `rivojlanish` taklifi — tasdiqlansa faqat «tasdiqlandi» g'oya bo'lib qoladi; kod/migratsiya/deploy ni agent bajarmaydi.
- **Shlyuz:** `/api/agent-ish` (GET muhit|takliflar; POST xotira_yoz, taklif_yarat, taklif_qaror, veb_ol, savol, veb_tahlil). `AGENT_ISH_YOQILGAN=1` bo'lmaguncha 503. Doira bazada model chaqiruvidan OLDIN tekshiriladi.
- **Sinov:** `supabase/tests/t2_agent_ish_muhiti_contract.sql` (rollback; 30/31 + 1 test xatosi tuzatilgan, funksiya tomoni tasdiqlangan), `agent-ish.test.ts`, `agent-veb.test.ts` (SSRF/redirect/prompt-injection to'siqlari).
- **Hali yo'q:** token hisobi (`t2_token_harakat`) va limit; admin UI (qoida/taklif/manba tasdiqlash sahifasi); `t2_agent_run` bilan bog'lash; fon kuzatuvchi (`t2_job`).

## O'rganish tsikli (2026-10-06) — o'zini rivojlantiradigan tizim
```
foydalanuvchi fikri/skrinshoti ─► YORDAMCHI agent (kompaniya doirasi): javob + TOZALANGAN umumiy xulosa
quyi agent signali ────────────► t2_agent_signal (tozalangan; kompaniya faqat xesh)
                                   │
              RIVOJLANTIRUVCHI agent (faqat tizim/superadmin): signallarni guruhlab ≤3 ish taklifi (maqsad, qabul mezonlari, xavf)
                                   ▼
                      ADMIN tasdig'i (superadmin) ──► t2_agent_buyruq (navbat)
                                   ▼
        buyruq_yubor ──► GitHub issue [agent-task] ──► ijrochi agent: branch + PR + test ──► CI ──► birlashtirish
```
- **Tenant xavfsizligi:** global agent HECH QACHON fikr matnini/skrinshotni/kompaniya ID sini ko'rmaydi; faqat `_t2_agent_tozala_v1` dan o'tgan xulosa (kompaniya/obyekt nomi, ≥4 xonali raqam, email, havola, telefon bo'lsa — ULASHILMAYDI, fail-closed) va hisob (nechta signal/kompaniya).
- **Fikr yo'qolmaydi:** AI ishlamasa ham fikr saqlanadi; kuniga 50 limit; skrinshot R2 reyestridan (o'z kompaniyasi hujjati).
- **Ish buyrug'i:** global rivojlanish taklifi tasdiqlansa yaratiladi (kompaniya darajasidagi g'oya umumiy kodni o'zgartirmaydi — tozalangan signalga aylanadi). Xavf past bo'lsagina avto-birlashtirish belgilanadi (DB CHECK).
- **Ijrochi:** buyruq GitHub issue ga aylanadi (`GITHUB_AGENT_TOKEN`, `GITHUB_REPO` — egasi kiritadi). Bajaruvchi: mavjud Claude/Codex sessiyalari yoki GitHub Actions agenti — **egasi qarori** (avtomatik ishga tushadigan workflow xavfsizlik klassifikatori tomonidan rad etildi, egasining aniq ruxsatisiz yaratilmaydi).
- **Chegara:** agent prod bazaga migratsiya qo'llamaydi, main ga to'g'ridan push qilmaydi; faqat PR.
- Sinov: `supabase/tests/t2_agent_oqish_buyruq_contract.sql` 25/25, `agent-ish.test.ts` 11.

## Model registri, proaktiv yordam, ijrochi workflow (2026-10-06)
- **Model registri:** `t2_agent_model_katalog` (faqat superadmin boshqaradi; model id OpenRouter shaklida, regex bilan tekshiriladi) + `t2_agent_model_tanlov` (kompaniya yoki platforma tanlovi). Hal qilish: kompaniya → platforma → server standarti (tier). Kompaniya tizim agentini tanlay olmaydi; tanlash — admin/boss/director. `/admin/ai-agentlar` da har agentning roli, rejimi, doirasi va hozirgi modeli (manbasi bilan) ko'rinadi.
- **Proaktiv yordam (`qadam_taklif`):** foydalanuvchi AI kuzatuvini O'ZI yoqadi (standart O'CHIQ). Mahalliy harakat izi (≤40 hodisa, xotirada): sahifa naqshi (ID lar `:id`), tugma yorlig'i, xato turi — matn/qiymat, input maydonlari HECH QACHON o'qilmaydi. Model faqat haqiqiy qiyinchilik belgisida (3 xato/90 s, adashish, xatodan keyin qotib qolish) chaqiriladi; taklif ixtiyoriy, bitta, qisqa; rad etilsa sovush 5→10→20… daqiqa (≤2 soat); yo'l faqat `/admin/…`.
- **Fikr paneli:** AiHelper → «Fikr / muammo» (tur, matn, skrinshot — R2 «Umumiy» loyihaga, tahlil uchun vision model).
- **Takliflar UI:** `AgentTakliflar` (tasdiq/rad, past xavfda avto-birlashtirish belgisi, ish buyruqlari, ijrochiga yuborish).
- **Ijrochi workflow:** `.github/workflows/agent-task.yml` — label `agent-task` + `AGENT_EXECUTOR_ENABLED=true` + OWNER/MEMBER/COLLABORATOR muallifi + sarlavha `[agent-task #` bilan boshlanishi; ijrochi modeli OPENROUTER orqali (Anthropic kaliti kerak emas): GitHub secret `OPENROUTER_API_KEY`, o'zgaruvchilar `AGENT_EXECUTOR_ENABLED=true` va `AGENT_EXECUTOR_MODEL`; agent faqat fayl yozadi, git/PR ni workflow qiladi. Birinchi ishga tushirishda Claude Code CLI + OpenRouter ulanishi tekshiriladi (o'chiq turadi).

## AI markazi, xarajat va hisob-kitob (2026-10-06)
- **Joylashuv:** tizim agentlari va butun AI boshqaruvi — **Boshqaruv paneli → «AI markazi»** (faqat superadmin): Umumiy ko'rinish (tayyorlik ro'yxati), Agentlar va modellar (galereya, narxlar), Takliflar va ishlar, O'rganish, Qoidalar va manbalar, Xarajat va limit. Kompaniya sahifasida (`/admin/ai-agentlar`) tizim agentlari YO'Q: faqat kompaniya agentlari va «AI sozlamalari».
- **Limit yo'q = AI yo'q:** `t2_agent_byudjet` da platforma oylik limiti (USD) belgilanmasa yoki tugasa — model chaqirilmaydi. Kill-switch: limitni nofaol qilish. Kompaniya limiti ham mumkin.
- **Sarf jurnali:** `t2_agent_sarf` — har chaqiruv: model, token, haqiqiy narx (OpenRouter `usage.cost`; bo'lmasa katalog narxi; bo'lmasa «narxsiz» deb belgilanadi).
- **Ustama va token:** mijoz narxi = provayder sarfi × (1 + ustama%) → × `usd_kurs` → / `token_som` → kompaniya hamyonidan `t2_token_harakat` (amal `ai_sarf`, meta: tannarx, ustama, kurs). **Misol: provayder $5 → ustama 40% → $7.00 → 889 token** (kurs 12 700, 1 token = 100 so'm). Ustama: platforma standarti (`t2_token_sozlama.ai_ustama_foiz`) + kompaniyaga alohida (`t2_agent_ustama`). Tizim agentlari sarfi kompaniyaga yozilmaydi (platforma xarajati).
- **Ko'rinish chegarasi:** kompaniya faqat TOKEN sarfini va balansini ko'radi — tannarx, ustama va USD ko'rinmaydi; superadmin tannarx / hisoblangan / **foyda**ni ko'radi.
- **Kompaniya admini sozlamalari (`t2_agent_kompaniya_sozlama`):** AI yoqish/o'chirish, oylik token limiti, a'zolar uchun AI kuzatuviga ruxsat — admin/boss/director o'zgartiradi, hamma ko'radi; `sarf_tekshir` majburan qo'llaydi; audit yoziladi.
- Sinov: `t2_agent_sarf_byudjet_contract.sql` 23/23, `t2_agent_hisob_ustama_contract.sql` 18/18, `t2_agent_kompaniya_sozlama_contract.sql` 13/13; gateway + UI testlari.

## Ochiq qarorlar (egasi)

- Cloudflare Pages'ga `OPENROUTER_API_KEY` ni **egasi o'zi** qo'yadi (Production + Preview); aniq 3 daraja uchun model nomlari.
- Kompaniya agentlari uchun xarajat: platforma tokeni (hozirgi `t2_token_*` hamyon) yoki BYOK?
- Birinchi kompaniya agenti: hujjat nazorati yoki PTO/smeta?

