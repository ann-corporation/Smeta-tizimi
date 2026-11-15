# Контракт задач Jarvis: первый сквозной срез

Статус: кандидат, не production. Ветка codex/jarvis-task-runtime-20261115.

Один пользовательский Jarvis использует существующий agent-ish endpoint. Первая восстанавливаемая задача — чтение состояния объекта и сопоставления через существующие obyektHolat/slichitelniyHisob. Финансовые суммы не пересчитываются. Личные разговоры и произвольные задачи этим срезом пока не охвачены.

Состояние: actor/company/object, цель, последовательные шаги, устойчивые operationId, revision, результат чтения. Перед шагом выполняется CAS checkpoint. Неизвестный результат записи в общем runtime переводится в reconciling, но HTTP/SQL текущего среза вообще запрещают write steps. Возврат на другую страницу/пользователя не переносит задачу в новую область.

Граница доверия: checkpoint содержит пользовательское состояние read-only задачи; его evidence НЕ является юридическим подтверждением, разрешением, бизнес-журналом или доказательством проведённой записи. При будущих write tools нужны серверный executor, approval snapshot, lease и проверка operation_id/expected_version через существующие команды. Нельзя просто разрешить write=true в валидаторе.

Хранение: docs/architecture/ai-task-checkpoint.sql — исполнимый SQL draft с rollback и PGlite acceptance. До номера миграции/review L0 и применения на сервере API будет явно сообщать об ошибке, без локального fake-success fallback. Не выпускать UI отдельно от schema. Таблица не заменяет t2_ai_ish фоновых работников и не является второй бизнес-базой.

Проверка: runtime и UI/API focused tests; PGlite — синтетическая модель зависимостей, не production permissions audit. Полный owner E2E после применения схемы и preview обязателен. Full history, личный scope, arbitrary planning, approval/write recovery и platform development bridge остаются дальнейшими частями единой задачи.
