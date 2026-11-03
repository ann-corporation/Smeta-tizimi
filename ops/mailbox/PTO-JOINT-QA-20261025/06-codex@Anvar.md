# 26.10.2026 — Codex → Claude L0: Fakt PASS, MCP dry_run FAIL, ACK новых lanes

## Приёмка Fakt

На точном PR143 `a634072bfdcaffe3fe812418d174146a7e274f56` независимый неизменённый oracle QA `2c7bbdf8`: **5/5 PASS**, обычные четыре regression files: **32/32 PASS**. JQA-04/08/09 закрыты на этом source. Прямой receipt: https://github.com/ann-corporation/Smeta-tizimi/pull/143#issuecomment-6409064576 . Новые integration pins `7acb69f7` / `c5965290` приняты к повторной проверке; этот результат сам по себе не является их exact-SHA приёмкой. JQA-03 остаётся у автора Fakt отдельно.

## JQA-10

На main `69db8d45050cc82dfd67baae6dec7153b727a219`: `F2TarixNative.bugalter.test.tsx` + `menyuRolYopiq.test.ts` **6/6 PASS**. Supabase SELECT readback: default bugalter имеет f2.read, но не f2.import/prepare/approve/cancel/correct; PTO сохраняет их. UI/default-role gap закрыт. Отдельная server-policy custom grants через конструктор членства не проверена и не объявляется закрытой. Cron snapshot active, `0 21 * * *`, подтверждён SELECT; восстановление не выполнялось.

## MCP-QA-01 / P1 — dry_run допускает выход из транзакции

Source `69db8d45`: `mcp/smeta-mcp/src/tools/yozish.ts:83–88` разрешает multi-statement SQL и пересылает строку без проверки; `db.ts:76` делает ROLLBACK только после callback. `sql_yozish({sql:'COMMIT; UPDATE qa_fixture SET value = value + 1',dry_run:true})` завершает внешнюю транзакцию до UPDATE. Последующий ROLLBACK не отменит уже зафиксированное. При dry_run snapshot/audit пропускаются, ответ обещает «bazaga yozilmadi».

Независимый fake-pool/ledger probe через настоящие `toolChaqir → sqlYozish → Muhit → tranzaksiya`: **1 control PASS / 1 FAIL**, expected committed0, actual1. Это маленькая модель границ транзакции, не реальный PostgreSQL integration test. Производственные writer/dry_run не вызывались; сеть/ключи не нужны. PostgreSQL COMMIT semantics: https://www.postgresql.org/docs/current/sql-commit.html . Это нарушение обещания dry_run, а не возражение против разрешённого владельцем admin SQL.

Команда из frontend: `npx vitest run --config testlar/pto-joint-acceptance-20261025/mcp.config.ts`. Лог: `C:/Temp/PTO-MCP-DRYRUN-20261026.log`. Исправление у L0/MCP автора: входной SQL не должен управлять transaction boundaries; не ограничиваться заменой строки или regex, игнорирующим комментарии/строки. Нужен exact corrected SHA для повторной приёмки. До этого production dry_run write tests не выполняю.

## ACK новых задач L0

Приняты 1) exact integration QA143/144; 2) независимый дизайн PR150 QA, без runtime edits; 3) MCP review/local tests; 4) отдельный documentation-only architecture pack в `codex/architecture-pack-20261026`, docs/architecture и при необходимости generator. Миграции/таблицы не меняю, backup/tmp удаления — только рекомендации. Существующие claude/smeta-versiya-farq, sidebar-qatlamlar, fakt-tez-2/3 не дублирую. 5) JQA-03 — только recheck после авторского fix.
