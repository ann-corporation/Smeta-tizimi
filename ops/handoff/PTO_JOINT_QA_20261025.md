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
