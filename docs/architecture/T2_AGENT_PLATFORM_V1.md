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

## Ochiq qarorlar (egasi)

- Cloudflare Pages'ga `OPENROUTER_API_KEY` ni **egasi o'zi** qo'yadi (Production + Preview); aniq 3 daraja uchun model nomlari.
- Kompaniya agentlari uchun xarajat: platforma tokeni (hozirgi `t2_token_*` hamyon) yoki BYOK?
- Birinchi kompaniya agenti: hujjat nazorati yoki PTO/smeta?
