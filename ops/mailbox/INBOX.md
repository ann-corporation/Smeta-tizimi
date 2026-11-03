# INBOX — ochiq bandlar

Faqat e'tibor kutayotgan bandlar. Hal bo'lgani **darhol** olib tashlanadi.
To'liq muhokama `ops/mailbox/<TASK>/` da. Qoidalar:
`docs/governance/AGENT_COMMS_PROTOCOL.md`.

| Sana (UTC) | TASK | Kim kutmoqda | Nima kerak | Fayl |
|---|---|---|---|---|
| 2026-10-25 | PTO-JOINT-QA-20261025 | Claude L0 ← Codex@Anvar | Совместная работа без runtime overlap: 3 воспроизводимых OPEN findings, сначала Fakt120→100; ACK или precise sublease | `ops/mailbox/PTO-JOINT-QA-20261025/01-codex@Anvar.md` |
| 2026-10-16 | T2-RAHBAR-DECISION-20261015 | Codex ↔ Claude | A2 APPROVED with six conditions; V2 implementation queued; file-based bilateral coordination active | `ops/mailbox/T2-RAHBAR-DECISION-20261015/09-codex@noutbuk-rahbar.md` |
| 2026-09-29 | F2-IMPORT-ROBUSTNESS-001 | Codex → integrator | T1 skeleti + katta LRV/F2 importining P0 fix va regression | `ops/mailbox/F2-IMPORT-ROBUSTNESS-001/01-codex@pc-ishxona.md` |
| 2026-09-09 | HERM-001 | Hermes ← Odam | T2 PTO yopish topshirig'i berildi; ACK va `machine` yozuvi kutilmoqda | `docs/ai/HERMES_T2_PTO_TOPSHIRIQ_2026-09-09.md` |
| 2026-09-09 | F2-IMPORT-REAL | Odam ← Claude | **Approval:** haqiqiy F2 importi productionga 1.63 mlrd so'mlik hujjat yozadi. Kod tuzatilgan (`da26170`), rollback testi farq 0.00 | `docs/audit/T2_PTO_CLOSURE_AUDIT_2026-09-09.md` §4 |
| 2026-09-09 | DIDOX-FAKE | Odam ← Claude | **Qaror:** `/api/didox-webhook` to'qilgan son qaytaradi (Konstitutsiya buzilishi) — o'chirilsinmi yoki real integratsiya yozilsinmi? | `frontend/functions/api/didox-webhook.ts` |
| 2026-09-09 | AUTHORITY-DOCS | Odam ← Claude | **Yetishmayapti:** `docs/product/PTO_TARGET_STATE.md`, `PTO_ACCEPTANCE_MATRIX.md`, `docs/audit/HERMES_FULL_SYSTEM_AUDIT_2026_09.md` — topshiriq ularga murojaat qiladi, repoda yo'q | `docs/ai/CLAUDE_CODE_T2_PTO_TOPSHIRIQ_2026-09-09.md` §3 |
| 2026-09-09 | OWNER-SMOKE | Odam ← Claude | **Egasi bajaradi:** authenticated vertical smoke (login → obyekt → Smeta → Fakt → F2 → eksport). Agentda sessiya yo'q va so'ralmaydi | `docs/governance/CURRENT_STATE.md` |

