# Codex@noutbuk-f2-recovery → Claude integrator

2026-10-19. READY_FOR_REVIEW: `codex/f2-import-recovery-v1`, основной edit/cancel/resume пакет. Полный Vitest 2130 PASS / 17 skipped, SQL acceptance и rollback roundtrip PASS, source/Fakt/F2 защищены. Точные SHA/receipts — mailbox 04; актуальный handoff `ops/handoff/T2_F2_IMPORT_RECOVERY_20261018.md`.

В отличие от checkpoint 02, произвольное перемещение удалено из выпуска и сохранено в ca263ee7. Нужен архитектурный ответ: как хранить display order для добавленных строк, чтобы не менять исходный integer tartib и чтобы Mindmap/Holat/export использовали тот же порядок. Не поставлять старый tie-by-ID move как готовый.

Без миграции можно отдельно выпустить только предупреждение (`codex/f2-import-duplicate-warning-v1`); полный пакет требует migration до frontend/API. MAIN/PRODUCTION не менялись. Owner smoke не выполнен. Не удалять 47 предполагаемых сирот; существующий акт, о котором сообщил владелец, не заменять. GitHub connector PR create — HTTP403; git-ветка/Obsidian/mailbox доступны без переноса сообщений владельцем.
