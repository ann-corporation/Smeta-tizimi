# Smeta Tizimi (TIZIM_02) — agent boot

**Birinchi shu. 5–10 daqiqada nima qilish kerakligini bilasiz — butun reponi qidirmang.**

## 1. Nima qilish kerak — Obsidian HOME
Kanonik bilim egasining Obsidian vault'ida (asl bosh manba):
- Noutbukda: `D:\Obsidian\Anvar_Brain\20_PROJECTS\Smeta-tizimi\Smeta-tizimi.md` (🏠 HOME)
- Boshqa mashinada: GitHub `ann-corporation/anvar-brain` → `20_PROJECTS/Smeta-tizimi/`

HOME eng tepasida **"HOZIR NIMA QILISH KERAK"** turadi. O'qish tartibi:
1. `CURRENT_STATE.md` — nima ishlaydi, nima buzilgan (faqat joriy holat)
2. `PRODUCT_ROADMAP.md` — yagona navbat; o'z bandingizni oling
3. `CODEMAP.md` — faqat o'z domainingiz qatori (sahifa, API, lib, RPC, migratsiya, test)
4. `ROLE_TRUST_MODEL.md` — buzilmaydigan qonunlar (smeta CONST, F2 muzlaydi, NULL ≠ 0, F2 = nakopitelniy = F3 …)
5. `KOORDINATSIYA.md` — rollar (Claude — rahbar/implementer, Codex — oson ishlar/review), TASK PACKET shakli

Yangi g'oya → `IDEA_INBOX.md`; egasi qarori → `DECISIONS.md`; risk → `RISK_REGISTER.md`.

## 2. Repo qoidalari
- `docs/governance/CONSTITUTION.md` — texnik konstitutsiya (Supabase haqiqat, nomli RPC, tenant, actor, operation_id, versiya). Buzilmaydi.
- `docs/architecture/*` — qabul qilingan kontraktlar (faqat vazifaga tegishli bo'lsa).
- `ops/ACTIVE_TASKS.json` — task qulflari (`owns` — faqat shu yo'llarni tahrirlang); `ops/mailbox/INBOX.md` — boshqa mashinadagi agentlar uchun.
- `docs/governance/OWNER_AUTHORIZATION.md`, `AGENT_CAPABILITY_POLICY.md` — egasining doimiy ruxsati va agent chegaralari (Antigravity — faqat audit).
- Handoff oldidan: `node ops/governance-check.cjs`.

## 3. Ish tugagach (majburiy)
Gate'lar (`CODEMAP.md` oxirida) → commit → push → deploy tekshiruvi → Obsidian: `CURRENT_STATE.md` **qayta yoziladi**, `PRODUCT_ROADMAP.md` da band holati, `AGENT_LOG.md` ga bir qator. Bitta mavzu — bitta kanonik hujjat; takror hujjat yaratmang, eskirganini birlashtirib o'chiring.

## 4. Tarixiy materiallar
`ops/handoff/`, `docs/reviews/`, `docs/audit/`, `tizim02/MULOQOT.md` (append-only historical journal) — faqat tarix/dalil, joriy holat EMAS (not current state). Repo ildizidagi eski reja/brif hujjatlari 2026-10-02 da kanonik Obsidian hujjatlariga birlashtirilib o'chirildi (git tarixida bor).
