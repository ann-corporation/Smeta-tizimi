# Загрузка каталогов: компания / платформа

Задача T2-CATALOG-UPLOAD-SCOPES-001. Прямой запрос владельца 2026-10-08. Base origin/main 1ef3e6d4; branch codex/catalog-upload-scopes-v1.

## Результат R2 (выполнено)

Private bucket smeta-tizimi-canonical; prefix reference-data/releases/c5822bb3610312bb/. 11 объектов, 3016089 байт. Все GET/readback SHA-256 и размер совпали. Receipt: D:/CatalogMigration/pto-uz data/audit-20261008/R2_UPLOAD_RECEIPT.json; manifest в том же пакете r2-upload/manifest.json. Объекты: 123622 ресурсных кода; 88806 неофисных цен; 437 ставок труда; 5560 автоматических связей REVIEW; 5 версий источника; история кодов; каталог типов актов; два справочных шаблона; README и manifest. 11943 цены из 168 старых смет, программные DLL, лицензия и секреты не загружены. CURRENT существующих каталогов не изменён. Это reference/review, не нормативно подтверждённый каталог.

## Реализация (отдельная ветка; не production)

BoshqaruvPanel → Kataloglar → CatalogReleasePanel. Company upload link → существующий /admin/narx-manbalari. Обычные пользователи загружают собственные источники в существующий company-scoped реестр; общие источники может загрузить только superadmin. Новый /api/catalog-release разрешает запись только после свежего database RPC t2_boshqaruv_umumiy_v1 с actor из подписанной сессии; роль cookie не является разрешением. Actorless legacy sessions, cross-origin writes и upstream failures отвергаются.

Platform source: original XLS/XLSX/XLSM/PDF <=25 MiB, server SHA256; 2000 строк на immutable chunk, JSON <=4 MiB, до 300000 строк. Finalize проверяет существование/hash/count всех частей; только полная manifest запись появляется в общем списке. Повтор с тем же содержимым не дублирует источник/части. Metadata: период/НДС/валюта; неизвестное NULL, отдельный операторский просмотр и подтверждение. Пользователь видит первые десять строк. Старые oferta/Ф2/цены не меняются. Сохранённые источники имеют pricing_published:false: автоподбор ещё не подключён к этому новому release-протоколу. В панели отдельно виден извлечённый reference пакет R2.

## Границы параллельных работ

KatalogManbaImport.tsx заблокирован T2-UNIVERSAL-SMETA-STUDIO-001 (Claude). Обнаружено: старый checkbox платформенного импорта вызывает t2_platforma_narx_manba_yoz_v1, которая теперь всегда возвращает sabab:r2. Файл НЕ ИЗМЕНЁН. Claude должен заменить старый platform branch на <CatalogReleasePanel /> (import ../catalog-release/CatalogReleasePanel), либо направить его в Boshqaruv → Kataloglar. Existing company import оставлять. Studio/narx-katalog/t2-narx-dalil и AI/F2 paths не изменены. Новые price releases пока не входят в canonical narx-katalog shards/snapshot validation: подключать через существующий source pipeline и canonical identity после review, без выдуманных numeric IDs и без второй цены в параллельной модели.

## Что остаётся

Интегратор Claude review/merge/deploy; owner authenticated upload/readback; исправление locked старого platform toggle; подключение опубликованных источников к существующему подбору цены с provenance/unit/date/region/VAT/currency gates. Никаких production DB миграций или изменений в этой ветке. Подробности тестов будут добавлены после окончания gates.

## Проверки 2026-10-08 (финальный код)

- 36/36 Vitest, 7 файлов: server upload/auth/finalization, 30001-row bounded client, platform/component access, existing Boshqaruv, catalog parser и tenant-read regressions.
- app tsc -b PASS; Functions tsc --noEmit PASS; oxlint src + new endpoint PASS, только existing warnings; focused new code lint без warnings.
- npm run tekshir PASS; npm run build PASS (4006 modules, existing grid.svg / bundle warnings); site-map --check PASS, generated map не изменился; git diff --check PASS.
- governance-check PASS, 75 tasks; existing CURRENT_STATE SHA warning. Locked KatalogManbaImport.tsx не изменён, конфликт устранён без изменения другого task.
- Supabase READ-ONLY pg_proc check: t2_boshqaruv_umumiy_v1 exists, jsonb result, _t2_boshqaruv_tekshir present, expected response key present. No migration/data write.
- R2 11/11 physical readback verified; authenticated new UI upload and production deploy UNKNOWN. Full Vitest suite не запускался; scope regression указан выше.
