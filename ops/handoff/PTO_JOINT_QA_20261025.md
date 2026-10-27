## 26.10.2026 вечер — актуальный receipt08

Post-merge maina4fe: MCP7/marker2/Qamrov5PASS; sidebar153deb85:7+38PASS. Узкие PR160(dee64acb),161(a65e7c25),162(1195c155) опубликованы. Новые #157 P1 source-trust и P2 signed-money regression переданыL0; writer/DDL не вызывались. Главное: ops/mailbox/PTO-JOINT-QA-20261025/08-codex@Anvar-postmerge-narrow-prs.md. Старый integration sandbox не release path; main23ownership overlaps сохраняются. Архитектурный snapshot остаётся d7bf/06:19,11manual overrides не означают новый live inventory.

# PTO-JOINT-QA-20261025 — независимая приёмка для Claude L0

OWNER: Codex@Anvar. REPO: ann-corporation/Smeta-tizimi. BASE:8b1eb8946dcb5b171db9af5a014d7e031dece585. BRANCH:codex/pto-joint-qa-20261025.

## Цель и граница

Владелец поручил Claude и Codex совместно решить PTO-проблемы без дублирования. У Claude4–5 implementers. Этот lane — только отдельные synthetic acceptance probes, review и mailbox. Runtime/Fakt/Sidebar/DB/Nakopitelniy/pereraschet.ts не редактируются. Интеграция/deploy — L0. REQUEST/ACK опубликован в Obsidian KOORDINATSIYA; прямой ACK ещё не получен.

OWNED PATHS: frontend/testlar/pto-joint-acceptance-20261025/; ops/handoff/PTO_JOINT_QA_20261025.md; ops/mailbox/PTO-JOINT-QA-20261025/. Registry registration — отдельная запись, чужие задачи не закрываются.

REQUIRED READING: AGENTS.md; docs/governance/CONSTITUTION.md; docs/governance/OWNER_AUTHORIZATION.md; Obsidian PTO_TIZIM_ARXITEKTURA_AUDIT_2026-10-25 / CLAUDE_PTO_AUDIT_TOPSHIRIQ_2026-10-25.

## Фактический результат

PR139 уже есть в main; его повторно не реализуем. В новом независимом наборе5 synthetic сценариев:2 controlPASS,3 OPEN FAIL на baseline8b1eb894. Не выдавать это за зелёную приёмку. Test files `*.audit.ts/tsx` запускаются отдельным config и не попадают в обычную discovery. Обычные существующие pereraschet tests:16PASS.

1. JQA-01, P1/P2 depending on live incidence: qatorTasnif рано исключает нулевой net quantity даже при certified amount500. Такая строка должна оставаться видимой для review/корректировки, без выдуманной объёмной суммы. Строки runtime115–122. Synthetic reproducible; реальная сумма не использовалась.
2. JQA-02, P2 contract hardening: explicitNULL f2_summa с positive quantity и missing/zero companion counter становится0 и даёт ложный price-difference claim. Nullable engine contract должен fail closed. Обычный production view может предотвращать такую форму своим counter; распространённость не доказана.
3. **JQA-03, P1:** компонентный repro FaktNative подтвердил: marker completion посылает expectedFaktHajm120 / yangiFaktHajm100. Измеренный overrun не должен уменьшаться completion-действием без отдельного correction review. Приоритет перед JQA-01/02, передать существующему Fakt агенту.

Production incidence SELECT: JQA-01 shape в объекте153 отсутствует (0 из2538 approved row groups). Не объявлять synthetic case доказанной текущей потерей денег в пилоте.

## Проверка

Из frontend: `npx vitest run --config testlar/pto-joint-acceptance-20261025/config.ts`.

Baseline: exit1,2PASS/3FAIL. После принятого исправления владельцем модуля —5PASS. Одновременно прежний `src/lib/pereraschet.test.ts` должен остаться зелёным. Устранение early-return не должно подставлять фиктивный объём для monetary-only строки. NULL и подтверждённый0 обязаны различаться.

## Следующее действие L0

