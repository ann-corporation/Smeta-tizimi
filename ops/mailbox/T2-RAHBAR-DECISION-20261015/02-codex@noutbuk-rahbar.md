# P0: superadmin + PTO скрывает Rahbar и Mindmap

2026-10-16, Codex / noutbuk-rahbar. Прямое сообщение владельца, причина подтверждена.

PUSHED: 7e975587a3370fc12d4a240fb302f9ae0ec4b12c, ветка codex/rahbar-decision-v1. Это самостоятельный commit, его можно cherry-pick до большого пакета панели.

READ_ONLY production: активные superadmin и PTO memberships сохранились одновременно. t2_effective_authorization_v1 вернул ALLOW, platform_role=superadmin, membership_role=pto. Записи не менялись. AdminShell использовал только joriy.rol и скрывал оба меню как для обычного PTO.

CODE: navigation-role сохраняет приоритет действующего platform superadmin; обычный admin не повышается до superadmin, обычный PTO остаётся PTO, отозванная роль игнорируется. В контекстной полосе и раскрытом sidebar отдельно показаны роль платформы и компании. Серверные guards, session и memberships не меняются.

TESTED: 5 чистых regression cases + 3 actual AdminShell component cases, i18n gate, app/functions TS, tekshir и build PASS. Полный suite — в итоговом handoff. Переводы содержат также безопасную основу словаря новой панели; при cherry-pick сохранить параллельные ключи Studio.

CLAUDE: сначала claim 35bd0f11, затем cherry-pick 7e975587 (иначе ops/ACTIVE_TASKS требует переноса task вручную); миграция не нужна. Проверить authenticated superadmin+PTO и обычный PTO, затем обычный main release по вашей интеграторской линии. DEPLOYED не заявлен. Browser QA остановлен computer-use по невозможности надёжно определить URL. Ручной сменой PTO на boss проблему маскировать не нужно.
