# 26.10.2026 — Codex → Claude L0: итог для возвращения в15:00

Владелец сообщил о лимите Claude и возвращении15:00. Codex не перехватывал руководство и чужие runtime locks, не изменял DB/main/Cloudflare. Ниже точные source pins; после rebase нельзя автоматически переносить общий PASS.

## Исправления и независимая приёмка

- PR143 **7acb69f70b349c97d73d473e7e3717ce6e64a724**:5 independentPASS +32 regressionsPASS. JQA04/08/09 закрыты; PR143 уже merged какd7bf7353. Прямой comment6409209749.
- PR144 **c5965290d4a76c5929734b4919c82c91d258c311**:5 independentPASS +37 regressionsPASS, comment6409301599. Новый integration pin после143 ещё ожидается.
- PR154 **17f3f1f2c6cee451cfc476336e486a7c7b20175a**: JQA03 strengthened2PASS +13 regressionsPASS, comment6409587655. Fixture содержит раздел, over120/100, under20/100 и другой marker: preview без writer, default write только+80; all-complete default disabled; уменьшение-20 только после отдельного correction preview/confirmation. Не тривиальный case без раздела. Новый integration pin ещё ожидается.
- PR155 **17703bbbf2a4db9b2fa5008de5cc555a913419d4**: MCP-QA01 corrected7 independentPASS,43 regressionsPASS/1skip, TS/buildPASS,22-tool stdio/no-DB fail-closedPASS. Comment6409635706. Через реальный dispatcher/transaction wrapper, fake pg.Client prototype + extended-protocol model, без сокета. Начальные COMMIT/ROLLBACK и SELECT-prefix multistatement блокируются. Это model/protocol QA, не live PostgreSQL integration. Production writer/dry_run не вызывался.
- PR150 **1e418514ee44d30e2d89df4e162b183e06545bb8**: DESIGN-QA01 закрыт:3 independentPASS +9 author/i18nPASS. Comment6409577759. На предыдущем115dad89 полный normal suite3429PASS/20skip; app/functionsTS, oxlint, site-map, buildPASS. tekshirPASS после материализации пропущенных sparse-checkout MCP source files. Полный suite не приписывается новому1e418514.
- PR153 **27ebb87e90d6f0ca5acd64c59913e3a79ec985f7**:4files45PASS, comment6409621627. PTO сохраняет money/work routes, buxgalter write menu denied, platform только superadmin; routePermission body не изменён. Это component/source PASS, не owner visual smoke.
- JQA10 UI/default gap закрыт6PASS + Supabase SELECT capabilities на69db8d45. Индивидуальные server grants — отдельная политика владельца. JQA05 остаётся отозванным.

## Реальные integration blockers

1. `git merge-tree --write-tree --messages27ebb87e1e418514` → exit1, CONTENT CONFLICT: App.tsx, AdminShell.tsx, FaktJurnal.tsx, lib/sayt-xaritasi/generated.ts. С PR144c5965290 дизайн отдельно конфликтует в FaktJurnal. Сохранить receipt/refresh/unknown handling; page guards не ослаблять; generated.ts регенерировать из итогового реестра. Runtime не редактировался QA. Оптимистичная ранняя sidecar оценка merge опровергнута проверкой parent.
2. Design governance FAIL: overlapping owns с существующими Studio/reliability/import/public-entry задачами. Это не ошибка тестового окружения. L0 должен явно согласовать subleases/статусы, не закрывая чужую незавершённую работу ради зелёного gate.
3. Owner authenticated full vertical/normal-role/company-switch smoke не выполнен. Последний ограниченный owner-home smoke относится к старому4736b620, не к новому дизайну/sidebar.

## Архитектура

PR156 `codex/architecture-pack-20261026`, отдельный documentation-only lane:7 запрошенных документов/реестр + metadata JSON и offline generator. Capture обновлён после PR152: **public202 + snapshot5 =207 tables, public578 routines**, source d7bf7353. Все RLS flags включены — это не доказательство политики tenant. Registry:180current module storage/2COMPAT/14BACKUP/1TEMP/10NULL, один owner_moduleNULL. Классы с недостаточными доказательствами оставлены неизвестными; DEPRECATED0; delete_authorized:false. Источник routine candidates ограничен настоящими dollar-quoted bodies, acceptance/rollback и trailing migration DML исключены. snapshot5 — рабочая recovery schema, из cleanup исключена.

Новые source-edition t2_smeta_versiya/_pozitsiya/_moslik связаны bazaviy_revision_id с существующей t2_smeta_revision; схема присутствует, законченный revision→claim user flow ещё не принят. Архитектура не создаёт runtime модели и не удаляет таблицы. Классификация10NULL и module owner review — явная очередьL0.

## Текущий production readback

GitHub exact maind7bf735359e8a54ef9e589c9a23cc28fc67876a9: frontend/mcp/Cloudflare Pages conclusionsSUCCESS; run40277714005, deployment3f8cada6-86dc-45a4-81eb-24f0e3c1dc7a. Это CI/deployment check readback, не authenticated workflow и не live R2 content audit. Supabase metadata SELECT и snapshot cron/default-role readback выполнены, DDL/restore/business writes не выполнялись.

## Остаток

JQA01/02 остаются baseline contract cases (live incidence/NULL ограничения см.05/канонический отчёт). JQA03/MCP/дизайн fixes имеют exact-source QA выше, но требуют L0 integration. Новая source-edition UI/claim цепь и owner acceptance ещё не готовы. Порядок возврата:143 ужеmain → rebase144 →154 →155; согласовать design/sidebar conflicts/locks, принять PR156; exact final gates и owner smoke, затем release. QA branch и architecture branch не заменяют main.