Привязать findings к существующему владельцу pereraschet либо выдать Codex точный отдельный sublease на pereraschet.ts/test с baseSHA и оговорённой семантикой. До этого runtime patch отсутствует. Отдельно назначить A01–A11 между уже работающими Fakt/revision/B0/UX агентами; не запускать дубли.

FORBIDDEN: production writes, changes to certified historical data, secrets, force pushes, main integration, чужие runtime файлы. ACCEPTANCE: exact corrected SHA +5PASS independent probes +previous regression +normal-role smoke by L0. Synthetic green не является owner acceptance.

## Продолжение: независимый review PR140–144, 23:26

Проверен фактический candidate stack PR140→143→144, SHA2e179c773e2fc780a33264b4490e2b20dc1f2314. Runtime не менялся.36 существующих testsPASS; отдельные network acceptance1PASS/2FAIL. P1 JQA-04/05: Qamrov меняет body под тем жеUUID после unknown response и переиспользует ID первого успешного chunk после partial write + parent refresh. Последний случай воспроизводит ложное завершение без записи оставшейся строки. Live function definitions SELECT подтверждают early UUID replay; реальные команды не вызывались.

Read-only peer review навигации: P2 JQA-06 session role вместо current-company role при входе; P2 JQA-07 утрата job/akt ссылки при F2 tab roundtrip. PR144 material helper delta: блокирующей регрессии не установлено, существующие unit/component testsPASS. Полные exact refs, repro и требования к исправлению — mailbox02.

L0: назначить findings существующим авторам PR143/141/142; прислать exact corrected SHA для повторной независимой приёмки. До этого PR143/144 не имеют QA PASS. Положительный material review не является release approval всего стека.

### Уточнение после проверки consumer

Mailbox03 обязателен: прежнийJQA-05/repartition ОТОЗВАН, реальный FaktJurnal хранит ishlar snapshot; partial+holatMap refresh сталCONTROL/PASS. ПодтвержденыP1JQA-04 (другой body под прежнимUUID) и новыйJQA-08 (unknown commit→закрытие/повторное открытие modal теряетUUID; synthetic итог200 вместо100). Текущий итог4probes:2controlPASS/2OPEN FAIL. Исправляющий комментарий направлен PR143 напрямую, runtime автора не менялся. Рекомендация: immutable attempt/receipts вне modal, resolution unknown до нового draft.

## 26.10.2026 — ACK и повторная приёмка

ClaudeL0 ACK00:10 принят, mailbox04. Fixes у существующих авторов. Mailbox05 содержит текущий oracle: PR141b1585e66 login4PASS, PR14280fa2363 nav7PASS (JQA-06/07 закрыты компонентно); PR143a5c6650e прежние Qamrov4PASS (JQA-04/08 закрыты), расширенный JQA-09 partial-confirmed→discard→new save даёт200 вместо100. Итог5cases4PASS/1OPEN FAIL. Author notified directly. JQA-05 не возвращается: новый09 относится к сохранённому snapshot и стиранию receipt кнопкойdiscard. JQA-10 — source-level остаток owner policy об approve уbugalter.

Normal full gates QA branch/base8b1eb894:3264PASS/20skip; app+functionsTS, oxlint, site-map check/generate (no diff), tekshir/build/governancePASS. Private logs/receipt C:/Temp/PTO-QA-*. Independent candidate failures не входят в обычную discovery. Полный normal green не является exact candidate CI или release approval.

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


## 27.10.2026 — mailbox09 supersedes08
C1 private financial reconciliation/draft delivered; C2 oldsource2PASS (new168 requiresseparateacceptance); C3 PR164 P1 immutable-attempt2FAIL+scope1FAIL with4controlsPASS, productionwriternevercalled.165retry5PASS, conditionalpartialmoneyhardening. New canonical receipt:ops/mailbox/PTO-JOINT-QA-20261025/09-codex@Anvar-c1-c3-20261027.md. Main95e9f743 is remote readback, not Codexpromotion. Own162a2a41073/1630aa96e98 checks5/5PASS;162 compatibilitywithnewmainnext.
