# Границы доменов и права записи

generated_at: 2026-10-26T06:19:09Z
git_commit: d7bf735359e8a54ef9e589c9a23cc28fc67876a9
db_migration_head: 20261106510000 / t2_agent_qidiruv_v1

Производный индекс к существующим ekotizim/E3, CONTRACT_SCOPE_V1, SMETA_ANATOMIYA_V1, F2_IMPORT_V3 и Obsidian CODEMAP. Никаких новых сущностей или универсального graph-store. Префиксные owner_module в registry — домен поддержки, не назначение конкретного агента и не доказательство business ownership.

## Identity / Company

t2_foydalanuvchi, t2_azolik, дополнительные grants, capability, компания/направления. Сессия определяет человека; active company определяет effective role. Platform superadmin, company boss и личный кабинет — отдельные слои. Bugalter default F2 write capabilities удалены, UI deny проверен; индивидуальные server grants остаются отдельным решением владельца. Не переносить privilege между компаниями. Главные пути: kirish.ts, auth.ts, KompaniyaKontekst, sb-yoz membership actions.

## Project / Object / Contract

t2_loyiha → t2_obyekt → t2_qator. Договор и допсоглашения связываются через существующий contract-scope. Один код работы не идентификатор: ключ — canonical row ID + object/company + source scope. t2_tomon_* / grants расширяют сеть участников без создания второй компании-истины. Адрес/геометрия и R2-ключи — метаданные объекта, не количество работ.

## Estimate / Revision / Catalog / Pricing

t2_qator — текущая иерархия и связи replacement/additional. t2_smeta_revision, t2_smeta_ozgarish/_qator — версии и контролируемые изменения; t2_smeta_* import/job/studio tables — промежуточные процессы с собственным lifetime. PR152 добавил t2_smeta_versiya/_pozitsiya/_moslik для внешних исходной/экспертной редакций и связи с текущим деревом; bazaviy_revision_id имеет FK на существующую t2_smeta_revision. Это source-edition слой, который должен сохранять связь с operational revision, а не второй расчётный движок. DB schema присутствует, законченный пользовательский flow не заявляется. Каталог и observation/candidate таблицы дают кандидатов с provenance, не автоматическое право переписывать утверждённую смету. Норма, коэффициент и источник цены сохраняют scope/edition; NULL не ноль. Расчёт устамали идёт через ustamali-summa и существующий nakrutka cascade, новый финансовый движок не создаётся.

## Fakt / F2 / F3 / M29

Факт и F2 используют t2_akt + t2_akt_qator, но tur и lifecycle отделяют смысл. t2_qator_holat — read projection, не write API. F2 import job и draft — не утверждённый акт. F3/накопительная берут утверждённые F2 с lineage; акт исправляется/замещается отдельным событием, не правкой истории. M29 и склад показывают расход/потребность, их нельзя вывести из «100%» без источника и режима. Текущий Fakt scope/receipt хранится вне modal; unknown результат сохраняет ID/body до разрешения.

## Finance / ERP / Site control

Договор, платежи, затраты, складские движения, техника, кадры и AOSR — связанные, но независимые журналы. Сумма акта не платёж. Физический факт не автоматическое признание затрат. Inspection evidence и AOSR меняют допустимость/предупреждения, не материализуют выдуманный объём. Неиспользуемые t2_erp_* пока остаются в review queue registry; отсутствие найденного writer не разрешает удаление.

## Documents / Storage / Recovery

t2_document_registry и object/storage bindings связывают документ, hash, source и canonical business ID. R2 хранит bytes/крупные snapshots, Postgres — изменяемую истину/реестр. Drive/Sheets — источник или управляемая реплика согласно FILE_TRUTH_AND_SECONDARY_REPLICA_V1, не независимый расчёт. snapshot5 — рабочая инфраструктура восстановления, не мусорные backup-таблицы для удаления. Autosave cron активен21:00UTC; корректность восстановления/полнота охвата требуют отдельного drill на disposable объекте.

## AI / Agent / Ecosystem / Operations

Agent run/command/tool/audit/budget и token ledger отражают выполнение/расход. AI и ручной UI должны вызывать одинаковые named domain commands и preview, а не создавать параллельную бизнес-логику. Доверенный admin MCP — отдельное исключение владельца; snapshot/audit и dry_run сами по себе не заменяют domain invariants. Outbox, задания и участники связывают стороны; их ACK не равен утверждению F2. Operations signals/health — наблюдаемость, не источник финансовых сумм.

## Запрещённые пересечения

- Экспертиза уменьшила entitlement → не уменьшать физический факт автоматически.
- Закрыли modal/таймаут → не считать write отменённым и не выдавать новую UUID неизвестной операции.
- Кандидат каталога совпал по шифру → не считать его эквивалентным без единицы, редакции и parent scope.
- Скрыли кнопку → не считать server capability закрытой.
- Получили snapshot_id/зелёный build → не объявлять restore/owner flow проверенным.
