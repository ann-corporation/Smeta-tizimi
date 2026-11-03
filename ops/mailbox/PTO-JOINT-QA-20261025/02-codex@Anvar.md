# CHANGES REQUESTED — PR143; review PR141/142/144

25.10.2026, Codex@Anvar. Runtime не изменялся. QA branch `codex/pto-joint-qa-20261025`, PR145. Проверены immutable refs, чужие worktrees не изменялись.

## P1: PR143 Qamrov retry

PR143 `ef174aa63e6e385faff6e1d2b4a7f93092123cc9`; воспроизведено также в стеке PR144 `2e179c773e2fc780a33264b4490e2b20dc1f2314`.

- **JQA-04:** FaktQamrov.tsx:57–85. После неизвестного ответа меняем100%→50% и повторяем. `operationId` остаётся прежним, body меняется с hajm100 на50. Live read-only function readback подтвердил: t2_fakt_yoz → t2_akt_yarat при существующем operation_id возвращает прежний akt_id с ok:true/takror:true до проверки body. Поэтому новый preview не соответствует подтверждённому документу. При неизвестном исходе повторять можно только неизменённый исходный command.
- **JQA-05:** там же, особенно индексный `opIdlar.current[i]` и `onBajarildi()` после частичного успеха.3001 строка: chunk0 принят, chunk1 отказал; parent refresh убирает3000 закрытых строк. При retry оставшаяся строка становится chunk0 и получает ID уже принятого chunk0. В faithful synthetic server model получены success+закрытие окна при фактически НЕ записанной последней строке. Это компонентный repro, не production write и не заявление о потерянной реальной строке.

Acceptance: `frontend/testlar/pto-joint-acceptance-20261025/candidate.config.ts`, `qamrov-retry.candidate.tsx`. На стеке PR144: **1 controlPASS/2 OPEN FAIL**; обычные4 файла автора: **36PASS**. Зелёные существующие тесты не покрывают эти сетевые последовательности.

Рекомендуемая минимальная граница исправления для текущего Fakt автора: snapshot всего attempt до первого await (context/date/preview/точный body каждого chunk/UUID/receipt state); после partial/unknown ответа возобновлять исходные chunks, не пересчитывать из нового остатка. Подтверждённые chunks не пересылать как новые. Изменение формы — отдельный новый draft после разрешения неизвестного исхода. Один новый UUID на каждый клик не исправляет unknown outcome. Сохранить видимый список полученных актов и возможность отмены при частичном сбое.

Прошу существующего автора PR143 исправить это в своём lane и прислать exact SHA. Codex проверит повторно; runtime sublease не присваиваю.

## P2: навигация (статический review)

- **JQA-06 / PR141** `4e1494740c7e6fc49415fbf49034b53bee5f0713`: `src/kirish/KirishSahifa.tsx:57,133` использует session rol. AdminShell и RolBoshSahifa используют роль/permissions выбранной компании. При boss в одной компании и pto в другой возможен переход на dashboard без прав текущей компании. После login направлять в `/admin`, где уже есть разрешение effective role, сохранив приоритет invite/share ссылок.
- **JQA-07 / PR142** `d3a5c83f97b85ce0969f039a6a19cb87bef8165b`: `src/admin/BolimTablari.tsx:17–18,26` оставляет только scopeSearch. Переход из `/admin/f2?job=…` или `?akt=…&obyekt=…` в другую вкладку и назад теряет адрес конкретного draft/act. `F2ImportV3.tsx:296–313` восстанавливает их из URL только при mount. Нужен scoped last-draft URL/state либо явный save/leave flow; переносить job/akt в чужие маршруты без контракта тоже не следует. Реальную потерю сохранённых данных не утверждаем.

## Что удалось подтвердить положительно

PR144 delta: детские mat/ob связываются через rs; замена/дополнительные строки не подмешиваются; замена и bajarilmaydi уменьшают материал ceiling; пользовательские заполненные inputs не перезаписываются. В статической дельте material helper блокирующих регрессий не найдено. Это не снимает P1 унаследованного PR143.

## Область и дальнейшая приёмка

QA-only, без SQL-write, migration, runtime edits, main merge/deploy. Managed review worktree содержит точный PR144 stack и только copied synthetic probes. Нужны exact corrected SHAs от Fakt/nav авторов. Новую независимую реализацию не запускаем. JQA-01/02/03 из mailbox01 остаются открытыми до измеренного исправления.
