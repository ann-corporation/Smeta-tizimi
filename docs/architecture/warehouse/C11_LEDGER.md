# C11.1 — центральный приходной журнал

**Статус:** implementation sidecar для review родителем/L0. SQL migration и acceptance написаны, но не применялись. Это минимальная первая поставка: импорт прихода в существующий журнал и сторно этого прихода. Выдача, transfer, M-29 cutover, цены/НДС и product-facing release не заявлены готовыми.

## Источники и scope

- База checkout: `4fd84562a2aee44a145f6f79da67e8d4622cb23b`; ветка `codex/c11-warehouse-ledger-20261027`.
- Архитектурные ограничения: `docs/governance/CONSTITUTION.md` и внешний контракт `C:\Temp\GAS-c11-contract-20261027\docs\architecture\warehouse\C11_CONTRACT.md`.
- Разрешённый inventory: `D:\Obsidian\Anvar_Brain\20_PROJECTS\Smeta-tizimi\PTO_C1_SVOD_20261026\WAREHOUSE_LIVE_INVENTORY_20261027.json` (колонки/функции/ограничения/сводное представление) и `D:\Obsidian\Anvar_Brain\20_PROJECTS\Smeta-tizimi\C11_SKLAD_20261027\DOCUMENT_LEDGER_CONSTRAINTS_20261027.json`.
- Эти локальные статические метаданные подтверждают старый `t2_sklad_harakat.obyekt_id NOT NULL`, `t2_sklad_qoldiq UNIQUE (obyekt_id, nomi)`, `t2_sklad_mustaqil` с `kompaniya_id`, и текущий object-to-warehouse consolidation view. В registry для R2-документа используются `provider='cloudflare_r2'`, `status='active'`, `canonical_storage_status='stored'`, `sha256_verified`.
- Не читались БД, private business workbooks и сеть. Ни production DDL, ни данные не записывались.

## Каноническая модель

`public.t2_sklad_harakat` остаётся единственным журналом фактов. Новых inventory/receipt tables нет. На существующий журнал добавлены nullable `c11_*` поля для склада, документа и физической строки, SHA-256 исходного файла, request id/hash, сторно-связи и optional links к существующим `t2_kontragent`/`t2_erp_taminot`. Старые строки и старый объектный cache не переписываются.

Новые приходные строки имеют `obyekt_id=NULL` только вместе с tenant-matched `c11_sklad_id`; это закреплено CHECK и композитным FK `(kompaniya_id,c11_sklad_id) → t2_sklad_mustaqil(kompaniya_id,id)`. Импорт принимает только лист `Приход` и требует исходный документ из R2, принадлежащий тому же tenant, со статусами active/stored и серверным `sha256_verified=true`. Actor хранится типизированно в `c11_actor_id` с FK на существующего `t2_foydalanuvchi`; обе формы строки (приход/сторно) требуют его наличия.

`public.t2_sklad_ombor_qoldiq_v1` — read-only view, рассчитанный суммой активных движений по точному `(tenant, warehouse, name, unit)`. Нормализация имени, aliases и цены в ключ не входят. `t2_sklad_qoldiq` остаётся legacy object cache и этим PR не объявляется центральным остатком.

## Команды и безопасность

- `t2_sklad_markaziy_prixod_import_v1(actor, company, warehouse, document, sheet, rows, operation_id)`: до вставки валидирует весь пакет (1–500 исходных строк), подтверждает склад/tenant, R2 metadata и optional supplier/request IDs, проверяет уникальность исходных физических строк, затем атомарно пишет приходные движения. Цена не принимается и не вычисляется.
- Request hash — SHA-256 от канонического JSONB параметров команды, только для обнаружения отличающегося retry; это не подпись документа и не security credential. Ключ replay scoped по `(kompaniya_id, c11_operation_id)`. Тот же payload возвращает ранее созданные movement IDs; тот же ключ с другим hash/командой возвращает `OPERATION_ID_CONFLICT`.
- Проверка registry явно отвергает `sha256 IS NULL`, в том числе при `sha256_verified=true`. Идентичность физических строк определяется `(tenant, warehouse, lower(source SHA-256), sheet, source_row)`, а не только registry ID: повторно зарегистрированный тот же файл не создаст второй приход в том же складе. Source-level advisory xact lock сериализует одновременные повторные импорты того же файла/склада; уникальный индекс — последняя защита.
- Append-only trigger на существующем журнале блокирует `UPDATE` и `DELETE` строки C11 прихода/сторно. Старые cancellation/update RPCs не могут менять `holat` C11 строки, из-за чего она пропала бы из view; исправление — отдельное новое сторно-движение.
- `t2_sklad_markaziy_prixod_storno_v1(actor, company, movement, reason, operation_id)`: только для C11 прихода не старше 24 часов; добавляет противоположное `rasxod` движение, ссылается на исходное. Идемпотентен по своему operation ID; unique index запрещает второе сторно. Исходная строка не меняется и не удаляется.
- Обе `SECURITY DEFINER` команды имеют пустой `search_path`, полные schema-qualified обращения, actor/company membership и текущую `document.write` permission. Проверенный actor guard возвращает роль `text` и сам бросает `42501` при нарушении tenant membership; permission guard возвращает `void` и сам бросает `42501` при отказе. EXECUTE закрыт от PUBLIC/anon/authenticated и дан только `service_role` gateway.