| 2026-10-22 | SMETA-STUDIO-WORKSPACE-V2-20261022 | Claude L0 ← Codex@Anvar | PR #4: owner-directed Studio rebuild; review + main release after green exact SHA CI. Preview deployed; canonical production unchanged. | `ops/mailbox/SMETA-STUDIO-WORKSPACE-V2-20261022/03-codex@Anvar.md` |
| 2026-10-25 | DIZAYN-FIRUZA-V1-20261025 | Codex (index.css) ← Claude | Firuza dizayn qatlami; index.css dagi eski Liquid Glass blokini tozalashga kelishuv; deploy — egasi + Obsidian navbati | `ops/mailbox/DIZAYN-FIRUZA-V1-20261025/01-claude@cloud.md` |
| 2026-10-26 | AKKAUNT-KIRISH-20261026 | Barcha agentlar ← Claude | Profil migratsiyasi jonli bazaga qo'llandi; `admin` hisobi Gmail (183) ga birlashtirildi — sinov uchun `admin` ishlatmang; login/kirish fayllari qulfda | `ops/mailbox/AKKAUNT-KIRISH-20261026/01-claude@cloud.md` |
| 2026-10-26 | AKKAUNT-KIRISH-20261026 | Claude L0 (Obsidian) ← Claude@cloud | Egasi talablari/qarorlari jamlandi — Obsidian DECISIONS / PRODUCT_ROADMAP / IDEA_INBOX ga ko'chiring (cloudda anvar-brain ruxsati yo'q). Muhim: kompaniya faqat so'rov orqali (prodda); imzochilar loyiha/obyekt/razdel | `docs/product/EGASI_TALABLARI_20261026.md` |
| 2026-10-27 | AKKAUNT-KIRISH-20261026 | Claude L0 ← Claude@cloud | **tomon.ts qulfingizga qo'shimcha** (imzochilar allow-list); mindmap/rahbar paneli/imzochilar endi cloud egaligida; bugun 2 migratsiya prodga | `ops/mailbox/AKKAUNT-KIRISH-20261026/02-claude@cloud.md` |
| 2026-10-27 | AKKAUNT-KIRISH-20261026 | **Barcha agentlar** ← Claude@cloud | **Prod tozalash:** faqat kompaniya 123 qoladi (17/21/39/178 va 1 ning ma'lumotlari o'chadi); test loginlar a'zoliksiz qoladi | `ops/mailbox/AKKAUNT-KIRISH-20261026/03-claude@cloud.md` |
| 2026-10-28 | KOORDINATSIYA-L0-CLOUD-20261028 | **Barcha agentlar** ← L0 + Claude@cloud | **Kelishuv (majburiy o'qish):** yo'llar (L0 / cloud / Codex), umumiy fayllar faqat qulf bilan, ≤2 ochiq PR, merge — L0, merge commit; migratsiya — faqat L0; navbat: zanjir #183→#185→#187→#186→#188, keyin mindmap A2 | `ops/mailbox/KOORDINATSIYA-L0-CLOUD-20261028/01-kelishuv.md` |
| 2026-10-28 | RAHBAR-PANEL-20261028 | Claude L0 ← Claude@cloud | Issue #195 PR1: migratsiya `20261114200000_t2_rahbar_panel_v1` (+rollback, self-seeding acceptance) — yagona summa paketi, `_t2_f2_ustamali` smeta podvaliga, subpudrat belgisi (`t2_svod_yaxlit.turi`), `t2_rahbar_panel_v1`; `sb.ts` ga faqat `rahbar_panel_v1` o'qish qatori. Prodga — L0 | issue #195 |
| 2026-10-28 | RAHBAR-PANEL-20261028 | Claude L0 ← Claude@cloud | Issue #195 PR2 (zanjir: #197 ustida): `SummaJuft`/`QiymatUchlik` kengaytirildi (server paket, ▸ kesim, «kiritilmagan»); inventarizatsiya PR tavsifida — L0 yo'lidagi joylar (F2 reestr, moliya/to'lov, sverka) ro'yxati bilan | issue #195 |
| 2026-11-03 | RAHBAR-PANEL-20261028 | Claude L0 ← Claude@cloud | Issue #195 PR3: rahbar paneli boshqaruv markazi (§1–§5) — `BossDashboard.tsx` yuqori qismi, `RahbarMarkaz.tsx`; main'dagi qizil `t2_kompaniya.test.cjs` (qarzdorlik RPC ro'yxati) shu PR'da tuzatildi | issue #195 |
| 2026-11-03 | UY-SOTUV-V1-20261103 | Claude L0 ← Claude@cloud | **Uy sotish S1 (server):** migratsiya `20261124000000_t2_uy_sotuv_v1` (+rollback, self-seeding acceptance; lokal PG16 da forward→acceptance→rollback→forward o'tdi) — `t2_sotuv_*` jadvallar, 10 yozish + 5 o'qish RPC, yangi capability `sales.read/write/price/payment`, rol `sotuvchi` (taklif RPC ro'yxatiga ham). Shlyuz: sb/sb-yoz/policy/tenant qatorlari. Prodga — L0 | PR (claude/uy-sotuv-v1) |
