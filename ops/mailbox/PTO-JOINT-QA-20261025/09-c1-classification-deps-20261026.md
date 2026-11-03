# C1 sidecar — проверка зависимостей классификации `t2_qator`

Дата: 2026-10-26
Режим: READ ONLY; только статический анализ исходников и SQL в `C:/Temp/GAS-pto-corrections-20261026`.
Область: основной срез `a4fe8b65`; отдельная pereraschet-коррекция вне проверки. Реальная сверка строк книги и БД не выполнялась и остаётся за parent review. ID строк/объектов и финансовые данные в отчёт не включались.

## Основа и ограничения источников

`docs/architecture/ROUTE_RPC_MAP.md` связывает `/admin/holat`, `/admin/f2`, `/admin/f2-tayyorlash` и `/admin/nakopitelniy` с `t2_qator`, `t2_qator_holat`, F2 и указанными именованными командами (стр. 49–55). Карта сама оговаривает, что это allowlist, а не полный React→API callgraph (стр. 9); её заголовок указывает snapshot commit `d7bf735…` и migration head `20261106510000` (стр. 3–11). Поэтому маршрутная карта — навигация, не утверждение о runtime/production. `DATA_MODEL_REGISTRY.yaml` помечает `t2_qator` канонической истиной и перечисляет audit/change/version triggers (стр. 11234–11268); в реестре `t2_akt_qator` также показан DB trigger для freeze утверждённых F2 (стр. 2417–2462).

Ниже условия взяты из определения `t2_nakopitelniy_v2` в исходной миграции с paged implementation и из последнего найденного в source дерева определения `t2_qator_holat` (v4). Это наблюдения по репозиторию, не проверка определения в подключённой БД.

## Фактические условия по цепочке

1. **Смысл дополнительной строки и её provenance.** Команда `t2_qoshimcha_ish_yarat_v1` передаёт операцию в общий audited executor. Для режима additional он создаёт `t2_smeta_ozgarish` со статусом draft, видом `additional_work`, актором, ссылкой на evidence и `operation_id`; строка `t2_qator` получает `qoshimcha=true`, `change_type='ADDITIONAL'`, `change_id` и тот же operation key ( `supabase/migrations/20260924120000_t2_additional_replacement_v1.sql:37–43, 68–94`). Это не только UI-флаг: он согласуется с журналом изменения и его источником.

2. **Nakopitelniy detail.** `t2_nakopitelniy_v2` строит строки по всем `t2_qator` объекта и возвращает поле `qoshimcha`; `change_type` в detail не включён ( `supabase/migrations/20261101090000_t2_nakopitelniy_v2_sahifa_barg_jami.sql:62–89`). В обычном режиме detail-фильтра по `qoshimcha`/`change_type` нет. В `faqat_faol` режиме строка проходит, если есть учтённая активность **или** `q.qoshimcha` **или** `q.zamena` (там же: 90–113).

3. **Nakopitelniy baseline total.** `jami.smeta_summa` складывает `summa` только листьев `rs/mat/ob`, а неизвестные суммы листьев считает отдельно. Условия по `qoshimcha` и `change_type` в этом total отсутствуют. F2 baseline и actual итоги собираются из `t2_akt_qator.baseline_summa`/`summa` для F2 нужного статуса и периода, связанные по `qator_id` (там же: 131–171, особенно 142–155). Следовательно, смена классификационных флагов не является условием этого SQL расчёта.

4. **`t2_qator_holat`.** Последняя найденная source-дефиниция v4 вычисляет факт/F2/остаток по `qator_id`, утверждённому статусу акта и certified полям; `qoshimcha` и `change_type` не выбраны и не участвуют в формулах ( `supabase/migrations/20261106610000_t2_qator_holat_tez_v4.sql:4–32`). F2 availability, таким образом, не переключается одним из этих флагов в этом view.

5. **Подготовка будущего F2.** Экран читает дерево сметы и состояние строк, затем строит список через `f2Qur` (`frontend/src/admin/sahifalar/F2TayyorlashNative.tsx:150–158, 175–179`). `f2Qur` обходит `rz` и затем `bl`/ресурсы, рассчитывая доступный объём из `smeta_hajm`, `f2_hajm` и `f2_mumkin_hajm`; проверки по `qoshimcha`/`change_type` нет (`frontend/src/lib/f2-tayyor.ts:55–101`). Отправляемый payload фиксирует количество, цену/сумму документа и `rawSnapshot` с источником (`там же: 220–235`). Поэтому сама переклассификация не меняет формулу доступного объёма или состав payload; изменится только иной потребитель, если он явно фильтрует флаг.

6. **Иерархическая сверка исходника.** Найдено конкретное условие, чувствительное к descendant-флагам: `t2_smeta_ierarxiya_tikla_v1` считает прямые не-`rz` строки baseline-раздела только когда `qoshimcha` false и `change_type` null (`supabase/migrations/20261106380000_t2_smeta_ierarxiya_tikla_v1.sql:61–72`). Валидатор при этом формирует список всех `rz`, не отфильтровывая корни по этим флагам (`там же: 54–59`). Значит флаги потомков — часть критерия «строка уже была в исходном файле»; их снятие расширяет baseline-count и может вызвать `IERARXIYA_MOS_EMAS`, если переданное описание исходника не содержит этих добавленных строк. Для корня аналогичного фильтра в этой проверке нет.

