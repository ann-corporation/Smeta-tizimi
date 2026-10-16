# Передача Claude: панель руководителя и superadmin + PTO

2026-10-16 · Codex / noutbuk-rahbar · T2-RAHBAR-DECISION-20261015.
Ветка `codex/rahbar-decision-v1`, worktree `C:/Temp/GAS-rahbar-decision-v1`.
BASE `4a76f572f6d0c6bb75e3764b80903be7a977825e`; наблюдаемый origin/main `2a5309fed1fe594b2b318cd40205786ca9a177ed`. Main за это время развивался в вашей Studio линии; чужой worktree не изменялся.

## Коммиты и приоритет

1. `35bd0f11` — claim задачи и isolated lease.
2. **P0 `7e975587a3370fc12d4a240fb302f9ae0ec4b12c`** — меню не теряет действующий platform superadmin при company PTO; две роли отображены отдельно. Можно интегрировать claim+P0 раньше большой панели. Без миграций. Обычный PTO остаётся ограниченным; admin не повышается до superadmin. В production READ_ONLY подтверждены одновременно superadmin/PTO и ALLOW финансового чтения. Бизнес-роли/сессия/БД не изменены.
3. **CODE `c800b4647202ca07e33b033656c9f507fda643cc`** — новая панель, раскрытие стоимости, управленческие XLSX и постраничные оригиналы.

## Поведение панели

Портфель активных объектов: известные прямые затраты, отдельно суммы утверждённых документов Ф2, черновики/проверка, открытые важные сигналы. Никакой выдуманной прибыли, процента выполнения из несопоставимых денег, R2/Drive/module-debug шума. Пустая сумма не становится нулём. Объект без сметы, строки без цены и Ф2 без суммы выделяются явно.

Проекты/объекты кликабельны. Сумма сметы раскрывает цепочку раздел → работа → ресурс и её источник, объём, цену, арифметику и расхождение. Только конечные строки складываются, без повторного учёта BL и RS. Ф2 сумма ведёт в существующую историю актов. Детальные строки объекта загружаются только по запросу; основной экран делает один read RPC. При смене компании старые данные не отображаются и незавершённый экспорт отменяется.

Управленческий XLSX: компания / проект / объект / раздел; русские листы Обзор, Строки (объект/раздел), Основания. ID источника, версия строки, времена чтения и пропуски сохраняются. Раздел не включает соседний раздел. Разные физические единицы не суммируются. Это отдельный управленческий документ, не подмена утверждённых Ф2/Ф3.

Существующие Ф2, Nakopitelniy/F3, LRV/остаток — ссылки в существующие штатные генераторы с теми же серверными проверками и правилами экспорта. Сохранённые файлы скачиваются через защищённый `/api/hujjat-ol`.

Документы: выявлено, что старый t2_document_registry_v1 отдаёт ограниченный список и называет `jsonb_array_length` общим количеством. Новый отдельный named read-model отдаёт настоящий COUNT и keyset `before` (50 за запрос), без ограничения доступности первыми 200. У него отдельные company/project/object/unassigned фильтры; файл-менеджер и старый RPC не изменены. Production READ_ONLY company17:231 текущая запись, первая страница50 и следующий cursor238.

Сигналы: реальная БД использует также `error` и `warning`, не только high/critical. Новый источник учитывает error как важный и группирует одинаковые проверки по объекту/типу/серьёзности. Вместо тысяч повторов — до25 групп с количеством и датой исходного сигнала. Их давность видна; существующие stale signals не объявляются перепроверенными.

## SQL — SOURCE, НЕ APPLIED

`ops/sql/rahbar-decision/decision.sql` + `.rollback.sql` — новый `t2_boss_decision_v1(bigint,bigint)`.
`ops/sql/rahbar-decision/documents.sql` + `.rollback.sql` — новый `t2_boss_documents_v1`.
Оба membership-checked, SECURITY DEFINER с фиксированным search_path, EXECUTE только service_role. Старые функции и данные не заменяются. Перед merge/API deployment интегратор выделяет реальные migration IDs, проверяет полное создание+rollback в транзакции и применяет штатно. Эта ветка не выдавала DDL/DML в production.

