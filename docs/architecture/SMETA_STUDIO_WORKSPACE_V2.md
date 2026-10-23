## Исследование взаимодействия — 2026-10-23

Первичные официальные руководства вне сметных программ:
- VS Code User Interface / Custom Layout: https://code.visualstudio.com/docs/editing/getting-started/userinterface и https://code.visualstudio.com/docs/configure/custom-layout — центральный редактор, primary/secondary sidebar, сохранение раскладки, command palette.
- Figma Properties: https://help.figma.com/hc/en-us/articles/360039832014-Design-prototype-and-explore-layer-properties-in-the-right-sidebar — свойства выбранного объекта без смены основного документа.
- Linear Peek / Selection: https://linear.app/docs/peek и https://linear.app/docs/select-issues — детали без потери списка, клавиатурная навигация.

Адаптация: смета в центре, выбор строки синхронизирует правый инспектор; слева целевой раздел и каталог; Ctrl+K ищет действия и существующие работы; стрелки перемещают выделение; раскладка хранится локально. Контекст выбранного work передаётся AI точной существующей [iN] ссылкой; выбор не разрешает менять условия. Коэффициентная форма привязана company+draft+work (исправлен независимый P2 review). Это адаптация паттернов, не копирование функций продуктов.

## 2026-10-23 — Переработка рабочего места по отказу владельца

Владелец не принял прежний экран: неудобно, перегружено, непонятно. Принято: три постоянные панели (кatalog/разделы; смета; выбранная работа/AI), переключение2/3панели, регулируемые ширины, независимый scroll. Таблица без длинных блоков коэффициентов; выбор строки меняет инспектор, не заменяет таблицу. Справа отдельные вкладки объём/коэффициенты/ресурс/AI/калькулятор. Ручные незавершённые поля и разговор остаются смонтированы при смене вкладок. Внизу сохранение/последнее действие/неполнота/известная сумма. Светлая нейтральная тема ограничена Studio, оболочка приложения не меняется. Core расчёт и команды прежние.

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

## Реализованное расширение рабочего процесса — 2026-10-22

После замечания владельца пакет расширен до цельного рабочего процесса. Новый рабочий центр показывает реальные missing quantities/prices/review из текущего calcDoc, предлагает следующий шаг и даёт AI/профессиональный вход. Профессиональная таблица поддерживает формулы, общий объём только для одинаковых физических единиц, перенос/удаление batch с одним undo и inline coefficients. Первая работа из каталога создаёт раздел в том же атомарном batch.

Геометрические калькуляторы (объём, площадь, стена минус проёмы, слой в мм, длина, масса с указанной погонной массой) используют existing exact ifoda. Физический результат не делится на масштаб нормы. Применение требует источника размеров и проверки единиц оператором. Результат сохраняется как quantity snapshot; серверная зависимость от параметров пока не создана.

Существующие named server API list/open/save переиспользованы без миграции. Есть opt-in autosave с debounce, optimistic version, стабильной идентичностью сетевого retry по snapshot, при VERSION_CONFLICT autosave прекращается. Undo с совпадающим edits не повторяет чужой operation_id. Сохранённый пустой draft можно записать. Divergent local version перед открытием server draft сохраняется отдельной копией; чужой company document отвергается. Объект берётся из существующего tenant-scoped API и задаёт context; документы объекта используют существующие рабочие места, не фиктивные выполненные объёмы.

Интернет-расценка больше не ограничена первыми 60 ресурсами и исследует pending candidates. Все полученные наблюдения сохраняются в local research queue до записи batch, переживают отмену/refresh. Unknown VAT не применяется и не показывается как рассчитанная цена без НДС. Несколько поставщиков требуют выбора и подтверждения спецификации/условий; оператор выбирает одну проверенную страницу, а не неподтверждённое среднее. Уже расценённые ресурсы исключены из видимой очереди. При смене draft/company/region или редактировании исходного документа старый pricing batch не применяется. Queue локальная, не серверный Durable job scheduler.

Следующие ограничения сохраняются явно: серверные shared jobs/history/dependency graph требуют самостоятельного контракта; официальный выпуск документов зависит от фактических реквизитов, execution и утверждения, а не от отсутствия warning в UI. Existing billing, auth и execution не дублируются.
