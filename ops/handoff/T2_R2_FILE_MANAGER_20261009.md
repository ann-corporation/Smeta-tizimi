# Файловый менеджер / R2 — ночная задача владельца

Owner Codex, machine noutbuk, branch codex/document-understanding-v1.
Scope: fayl-daraxt.ts/test, FaylMenejer.tsx. STOR-001/backend/DB не изменяются.

Подтверждено кодом: одинаковые очищенные имена проектов объединяют дерево с контекстом первого ID; async загрузка списка без защиты от смены компании; ZIP fallback может совпасть с существующим именем и перезаписать запись архива.

Первое исправление: ZIP fallback проверяет повторные коллизии, ни один уникальный file ID не теряет путь. Regression test добавлен, проверка запущена. Дерево/контекст компании ещё не исправлены. Remote R2 inventory, ownership/registry reconciliation, live authenticated smoke не выполнены. Удаление или перемещение существующих объектов не выполнялось.

## 2026-10-09 — файловый менеджер, identity/race checkpoint IN_PROGRESS
Дерево использует canonical loyiha_id/obyekt_id/type/month, видимые имена и ZIP-пути сохранены. Breadcrumb показывает имя вместо внутреннего ключа. Same-name проекты/объекты больше не сливаются; 6 fayl-daraxt tests PASS. Список показывает только data.kompaniya_id=current; generation guards защищают late refresh; preview late-result также проверяет generation. Закрытие preview/search/tree при смене company. Authenticated UI A→B→A smoke ещё НЕ выполнен; download/ZIP/upload async company guards пока остались к следующему шагу.
Governance ошибка missing base_sha исправлена, 77 tasks PASS. Source previous gates прошли до governance (которая была FAIL, пакет нельзя назвать полностью green); новый app tsc запущен для текущих file-manager edits. oxlint exit0 с react-hooks ref cleanup warning; compile результат ожидается. Пока uncommitted и не deployed. R2 inventory/reconciliation ещё не выполнены; ни один объект не перемещался/удалялся.

## Завершённый branch checkpoint 2026-10-09
ID-based папки; keyed company workspace + request generation guards для списка/preview/download/ZIP/upload; upload exception освобождает busy state; stale company completion не показывает старую ошибку. Начатый upload старой компании не отменяется сервером, последующие файлы не запускаются; это не rollback успешно сохранённого файла.
10 file-manager tests PASS (A→B→A, late download, multi-file upload stop, late ZIP, folder identity и collision). Полный gate packet COMPLETE: app/functions TS, src lint, tekshir, site-map, build, 101 regression, 5-source real corpus, governance. Дополнительный финальный incremental compile/test повтор отдельно. Authenticated production smoke НЕ выполнен; это local component tests.
Live read-only audit: canonical R2 bucket 586 objects (arxiv2/docs128/hour-price5/narx286/norm154/reference11). Все128 registry documents с r2_key имеют object; size/company/custom sha metadata совпали; unregistered docs=0. SHA байтов повторно не вычислялся. Receipt D:/CatalogMigration/outputs/smeta-source-fidelity-20261008/r2-registry-audit-20261009.json. Remote файл не удалён/не перемещён. Логический explorer не обязан физически переименовывать immutable keys. Main/prod интеграция остаётся Claude.