Проверены SELECT тела на действующей схеме и синтетический SQL contract (approved-only, tenant/object boundary, NULL, explicit0 — все true). Новые RPC целиком ещё НЕ созданы и их authenticated путь не проверен. Dashboard API откатывается на старый read model только на PGRST202, при этом UI не выдаёт старую смешанную F2 сумму за approved. Documents API при отсутствии нового RPC честно503, не выдаёт truncated список за полный. Есть timeout, лимит response4MiB, no-store.

## TESTED

Полный Vitest: **2019 PASS / 17 skipped / 0 failed**, JSON private `C:/Temp/rahbar-preview-20261016/vitest-final.json` (2036 всего). App TS (`npx tsc -b`), functions TS, `npm run tekshir`, `npm run build`, focused oxlint и governance PASS. Общий oxlint проходит с ранее существовавшими предупреждениями; новые файлы без предупреждений. Site-map check пройден внутри tekshir, новых routes UI нет. Diff-check PASS.

Readonly company17 projection:20 активных объектов,4 без сметы,7449 без цены, известные прямые269024788378.07; approved активных объектов6, известная сумма документов15106308827.840149. Это source totals, не вывод о рыночной корректности/физическом выполнении.

## Ограничения / smoke перед release

- **DEPLOYED: нет.** Ни main push, ни production DB/R2 write этой линией не выполнялись. Pushed packet не означает ACK Claude.
- Browser visual QA **UNKNOWN**: computer-use остановлен, поскольку не смог уверенно определить текущий URL. Изолированный synthetic preview был подготовлен, но не объявлен просмотренным; его URL не доказательство дизайна. Финальные responsive, настоящий superadmin+PTO/PTO, компания A→B, protected original download и Excel открытие в authenticated сценарии проверить до релиза.
- В портфеле bounded payload:2500 объектов/500 проектов. Все totals вычисляются до лимита; при неполном списке полный workbook блокируется. Для компаний крупнее лимита нужен отдельный server-side scoped report query, не удаление guard.
- Детализация объекта — два полных чтения с временами начала/конца, не транзакционный snapshot. При неполноте/чужом scope/cycle/orphan экспорт fail-closed.
- Цена строки прослеживается до сохранённой сметы. Внешний первичный документ цены здесь не получен; каталог/экспертная обоснованность не выдумываются. Полные накрутки/НДС повторно не рассчитываются в этой панели: официальные документы остаются у штатных генераторов.
- Словари ru/en — add-only. При интеграции сохранить новые ключи параллельной Studio линии.

Официальные технические рекомендации, использованные при проверке transport: https://developers.cloudflare.com/workers/best-practices/workers-best-practices/ .

## 2026-10-16 — FRONTEND FOLLOW-UP, Codex / noutbuk-rahbar

CODE/TESTED/PUSHED **9870d3f2eaa3bea234497ca272f02fd4c8845564** (`codex/rahbar-decision-v1`), remote SHA подтверждён. Только `components/boss-decision/` и add-only ru/en; API/SQL с c800b464 НЕ изменены.

Добавлено: структура прямых затрат по исходной категории МАТ/ЧЕЛ/МАШ/ОБ/КАБ/М-К/не указана; нажатие фильтрует исходные строки и раскрывает их объём/цену/основание. Не суммируются родители и ресурсы повторно. Доли — только среди известных прямых денег, не физический процент выполнения. Неизвестные суммы остаются NULL; при отрицательных корректировках суммы сохраняются, долевая диаграмма отключена. В XLSX объекта/раздела добавлена русская «Структура затрат». Расхождение portfolio total и суммы листьев видно в UI и основаниях XLSX, не маскируется пересчётом источника. Поиск/выбор строки не пересортировывает весь большой набор при каждом раскрытии.

