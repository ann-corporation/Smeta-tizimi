# C11.1 — центральный приходной журнал

Статус: PR189, исправления по L0 review от 28.10.2026. Production apply и merge выполняет L0 после целевого acceptance. PR190 и PR182 заморожены; PR-B начинается после merge189.

## Источники и границы

Чистая база main `f0eddfc05253717e6c259fad86d68fc7cafcbfbc`, существующий PR189 `bc27306a6b7080bfac6e8a7fd1ba3948bac9e911` включён обычным merge. Рабочая ветка `codex/c11-ledger-review-20261028`; доставка в существующую ветку PR189 `codex/c11-warehouse-ledger-20261027` без force.

Канонические требования: `docs/governance/CONSTITUTION.md` и Obsidian `KOORDINATSIYA.md`, раздел 2026-10-28 (3). Метаданные действующих таблиц, FK, actor/permission функций и INSERT-trigger inventory проверены SELECT-only 28.10.2026. Ни production DDL/DML, ни чтение частной книги в этой итерации не выполнялись. Публичные fixtures синтетические.

## Каноническая модель

Единственный журнал — существующий `public.t2_sklad_harakat`. Nullable `c11_*` поля сохраняют склад, актор, исходный документ/лист/физическую строку/SHA-256, operation/hash и сторно-связь. `c11_manba_turi` и `c11_sf_tasdiq` сохраняют исходную классификацию/отметку, не заменяя доменное `turi='mat'`. Цены, НДС, оплаты и новая таблица остатков не добавляются.

`obyekt_id=NULL` разрешён только при реальном tenant-matched складе; CHECK и composite FK обязательны. Исторические object-only строки и legacy cache не переписываются. Append-only trigger запрещает UPDATE/DELETE C11 строк; исправление — отдельное сторно.

`public.t2_sklad_ombor_qoldiq_v1` суммирует только активные C11 движения по точным `(tenant, warehouse, name, unit)`. Это НЕ полный складской остаток: legacy writers/M-29 и отсутствующий расход не включены. Разные единицы не объединяются; поиск не меняет идентичность материала.

## Именованные команды

`t2_sklad_markaziy_prixod_import_v1(actor, company, warehouse, document, sheet, rows, operation_id)` принимает 1–1000 строк только листа `Приход`. До первой вставки проверяет весь пакет, положительное количество, дату, физические номера и tenant-scoped optional supplier/request links. Невалидная строка возвращает код и исходный номер; частичной записи нет.

Источник: registry того же tenant, provider `cloudflare_r2`, active/stored, непустые bucket/key и серверно подтверждённый 64-символьный SHA-256. SHARE lock удерживает склад и метаданные документа во время записи. БД доверяет registry, но не скачивает файл из R2 и не доказывает соответствие payload исходной книге: это обязанность существующего server parser/preview/gateway.

Повторное выполнение одного operation_id с теми же параметрами возвращает **точно тот же JSON**, включая movement IDs и `takror:false`. Этот флаг не является индикатором повторной записи; UI должен использовать сохранённую квитанцию операции. JSONB hash канонизирует порядок строк, поэтому перестановка массива не меняет retry. Изменённый payload/actor/command с тем же UUID даёт `OPERATION_ID_CONFLICT`. Результат всегда отсортирован по source_row.

Физический dedup: `(tenant, warehouse, source SHA-256, sheet, source_row)`, поэтому повторная регистрация тех же байтов под другим document ID не создаёт приход. При новом UUID уже проведённый пакет получает `SOURCE_ROW_ALREADY_POSTED`, новых строк 0; это не успешная новая квитанция. Advisory transaction locks по операции/файлу и уникальный индекс защищают запись.

`t2_sklad_markaziy_prixod_storno_v1(actor, company, movement, reason, operation_id)` добавляет противоположное движение только для C11 прихода не старше24ч. Исходник не меняется; второе сторно запрещено unique index. Старый контракт replay сторно сохранён.

## Чтение экрана

`t2_sklad_kirim_royxat_v1(p_actor_id,p_kompaniya_id,p_sklad_id,p_filtr,p_limit,p_offset)` проверяет membership и `document.read`. Фильтр: `dan`, `gacha` (включительно), `qidir`, `tur`, `yetkazuvchi`; неизвестные ключи/неверные даты/типы отвергаются. Размер страницы 1–1000, offset≥0; порядок `sana DESC,id DESC`.

Ответ: `qatorlar` с provenance/actor/source category/SF/storno, `jami` по всему фильтру, `jami_materiallar` по точным имени+единице (`kirim`, `storno`, `sof_kirim`), `limit`, `offset`, `rasxod_kiritilgan:false`. Итоги не ограничены страницей и не называются доступным остатком. Латинско-кириллическая нормализация используется только для поиска: `sheb` находит `Щебень`, но не сливает номенклатуру.

Все SECURITY DEFINER RPC имеют пустой search_path и schema-qualified обращения, EXECUTE закрыт PUBLIC/anon/authenticated и разрешён только service_role gateway. Запись требует `document.write`; отдельное складское право в действующей модели пока отсутствует. Gateway должен брать actor из проверенной сессии, а не доверять клиентскому ID.

## Acceptance и rollback

`supabase/tests/c11_warehouse_receipt_v1.sql` сам создаёт уникальные синтетические company/user/membership/warehouse/registry fixtures внутри BEGIN..ROLLBACK. Внешние SET и существующие пользовательские ID не требуются. R2 fixtures — только метаданные для теста; файл в R2 не создаётся, проверка физического объекта не заявляется.

Покрытие: 1000 строк и точный replay без роста журнала; отказ1001; reordered retry/hash conflict; SHA-level dedup; NULL hash; actor/tenant/permission denial; фильтры/пагинация/итоги/кириллический поиск; source fields; разные единицы; сторно/24ч; append-only; закрытый EXECUTE.

Portable runner: `supabase/tests/c11-warehouse-pglite.mjs`; `C11_PGLITE_DIR` указывает на отдельно установленный `@electric-sql/pglite`. Минимальная схема и auth/audit mocks явно ограничены: это не production auth/RLS parity и не двухсессионная проверка конкурентности. Runner выполняет acceptance дважды и проверяет нулевой остаток fixtures после каждого rollback; затем guarded schema rollback и его postconditions.

28.10.2026: parent независимо повторил **PASS_SYNTHETIC_SQL_ONLY** на PGlite0.5.12: acceptance дважды, migration→rollback→migration→rollback, отсутствие всех C11 колонок/view/guard/list/search после каждого снятия. Исправлен найденный при review регресс: guard возвращал OLD для legacy UPDATE; теперь возвращает NEW, сохраняя запрет изменения C11. Harness подтвердил legacy insert/update/delete; production object FK этим не проверен. `node --check` и `git diff --check` PASS. Governance: три прежних ошибки чужих AKKAUNT/DIZAYN locks/production flag, воспроизводимые на исходной main; не исправлялись и не обходились в C11.

Rollback отказывается удалять любые C11 бизнес-факты. Только пустая C11 схема снимается, возвращая legacy `obyekt_id NOT NULL`. L0 отдельно выполняет acceptance на целевом Supabase/PostgreSQL и применяет миграцию. После merge189: существующий Sklad.tsx + preview181 + подтверждение/R2/progress/retry1000; никакой голосовой/autonomous posting в первом этапе.
