# Риски текущего architecture capture

generated_at: 2026-10-26T05:48:29Z  
git_commit: 69db8d45050cc82dfd67baae6dec7153b727a219  
db_migration_head: 20261106510000 / t2_agent_qidiruv_v1

Производный технический индекс. Назначения и приоритеты владельца остаются в Obsidian RISK_REGISTER / PRODUCT_ROADMAP / KOORDINATSIYA. Не закрывать риски по названию PR или общему green CI. QA receipts — PR145, mailbox PTO-JOINT-QA-20261025.

## P1: перед ежедневной работой

- **MCP-QA01, OPEN на69db8d45:** raw SQL COMMIT обходит завершающий dry_run ROLLBACK, при этом snapshot/audit пропускаются. Fake-pool ledger1controlPASS/1FAIL; live writer не вызывался. Владелец fix: существующий MCP автор/L0; PR151 comment6409158001. Приёмка: входной SQL не управляет transaction boundary, negative probes + обычные MCP tests + disposable PostgreSQL drill. Административные полномочия владельца этим не оспариваются.
- **JQA03, OPEN baseline8b1eb894:** marker «100%» отправляет факт120→100 без correction review. Физическое выполнение нельзя стирать completion-действием. Fix у существующего Fakt автора, Codex повторяет probe по exact SHA.
- **Revision/expertise chain, IMPLEMENTING у L0:** исходная и экспертная редакции, выполненное сверх entitlement, claim/additional и evidence должны связываться без automatic negative fact. Наличие t2_smeta_revision/t2_smeta_ozgarish подтверждено; end-to-end owner scenario ещё не принят. Не создавать дубль этих моделей.

## P2: не скрывать неполноту

- **JQA01:** net F2 quantity0 при ненулевой certified amount исчезает в расчётном review. Synthetic defect; в пилотном SELECT0/2538 соответствующих shape. Не заявлять доказанную текущую потерю денег.
- **JQA02:** explicitNULL суммы с отсутствующим companion counter превращается в0; contract hardening. Live prevalence неизвестна, обычный view может защищать форму.
- **DESIGN-QA01:** на отдельном PR150115dad89 новый SmetaAnatomiya total превращает unknown в0; source pin этого pack ещё не включает дизайн. Независимый probe2controlPASS/1FAIL, PR150 comment6409301256. Fix у дизайнера, базовые финансовые formulas не объявлены изменёнными.
- **RBAC custom grants:** default bugalter F2 write удалён, UI deny6PASS, SELECT подтверждён. Возможность индивидуально выдать approve через membership constructor — отдельная server policy; закрытой не объявляется.
- **Registry classification:** NULL классы и owner_module требуют reviewL0. Текстовая ссылка на таблицу не доказывает запись, безопасность, полноту или актуальность DML. Отсутствие ссылки не означает orphan/deprecated.
- **Allowlist drift:** NOT_OBSERVED в ROUTE_RPC_MAP требует проверки конкретного имени/сигнатуры/gateway. Это наличие в metadata capture, не автоматический вывод о сломанной странице. Старые allowlist могут содержать dormant actions.

## Recovery и cleanup

Snapshot cron active21:00UTC подтверждён SELECT. Restore correctness, child order, FKs, frozen acts, journals, object/tenant isolation, partial failure и полнота охвата требуют disposable drill. Регулярный backup не разрешает автоматический hard delete.

Только список для review, **никакого удаления**: public.t2_document_registry_f2slot_bak; t2_qator_kat_bak_20261024 и суффиксыb/c/d/e/f; t2_qator_zaxira_suniy_kol_84; t2_smeta_ierarxiya_zaxira; t2_tmp_eq_lot1. Нужны: создатель/назначение, retention, read/write dependencies, контрольная сумма и проверенное восстановление, затем отдельное решениеL0/владельца. snapshot.* — рабочая recovery schema, из cleanup исключена. Имя _bak/tmp само по себе не доказывает ненужность, successor неизвестен и остаётся NULL.

## Уже проверенные исправления

JQA04/08/09: independent5PASS на PR1437acb69f7 и PR144c5965290; regressions32/37PASS. JQA06/07: nav7PASS на80fa2363. JQA10 UI/default capabilities:6PASS + SELECT на69db8d45. JQA05 отозван как неверный ранний consumer oracle. Эти пункты не открывать повторно без новой регрессии; component PASS не равен authenticated owner acceptance всего продукта.
