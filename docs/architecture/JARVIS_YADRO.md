# Единое ядро Jarvis

Статус: M0 — инвентаризация и контракт переноса, НЕ реализованный M1–M5.
Срез main: `df9d6147d4abd9ae874c5913de0d160d871ab3e7`, 15.11.2026.
Источник требований: поручение владельца CODEX_GOAL_JARVIS_2026-11-15 в Obsidian.
Архитектор/review/merge: Claude L0. Исполнение AI lane: Codex. Production и применение SQL — не Codex.

## 1. Контракт ядра

Каналы web, mobile BFF, Telegram, Windows и MCP передают запрос единому
`frontend/functions/_shared/jarvis/`. Канал переводит транспорт/формат, но не
выбирает финансовую формулу, модель, разрешения или независимую историю.

Последовательность: проверенная сессия → tenant/object authorization → контекст
и серверная история → deterministic router → typed tools → при необходимости
budgeted LLM → проверенные evidence → ответ/ссылки/chips → компактная telemetry.

Контекст: actor, company, role, page, object, smeta, F2, akt, locale, conversation,
request/operation ID. Actor/роль берутся с сервера. Переданные клиентом object,
company и conversation проверяются при каждом вызове; история не выдаёт права.
Неоднозначный объект требует уточнения, а не первого совпадения.

Tool contract: идентификатор и версия, входная схема, permission, scope,
read/write, output schema, evidence refs, timeout, idempotency/reconciliation.
Evidence содержит источник и его версию; пустые данные, отказ и ошибка различны.
Финансовые значения берутся из существующего ядра smeta-anatomiya/денежных helpers:
цена единицы без НДС; объект с НДС → с накруткой без НДС → прямые;
проценты только из подвала, NULL не 0, отрицательные значения сохраняются.
LLM не рассчитывает суммы и не превращает инструкцию внутри документа в команду.

## 2. Перенос существующих входов

Все пути в таблице относительно frontend/. Перенос выполняется постепенно с
contract tests; удаление старого кода только после переключения его потребителей.

