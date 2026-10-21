# CatalogMigration → R2 → Studio: проверенная первая интеграция

Owner direct request 21.10.2026: Codex интегрирует новые данные и согласует работу с L0 Claude через Obsidian. Branch `codex/catalog-runtime-20261021`. Отдельная L3 oracle branch остаётся `codex/catalog-adoption-20261021`.

## Изменение поведения

В существующем Studio coefficient panel появляется просмотр нового источника Construct: выбрать работу сметы или ввести полный код → bounded запрос 20 правил → исходное условие, basis, группы факторов, области связи, edition и SHA. Новые правила не получают кнопку применения: source approval и применимость к объекту ещё не подтверждены. Неизвестная работа отличается от существующей работы без связанных коэффициентов. Форматирование E→Е не означает эквивалентность редакций. Учтены короткие repair keys Е51–Е69 и commissioning family У.

Для уже существующих коэффициентов добавлен preview через действующий `calcOccurrence`: реальные ресурсы, quantity/amount до и после, неполный итог и известная часть. Нажатие «Ta’sirini ko‘rish» не меняет документ. Применение в черновик требует подтверждения условия и совместимости; отмена сохраняет существующий command/history механизм. Ручные значения проходят действующий command validator до preview. Calc/model/commands, price policy и canonical save не изменены.

## Место данных и доказательства

Private bucket `smeta-tizimi-canonical`, существующие active pointers прочитаны через authenticated Wrangler 4.151.2:

- `koef-katalog/CURRENT.json`: `b53bb50b9ee82a09`, 1703 правила, 5259 table keys, 110 SHART и 2 правила с нулевым значением. SHA payload совпадает с revision prefix.
- `norm-katalog/CURRENT.json`: `feaaa9e06cb91f03`.
- Существующий Construct parent: `reference-data/construct-2.7.3/releases/543add7f9b82a053f3666549`. Manifest вновь скачан с R2 и побайтно сопоставлен с сохранённым manifest.

Новый объект — **производный индекс**, не ещё одна копия базы: 1 125 459 bytes, 517 правил, 2730 областей, known identity 42 608 работ. Key: `reference-data/construct-coefficients/11f9a6ce4cc156fb51a1419562cca846a654ced4fb77bf605b012952c8a2a7b1/reference.json`. Manifest с parent lineage опубликован последним; оба GET+SHA readback проверены. Существующие CURRENT не менялись, raw базы не перезаписаны. `REMOTE_EVIDENCE.json` хранит точные counts, SHA и remote receipts без credentials.

Read API расширяет существующий `/api/koef-katalog?f=construct&work=...&limit=20&offset=0`. Session проверяется до R2; path/hash фиксированы сервером, query не выбирает bucket key. Проверяются размер, SHA-256 и schema. Ответ ограничен ≤100, UI —20. Missing/corrupt source возвращает явную ошибку, не пустой успешный каталог. Browser не получает полный корпус. Никаких бизнес-записей или новых Supabase таблиц.

## Проверки и пределы

`smoke-r2.mjs`: настоящий handler, реально скачанные R2 bytes, synthetic signed session, file-backed read-only R2 binding. 401 до чтения для анонимного запроса; 200 для правильного запроса; все 42 608 работ сравнены с независимыми ответами установленного NormRepository.Corrections: **0 различий**. Это проверка source+adapter, **не production authenticated browser E2E**.

Focused tests покрывают core fixture parity, pagination, unknown vs empty, source edition/SHA, stale request abort, non-executable source, auth/path/hash failure и preview→explicit confirm→apply→cancel. UI переводится в четыре существующих языка. Test arithmetic явно SYNTHETIC.

Исходный governance FAIL остаётся у чужих старых задач (`T2-NARX-ISHONCH-001` schema; AdminShell overlap RAHBAR/ROLES); новый task не добавляет overlap. Это отдельно передано L0, а не выдано за PASS.

OPEN: L0 review/merge/release, live authenticated owner smoke, approval source conditions/compatibility, полная интеграция Construct work/resource/price catalog (за пределами этого коэффициентного vertical slice). Два старых adapter defects из L3 остаются отдельными задачами L0. Нельзя объявлять «все данные внедрены» по этому PR.

## Воспроизведение

Python stdlib `build_reference.py` строит индекс из локального проверенного пакета. `--publish` использует уже имеющийся Wrangler OAuth; существующий иной hash по immutable key вызывает ошибку. Sources и pointers не переписываются.

`node ops/catalog-adoption/smoke-r2.mjs` запускается после R2 GET в локальный `runtime-reference/REMOTE_RUNTIME_REFERENCE.json` рядом с сохранённым full core oracle. Нет live business reads/writes и реальных пользовательских credentials.