## Что следует из гипотезы переклассификации разделов

| Изменение флагов | Вывод по существующему условию |
|---|---|
| Только `rz`-корни: снять `qoshimcha` и очистить `change_type` | В `Nakopitelniy` без `faqat_faol` строки останутся в detail; в `faqat_faol` неактивный корень может пропасть, потому что `qoshimcha` больше не удерживает его. Листовые итоги не меняются из-за корня: они считают только `rs/mat/ob`. F2-подготовка по текущему `f2Qur` не зависит от флага. Иерархический baseline-count потомков не меняется. |
| Потомки тоже перевести в baseline | Неактивные потомки также перестанут удерживаться в `faqat_faol` только флагом. Листовой `smeta_summa` и утверждённые F2 агрегаты по видимому SQL не фильтруются этими флагами. Но иерархическая сверка начнёт включать теперь baseline-помеченных прямых потомков в baseline-count; результат сверки зависит от входного исходного описания. `t2_qator_holat`/F2 расчёт остаётся без флаговой ветки. |
| Меняется `change_type`, но `qoshimcha` оставлен true | Для Nakopitelniy `faqat_faol` удержание остаётся через `qoshimcha`; hierarchy validator продолжает исключать строку, потому что условие требует одновременно `qoshimcha=false` и `change_type is null`. |

Таблица описывает только последствия статически видимых условий. Она не утверждает, что упомянутые строки в живой базе имеют конкретные признаки или что какой-либо итоговый документ изменится.

## F2 snapshots, неизменность и допустимая запись

- `t2_akt_yarat_v2` требует `operation_id`, авторизует actor по компании, связывает строку F2 с canonical `qator_id`, сохраняет входной `raw_snapshot`, certified поля и снимок ценовой основы (`supabase/migrations/20260929120000_t2_akt_yarat_v2_hujjat_summasi_v1.sql:32–64, 74–112`). Native payload также сохраняет source reference (`frontend/src/lib/f2-tayyor.ts:226–235`).
- Источник F2 не следует «исправлять» задним числом через `t2_akt_qator`: freeze trigger запрещает изменение certified quantity/price/amount, provenance status и source hash после утверждения (`supabase/migrations/20260920120000_t2_akt_qator_certified_v1.sql:95–123`). `Nakopitelniy` агрегирует уже сохранённые `baseline_summa` и суммы из F2-строк, а не выводит прошлые документы заново из текущего флага (`20261101090000...sql:94–107, 142–155`).
- Для исходных `t2_qator` строк `qoshimcha` и `change_type` являются аудируемой классификацией. Текущий `t2_qator_tahrir` разрешает только `nom/hajm/narx/birlik/kat`; он не является командой переклассификации (`supabase/migrations/20261021100000_t2_smeta_norma_cascade_v1.sql:217–240`). В route map есть `qator_tahrir`, но он не даёт права записывать эти поля (`docs/architecture/ROUTE_RPC_MAP.md:105, 169–171`). Проверенный additional writer требует actor, expected version, caller-stable `operation_id`, evidence scope и audit/change-ledger (`20260924120000...sql:37–50, 52–56, 68–94`). В рассмотренных маршрутах/SQL не найден отдельный baseline-reclassification RPC.

Любая согласованная коррекция должна сохранить ссылку на исходный документ и доказательство provenance, не менять утверждённые F2 snapshots, и пройти named command с проверкой tenant/actor, версии, caller-generated `operation_id` (идемпотентность), записью аудита и сохранением версии строки. Эти общие требования зафиксированы в `docs/governance/CONSTITUTION.md:27–37`; происхождение F2 и привязка по canonical `qator_id` — `docs/architecture/PTO_DOCUMENT_LINEAGE_F2_F3_V1.md:25–45`.

## DS предупреждения

Найденная warning-ветка `F3_SHARTNOMADAN_OSHDI` сравнивает накопленный F3 «sotuv» с текущей суммой контракта/последнего действующего DS; прочие проверки смотрят на сумму договора, аванс и статусы F2/F3 (`frontend/src/lib/nakopitelniy-svod.ts:12, 134–170`). Ни `qoshimcha`, ни `change_type` в условии нет. В проверенном коде нет evidence, что переклассификация строк сметы сама меняет DS warning. Это отсутствие видимой зависимости, не вывод о живых данных, действующих DS или реальном F3.

## Вывод для parent

Подтверждена одна конкретная чувствительная зависимость: descendant-флаги участвуют в `t2_smeta_ierarxiya_tikla_v1` baseline-count; root-флаг там не участвует. В Nakopitelniy флаг влияет на удержание неактивных строк только в `faqat_faol` detail, а сумма по листьям и сохранённые F2 агрегаты напрямую от него не фильтруются. F2 preparation helper и `t2_qator_holat` также не ветвятся по этим флагам. DS warning проверенного frontend свода зависит от F3 и договорной суммы/DS, без условия по классификации строки.

Ничего не записывалось в БД, не вызывались RPC/runtime и не менялись исходники. Проверки/тесты не запускались. Parent должен сопоставить это с live definitions и своей реальной сверкой книги/БД; данный отчёт сам по себе не подтверждает состояние данных или production.