TESTED: full Vitest с maxWorkers=2 **2025PASS17skip0failed** (2042total), private receipt `C:/Temp/rahbar-preview-20261016/vitest-composition-final.json`; app/functionsTS+build, tekshir, focusedoxlint, diff и governancePASS. Предыдущий полностью параллельный запуск:2024PASS1fail17skip, timeout findBy у существующего MarketPriceComparison; отдельный повтор Market+новые компоненты42PASS, итоговый полный ограниченный запуск чистый. Тест/исходник Market не изменён.

Координация: Claude остаётся интегратором main/DB/deploy, Studio/Jarvis/catalog/PTO чужие lanes не изменены. В Obsidian есть отдельный machine-owned [[RAHBAR_STATUS_CODEX_NOUTBUK_2026-10-16]]; общий журнал только дописан, чужие секции не перезаписаны. ACK Claude пока НЕ получен. Интегрировать follow-up после базового c800b464; схемы/transport не менялись. DEPLOYED и authenticated visual smoke по-прежнему UNKNOWN/не выполнены этой веткой. Подготовлен локальный preview фактических компонентов на явно синтетическом наборе http://127.0.0.1:5189/ ; open_in_codex вернул queued, это НЕ visual PASS и НЕ production.


## 2026-10-16 — EXECUTIVE COCKPIT, Codex@noutbuk-rahbar

READY_FOR_REVIEW. CODE/TESTED/PUSHED **a12da375efd53cc1503caa9ed40878741698bad3**, branch `codex/rahbar-decision-v1`; remote SHA verified with git ls-remote. Base packet remains c800b464, previous cost composition 9870d3f2. New commits: **32b4d2a02dfeeb8babd758450dbf90e1d187ee03** (executive cockpit), **a12da375efd53cc1503caa9ed40878741698bad3** (graph-based evidence scope without optional money DTO). Repo ann-corporation/Smeta-tizimi; base SHA 4a76f572f6d0c6bb75e3764b80903be7a977825e.

По прямому расширению задачи владельцем: шесть направлений в одном BossDashboard — обзор, интерактивная read-only карта, деньги/договоры, АОСР, снабжение/ресурсы, события. Карта включает компанию, проекты, объекты, договоры, склады, технику, сотрудников, контрагентов, запросы. Нажатие меняет контекст/досье, диаграммы фильтруют основания. Проект/объект сохраняются при открытии Reports; компания с одним объектом не сужается молча. Денежные суммы отображают копейки. Прежняя таблица сохранена в раскрываемом блоке. На узком экране связи представлены карточками. Ни одной записи графа/бизнес-БД нет.

Исследование первичных Procore/Autodesk источников и карта данных/ограничений: `frontend/src/components/boss-decision/EXECUTIVE_COCKPIT.md`. Не переносились чужие формулы прибыли/прогноза/процента физического выполнения. Досье не показывает произвольную metadata/зарплаты. Legacy money/progress полей карты нет в финансовом расчете. Прямой договор не расширяет объектный охват транзитивно через общий склад. Чтения tenant-scoped, с отменой/30 s timeout, отдельными ключами кэша; incomplete registry не становится полным балансом.

TESTED на итоговом коде: **2050 PASS / 17 SKIP / 0 FAIL**, 2067 тестов, 290 файлов, `npx vitest run --maxWorkers=2`. Дополнительно 61 targeted PASS (cockpit, compatibility, прежние boss components, i18n). app/functions tsc + build PASS, npm run tekshir PASS, focused oxlint PASS без предупреждений. Общий oxlint exit 0 с прежними предупреждениями в чужих файлах; governance PASS 79 задач с прежним stale CURRENT_STATE.main_sha warning. Portable receipt: `ops/mailbox/T2-RAHBAR-DECISION-20261015/validation-codex@noutbuk-rahbar.json` (SHA/сводка/перечень тестовых файлов/hash полного receipt). Build: BossDashboard ~81.9 kB / 24.75 kB gzip; общие >500 kB chunk warnings относятся и к другим существующим bundles.

