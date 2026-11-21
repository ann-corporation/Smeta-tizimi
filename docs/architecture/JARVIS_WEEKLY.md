# Jarvis: недельный отчёт через существующие предложения

Существующий `bilim-kuzatuv.yml` вызывает `rivojlanish_tahlil` по понедельникам.
Новый RPC `t2_jarvis_haftalik_taklif_v1(actor,operation_id)` подключён к тому же
действию; отдельного scheduler/LLM/storage нет. Он вызывает существующий
`t2_agent_taklif_yarat_v1`: результат — предложение `kutilmoqda`, а не изменение
поведения, исполнение задания, merge или deploy.

Источник — disjoint daily/weekly friction counters: retention использует
`DELETE RETURNING` → archive в одной транзакции. Учитывается последняя полностью
закрытая неделя UTC. Только фиксированные failure codes, opt-in `oqish+hissa`
и **≥5 DISTINCT компаний на каждый ключ**. Ожидаемый FORBIDDEN не считается
поломкой. Company IDs, aliases, сообщения и суммы не копируются. Число людей
неизвестно (`null`), попытки/компании — точные десятичные строки.

Caller UUID записывается в snapshot; workflow получает стабильный UUIDv8 от
UTC week, клиент может сохранить/повторить свой UUID. Legacy API без UUID
создаёт его один раз на запрос. Week key + partial unique index обеспечивают
один immutable report/week даже через generic creator. Утверждённый/отклонённый
snapshot не перезаписывается. Повтор с новым UUID возвращает существующий отчёт;
повтор creator UUID в другой неделе отвергается. Это не универсальная receipt
таблица для каждого не создавшего отчёт HTTP запроса.

UI различает новый отчёт, ранее созданный, отсутствие eligible signals и ошибку
источника. Если legacy анализ упал ПОСЛЕ создания отчёта, HTTP error сохраняется,
но клиент удерживает только валидированный receipt, предупреждает о частичном
результате и открывает review новой pending proposal. Без receipt ошибка остаётся
ошибкой. Пустой legacy список не блокирует проверку. Weekly unavailable не
выдаётся за success: workflow проверяет вложенный `jarvis_hafta.ok` и завершается
ошибкой даже при legacy HTTP200. Legacy global analysis также фильтрует группы
до ≥5 компаний ПЕРЕД моделью; параметры клиента этот порог не понижают.

Release L0: сначала миграция `20270121000100`/schema smoke, затем API+workflow/UI.
Index additivный на tiny existing proposal table (read-only metadata:8KiB на
21.11.2026); перед production apply проверить актуальный размер/lock window.
Rollback удаляет только wrapper/index, оставляя counters/proposals/решения.

Synthetic PGlite запускает реальную migration и existing creator/schema внутри
BEGIN…ROLLBACK; authority boundary — fixture. Bash workflow test — mocked curl,
без сети. Эти тесты не доказывают live owner acceptance или реальный scheduled run.
Generic Studio prior engines k=2 и другие M5 consumers этим не изменены; полный M0–M5 открыт.
