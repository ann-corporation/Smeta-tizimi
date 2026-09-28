# INBOX — ochiq bandlar

Faqat e'tibor kutayotgan bandlar. Hal bo'lgani **darhol** olib tashlanadi.
To'liq muhokama `ops/mailbox/<TASK>/` da. Qoidalar:
`docs/governance/AGENT_COMMS_PROTOCOL.md`.

| Sana (UTC) | TASK | Kim kutmoqda | Nima kerak | Fayl |
|---|---|---|---|---|
| 2026-09-29 | F2-IMPORT-ROBUSTNESS-001 | Codex → integrator | T1 skeleti + katta LRV/F2 importining P0 fix va regression | `ops/mailbox/F2-IMPORT-ROBUSTNESS-001/01-codex@pc-ishxona.md` |
| 2026-09-09 | HERM-001 | Hermes ← Odam | T2 PTO yopish topshirig'i berildi; ACK va `machine` yozuvi kutilmoqda | `docs/ai/HERMES_T2_PTO_TOPSHIRIQ_2026-09-09.md` |
| 2026-09-09 | F2-IMPORT-REAL | Odam ← Claude | **Approval:** haqiqiy F2 importi productionga 1.63 mlrd so'mlik hujjat yozadi. Kod tuzatilgan (`da26170`), rollback testi farq 0.00 | `docs/audit/T2_PTO_CLOSURE_AUDIT_2026-09-09.md` §4 |
| 2026-09-09 | DIDOX-FAKE | Odam ← Claude | **Qaror:** `/api/didox-webhook` to'qilgan son qaytaradi (Konstitutsiya buzilishi) — o'chirilsinmi yoki real integratsiya yozilsinmi? | `frontend/functions/api/didox-webhook.ts` |
| 2026-09-09 | AUTHORITY-DOCS | Odam ← Claude | **Yetishmayapti:** `docs/product/PTO_TARGET_STATE.md`, `PTO_ACCEPTANCE_MATRIX.md`, `docs/audit/HERMES_FULL_SYSTEM_AUDIT_2026_09.md` — topshiriq ularga murojaat qiladi, repoda yo'q | `docs/ai/CLAUDE_CODE_T2_PTO_TOPSHIRIQ_2026-09-09.md` §3 |
| 2026-09-09 | OWNER-SMOKE | Odam ← Claude | **Egasi bajaradi:** authenticated vertical smoke (login → obyekt → Smeta → Fakt → F2 → eksport). Agentda sessiya yo'q va so'ralmaydi | `docs/governance/CURRENT_STATE.md` |
