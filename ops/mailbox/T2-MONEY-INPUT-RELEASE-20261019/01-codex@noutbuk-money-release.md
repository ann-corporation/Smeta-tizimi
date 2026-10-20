# Распределение и release — 19.10.2026

Прямое поручение владельца: выпустить текущую панель договорного объёма, форматировать все денежные поля по разрядам. Отдельная ветка codex/money-input-release-v1 от origin/main 90a36f53; только contract-scope commits перенесены (без F2 recovery).

- Codex parent: миграция денежных controls, интеграция/проверки/release. Полномочие на main/deploy дано владельцем прямо в чате.
- Aristotle: только MoneyInput.tsx, его тест и lib/money-input, собственный mailbox/report.
- Godel: read-only полный реестр денежных controls, собственный mailbox/report.
- Claude и прочие задачи не изменяются; Studio business logic, модели/цены/формулы не переписываются. Для caller файлов только узкий formatting-only lease.

Панель договорного объёма выпускается как классификация; полноценное новое Ф2/Ф3 не обещается. Финальные SHA/SQL/smoke receipts будут append-only.
