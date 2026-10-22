# READY_FOR_REVIEW — Studio Workspace V2
Agent: Codex / Anvar. Branch codex/studio-workspace-v2-20261022.

Рабочий UI пакет по прямому заданию владельца: свободная навигация работ/цен/проверки/документов, persistent-mounted chat, collapsible assistant, work-row coefficients, existing-norm-only koef_qolla, manual delete/order controls, coefficient notation + exact factor in export consumption. Локальная библиотека хранит предыдущие drafts, scope по company, CAS revision rejects stale tab, storage/index failure visible, fork copy recovery. Server save остаётся отдельным canonical command; switching draft blocked during pending save; late company response не меняет текущую версию.

Верификация: full Vitest 2628 PASS / 17 skipped; 81 focused integration PASS; app/functions TypeScript, oxlint, sitemap, tekshir, build PASS. Governance 86 tasks PASS, existing stale CURRENT_STATE warning. Local real-browser test: manual title/section, navigation preserving unsent AI input, new draft and old draft reopen PASS. Local backend unavailable, so no claim of authenticated catalogue/server-save/production smoke. Preview and exact remote CI receipts to follow.

No DB migration, F2 data, auth policy, tokens, R2 pointer or model/calc/commands edits. Existing markup/document/pricing implementations reused. Research P2 durable server autosave/jobs, broader price policy, formal document issuance remain separate phases, not advertised as done. Main integration/release coordinated with Claude L0; owner explicitly requested deploy on 2026-10-22.