## Rollback, ограничения и риски review

Rollback сначала отказывается продолжать при любой строке C11 или warehouse-only row; он не удаляет складские бизнес-факты. Только при отсутствии таких строк возвращает `obyekt_id NOT NULL` и убирает добавленные метаданные/view/functions.

1. Новая модель сохраняет R2 document id + sheet + physical row, но сама БД не извлекает строку повторно из R2. Gateway/parser обязан показать оригинал, полный preview и соответствие строки перед вызовом RPC.
2. `document.write` — существующее широкое разрешение; отдельного `warehouse.receive` в базовом контракте нет. Гранулярная роль/route требует отдельного L0 изменения.
3. Есть отдельные legacy writers, включая `t2_skladga_yozish`, trigger material movement и M-29. Они продолжают писать object-only/legacy cache и пока не используют C11 warehouse fields. Поэтому view намеренно ограничен C11 source rows; он не является полным складским балансом.
4. Миграция добавляет tenant-composite FK для склада. Supplier/request ссылки проверяются tenant-scoped в RPC и имеют FK на уже существующие entities; при дальнейшей прямой сервисной записи нужен такой же composite FK для этих таблиц.
5. `security_invoker` view, trigger/legacy-writer interaction, grants и поддержку `pg_catalog.sha256(bytea)` нужно подтвердить на целевой версии Supabase/PostgreSQL перед применением.
6. RPC использует существующий широкий `document.write`; dedicated warehouse permission отсутствует в проверенном контракте. Это ограничение требует L0 review до production exposure.
7. Source SHA-256 доверяется только после server-side `sha256_verified=true`; request hash предназначен для replay conflict detection, не для аутентификации.

## Acceptance и состояние проверки

`supabase/tests/c11_warehouse_receipt_v1.sql` — rollback-only синтетический контракт с изолированными fixture IDs. Он покрывает invalid JSON batch, `verified=true` с NULL hash, один SHA-256 на двух registry IDs, replay/hash conflict, физический dedup при сохранении разных source rows, forged tenant/actor, чужой склад, unit-separated balance view, storno replay/24h, блокировку legacy UPDATE/DELETE и lock/index наличие.

Внешний `C:\Temp\c11-sql-runtime\check-c11.mjs` на `@electric-sql/pglite 0.5.12` выполнил migration, rollback-only acceptance и guarded rollback: **PASS_SYNTHETIC_SQL_ONLY**. Портируемая копия runner — `supabase/tests/c11-warehouse-pglite.mjs`; PGlite устанавливается отдельно по инструкции в самом файле, без зависимости frontend. Проверены, среди прочего, null SHA rejection, повторный registry ID с тем же SHA, типизированный actor FK для прихода/сторно, ошибочная форма batch, append-only update/delete, tenant/unit checks и rollback postconditions. Схема минимальная; actor/permission/audit routines — явно заданные mocks, поэтому тест не доказывает production auth parity. PGlite использует одно соединение и не доказывает реальную конкурентность; production Supabase grants/RLS и целевую runtime совместимость также надо подтвердить отдельно. Окончательное принятие — за родителем/L0.

## Изменённые пути

- `supabase/migrations/20261113810000_c11_warehouse_receipt_v1.sql`
- `supabase/migrations/20261113810000_c11_warehouse_receipt_v1.rollback.sql`
- `supabase/tests/c11_warehouse_receipt_v1.sql`
- `supabase/tests/c11-warehouse-pglite.mjs`
- `docs/architecture/warehouse/C11_LEDGER.md`

Файлы созданы вручную по шаблону репозитория: Supabase CLI отсутствует в среде, поэтому `supabase migration new` нельзя было запустить. Commit, push, migration apply и rollout не выполнялись.