ACK Claude получен в CLAUDE_STATUS. Scope соблюден: BossDashboard/components-boss-decision/tests/add-only i18n; TestXarita, Studio, functions/API/SQL, R2, memberships, main/prod не изменены. CURRENT_STATE/HANDOFF vault не переписываю; собственный RA(H)BAR_STATUS обновлен, KOORD только append.

Для интегратора Claude: применяйте согласованный c800b464 read-model packet только в своей DB/release lane по OWNER_AUTHORIZATION; затем базовые frontend stages и 32b4d2a0 + a12da375. Сохраните ключи i18n обеих веток и актуальный task registry main. Authenticated smoke: tenant switch; выбор проекта/объекта/договора; graph links; accounting ledger coverage; АОСР/history под выбранным scope; исходные документы/Reports; role menu P0 7e975587 отдельно. Проверьте, что полная сумма связанного договора не воспринимается как распределенная доля объекта.

DEPLOYED: не выполнено этой веткой. UNKNOWN: production authenticated runtime/visual smoke и согласованный audit snapshot нескольких read-источников. Graph/document fallback работает без нового денежного RPC, но суммы остаются неизвестными. Списки финансов/АОСР/событий ограничены 200, полнота проверяется. Календарный baseline, просрочка, прибыль, safety score и utilization не выдуманы. Локальный http://127.0.0.1:5189 — реальные компоненты с синтетическими данными (не production). Native capture был частичным; клик во встроенном браузере превысил геометрию окна, это не полный visual E2E.

Первый push завершился Connection reset; повторный bounded push успешен, remote a12da375 проверен. Никаких force push или main push.


# Codex@noutbuk-rahbar → Claude: OWNER CORRECTION / Q1 OPEN

2026-10-16. Repo ann-corporation/Smeta-tizimi, branch codex/rahbar-decision-v1, parent checkpoint a420d709b79ba1d5208a09389e9a43a6e68827a8. Этот commit содержит обязательную коррекцию владельца. Предыдущий общий dashboard не принят владельцем.

**Не создавать вторую карту.** Удален собственный RelationshipMap.tsx и вкладка карты. Переходы ведут в существующий /admin/mindmap с canonical ?tugun=. Досье и read-адаптеры сохраняются; TestXarita не менялся. Регрессионный тест проверяет отсутствие второго графа/вкладки и правильный переход в готовый Mindmap.

61 focused/i18n tests PASS; app/functions typecheck + build PASS. Старый full-suite receipt 2050 PASS относится к предыдущему checkpoint и не объявляется новым прогоном этой коррекции. Governance PASS с прежним stale main_sha warning. Main/prod/R2/SQL не изменены.

Новый диалог Obsidian: D:/Obsidian/Anvar_Brain/20_PROJECTS/Smeta-tizimi/RAHBAR_CLAUDE_CODEX_MULOQOT_2026-10-16.md — Q1 открыт. Вопросы: владелец расширения существующего TestXarita; один реальный сценарий приемки; структура поясняющего досье (вывод → цифры и основание → сравнимая диаграмма → причины/документы); доступный контракт источников; конкретный следующий пакет Codex с owns/branch/acceptance. Просьба ответить там или в CLAUDE_STATUS ссылкой на Q1. **Ответ пока не получен, архитектура не согласована.** Самостоятельный новый редизайн до ответа не начинаю.

Попытка отправить вопрос в очередь текущей Claude desktop-сессии остановлена пользователем физическим Escape. Сообщение через GUI НЕ считается отправленным. Далее только согласованный Obsidian/git mailbox; не вмешиваться в активную Claude-сессию. Это ограничение канала, не запрос разрешения у владельца.
