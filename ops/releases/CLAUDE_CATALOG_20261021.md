# Завершение Claude WIP и интеграция каталогов — 2026-10-21

Прямое поручение владельца: проверить работу Claude после исчерпания лимита, закончить текущую реализацию и объединить с каталогами, затем выпустить main. Исполнитель Codex@Anvar; worktree `C:/Temp/GAS-catalog-adoption-20261021`; ветка `codex/release-claude-catalog-20261021`. Исходный main `b979e114421467a163ee32eb24227e5f8b6ffa70`.

## Состав и review

Сохранены и объединены Claude `1565627abc188b60efdc041573585a6c31d7359d` (модули/пять групп меню), `46a5f8d3` (реестр F2), main registry/role authority, Codex каталог `469daed407c7302dc66a43aaea77327101f6404d` и L3 oracle. Чужие dirty worktree не изменены.

Исправлены: вызов hook после conditional return; серверный запрет неизвестной команды даже superadmin; fresh company module gate с fail-closed; разрешение f2.read и company scope реестра; неизвестное происхождение F2 при отсутствии строк; потеря актов с отсутствующим объектом; ложное «без договора» при ошибке/усечённом чтении. Module mutation имеет operation_id и expected_version. Старый source guard меню теперь извлекает typed declaration и работает при полном удалении legacy блока, сохраняя проверки обязательных маршрутов.

Коэффициенты: закрыты GAP-COEF-001/002 (лишний хвост ключа и неизвестная строка в row-limited правиле). Construct reference показывает источники/условия/область действия отдельно от применимых правил. Preview реального calculator сохраняет NULL; ручное подтверждение условий требуется, canonical write не добавлен. Новые source rules calculation_approved=0 не применяются автоматически.

## Данные и миграция

R2 immutable index SHA `11f9a6ce4cc156fb51a1419562cca846a654ced4fb77bf605b012952c8a2a7b1`, 517 правил / 2730 scopes / 42608 известных работ. GET/SHA проверены. Реальный runtime handler сопоставлен с установленным Construct core для всех 42608 работ: 0 расхождений. Старые CURRENT pointers сохранены, исходная база не дублировалась. Полные локальные доказательства: `D:/CatalogMigration/coefficient-foundation-20261021-v1/runtime-reference/`.

Supabase project `tuoyrzadkgoltpqkdiyx`: `t2_modul_katalog_v1`, live migration version **20261021110542**. Репозиторный SQL `20261106730000_t2_modul_katalog_v1.sql` и парный rollback сохранены. Прежде чем применять: migration+acceptance выполнены в транзакции с принудительным RAISE EXCEPTION MODULE_ACCEPTANCE_PASS. Проверены 4 модуля, effective/default read, company off, operation replay, stale version, unauthorized actor и ACL. После rollback функция/seed отсутствовали, тестовый override=0. После apply: 4 default-on модуля, override=0. Реальные company settings и бизнес-данные не менялись. Ранее заявленные Claude F2 unique/section/contract-trigger изменения проверены на live, повторно не применялись.

Rollback приложения: deploy предыдущего зелёного main. Rollback модулей только парным SQL после проверки отсутствия company overrides; не удалять реальные записи/переопределения. Additive reference может оставаться неиспользуемым в R2.

## Проверки перед push

App tsc -b PASS; functions tsc --noEmit PASS; oxlint src PASS (существующие warnings); npm run tekshir PASS; site-map generated обновлён; npm run build PASS (chunk-size warning). Full Vitest: **356 passed / 8 skipped files; 2648 passed / 17 skipped tests**. Последующая небольшая правка operation_id проверена целевыми тестами модулей (3 PASS), company route guard добавлен. Governance PASS, 85 tasks. Исторические конфликтующие leases сверены с реально merged SHA; не удалены остальные задачи.

Security advisors: 163 INFO rls_enabled_no_policy и 62 WARN function_search_path_mutable в существующей базе. Новая module RPC задаёт search_path и доступна только service_role; новые таблицы не созданы. Этот выпуск не является аттестацией всех исторических предупреждений.

## Граница доказательств

До green CI, fast-forward main и подтверждённого Pages deployment статус — проверенный release candidate. Authenticated production smoke и exact deployed SHA записываются в Obsidian CURRENT_STATE/HANDOFF и следующем machine mailbox после выпуска. Реальные F2 не создавались/не утверждались, модульные настройки клиентов не переключались. Logout/login без ввода credentials, полный импорт/export владельца и исторические 116 coefficient findings не закрыты этим выпуском.

## Подтверждённая интеграция main

Функциональный HEAD **8a8a6162cc76515a85d981287fec0809a0260fa9**: exact-SHA frontend CI SUCCESS — https://github.com/ann-corporation/Smeta-tizimi/actions/runs/39591352350 . Main fast-forward b979e114→8a8a6162 подтверждён git ls-remote 2026-10-21. Дополнительно закрыта race: старый ответ реестра/файлов не записывается после смены компании; rendered regression PASS. Full final local2648PASS17skip, build PASS.

Cloudflare production deployment для этого SHA запущен: `5c00d330-9b2b-4905-a622-7b9c4498ad53`; на момент этой записи build ещё выполняется, а не принят как LIVE. Итоговые production source/bundle и authenticated read-only smoke подтверждаются отдельными receipts в CatalogMigration и каноническом Obsidian; не считать HTTP200 или marker Active достаточным доказательством. Следующий документационный commit не меняет frontend/functions/SQL.

Советы по историческим DB предупреждениям: [RLS без policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [mutable search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
