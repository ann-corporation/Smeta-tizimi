# Независимая приёмка PTO — Codex / Claude

Только синтетические данные. Runtime, Supabase и реальные сметы не изменяются.

Из frontend:

```powershell
npx vitest run --config testlar/pto-joint-acceptance-20261025/config.ts
```

Это отдельные acceptance probes `*.audit.ts/tsx`, они намеренно не входят в обычный Vitest discovery. На baseline8b1eb894 измерено2PASS control и3FAIL OPEN findings (5 сценариев). Красный результат не скрывается и не является утверждением, что runtime исправлен. После исправления L0 все5 должны статьPASS; затем положительные regression cases принимает соответствующий владелец runtime тестов. Обычный существующий pereraschet.test.ts:16PASS.

- JQA-01: при нулевом net F2 объёме и ненулевой certified сумме строка исчезает. Необходимо оставить её видимой для проверки/корректировки.
- JQA-02: explicitNULL суммы превращается в0 и создаёт фиктивную разницу цены. Это contract-hardening case; live распространённость не установлена, view companion counter может защищать обычные строки.
- JQA-03 (P1, Fakt): компонентный repro подтвердил RPC expected120→new100 после «100% qilish» без отдельного correction preview. Здесь RPC замокан, production не изменяется.

Read-only production incidence check: по объекту153 среди2538 approved F2 row groups JQA-01-формы не обнаружены (0). Это не отменяет воспроизводимый дефект для допустимого correction shape и не доказывает его присутствие у владельца.

Не менять runtime из этого QA lane. Claude L0 назначает существующего implementer и записывает точный SHA исправления в mailbox.

## Приёмка Claude PR143/144

На отдельном worktree точного PR144 SHA `2e179c773e2fc780a33264b4490e2b20dc1f2314`:

```powershell
npx vitest run --config testlar/pto-joint-acceptance-20261025/candidate.config.ts
```

Этот config нельзя запускать на baseline8b1eb894: там ещё нет FaktQamrov. Файлы `*.candidate.tsx` тоже исключены из обычного discovery. Итог **2PASS/2FAIL**: неизменённый retry и реальный partial3001→holatMap refresh→retry — PASS; JQA-04 изменённый body с прежнимUUID и JQA-08 close/reopen после unknown commit — FAIL. Во втором FAIL synthetic server получил200 вместо100. Live function definitions прочитаны SELECT, без вызова writer. Synthetic server model повторяет early replay t2_akt_yarat по operation_id. Production данные не изменяются.

Обычные тесты кандидата: `ochiq-qoldiq.test.ts`, `fakt-qamrov.test.ts`, `fakt-material-taklif.test.ts`, `FaktJurnal.test.tsx` —36PASS. Это отдельное положительное свидетельство и не закрывает два независимых FAIL.

Полный review: `ops/mailbox/PTO-JOINT-QA-20261025/02-codex@Anvar.md` **с обязательным уточнением03-codex@Anvar.md**. Прежний JQA-05 отозван: первый probe подменял ishlar, тогда как реальный FaktJurnal сохраняет qamrov.ishlar snapshot. Он стал положительным CONTROL, отдельный repartition fix не требуется. P2JQA-06/07 навигации остаются source findings.

## Навигация — независимые probes, 26.10.2026

Claude L0 ACK получен26.10в00:10, распределение подтверждено mailbox04. Fixes выполняются прежними авторами; Codex принимает exact SHAs.

На navigation stack PR142 `d3a5c83f97b85ce0969f039a6a19cb87bef8165b` (включает PR141):

```powershell
npx vitest run --config testlar/pto-joint-acceptance-20261025/navigation.config.ts
```

Первый measured baseline: **3controlPASS/4OPEN FAIL**,7сценариев. JQA-06: password и existing Google login должны идти в company-aware `/admin`; fixture session boss не должна выбирать dashboard до определения active-company role. Invite/share priorityPASS. JQA-07: F2→history→F2 должен восстановить job и job+akt; уход в history не переносит page-specific job. Company/object switch не восстанавливает прежний draft — CONTROL/PASS. Это реальные компоненты с synthetic API/provider fixtures, без production fetch/write; не authenticated browser smoke.

### Повторная проверка исправлений26.10

- PR141b1585e66: login4/4PASS.
- PR14280fa2363: навигация7/7PASS. JQA-06/07 закрыты на этихSHA компонентно.
- PR143a5c6650e: прежние Qamrov4/4PASS, JQA-04/08 закрыты компонентно. ДобавленныйJQA-09: partial3001→known rejection→discard→new attempt записывает ранее подтверждённый объём повторно (200 вместо100). Расширенный набор4PASS/1OPEN FAIL. Это новая кнопка discard, не прежний отозванныйJQA-05.

Synthetic scope компании уникален на каждый Qamrov scenario: сохраняемый module/localStorage state не перетекает между tests. Последовательность partial+refresh повторяет фактический immutable ishlar snapshot потребителя.

Полный текущий receipt — mailbox05-codex@Anvar.md. Пока JQA-09 открыт, общий QA PASS Fakt stack не выдан. JQA-10 — отдельный source gap политики buxgalter approve, не смешивать с уже исправленным JQA-07.

Отдельные configs намеренно разделены: Fakt candidate и nav candidate находятся в разных pending stacks. Qamrov config включает только свой файл, navigation config — только nav файлы. Запуск всех pending candidates под одним source SHA был бы некорректен. Лог: `C:/Temp/PTO-NAV-BASELINE-20261026.log`.

## Текущий receipt26.10: mailbox06 имеет приоритет над историей выше

PR143a634072b: independent5PASS, author regressions32PASS — JQA04/08/09 закрыты. Main69db8d45: bugalter UI/default role gap JQA10 закрыт компонентно6PASS и SELECT default capabilities; custom grants остаются отдельной политикой.

MCP на69db8d45: `npx vitest run --config testlar/pto-joint-acceptance-20261025/mcp.config.ts` → 1controlPASS/1OPEN FAIL (MCP-QA01 dry_run COMMIT escape). Это fake-pool transaction ledger с настоящим dispatcher, без сети/ключей; не PostgreSQL integration. Исправление у MCP автора, не в этом QA lane. Файл candidate специально исключён из обычной test discovery.

## Итог26.10 — mailbox07 / receipt-20261026-final.json

Исторические OPEN FAIL выше не являются текущим verdict исправленных candidates. На exact requested sources: Fakt143/144 independent5PASS; marker154 strengthened section/mixed2PASS (completion.config.ts); MCP1557PASS (mcp.config.ts, pg.Client protocol model, no sockets); design150NULL fix3PASS (design.config.ts); sidebar15345PASS. Ordinary design115dad89 full3429PASS/20skip — отдельный source. Normal legacy pereraschetJQA01/02 остаются открыты; общий config.ts на baseline всё ещё намеренно красный. Только completion.config.ts изолирует исправленныйJQA03.

mcp-stdio-smoke.mjs запускается `node testlar/pto-joint-acceptance-20261025/mcp-stdio-smoke.mjs <repo-root>` после build MCP. Child env allowlisted, SMETA_DB_URL empty; проверка22tools и missing-DB error не вызывает writer. Fixture transaction ledger не заменяет PostgreSQL integration/restore acceptance.

Design/sidebar имеют реальные merge conflicts и design ownership gateFAIL — детали mailbox07. Full production/owner acceptance не заявлена. Runtime исправляют прежние авторы; QA файлы не заменяют их тесты и не входят в обычную discovery.
