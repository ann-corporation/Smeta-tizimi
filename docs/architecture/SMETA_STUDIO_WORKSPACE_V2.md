# Smeta Studio Workspace V2

Статус: implementation contract по прямому поручению Anvar 2026-10-22; release review — Claude L0.
Источник задания: пользовательский Research «Smeta Studio 2.0», не доказательство production поведения.

## Принятые границы

Один EstimateDoc, один dispatch/undo/redo, один calcDoc. AI предлагает named actions; после подтверждения они попадают в те же StudioCommand, что и ручной интерфейс. Переключение AI/каталог/проверка не создаёт копию сметы и не сбрасывает разговор. Ни AI, ни новая UI не рассчитывают деньги самостоятельно.

## Повторное использование

- Нормы и recipe snapshots: catalog-extraction/norm-remote + smeta-studio/catalog-bridge.
- Расчёт, NULL, коэффициенты, scale 100/1000: smeta-studio/calc и commands, без переписывания.
- Формулы: smeta-ai/ifoda и smeta-studio/birlik-hisob. Это уже существует; не создавать второй expression engine.
- Цены: StudioBosqichlar, company-prices, hour-pricing, market-comparison, narx-ishonch. Price observation не равен утверждённой цене.
- Документы: StudioBosqichlar/ResBosqichi, lrv-plus-export, hujjat-yozuvchi. F2/F3/акт требуют реального execution context; Studio не создаёт фиктивное выполнение.
- Сохранение: named server-save с optimistic version + operation_id. Локальная библиотека — recovery, не server truth.
- Публичные названия источников: manbaKorinishi; provenance в исходных данных сохраняется.

## Текущий пакет PR-01

1. Непоследовательные views «Ишлар / Нарxлар / Текширув / Ҳужжатлар», без обязательного wizard.
2. AI и каталог доступны из единого workspace; AI component остаётся смонтированным при навигации.
3. Предложения коэффициентов в строке каждой работы, прямое применение, undo; AI допускает только существующий applicable нормативный код.
4. Review строится из calcDoc и наличия recipe/basis/quantity; известная часть не подменяет полный итог. Переход к проблемной работе, а не поиск наугад.
5. Сохранённые локальные drafts не уничтожаются при создании нового; recover/open отделены от canonical save.
6. Ручные удаление/порядок разделов и AI используют те же commands. Экспорт использует существующий engine.

## Следующие пакеты, не объявлять выполненными

P2: server draft list/autosave, tenant/auth-scoped recovery, optimistic multi-tab conflict resolution, resumable jobs. Требуют серверного контракта и L0.
P3: price policy (включая неизвестный НДС), price evidence decisions, durable missing-price queue; без выдуманных текущих цен.
P4: quantity derivation library поверх existing exact expression engine; input units/evidence и frozen revision.
P5: document issuance registry поверх существующих генераторов; billing/onboarding/monitoring — самостоятельные существующие subsystems.

## Приёмка

AI→manual и manual→AI меняют один draft; переключение view не сбрасывает chat; unknown price/quantity/basis остаются unknown; coefficient apply/undo/export согласованы; локальные ошибки хранения видимы; ранее сохранённый draft открывается без потери текущего. Existing catalogue, server-save and export regression suites + app/functions types, lint/map/tekshir/build/governance. Browser local synthetic smoke отдельно от production owner acceptance.