| Сегодня | Целевая ответственность | Что объединить/удалить |
|---|---|---|
| functions/api/ai-savol.ts | Legacy channel adapter | oqishRpc/umumiyMatn/частный jarvisJavobi перенести в tools/composer; убрать прямой AI.run |
| functions/api/agent-ish.ts | Authenticated channel + совместимость операций | kasbQuvur, intent, prompt assembly, model selection перенести в core; administrative routes сохранить отдельно |
| functions/api/smeta-ai.ts | Studio adapter | suhbat, ish/narx/koef selection, page help, F2 intent, internet prices, KP reading зарегистрировать как capabilities |
| functions/api/ai-parse.ts | Document extraction tool | Inline prompt/schema → document tool; существующий OCR контракт сохранить |
| functions/api/foto-ai.ts | Photo evidence tool | Prompt/schema → photo tool; описание не является подтверждением объёма |
| functions/api/loyiha-ai-oqish.ts | Project reading tool | LOYIHA_AI_SYSTEM/схема → domain capability, без второго parser |
| functions/api/smeta-narx-agent.ts | Price matching tool | SYSTEM/SCHEMA → price capability; предложения не равны утверждённой цене |
| functions/api/ai-ishchi.ts, ai-ishchi-bajar.ts; _shared/ai-ishchi.ts | Worker channel + job adapter | Существующие worker definitions/queue сохранить; общие инструменты/charging через core |
| functions/_shared/telegram-bot.ts; api/telegram/* | Telegram channel | Сейчас bot вызывает ai-savol через middleware; перенести AI dispatch, не дублировать ACL |
| functions/api/mobil/bff.ts | Android authenticated adapter | Принять изменение Claude android-jarvis-toliq после merge; не переписывать его параллельно |
| src/components и src/lib/yordamchi | Web/Windows UI и previews | Браузерные callbacks не делать серверным authority; заменить invocation на serializable tools |
| MCP integration | Channel adapter | Найти/проверить exact transport при M1; не объявлять parity без реального вызова |

## 3. Общие слои и источники

| Существующий код | Решение |
|---|---|
| functions/_shared/ai.ts | Сохранить provider transport; вызывается только accounting boundary |
| functions/_shared/agent-hisob.ts и ai-hisobli.ts | Два одноимённых aiHisobli: унифицировать бюджет/route без двойного debit; nullable platform scope сохранить явно |
| functions/_shared/agent-prompt.ts, agent-kasb.ts | Prompt modules ядра; role facts/deny policy не заменять текстом модели |
| functions/_shared/jarvis-xotira.ts | Memory adapter; preferences — данные, не permissions |
| src/lib/jarvis/intent.ts, answers.ts, qidiruv-sozlari.ts | Общие deterministic intents/composer/synonyms, не новая формула |
| src/lib/jarvis/studio-kontekst.ts, katalog-kontekst.ts | Проверяемые draft/reference контексты, не canonical business truth |
| src/lib/smeta-ai/* и lib/loyiha-smeta/jarvis.ts | Domain prompts/schemas/flows сохранить и зарегистрировать; не перемешивать предложения и утверждённые данные |
| src/lib/yordamchi/vosita/{tur,reestr,haqiqiy,amal-vosita,pto-liniya}.ts | Инвентарь операций → server registry; текущие UI confirmations не достаточны для M3 |
| src/lib/reestr/{amal,amal-motor,amal-ijro}.ts | Сохранить named command/operation_id, ручной и AI путь используют одну команду |
| role-authority / permission-policy | Единый источник прав; tool сначала проверяет tenant+object+action |
| agent-ish suhbat_royxat/ol/saqla/ochir | Уже есть серверный CRUD t2_jarvis_suhbat; расширить sync, а не создать вторую историю |
| #506 / #523 / #532 | Использовать после интеграции; 15.11 #532 OPEN, checkpoint SQL draft не применён |
| #536 / #537 | Кандидаты sequence/planner поверх #532, не доказательство готовности единого ядра |

Прямой Workers AI вызов в ai-savol сейчас обходит общий aiHisobli. Это факт
кодового пути, не доказанная потеря денег. Удалить обход при миграции adapter.
В данном main не найдены ожидаемые r2-saqlash.ts/arxiv-siyosat.ts: перед M2
проверить актуальную ветку L0 и использовать её storage contract, не создавать дубль.
Удалённый ref claude/android-jarvis-toliq на момент проверки не обнаружен:
это не означает отсутствие локальной работы Claude.

## 4. Полная целевая поверхность tools

| Группа | Источник/перенос | Этап |
|---|---|---|
| Object list/fuzzy aliases | Existing object readers + qidiruv-sozlari; scoped ambiguity | M1/M2 |
| Finance/podval | Existing object finance/smeta-anatomiya, source refs; VAT-first | M1 |
| Rows RZ→BL→RS/norm code | Existing row readers; active smeta version, no hierarchy inference | M1 |
| Fakt/coverage | Existing fakt journal/read contracts; preserve signs | M1 |
| F2 list/status | Existing reestr/VositaApi; frozen approved version | M1 |
| Nakop/slich | Existing comparisons, no parallel aggregation | M1 |
| Acts/debts | Existing act/accounting readers and permission policies | M1 |
| Warehouse balance | Existing stock ledger readers, no inferred zero | M1 |
| Today/approvals | Existing bugun and workflow readers; remove channel-only logic | M1 |
| Documents/links | Existing document ACL/download contracts; no arbitrary URL fetching | M1 |
| ShNK norms | Existing normativ-qidir, published references with citations | M1 |
| Price catalog | Existing catalog readers; reference price distinct from approved price | M1 |
| Fakt incl negative; zamena/extra | Existing named commands; preview, confirm, step-up as required | M3 |
| F2 draft create/update | Existing F2 domain commands, expected version, never automatic approval | M3 |
| Task/invite | Existing task and @username/phone invite APIs | M3 |
| Warehouse receive/issue | Existing ledger commands; operation ID + readback | M3 |
| Signing | Existing public signing/PIN API from Claude qulf, no internal edits | M3 |

Эта таблица — обязательства реализации, не заявление что все server tools уже есть.
Каждый binding при M1 получает exact RPC, input/output validation и denial tests.

## 5. Долговечность, jobs и обучение

Один conversation ID и серверный список во всех каналах; rename/delete и сообщения
синхронизируются ≤5 секунд. Offline очередь упорядочена по operation_id, local
storage только шифрованный cache. История >90 дней в R2 остаётся читаемой;
metadata/индексы компактные. Нельзя повторно сохранять усечённый prompt как полную историю.

M3: proposal → diff → confirmation → step-up → idempotent command → audit.
Подтверждение привязано к actor/scope/payload/version; изменённый preview требует
нового подтверждения. Неопределённый результат записи → reconcile/readback,
не слепой retry. Client checkpoint #532 не является доказательством бизнес-записи.

M4 строится на #532: месячный F2 draft, unpriced rows/proposals, project→Studio.
Прогресс доступен по task ID во всех каналах. Зависимые шаги прекращаются при
ошибке; completed означает подтверждённый результат, не текст модели.

M5: compact feedback/corrections/failures/no-answer/chips → company aliases,
reviewed routing/FAQ proposals; глобальные priors только ≥5 компаний. Weekly
report в существующие proposals; человек принимает изменение поведения.
Raw transcripts не попадают в глобальный prompt. Admin показывает eval/cost/failures.

## 6. Доказательства и оставшиеся критерии

| Этап | Приёмка | Состояние на этот срез |
|---|---|---|
| M0 | Входы, prompts/calls/tools и перенос перечислены | Документ + механический индекс ниже; runtime не менялся |
| M1 | ≥150 synthetic goldens, 3 канала одним core, источники чисел | Не выполнено |
| M2 | Полная история и context, sync ≤5s, offline ordering/R2 | CRUD есть; end-to-end не доказан |
| M3 | Все write tools, step-up/idempotency/audit | Не выполнено; PIN public API dependency |
| M4 | Три сквозных job сценария + cross-channel progress | #532 кандидат read-only; не выполнено |
| M5 | Reviewed learning loop, weekly report, измеренные cost/quality | Не выполнено |

Eval frontend/scripts/jarvis-eval.mjs: uz-Latin/uz-Cyrillic/ru, money/followup,
aliases, forbidden tenant/role, unknown, write confirmation, document injection.
Порог money/status ≥95%, permissions 100%, invented numbers 0; median deterministic
≤4s/LLM ≤12s, стоимость на ответ. Mock latency не является production latency.
Private real-data eval вне repo выполняет Claude. Все fixtures в repo синтетические.

Каждый code PR: app/functions TS, focused Vitest, authorization/domain/i18n/site-map
guards, eval; CI и authenticated E2E отмечаются раздельно. SQL только draft + rollback
rehearsal, затем L0. Ни merge M0, ни зелёный mock test не завершают общий goal.

## 7. Воспроизводимый индекс исходников

Индекс production TS/TSX (тесты исключены); числа после пути — строки данного SHA.
Имена/тела пользовательских данных не копируются. Prompt assembly включает inline
системные сообщения; динамические domain builders перечислены в §3. Regex-индекс
не доказывает отсутствие скрытых внешних вызовов; M1 проверяет каждый перенос.

### Вызовы модели

- `frontend/functions/_shared/agent-hisob.ts`: 21, 25.
- `frontend/functions/_shared/ai-hisobli.ts`: 30, 37.
- `frontend/functions/_shared/ai-ishchi.ts`: 143.
- `frontend/functions/_shared/ai.ts`: 510.
- `frontend/functions/api/agent-ish.ts`: 360, 520, 545, 569, 595, 606, 736, 778, 784.
- `frontend/functions/api/ai-parse.ts`: 93.
- `frontend/functions/api/ai-savol.ts`: 78, 85, 102.
- `frontend/functions/api/foto-ai.ts`: 66.
- `frontend/functions/api/loyiha-ai-oqish.ts`: 106.
- `frontend/functions/api/smeta-ai.ts`: 231, 251, 269, 316, 340, 354, 406, 454.
- `frontend/functions/api/smeta-narx-agent.ts`: 100.

### Сборка prompts

- `frontend/functions/_shared/agent-kasb.ts`: 98.
- `frontend/functions/_shared/agent-prompt.ts`: 15.
- `frontend/functions/_shared/ai-ishchi.ts`: 64, 77, 160, 202.
- `frontend/functions/_shared/ai.ts`: 352.
- `frontend/functions/_shared/tizim-maxfiy.ts`: 99.
- `frontend/functions/api/agent-ish.ts`: 361, 521, 546, 570, 607, 737, 778, 785.
- `frontend/functions/api/ai-parse.ts`: 94.
- `frontend/functions/api/ai-savol.ts`: 39, 75.
- `frontend/functions/api/foto-ai.ts`: 67.
- `frontend/functions/api/loyiha-ai-oqish.ts`: 27, 107.
- `frontend/functions/api/smeta-ai.ts`: 118, 235, 259, 281, 318, 345, 356, 417, 456.
- `frontend/functions/api/smeta-narx-agent.ts`: 61, 100.
- `frontend/src/lib/ai-yordamchi/prompt.ts`: 29, 50, 73, 100.
- `frontend/src/lib/smeta-ai/internet-narx.ts`: 80.
- `frontend/src/lib/smeta-ai/prompt.ts`: 10, 131, 161, 170, 180, 207.
- `frontend/src/lib/yordamchi/kim.ts`: 46.
- `frontend/src/lib/yordamchi/niyat-llm.ts`: 30.
- `frontend/src/lib/yordamchi/niyat.ts`: 70.

### Tool definitions

- `frontend/src/lib/jarvis/answers.ts`: 6, 12, 20, 35.
- `frontend/src/lib/jarvis/intent.ts`: 19, 34, 38, 42.
- `frontend/src/lib/jarvis/katalog-kontekst.ts`: 18.
- `frontend/src/lib/jarvis/qidiruv-sozlari.ts`: 29.
- `frontend/src/lib/jarvis/studio-kontekst.ts`: 5, 18, 22, 23, 26.
- `frontend/src/lib/jarvis/useStudioKontekst.ts`: 7, 22.
- `frontend/src/lib/yordamchi/vosita/amal-vosita.ts`: 21, 50.
- `frontend/src/lib/yordamchi/vosita/haqiqiy.ts`: 38.
- `frontend/src/lib/yordamchi/vosita/ishla.ts`: 10, 16.
- `frontend/src/lib/yordamchi/vosita/pto-liniya.ts`: 19, 30, 50, 57, 64, 85, 105, 119, 131, 145, 156, 189, 226.
- `frontend/src/lib/yordamchi/vosita/reestr.ts`: 61, 74, 126, 144, 173, 194, 222, 235, 254, 268, 283, 310, 325, 334.
- `frontend/src/lib/yordamchi/vosita/yordam.ts`: 8, 16, 35, 45, 56, 65.
